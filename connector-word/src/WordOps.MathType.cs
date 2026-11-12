using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Converting MathType equations in the open document: the app does the conversion
    /// (packages/mathtype, convertFlatOpc); Word hands over and takes back whole paragraphs, so
    /// tabs, number fields and bookmarks travel with them.
    /// </summary>
    internal sealed partial class WordOps
    {
        internal static bool IsMathType(Word.InlineShape s)
        {
            try
            {
                if (s.Type != Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject) return false;
                var id = s.OLEFormat?.ProgID ?? "";
                return id.StartsWith("Equation.", StringComparison.OrdinalIgnoreCase);
            }
            catch (COMException)
            {
                return false;
            }
        }

        private struct ParaSpan
        {
            public int Start, End, Count;
        }

        /// <summary>Paragraph contents (without the paragraph mark) holding MathType equations, in order.</summary>
        private static List<ParaSpan> MathTypeParagraphs(Word.Document doc)
        {
            var map = new SortedDictionary<int, ParaSpan>();
            foreach (Word.InlineShape s in doc.InlineShapes)
            {
                if (!IsMathType(s)) continue;
                var pr = s.Range.Paragraphs[1].Range;
                int start = pr.Start, end = Math.Max(pr.Start, pr.End - 1);
                if (map.TryGetValue(start, out var span)) span.Count++;
                else span = new ParaSpan { Start = start, End = end, Count = 1 };
                map[start] = span;
            }
            return map.Values.ToList();
        }

        private static string PreviousText(Word.Document doc, int start)
        {
            try
            {
                var prev = doc.Range(start, start).Paragraphs[1].Previous();
                for (int i = 0; prev != null && i < 3; i++, prev = prev.Previous())
                {
                    var t = Snippet(prev.Range);
                    if (t.Length > 0) return t;
                }
            }
            catch (COMException)
            {
            }
            return "";
        }

        private static int CountMathType(Word.Range r)
        {
            int n = 0;
            foreach (Word.InlineShape s in r.InlineShapes) if (IsMathType(s)) n++;
            return n;
        }

        /// <summary>Pages through the paragraphs with MathType equations (Flat OPC of each).</summary>
        public Dictionary<string, object> ListMathTypeParagraphs(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            int from = Rpc.GetInt(p, "from"), limit = Math.Max(1, Rpc.GetInt(p, "limit", 20));
            var all = MathTypeParagraphs(doc);
            var items = new List<object>();
            foreach (var span in all.Skip(from).Take(limit))
            {
                items.Add(new Dictionary<string, object>
                {
                    ["start"] = span.Start,
                    ["end"] = span.End,
                    ["objects"] = span.Count,
                    ["flatOpc"] = doc.Range(span.Start, span.End).WordOpenXML,
                    // Where it is, for the report: the paragraph before (an equation alone in its paragraph has no text of its own).
                    ["before"] = PreviousText(doc, span.Start),
                });
            }
            return new Dictionary<string, object>
            {
                ["name"] = doc.Name,
                ["fullName"] = doc.FullName,
                ["total"] = all.Count,
                ["totalObjects"] = all.Sum(x => x.Count),
                ["paragraphs"] = items,
            };
        }

        /// <summary>
        /// Replaces paragraph contents by converted ones, last first (earlier positions stay valid),
        /// in one undo step. An item is skipped when its range no longer holds the expected objects.
        /// </summary>
        public Dictionary<string, object> ReplaceParagraphs(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "Convert MathType equations";
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            var items = new List<Dictionary<string, object>>();
            foreach (var o in list) if (o is Dictionary<string, object> d) items.Add(d);
            items.Sort((a, b) => Rpc.GetInt(b, "start").CompareTo(Rpc.GetInt(a, "start")));

            return InOneUndo(undoLabel, () => ReplaceParagraphsCore(doc, items), null, doc);
        }

        private Dictionary<string, object> ReplaceParagraphsCore(Word.Document doc, List<Dictionary<string, object>> items)
        {
            int replaced = 0, skipped = 0;
            bool screen = _app.ScreenUpdating;
            try
            {
                _app.ScreenUpdating = false;
                foreach (var item in items)
                {
                    int start = Rpc.GetInt(item, "start"), end = Rpc.GetInt(item, "end"), objects = Rpc.GetInt(item, "objects");
                    var r = doc.Range(start, end);
                    if (CountMathType(r) != objects)
                    {
                        skipped++;
                        continue;
                    }
                    try
                    {
                        if (item.TryGetValue("packages", out var pk) && pk is IEnumerable pkList && !(pk is string))
                        {
                            // Only the MathType objects are replaced, one by one: each new equation goes in
                            // front of its MathType object, then the object goes. The paragraph — its style
                            // (MTDisplayEquation), tabs, spacing, number fields, bookmarks — is never rewritten.
                            var packages = new List<string>();
                            foreach (var o in pkList) packages.Add(o as string);
                            var shapes = new List<Word.InlineShape>();
                            foreach (Word.InlineShape sh in r.InlineShapes) if (IsMathType(sh)) shapes.Add(sh);
                            for (int k = Math.Min(shapes.Count, packages.Count) - 1; k >= 0; k--)
                            {
                                if (string.IsNullOrEmpty(packages[k])) continue; // not converted: MathType's stays
                                var old = shapes[k];
                                int at = old.Range.Start;
                                doc.Range(at, at).InsertXML(RunsOnly(packages[k]));
                                old.Delete();
                                FinishInserted(doc, packages[k]);
                            }
                        }
                        else
                        {
                            var xml = Rpc.GetString(item, "flatOpc");
                            r.InsertXML(xml);
                            FinishInserted(doc, xml);
                        }
                        replaced++;
                        CheckOperationUndo("after converting the paragraph at " + start);
                    }
                    catch (COMException ex)
                    {
                        Log.Error("replaceParagraphs at " + start, ex);
                        skipped++;
                    }
                }
            }
            finally
            {
                _app.ScreenUpdating = screen;
            }
            Log.Info("replaceParagraphs in " + doc.Name + ": " + replaced + " replaced, " + skipped + " skipped");
            return new Dictionary<string, object> { ["replaced"] = replaced, ["skipped"] = skipped };
        }

        /// <summary>Opens a MathType object in MathType (its default verb), by paragraph and index.</summary>
        public Dictionary<string, object> ActivateObject(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            int start = Rpc.GetInt(p, "start"), end = Rpc.GetInt(p, "end"), index = Rpc.GetInt(p, "index");
            int k = 0;
            foreach (Word.InlineShape s in doc.Range(start, end).InlineShapes)
            {
                if (!IsMathType(s)) continue;
                if (k++ != index) continue;
                s.OLEFormat.DoVerb();
                return new Dictionary<string, object> { ["ok"] = true };
            }
            throw new RpcException(Rpc.NotFound, "That MathType equation is no longer there.");
        }

        /// <summary>For the double-click handler: the MathType object under the selection, if any.</summary>
        internal static Dictionary<string, object> MathTypeAt(Word.Document doc, Word.Selection sel)
        {
            Word.InlineShape hit = null;
            foreach (Word.InlineShape s in sel.Range.InlineShapes)
            {
                if (IsMathType(s))
                {
                    hit = s;
                    break;
                }
            }
            if (hit == null) return null;
            var pr = hit.Range.Paragraphs[1].Range;
            int start = pr.Start, end = Math.Max(pr.Start, pr.End - 1);
            int index = 0, objects = 0;
            foreach (Word.InlineShape s in doc.Range(start, end).InlineShapes)
            {
                if (!IsMathType(s)) continue;
                if (s.Range.Start < hit.Range.Start) index++;
                objects++;
            }
            return new Dictionary<string, object>
            {
                ["document"] = doc.FullName,
                ["start"] = start,
                ["end"] = end,
                ["objects"] = objects,
                ["index"] = index,
                ["flatOpc"] = doc.Range(start, end).WordOpenXML,
            };
        }
    }
}
