using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// What is at the cursor (for keyboard shortcuts), LaTeX in the document text, and replacing
    /// text ranges with equations or equations with text.
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>Screen rectangle of a range (pixels), or null.</summary>
        internal Dictionary<string, object> RectOf(Word.Range r)
        {
            try
            {
                _app.ActiveWindow.GetPoint(out int left, out int top, out int width, out int height, r);
                return new Dictionary<string, object> { ["left"] = left, ["top"] = top, ["width"] = width, ["height"] = height };
            }
            catch (COMException)
            {
                return null;
            }
        }

        /// <summary>The MathBlocks equation at the cursor, the selected text, or LaTeX around the cursor.</summary>
        public Dictionary<string, object> SelectionInfo(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            var sel = _app.Selection;
            var result = new Dictionary<string, object> { ["document"] = doc.FullName, ["rect"] = RectOf(sel.Range) };
            var cc = sel.Range.ParentContentControl;
            if (cc == null)
                foreach (Word.ContentControl c in sel.Range.ContentControls) { cc = c; break; }
            if (cc?.Tag == null || !cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal))
            {
                // A pasted MathBlocks picture that lost its wrapper (Ctrl+Alt+M on it): wrap it again.
                var shape = UnwrappedPictureAt(doc, sel.Range, out _);
                if (shape != null)
                {
                    MathBlocksData(shape.Range.WordOpenXML, out var json);
                    var block = json != null ? Regex.Match(json, "\"block\"\\s*:\\s*\"([0-9A-Za-z]{16})\"").Groups[1].Value : null;
                    var tag = AdoptPicture(doc, shape, block);
                    foreach (Word.ContentControl c in doc.SelectContentControlsByTag(tag)) cc = c;
                }
            }
            if (cc?.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal))
            {
                result["tag"] = cc.Tag;
                result["flatOpc"] = cc.Range.WordOpenXML;
                result["number"] = NumberInfo(cc);
                result["rect"] = RectOf(cc.Range) ?? result["rect"];
                return result;
            }
            // Selected text, or a $…$ / \(…\) / \[…\] span around the cursor in this paragraph.
            if (sel.Start != sel.End)
            {
                result["text"] = sel.Range.Text ?? "";
                result["start"] = sel.Start;
                result["end"] = sel.End;
                return result;
            }
            var para = sel.Range.Paragraphs[1].Range;
            var text = para.Text ?? "";
            int caret = sel.Start - para.Start;
            foreach (Match m in LatexSpans.Matches(text))
            {
                if (caret < m.Index || caret > m.Index + m.Length) continue;
                result["text"] = m.Value;
                result["start"] = para.Start + m.Index;
                result["end"] = para.Start + m.Index + m.Length;
                break;
            }
            return result;
        }

        private static Regex LatexSpans => LatexText.Spans;

        /// <summary>
        /// Every LaTeX span in the main text that is not already inside a MathBlocks equation or field.
        /// Paragraph text and document positions can differ (fields, hidden text, objects): a span
        /// whose position does not hold its text is searched for within the paragraph.
        /// </summary>
        public Dictionary<string, object> FindLatex(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var items = new List<object>();
            int found = 0, inside = 0, lost = 0, moved = 0;
            foreach (Word.Paragraph para in doc.Paragraphs)
            {
                var r = para.Range;
                var text = r.Text ?? "";
                foreach (var m in LatexText.Find(text))
                {
                    found++;
                    int start = r.Start + m.Index, end = start + m.Length;
                    var span = doc.Range(start, end);
                    if ((span.Text ?? "") != m.Text)
                    {
                        span = Locate(r, m.Text, start);
                        if (span == null)
                        {
                            lost++;
                            Log.Info("findLatex: could not locate \"" + Short(m.Text) + "\" near " + start);
                            continue;
                        }
                        moved++;
                        start = span.Start;
                        end = span.End;
                    }
                    if (InsideFieldOrEquation(span))
                    {
                        inside++;
                        continue;
                    }
                    items.Add(new Dictionary<string, object> { ["start"] = start, ["end"] = end, ["text"] = m.Text, ["alone"] = m.Alone });
                }
            }
            Log.Info("findLatex in " + doc.Name + ": " + found + " span(s), " + items.Count + " to convert, " + inside + " inside equations/fields, " + moved + " relocated, " + lost + " not located");
            return new Dictionary<string, object>
            {
                ["name"] = doc.Name, ["fullName"] = doc.FullName, ["items"] = items,
                ["skippedInside"] = inside, ["notLocated"] = lost,
            };
        }

        private static string Short(string s) => s.Length > 40 ? s.Substring(0, 40) + "…" : s;

        private static bool InsideFieldOrEquation(Word.Range span)
        {
            try
            {
                if (span.ContentControls.Count > 0 || span.Fields.Count > 0) return true;
                var cc = span.ParentContentControl;
                return cc != null && cc.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal);
            }
            catch (COMException)
            {
                return false;
            }
        }

        /// <summary>The span's text inside the paragraph, nearest to where it was expected.</summary>
        private static Word.Range Locate(Word.Range para, string text, int near)
        {
            if (text.Length > 250) return null; // Word's Find limit
            Word.Range best = null;
            var r = para.Duplicate;
            var f = r.Find;
            f.ClearFormatting();
            f.Text = text;
            f.MatchWildcards = false;
            f.MatchCase = true;
            f.Forward = true;
            f.Wrap = Word.WdFindWrap.wdFindStop;
            int guard = 0;
            while (f.Execute() && r.End <= para.End && guard++ < 50)
            {
                if (best == null || Math.Abs(r.Start - near) < Math.Abs(best.Start - near)) best = r.Duplicate;
                r.Collapse(Word.WdCollapseDirection.wdCollapseEnd);
            }
            return best;
        }

        /// <summary>
        /// Replaces text ranges (last first) by Flat OPC content or plain text, in one undo step.
        /// Each item's range must still hold `expect` (its text when it was found).
        /// </summary>
        public Dictionary<string, object> ReplaceRanges(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "MathBlocks";
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            var items = new List<Dictionary<string, object>>();
            foreach (var o in list) if (o is Dictionary<string, object> d) items.Add(d);
            items.Sort((a, b) => Rpc.GetInt(b, "start").CompareTo(Rpc.GetInt(a, "start")));
            int replaced = 0, skipped = 0;
            var undo = _app.UndoRecord;
            bool screen = _app.ScreenUpdating;
            undo.StartCustomRecord(undoLabel);
            try
            {
                _app.ScreenUpdating = items.Count < 3;
                foreach (var item in items)
                {
                    int start = Rpc.GetInt(item, "start"), end = Rpc.GetInt(item, "end");
                    var r = doc.Range(start, end);
                    if (item.TryGetValue("expect", out var e) && e is string expect && (r.Text ?? "") != expect)
                    {
                        skipped++;
                        continue;
                    }
                    try
                    {
                        if (item.TryGetValue("flatOpc", out var f) && f is string flatOpc)
                        {
                            // As a normal insertion: remove the text, insert at the empty point.
                            r.Text = "";
                            var at = doc.Range(start, start);
                            at.InsertXML(flatOpc);
                        }
                        else if (item.TryGetValue("text", out var t) && t is string text) r.Text = text;
                        replaced++;
                    }
                    catch (COMException ex)
                    {
                        Log.Error("replaceRanges at " + start + " (" + Short(r.Text ?? "") + ")", ex);
                        skipped++;
                    }
                }
                foreach (var cc in MathBlocksControls(doc)) TryHide(cc);
            }
            finally
            {
                _app.ScreenUpdating = screen;
                undo.EndCustomRecord();
            }
            Log.Info("replaceRanges \"" + undoLabel + "\": " + replaced + " replaced, " + skipped + " skipped");
            return new Dictionary<string, object> { ["replaced"] = replaced, ["skipped"] = skipped };
        }

        /// <summary>Replaces a MathBlocks equation by plain text (e.g. its LaTeX), one undo step.</summary>
        public Dictionary<string, object> EquationToText(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var text = Rpc.GetString(p, "text");
            var found = FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "The equation is no longer in the document.");
            var cc = found[0];
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Equation to LaTeX");
            try
            {
                cc.LockContents = false;
                cc.LockContentControl = false;
                int at = Math.Max(0, cc.Range.Start - 1);
                cc.Delete(true);
                RemoveEmptyMath(doc, at);
                var r = doc.Range(at, at);
                r.InsertAfter(text);
                // Select the LaTeX so the user can edit it, and toggle it back with the same shortcut.
                doc.Range(at, at + text.Length).Select();
            }
            finally
            {
                undo.EndCustomRecord();
            }
            return new Dictionary<string, object> { ["ok"] = true };
        }
    }
}
