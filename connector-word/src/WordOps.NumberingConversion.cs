using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// MathType's equation numbering → MathBlocks numbering (one scheme per document): MathType's
    /// chapter/section breaks become MathBlocks markers, its numbers become MathBlocks number fields
    /// keeping their bookmark (ZEqnNum…), so every reference keeps pointing at its equation. The app
    /// plans it (numberingConversion.ts: keep the numbers, or renumber to chapter.section.equation);
    /// this side reads the document (scanNumbering) and writes the plan (convertNumbering).
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>
        /// In document order: MathType breaks and numbers (with what each number shows and its bookmark),
        /// MathBlocks markers and numbers already there, and headings (level, text, Word's own number).
        /// </summary>
        public Dictionary<string, object> ScanNumbering(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var clock = Stopwatch.StartNew();
            var items = new List<Dictionary<string, object>>();
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (Word.Field f in doc.Fields)
                {
                    string code;
                    int start;
                    try
                    {
                        code = f.Code.Text ?? "";
                        start = f.Code.Start - 1;
                    }
                    catch (COMException)
                    {
                        continue;
                    }
                    var para = doc.Range(start, start).Paragraphs[1].Range;
                    if (code.Contains("MTEditEquationSection"))
                    {
                        var label = "";
                        label = ButtonDisplay(f);
                        items.Add(new Dictionary<string, object> { ["type"] = "mtBreak", ["start"] = start, ["paraStart"] = para.Start, ["label"] = label, ["code"] = NestedCodes(f) });
                    }
                    else if (code.Contains("MTPlaceRef"))
                    {
                        string bookmark = null;
                        foreach (Word.Bookmark bm in para.Bookmarks)
                            if (bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal)) bookmark = bm.Name;
                        var nested = NestedCodes(f);
                        items.Add(new Dictionary<string, object>
                        {
                            ["type"] = "mtNumber",
                            ["start"] = start,
                            ["paraStart"] = para.Start,
                            ["text"] = ButtonDisplay(f),
                            ["bookmark"] = bookmark ?? "",
                            ["code"] = nested,
                            ["snippet"] = Snippet(para),
                        });
                    }
                    else if (code.Contains("MBEquationSection"))
                    {
                        var m = MarkerLabel.Match(code);
                        if (m.Success) items.Add(new Dictionary<string, object> { ["type"] = "mbMarker", ["start"] = start, ["paraStart"] = para.Start, ["chapter"] = int.Parse(m.Groups[2].Value), ["appendix"] = m.Groups[1].Value == "Appendix", ["section"] = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0 });
                    }
                    else if (code.Contains("MBPlaceRef"))
                    {
                        items.Add(new Dictionary<string, object> { ["type"] = "mbNumber", ["start"] = start, ["paraStart"] = para.Start, ["text"] = ButtonDisplay(f), ["snippet"] = Snippet(para) });
                    }
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            // Headings (outline levels 1–3): where sections start, and their numbers.
            foreach (Word.Paragraph para in doc.Paragraphs)
            {
                int level;
                try { level = (int)para.OutlineLevel; } catch (COMException) { continue; }
                if (level < 1 || level > 3) continue;
                var r = para.Range;
                var list = "";
                try { list = r.ListFormat.ListString ?? ""; } catch (COMException) { }
                items.Add(new Dictionary<string, object> { ["type"] = "heading", ["start"] = r.Start, ["paraStart"] = r.Start, ["after"] = r.End, ["level"] = level, ["text"] = (r.Text ?? "").Trim(), ["list"] = list });
            }
            items.Sort((a, b) => Convert.ToInt32(a["start"]).CompareTo(Convert.ToInt32(b["start"])));
            Log.Info("scanNumbering in " + doc.Name + ": " + items.Count + " item(s), " + clock.ElapsedMilliseconds + " ms");
            return new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName, ["items"] = items };
        }

        /// <summary>The codes of the fields nested in a field (MathType's SEQ counters).</summary>
        private static List<object> NestedCodes(Word.Field f)
        {
            var list = new List<object>();
            try
            {
                foreach (Word.Field inner in f.Code.Fields) list.Add((inner.Code.Text ?? "").Trim());
            }
            catch (COMException)
            {
            }
            return list;
        }

        private static string Snippet(Word.Range para)
        {
            var t = DisplayText(para.Text ?? "").Replace("\r", " ").Replace("\a", " ").Replace("\t", " ").Trim();
            return t.Length > 80 ? t.Substring(0, 80) + "…" : t;
        }

        /// <summary>
        /// Writes the plan (last position first) as one undo step: breaks replaced by markers, markers
        /// inserted, numbers replaced by MathBlocks number fields under the same bookmark; then every number
        /// and reference is updated. Returns what each bookmark shows afterwards.
        /// </summary>
        public Dictionary<string, object> ConvertNumbering(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var fmt = NumberFields.NumberFormat.From(p.TryGetValue("format", out var fo) && fo is Dictionary<string, object> fd ? fd : new Dictionary<string, object>());
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            var items = new List<Dictionary<string, object>>();
            foreach (var o in list) if (o is Dictionary<string, object> d) items.Add(d);
            items.Sort((a, b) => Rpc.GetInt(b, "start").CompareTo(Rpc.GetInt(a, "start")));
            var clock = Stopwatch.StartNew();
            return InOneUndo("Convert MathType numbering", () =>
            {
                var problems = new List<object>();
                var bookmarks = new List<string>();
                bool screen = _app.ScreenUpdating;
                bool hidden = doc.Bookmarks.ShowHidden;
                try
                {
                    _app.ScreenUpdating = false;
                    doc.Bookmarks.ShowHidden = true;
                    foreach (var item in items)
                    {
                        var kind = Rpc.GetString(item, "kind");
                        int start = Rpc.GetInt(item, "start");
                        try
                        {
                            switch (kind)
                            {
                                case "replaceBreak":
                                {
                                    var f = FieldAt(doc, start, "MTEditEquationSection");
                                    if (f == null) { problems.Add("MathType break not found at " + start); break; }
                                    int pos = f.Code.Start - 1;
                                    f.Delete();
                                    InsertInline(doc, doc.Range(pos, pos), NumberFields.Package(MarkerRuns(Rpc.GetInt(item, "chapter", 1), Rpc.GetInt(item, "section", 0), Rpc.GetBool(item, "appendix"), true)));
                                    break;
                                }
                                case "insertMarker":
                                {
                                    // Its own hidden paragraph (as MathType's breaks): nothing is added to the heading or
                                    // to the paragraph after it (which may be a pasted \mbnumbering line).
                                    doc.Range(start, start).InsertParagraphBefore();
                                    InsertInline(doc, doc.Range(start, start), NumberFields.Package(MarkerRuns(Rpc.GetInt(item, "chapter", 1), Rpc.GetInt(item, "section", 0), Rpc.GetBool(item, "appendix"), true)));
                                    var mp = doc.Range(start, start).Paragraphs[1];
                                    mp.Range.Font.Hidden = 1;
                                    break;
                                }
                                case "replaceNumber":
                                {
                                    var f = FieldAt(doc, start, "MTPlaceRef");
                                    if (f == null) { problems.Add("MathType number not found at " + start); break; }
                                    var name = Rpc.GetString(item, "bookmark");
                                    if (string.IsNullOrEmpty(name)) name = BookmarkPrefix + RandomId(12);
                                    int pos = f.Code.Start - 1;
                                    if (doc.Bookmarks.Exists(name)) doc.Bookmarks[name].Delete();
                                    f.Delete();
                                    InsertInline(doc, doc.Range(pos, pos), NumberFields.Package(NumberFields.NumberRuns(fmt, name, NumberOnlyName(name), Rpc.GetBool(item, "appendix"))));
                                    bookmarks.Add(name);
                                    break;
                                }
                                default:
                                    problems.Add("unknown item " + kind);
                                    break;
                            }
                        }
                        catch (Exception ex)
                        {
                            problems.Add(kind + " at " + start + ": " + ex.Message);
                            Log.Error("convertNumbering " + kind + " at " + start, ex);
                        }
                        CheckOperationUndo("after " + kind + " at " + start);
                    }
                    var updated = UpdateNumberFields(doc);
                    var shows = new Dictionary<string, object>();
                    foreach (var name in bookmarks)
                        if (doc.Bookmarks.Exists(name)) shows[name] = (doc.Bookmarks[name].Range.Text ?? "").Replace("\t", "").Trim();
                    Log.Info("convertNumbering in " + doc.Name + ": " + items.Count + " item(s), " + problems.Count + " problem(s), " + clock.ElapsedMilliseconds + " ms");
                    return new Dictionary<string, object> { ["problems"] = problems, ["shows"] = shows, ["ms"] = clock.ElapsedMilliseconds, ["broken"] = updated["broken"] };
                }
                finally
                {
                    doc.Bookmarks.ShowHidden = hidden;
                    _app.ScreenUpdating = screen;
                }
            });
        }

        /// <summary>The top-level field of this kind that starts at (or right around) a position.</summary>
        private static Word.Field FieldAt(Word.Document doc, int start, string codePart)
        {
            var para = doc.Range(start, start).Paragraphs[1].Range;
            Word.Field best = null;
            int bestDistance = int.MaxValue;
            foreach (Word.Field f in para.Fields)
            {
                try
                {
                    if (!(f.Code.Text ?? "").Contains(codePart)) continue;
                    int d = Math.Abs(f.Code.Start - 1 - start);
                    if (d < bestDistance)
                    {
                        best = f;
                        bestDistance = d;
                    }
                }
                catch (COMException)
                {
                }
            }
            return best;
        }
    }
}
