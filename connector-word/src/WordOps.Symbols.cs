using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The list of symbols (docs/SYMBOL-LIST.md). A definition is a hidden field at its place of definition,
    /// the same mechanism as the numbering markers (no content control: text typed or pasted at a content
    /// control's edge ended up inside it): { MACROBUTTON MBDefine \define{symbol}{meaning}[unit] }. A field is
    /// one unit for Word: text next to it stays outside, it cannot be half-deleted. The table of symbols
    /// follows a hidden { MACROBUTTON MBSymbolList } field, which marks its place for updates.
    /// </summary>
    internal partial class WordOps
    {
        private const string DefineMacro = "MBDefine";
        private const string ListMacro = "MBSymbolList";
        private static readonly Regex DefineCode = new Regex(@"^\s*MACROBUTTON\s+MBDefine\s+(.*?)\s*$", RegexOptions.Compiled | RegexOptions.Singleline);
        private static readonly Regex ListCode = new Regex(@"^\s*MACROBUTTON\s+MBSymbolList\b", RegexOptions.Compiled);

        /// <summary>The hidden field runs of one definition (or of the list's marker, with no tag).</summary>
        internal static string HiddenMacroRuns(string macro, string text)
        {
            string hiddenInstr(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:instrText xml:space=\"preserve\">" + SecurityElement.Escape(t) + "</w:instrText></w:r>";
            string hb(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType=\"" + t + "\"/></w:r>";
            return hb("begin") + hiddenInstr(" MACROBUTTON " + macro + " ") + (string.IsNullOrEmpty(text) ? "" : hiddenInstr(text + " ")) + hb("end");
        }

        private static IEnumerable<Word.Field> MacroFields(Word.Document doc, Regex code)
        {
            var list = new List<Word.Field>();
            foreach (Word.Field f in doc.Fields)
            {
                string c;
                try
                {
                    c = f.Code.Text ?? "";
                }
                catch (COMException)
                {
                    continue;
                }
                if (code.IsMatch(c)) list.Add(f);
            }
            return list;
        }

        /// <summary>Every definition: its tag, position, page, the text around it, and how many equations come before it.</summary>
        public Dictionary<string, object> ListDefinitions(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var light = Rpc.GetBool(p, "light");
            var starts = new List<int>();
            foreach (var eq in AllEquations(doc)) starts.Add(SafeStart(eq));
            var defs = new List<object>();
            foreach (var f in MacroFields(doc, DefineCode))
            {
                var m = DefineCode.Match(f.Code.Text ?? "");
                int start = f.Code.Start - 1;
                int before = 0;
                while (before < starts.Count && starts[before] < start) before++;
                int end = start;
                try
                {
                    end = f.Result.End + 1;
                }
                catch (COMException)
                {
                    end = f.Code.End + 1;
                }
                var item = new Dictionary<string, object> { ["tag"] = m.Groups[1].Value, ["start"] = start, ["end"] = end, ["equationsBefore"] = before };
                if (!light)
                {
                    try
                    {
                        item["page"] = Convert.ToInt32(f.Code.get_Information(Word.WdInformation.wdActiveEndPageNumber));
                        item["context"] = VisibleContext(f.Code.Paragraphs.First.Range);
                    }
                    catch (COMException)
                    {
                        item["page"] = 0;
                        item["context"] = "";
                    }
                }
                defs.Add(item);
            }
            int listAt = -1, listEnd = -1;
            foreach (var f in MacroFields(doc, ListCode))
            {
                listAt = f.Code.Start - 1;
                // The table after the marker's paragraph (its equations are not uses of the symbols).
                int after = f.Code.Paragraphs.First.Range.End;
                var next = doc.Range(after, Math.Min(doc.Content.End, after + 1));
                listEnd = next.Tables.Count > 0 ? next.Tables[1].Range.End : after;
                break;
            }
            return new Dictionary<string, object> { ["definitions"] = defs, ["listAt"] = listAt, ["listEnd"] = listEnd, ["name"] = doc.Name, ["fullName"] = doc.FullName };
        }

        /// <summary>The visible text of a paragraph (field codes and hidden text left out), shortened.</summary>
        private static string VisibleContext(Word.Range para)
        {
            var sb = new System.Text.StringBuilder();
            try
            {
                foreach (Word.Range ch in para.Characters)
                {
                    if (ch.Font.Hidden != 0) continue;
                    var t = ch.Text ?? "";
                    foreach (var c in t) sb.Append(char.IsControl(c) ? ' ' : c);
                    if (sb.Length > 200) break;
                }
            }
            catch (COMException)
            {
            }
            var s = Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
            return s.Length > 90 ? s.Substring(0, 90) + "…" : s;
        }

        /// <summary>
        /// Inserts a definition: at Word's cursor, at the end of the paragraph of an equation (by tag), or at a
        /// position. One undo step; the cursor stays where it was.
        /// </summary>
        public Dictionary<string, object> InsertDefinition(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            if (string.IsNullOrWhiteSpace(tag)) throw new RpcException(Rpc.InvalidParams, "Missing tag");
            var where = Rpc.GetOptString(p, "where") ?? "cursor";
            return InOneUndo("Define symbol", () =>
            {
                int at;
                if (where == "afterEquation")
                {
                    var eqTag = Rpc.GetString(p, "equation");
                    Eq found = null;
                    foreach (var eq in AllEquations(doc)) if (eq.Tag == eqTag) { found = eq; break; }
                    if (found == null) throw new RpcException(Rpc.InvalidParams, "The equation was not found in the document");
                    var para = found.Range.Paragraphs.First.Range;
                    at = para.End - 1;
                }
                else if (where == "at") at = Rpc.GetInt(p, "at");
                else at = _app.Selection.End;
                var sel = _app.Selection;
                int selStart = sel.Start, selEnd = sel.End, length = doc.Content.End;
                InsertInline(doc, doc.Range(at, at), NumberFields.Package(HiddenMacroRuns(DefineMacro, tag)));
                int grew = doc.Content.End - length;
                // The cursor keeps its place in the text (after the definition when it was there).
                sel.SetRange(selStart >= at ? selStart + grew : selStart, selEnd >= at ? selEnd + grew : selEnd);
                return new Dictionary<string, object> { ["ok"] = true, ["at"] = at };
            });
        }

        /// <summary>Replaces (tag given) or deletes (no tag) the definition whose field starts at a position.</summary>
        public Dictionary<string, object> UpdateDefinition(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            int start = Rpc.GetInt(p, "start");
            var tag = Rpc.GetOptString(p, "tag");
            return InOneUndo(tag == null ? "Delete symbol definition" : "Edit symbol definition", () =>
            {
                foreach (var f in MacroFields(doc, DefineCode))
                {
                    if (f.Code.Start - 1 != start) continue;
                    int at = f.Code.Start - 1;
                    f.Delete();
                    if (tag != null) InsertInline(doc, doc.Range(at, at), NumberFields.Package(HiddenMacroRuns(DefineMacro, tag)));
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                throw new RpcException(Rpc.InvalidParams, "The definition was not found (the document changed)");
            });
        }

        /// <summary>
        /// Writes the table of symbols at its place (after its marker) or, the first time, at the cursor, in one
        /// undo step. Rows: { heading } or { cells: [ [ {text} | {flatOpc, tag} … ] … ] }. The first row is the
        /// header (repeated on each page when asked).
        /// </summary>
        public Dictionary<string, object> WriteSymbolList(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var header = ToStrings(p.TryGetValue("header", out var h) ? h : null);
            var rows = new List<Dictionary<string, object>>();
            if (p.TryGetValue("rows", out var raw) && raw is IEnumerable list)
                foreach (var o in list) if (o is Dictionary<string, object> d) rows.Add(d);
            int cols = Math.Max(1, header.Count);
            var styleName = Rpc.GetOptString(p, "tableStyle");
            bool repeat = !p.ContainsKey("repeatHeader") || Rpc.GetBool(p, "repeatHeader");
            return InOneUndo("Update list of symbols", () =>
            {
                bool screen = _app.ScreenUpdating;
                try
                {
                    _app.ScreenUpdating = false;
                    int at = -1;
                    bool replaced = false;
                    foreach (var f in MacroFields(doc, ListCode))
                    {
                        var para = f.Code.Paragraphs.First.Range;
                        at = para.End;
                        // The table right after the marker's paragraph is the list: replaced.
                        var next = doc.Range(at, Math.Min(doc.Content.End, at + 1));
                        if (next.Tables.Count > 0)
                        {
                            next.Tables[1].Delete();
                            replaced = true;
                        }
                        break;
                    }
                    if (at < 0)
                    {
                        // First time: a hidden marker paragraph at the cursor, the table after it.
                        var sel = _app.Selection;
                        var r = doc.Range(sel.Start, sel.Start);
                        r.InsertParagraphBefore();
                        int mStart = r.Start;
                        InsertInline(doc, doc.Range(mStart, mStart), NumberFields.Package(HiddenMacroRuns(ListMacro, "")));
                        var mPara = doc.Range(mStart, mStart).Paragraphs.First;
                        mPara.Range.Font.Hidden = 1;
                        at = mPara.Range.End;
                    }
                    var place = doc.Range(at, at);
                    place.InsertParagraphBefore();
                    place = doc.Range(at, at);
                    var table = doc.Tables.Add(place, rows.Count + 1, cols);
                    table.Range.Font.Hidden = 0;
                    if (!string.IsNullOrEmpty(styleName))
                    {
                        try
                        {
                            object st = styleName;
                            table.set_Style(ref st);
                        }
                        catch (COMException)
                        {
                            // A style this Word does not have: the default table look.
                        }
                    }
                    for (int c = 0; c < cols; c++) table.Cell(1, c + 1).Range.Text = header[c];
                    table.Rows[1].Range.Font.Bold = 1;
                    table.Rows[1].HeadingFormat = repeat ? -1 : 0;
                    int equations = 0;
                    // Bottom row first: earlier cells keep their positions while equations go in.
                    for (int i = rows.Count - 1; i >= 0; i--)
                    {
                        var row = rows[i];
                        int wr = i + 2;
                        if (row.TryGetValue("heading", out var hd) && hd is string heading)
                        {
                            var first = table.Cell(wr, 1);
                            if (cols > 1) first.Merge(table.Cell(wr, cols));
                            table.Cell(wr, 1).Range.Text = heading;
                            table.Cell(wr, 1).Range.Font.Bold = 1;
                            continue;
                        }
                        var cells = row.TryGetValue("cells", out var cv) && cv is IList cl ? cl : new ArrayList();
                        for (int c = Math.Min(cols, cells.Count) - 1; c >= 0; c--)
                        {
                            if (!(cells[c] is IList segs)) continue;
                            var cell = table.Cell(wr, c + 1).Range;
                            int pos = cell.Start;
                            // Segments in order, each after the previous.
                            foreach (var so in segs)
                            {
                                if (!(so is Dictionary<string, object> seg)) continue;
                                if (seg.TryGetValue("flatOpc", out var fo) && fo is string flat && flat.Length > 0)
                                {
                                    int length = doc.Content.End;
                                    InsertInline(doc, doc.Range(pos, pos), RunsOnly(flat));
                                    FinishInserted(doc, flat, pos, Rpc.GetOptString(seg, "tag"));
                                    pos += doc.Content.End - length;
                                    equations++;
                                }
                                else if (seg.TryGetValue("text", out var to) && to is string text && text.Length > 0)
                                {
                                    var r = doc.Range(pos, pos);
                                    r.InsertAfter(text);
                                    pos = r.End;
                                }
                            }
                        }
                    }
                    UpdateNumberFields(doc);
                    return new Dictionary<string, object> { ["ok"] = true, ["replaced"] = replaced, ["rows"] = rows.Count, ["equations"] = equations };
                }
                finally
                {
                    _app.ScreenUpdating = screen;
                }
            });
        }

        private static List<string> ToStrings(object o)
        {
            var list = new List<string>();
            if (o is IEnumerable e && !(o is string)) foreach (var x in e) list.Add(x?.ToString() ?? "");
            return list;
        }
    }
}
