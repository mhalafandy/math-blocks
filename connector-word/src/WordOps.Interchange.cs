using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// LaTeX interchange (docs/LATEX-INTERCHANGE.md): the paragraphs a document's LaTeX conversion needs
    /// (scanInterchange), and the conversion itself (convertInterchange) — inline equations, display and
    /// numbered equations with their number field and label bookmark, numbering markers, references —
    /// as one undo step. The app plans everything (latexInterchange.ts); this side only reads and writes.
    /// </summary>
    internal sealed partial class WordOps
    {
        private static readonly Regex MarkerLabel = new Regex(@"Equation (Chapter|Appendix) (\d+)(?: Section (\d+))?", RegexOptions.Compiled);

        /// <summary>
        /// The paragraphs that hold LaTeX ($ or a backslash), equation numbers or numbering markers, with
        /// their positions and styles; the number bookmarks already in the document. Reads only.
        /// </summary>
        public Dictionary<string, object> ScanInterchange(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var clock = Stopwatch.StartNew();
            // Numbers and markers already there (converted before, or MathType's): by paragraph.
            var numbered = new HashSet<int>();
            var markers = new Dictionary<int, Dictionary<string, object>>();
            foreach (Word.Field f in doc.Fields)
            {
                string code;
                int at;
                try
                {
                    code = f.Code.Text ?? "";
                    at = f.Code.Paragraphs[1].Range.Start;
                }
                catch (COMException)
                {
                    continue;
                }
                if (code.Contains("MBEquationSection") || code.Contains("MTEditEquationSection"))
                {
                    var m = MarkerLabel.Match(f.Code.Text ?? "");
                    if (m.Success) markers[at] = new Dictionary<string, object> { ["chapter"] = int.Parse(m.Groups[2].Value), ["appendix"] = m.Groups[1].Value == "Appendix", ["section"] = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0 };
                }
                else if (code.Contains("MBPlaceRef") || code.Contains("MTPlaceRef") || code.Contains("SEQ MTEqn") || (code.Contains("SEQ MBEq") && code.Contains("\\c"))) numbered.Add(at);
            }
            var paragraphs = new List<object>();
            foreach (Word.Paragraph para in doc.Paragraphs)
            {
                var r = para.Range;
                var text = r.Text ?? "";
                int start = r.Start;
                bool hasNumber = numbered.Contains(start);
                bool hasMarker = markers.ContainsKey(start);
                if (!hasNumber && !hasMarker && text.IndexOf('$') < 0 && text.IndexOf('\\') < 0) continue;
                var body = text.TrimEnd('\r', '\a', '\n');
                var entry = new Dictionary<string, object>
                {
                    ["start"] = start,
                    ["end"] = start + body.Length,
                    ["text"] = body,
                    ["style"] = StyleNameOf(para),
                };
                if (hasNumber) entry["numbered"] = true;
                if (hasMarker) entry["marker"] = markers[start];
                try
                {
                    if (r.Fields.Count > 0 || r.InlineShapes.Count > 0 || r.OMaths.Count > 0 || r.ContentControls.Count > 0 || body.Length != r.End - 1 - start) entry["complex"] = true;
                }
                catch (COMException)
                {
                    entry["complex"] = true;
                }
                paragraphs.Add(entry);
            }
            var bookmarks = new List<object>();
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (Word.Bookmark bm in doc.Bookmarks)
                    if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal)) bookmarks.Add(bm.Name);
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            Log.Info("scanInterchange in " + doc.Name + ": " + paragraphs.Count + " paragraph(s), " + numbered.Count + " number(s), " + markers.Count + " marker(s), " + bookmarks.Count + " bookmark(s), " + clock.ElapsedMilliseconds + " ms");
            return new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName, ["paragraphs"] = paragraphs, ["bookmarks"] = bookmarks };
        }

        /// <summary>The numbering marker nearest before the cursor (chapter, section, appendix), for "Insert section marker".</summary>
        public Dictionary<string, object> MarkerBefore(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            int pos = _app.Selection.Start;
            Dictionary<string, object> found = null;
            foreach (Word.Field f in doc.Fields)
            {
                try
                {
                    if (f.Code.Start > pos) break;
                    var code = f.Code.Text ?? "";
                    if (!code.Contains("MBEquationSection") && !code.Contains("MTEditEquationSection")) continue;
                    var m = MarkerLabel.Match(code);
                    if (m.Success) found = new Dictionary<string, object> { ["chapter"] = int.Parse(m.Groups[2].Value), ["appendix"] = m.Groups[1].Value == "Appendix", ["section"] = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0 };
                }
                catch (COMException)
                {
                }
            }
            return found ?? new Dictionary<string, object> { ["none"] = true };
        }

        private static string StyleNameOf(Word.Paragraph para)
        {
            try
            {
                return ((Word.Style)para.get_Style()).NameLocal ?? "";
            }
            catch (Exception)
            {
                return "";
            }
        }

        /// <summary>
        /// Writes the plan, last position first (earlier positions stay valid), as one undo step; then
        /// updates every equation number and reference. Each item's range must still hold the text it
        /// was planned from (else it is skipped and reported). Returns per-item results and the time.
        /// </summary>
        public Dictionary<string, object> ConvertInterchange(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var fmt = NumberFields.NumberFormat.From(p.TryGetValue("format", out var fo) && fo is Dictionary<string, object> fd ? fd : new Dictionary<string, object>());
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            var items = new List<Dictionary<string, object>>();
            foreach (var o in list) if (o is Dictionary<string, object> d) items.Add(d);
            items.Sort((a, b) => Rpc.GetInt(b, "start").CompareTo(Rpc.GetInt(a, "start")));
            var label = p.TryGetValue("undoLabel", out var u) && u is string us ? us : "Convert LaTeX";
            var clock = Stopwatch.StartNew();
            return InOneUndo(label, () =>
            {
                var results = new List<object>();
                bool screen = _app.ScreenUpdating;
                int done = 0;
                try
                {
                    _app.ScreenUpdating = false;
                    foreach (var item in items)
                    {
                        var kind = Rpc.GetString(item, "kind");
                        int id = Rpc.GetInt(item, "id");
                        string problem;
                        try
                        {
                            problem = WriteInterchangeItem(doc, item, kind, fmt);
                        }
                        catch (Exception ex)
                        {
                            problem = "Word refused it: " + ex.Message;
                            Log.Error("convertInterchange " + kind + " at " + Rpc.GetInt(item, "start"), ex);
                        }
                        if (problem == null) done++;
                        results.Add(new Dictionary<string, object> { ["id"] = id, ["ok"] = problem == null, ["problem"] = problem ?? "" });
                        CheckOperationUndo("after " + kind + " at " + Rpc.GetInt(item, "start"));
                    }
                    // Numbers first, then references (they show the numbers).
                    var updated = UpdateNumberFields(doc);
                    CheckOperationUndo("after updating numbers and references");
                    Log.Info("convertInterchange in " + doc.Name + ": " + done + "/" + items.Count + " item(s) in " + clock.ElapsedMilliseconds + " ms");
                    return new Dictionary<string, object> { ["results"] = results, ["done"] = done, ["ms"] = clock.ElapsedMilliseconds, ["numbers"] = updated["numbers"], ["references"] = updated["references"], ["broken"] = updated["broken"] };
                }
                finally
                {
                    _app.ScreenUpdating = screen;
                }
            });
        }

        /// <summary>Writes one planned item; returns null when done, else why it was left alone.</summary>
        private string WriteInterchangeItem(Word.Document doc, Dictionary<string, object> item, string kind, NumberFields.NumberFormat fmt)
        {
            int start = Rpc.GetInt(item, "start"), end = Rpc.GetInt(item, "end");
            var expect = Rpc.GetString(item, "expect");
            var r = RangeHolding(doc, start, end, expect, kind == "display" || kind == "marker");
            if (r == null) return "the text changed since it was checked";
            start = r.Start;
            switch (kind)
            {
                case "inline":
                {
                    var flat = Rpc.GetString(item, "flatOpc");
                    var tag = Rpc.GetString(item, "tag");
                    r.Text = "";
                    InsertInline(doc, doc.Range(start, start), RunsOnly(flat));
                    FinishInserted(doc, flat, start, tag);
                    return null;
                }
                case "display":
                {
                    var flat = Rpc.GetString(item, "flatOpc");
                    var tag = Rpc.GetString(item, "tag");
                    bool numbered = Rpc.GetBool(item, "numbered");
                    // TAB, equation (centred on the style's centre tab), and for numbered ones TAB and the
                    // number field at the right tab. The paragraph keeps its style.
                    r.Text = "\t";
                    InsertInline(doc, doc.Range(start + 1, start + 1), RunsOnly(flat));
                    FinishInserted(doc, flat, start + 1, tag);
                    var para = doc.Range(start, start).Paragraphs[1];
                    EnsureEquationTabs(para, numbered);
                    if (!numbered) return null;
                    int after = -1;
                    foreach (Word.InlineShape s in doc.Range(start, para.Range.End).InlineShapes)
                    {
                        after = s.Range.End;
                        break;
                    }
                    if (after < 0) return "the equation was not found after inserting it";
                    var name = item.TryGetValue("bookmark", out var b) && b is string bs && bs.Length > 0 ? bs : BookmarkPrefix + InstanceId(tag);
                    if (doc.Bookmarks.Exists(name)) name = BookmarkPrefix + RandomId(12);
                    InsertInline(doc, doc.Range(after, after), NumberFields.Package("<w:r><w:tab/></w:r>" + NumberFields.NumberRuns(fmt, name, NumberOnlyName(name), Rpc.GetBool(item, "appendix"))));
                    return null;
                }
                case "marker":
                {
                    // The marker in its own hidden paragraph (as MathType's section breaks): no blank line
                    // where \mbnumbering was, not in the heading (or its table of contents entry).
                    int chapter = Rpc.GetInt(item, "chapter", 1);
                    int section = Rpc.GetInt(item, "section", 0);
                    bool appendix = Rpc.GetBool(item, "appendix");
                    r.Text = "";
                    InsertInline(doc, doc.Range(start, start), NumberFields.Package(MarkerRuns(chapter, section, appendix, true)));
                    doc.Range(start, start).Paragraphs[1].Range.Font.Hidden = 1;
                    return null;
                }
                case "ref":
                {
                    var bookmark = Rpc.GetString(item, "bookmark");
                    var target = Rpc.GetString(item, "form") == "ref" ? NumberOnlyName(bookmark) : bookmark;
                    r.Text = "";
                    InsertReferenceFields(doc, doc.Range(start, start), target);
                    return null;
                }
                case "highlight":
                    r.HighlightColorIndex = Word.WdColorIndex.wdYellow;
                    return null;
                default:
                    return "unknown item kind " + kind;
            }
        }

        /// <summary>
        /// The range holding the expected text: at its planned place, else found in its paragraph (fields
        /// or pictures earlier in the paragraph shift positions). Whole paragraphs compare their content.
        /// </summary>
        private static Word.Range RangeHolding(Word.Document doc, int start, int end, string expect, bool wholeParagraph)
        {
            var r = doc.Range(start, end);
            if ((r.Text ?? "") == expect) return r;
            var para = doc.Range(start, start).Paragraphs[1].Range;
            if (wholeParagraph)
            {
                var content = doc.Range(para.Start, para.End - 1);
                return (content.Text ?? "") == expect ? content : null;
            }
            return Locate(para, expect, start);
        }

        /// <summary>A display paragraph without custom tab stops gets the centre (and right) tab of a numbered equation.</summary>
        private static void EnsureEquationTabs(Word.Paragraph para, bool numbered)
        {
            int custom = 0;
            foreach (Word.TabStop ts in para.TabStops) if (ts.CustomTab) custom++;
            if (custom > 0) return;
            var ps = para.Range.Sections[1].PageSetup;
            float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - para.LeftIndent - para.RightIndent;
            para.Alignment = Word.WdParagraphAlignment.wdAlignParagraphLeft;
            para.FirstLineIndent = 0;
            para.TabStops.Add(width / 2, Word.WdTabAlignment.wdAlignTabCenter);
            if (numbered) para.TabStops.Add(width, Word.WdTabAlignment.wdAlignTabRight);
        }
    }
}
