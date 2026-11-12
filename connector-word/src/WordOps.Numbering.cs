using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Equation numbering (M8). A numbered equation sits in its own paragraph laid out like
    /// MathType's: tab · equation (inline math) · tab · "(" SEQ MBEq ")". The number is covered by
    /// a hidden bookmark _MBEq_&lt;instance id&gt;, so Word cross-references (REF fields) work.
    /// </summary>
    internal sealed partial class WordOps
    {
        private const string BookmarkPrefix = "_MBEq_";
        private const string MathTypeBookmarkPrefix = "ZEqnNum";

        private static string InstanceId(string tag)
        {
            var parts = tag.Split('|');
            return parts.Length == 3 ? parts[2] : WordOps.RandomId(12);
        }

        /// <summary>Whether the nearest MathBlocks chapter marker before a position starts an appendix.</summary>
        private static bool InAppendix(Word.Document doc, int pos)
        {
            bool appendix = false;
            foreach (Word.Field f in doc.Fields)
            {
                string code;
                try
                {
                    if (f.Code.Start > pos) break;
                    code = f.Code.Text ?? "";
                }
                catch (COMException) { continue; }
                if (code.Contains("MBEquationSection")) appendix = code.Contains("Appendix");
            }
            return appendix;
        }

        /// <summary>Puts a numbered equation's number (and bookmarks) after its content control.</summary>
        private void InsertNumber(Word.Document doc, Eq cc, NumberFields.NumberFormat f, string name)
        {
            int pos = cc.After;
            doc.Range(pos, pos).InsertXML(NumberFields.Package("<w:r><w:tab/></w:r>" + NumberFields.NumberRuns(f, name, NumberOnlyName(name), f.Source == "markers" && InAppendix(doc, pos))));
        }

        /// <summary>Bookmark of the number without brackets ("1.2.3", for "Eq. 1.2.3").</summary>
        internal static string NumberOnlyName(string name) => name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) ? "_MBEqN_" + name.Substring(BookmarkPrefix.Length) : name + "N";

        private static bool IsBlank(string s) => string.IsNullOrEmpty(s) || s.All(c => char.IsWhiteSpace(c) || c == '\t');

        /// <summary>Gives the equation its own paragraph with a number (or keeps its number, re-laid out).</summary>
        public Dictionary<string, object> NumberEquation(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var fmt = NumberFields.NumberFormat.From(p);
            var found = new List<Eq> { VerifyForWrite(doc, tag, p, "numberEquation") };

            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Number equation");
            try
            {
                RemoveNumber(doc, found[0]);
                ReplaceEquationContent(doc, FindByTag(doc, tag)[0], flatOpc, tag);
                var cc = FindByTag(doc, tag)[0];
                if (!cc.IsPicture) Secure(cc.Control);

                // Own paragraph: split off text before and after.
                var para = cc.Range.Paragraphs[1];
                int ccStart = cc.Before, ccEnd = cc.After;
                if (!IsBlank(doc.Range(para.Range.Start, ccStart).Text)) doc.Range(ccStart, ccStart).InsertParagraphBefore();
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                ccEnd = cc.After;
                if (!IsBlank(doc.Range(ccEnd, para.Range.End - 1).Text)) doc.Range(ccEnd, ccEnd).InsertParagraphAfter();

                // Only the equation is left in the paragraph (plus blanks): clear those.
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                ccEnd = cc.After;
                if (para.Range.End - 1 > ccEnd) doc.Range(ccEnd, para.Range.End - 1).Delete();
                ccStart = cc.Before;
                if (ccStart > para.Range.Start) doc.Range(para.Range.Start, ccStart).Delete();

                // Tab stops: centre of the text column, right margin.
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                var ps = para.Range.Sections[1].PageSetup;
                float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - para.LeftIndent - para.RightIndent;
                para.Alignment = Word.WdParagraphAlignment.wdAlignParagraphLeft;
                para.FirstLineIndent = 0;
                para.TabStops.ClearAll();
                para.TabStops.Add(width / 2, Word.WdTabAlignment.wdAlignTabCenter);
                para.TabStops.Add(width, Word.WdTabAlignment.wdAlignTabRight);

                doc.Range(para.Range.Start, para.Range.Start).InsertBefore("\t");
                cc = FindByTag(doc, tag)[0];
                var name = BookmarkPrefix + InstanceId(tag);
                // One field holding brackets and counters, bookmarked inside (as MathType does).
                InsertNumber(doc, cc, fmt, name);
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                para.Range.Fields.Update();
                UpdateNumberFields(doc);
                return new Dictionary<string, object> { ["bookmark"] = name, ["number"] = NumberTextOf(para.Range) };
            }
            catch (COMException ex)
            {
                throw new RpcException(Rpc.WordRejected, "Word refused to number the equation: " + ex.Message);
            }
            finally
            {
                undo.EndCustomRecord();
            }
        }

        /// <summary>Removes the number: the equation becomes an ordinary display equation again.</summary>
        public Dictionary<string, object> UnnumberEquation(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var found = new List<Eq> { VerifyForWrite(doc, tag, p, "unnumberEquation") };
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Remove equation number");
            try
            {
                RemoveNumber(doc, found[0]);
                ReplaceEquationContent(doc, FindByTag(doc, tag)[0], flatOpc, tag);
                foreach (var cc in FindByTag(doc, tag)) if (!cc.IsPicture) Secure(cc.Control);
                UpdateNumberFields(doc);
            }
            finally
            {
                undo.EndCustomRecord();
            }
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>Deletes the number, tabs and bookmark around a numbered equation (if any).</summary>
        private static void RemoveNumber(Word.Document doc, Eq cc)
        {
            var para = cc.Range.Paragraphs[1];
            if (!HasNumberField(para.Range)) return;
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (Word.Bookmark bm in para.Range.Bookmarks.Cast<Word.Bookmark>().ToList())
                    if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) || bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal)) bm.Delete();
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            int ccEnd = cc.After, ccStart = cc.Before;
            if (para.Range.End - 1 > ccEnd) doc.Range(ccEnd, para.Range.End - 1).Delete();
            if (ccStart > para.Range.Start) doc.Range(para.Range.Start, ccStart).Delete();
            para.TabStops.ClearAll();
        }

        private static bool HasNumberField(Word.Range r)
        {
            foreach (Word.Field f in r.Fields)
            {
                var code = f.Code?.Text ?? "";
                if (code.Contains("SEQ ")) return true;
            }
            return false;
        }

        /// <summary>Number of the equation's paragraph, for the editor: null when not numbered.</summary>
        internal static Dictionary<string, object> NumberInfo(Eq cc)
        {
            try
            {
                var para = cc.Range.Paragraphs[1];
                if (!HasNumberField(para.Range)) return null;
                var doc = (Word.Document)cc.Range.Document;
                bool hidden = doc.Bookmarks.ShowHidden;
                doc.Bookmarks.ShowHidden = true;
                try
                {
                    foreach (Word.Bookmark bm in para.Range.Bookmarks)
                        if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) || bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal))
                            return new Dictionary<string, object> { ["bookmark"] = bm.Name, ["number"] = NumberText(bm) };
                }
                finally
                {
                    doc.Bookmarks.ShowHidden = hidden;
                }
                return new Dictionary<string, object> { ["bookmark"] = null, ["number"] = "" };
            }
            catch (COMException)
            {
                return null;
            }
        }

        /// <summary>What a numbered paragraph's number field shows, e.g. "(1.2.3)".</summary>
        private static string NumberTextOf(Word.Range para)
        {
            foreach (Word.Field f in para.Fields)
            {
                string code;
                try { code = f.Code?.Text ?? ""; } catch (COMException) { continue; }
                if (code.Contains("MBPlaceRef") || code.Contains("MTPlaceRef")) return ButtonDisplay(f);
            }
            return "";
        }

        /// <summary>
        /// What a MACROBUTTON / GOTOBUTTON field shows. These fields have no result (Field.Result is empty):
        /// their display text is the end of their code, with nested fields showing their results.
        /// </summary>
        internal static string ButtonDisplay(Word.Field f)
        {
            // Through Word's ranges: the code's own text between nested fields, and each nested field's result.
            try
            {
                var codeRange = f.Code;
                var doc = codeRange.Document;
                var nested = new List<Word.Field>();
                foreach (Word.Field n in codeRange.Fields) nested.Add(n);
                nested.Sort((x, y) => x.Code.Start.CompareTo(y.Code.Start));
                var sb = new System.Text.StringBuilder();
                int pos = codeRange.Start;
                foreach (var n in nested)
                {
                    int begin = n.Code.Start - 1;
                    if (begin < pos) continue; // nested deeper (inside a field already taken)
                    sb.Append(doc.Range(pos, begin).Text ?? "");
                    // A field without a result part (MathType's hidden counter) ends right after its code; Word
                    // then reports an empty "result" just past the field, which must not be skipped over (it is
                    // the next character — the number's opening bracket).
                    int end = n.Code.End + 1;
                    try
                    {
                        var mark = doc.Range(n.Code.End, n.Code.End + 1).Text ?? "";
                        bool hasResult = mark == "\u0014";
                        var r = n.Result;
                        if (hasResult && r != null && r.End >= r.Start && r.Start > n.Code.End)
                        {
                            sb.Append(r.Text ?? "");
                            end = r.End + 1;
                        }
                    }
                    catch (COMException)
                    {
                    }
                    pos = Math.Min(end, codeRange.End);
                }
                if (pos < codeRange.End) sb.Append(doc.Range(pos, codeRange.End).Text ?? "");
                var walked = ButtonText(DisplayText(sb.ToString())).Replace("\t", "").Trim();
                if (walked.Length > 0) return walked;
            }
            catch (COMException)
            {
            }
            string code;
            try { code = f.Code.Text ?? ""; } catch (COMException) { return ""; }
            var shown = DisplayText("\u0013" + code + "\u0015").Replace("\t", "").Trim();
            if (shown.Length > 0) return shown;
            try { return (f.Result?.Text ?? "").Replace("\t", "").Trim(); } catch (COMException) { return ""; }
        }

        private static readonly System.Text.RegularExpressions.Regex InnerField = new System.Text.RegularExpressions.Regex("\u0013([^\u0013\u0014\u0015]*)(?:\u0014([^\u0013\u0014\u0015]*))?\u0015");

        /// <summary>
        /// Text as it reads on the page: Word's range text holds the codes of fields (\u0013 code \u0014 result
        /// \u0015); fields with a result show it, MACROBUTTON/GOTOBUTTON show their display text, others nothing.
        /// </summary>
        internal static string DisplayText(string text)
        {
            if (string.IsNullOrEmpty(text) || text.IndexOf('\u0013') < 0) return text ?? "";
            for (int guard = 0; guard < 50; guard++)
            {
                var next = InnerField.Replace(text, m => m.Groups[2].Success ? m.Groups[2].Value : ButtonText(m.Groups[1].Value));
                if (next == text) break;
                text = next;
            }
            return text.Replace("\u0013", "").Replace("\u0014", "").Replace("\u0015", "");
        }

        /// <summary>The display text of a button field's code: after the keyword, its argument and its switches.</summary>
        private static string ButtonText(string code)
        {
            var t = code.Trim();
            var m = System.Text.RegularExpressions.Regex.Match(t, @"^(MACROBUTTON|GOTOBUTTON)\s+\S+\s*((?:\\\*\s*[A-Za-z]+\s*|\\[a-z](?![A-Za-z])\s*)*)(.*)$", System.Text.RegularExpressions.RegexOptions.Singleline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return m.Success ? m.Groups[3].Value : "";
        }

        private static string NumberText(Word.Bookmark bm)
        {
            var single = NumberTextOf(bm.Range.Paragraphs[1].Range);
            if (single.Length > 0) return single;
            var text = bm.Range.Text ?? "";
            // MathType's bookmark covers a MACROBUTTON field: take what the field displays.
            if (bm.Range.Fields.Count > 0 && (text.Contains("MACROBUTTON") || text.Contains("SEQ"))) text = bm.Range.Fields[1].Result.Text ?? text;
            return text.Replace("\t", "").Trim();
        }

        /// <summary>Numbered equations of a document (MathBlocks and MathType numbers), in order.</summary>
        public Dictionary<string, object> ListNumbered(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var includeContent = Rpc.GetBool(p, "includeContent");
            var items = new List<KeyValuePair<int, Dictionary<string, object>>>();
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (Word.Bookmark bm in doc.Bookmarks)
                {
                    var name = bm.Name;
                    bool ours = name.StartsWith(BookmarkPrefix, StringComparison.Ordinal);
                    if (!ours && !name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal)) continue;
                    var para = bm.Range.Paragraphs[1].Range;
                    string tag = null, flatOpc = null;
                    foreach (Word.InlineShape s in para.InlineShapes)
                    {
                        if (IsTag(TagOf(s)) && !InsideMathBlocksControl(s.Range))
                        {
                            tag = TagOf(s);
                            if (includeContent) flatOpc = s.Range.WordOpenXML;
                            break;
                        }
                    }
                    if (tag == null)
                    {
                        foreach (Word.ContentControl cc in para.ContentControls)
                        {
                            if (cc.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal))
                            {
                                tag = cc.Tag;
                                if (includeContent) flatOpc = cc.Range.WordOpenXML;
                                break;
                            }
                        }
                    }
                    int page = 0;
                    try { page = Convert.ToInt32(bm.Range.get_Information(Word.WdInformation.wdActiveEndPageNumber)); } catch (COMException) { }
                    var context = (para.Text ?? "").Replace("\r", " ").Replace("\a", " ").Trim();
                    if (context.Length > 100) context = context.Substring(0, 100) + "…";
                    var item = new Dictionary<string, object>
                    {
                        ["bookmark"] = name,
                        ["number"] = NumberText(bm),
                        ["kind"] = ours ? "mathblocks" : "mathtype",
                        ["page"] = page,
                        ["tag"] = tag,
                        ["context"] = context,
                    };
                    if (flatOpc != null) item["flatOpc"] = flatOpc;
                    items.Add(new KeyValuePair<int, Dictionary<string, object>>(bm.Range.Start, item));
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            return new Dictionary<string, object>
            {
                ["name"] = doc.Name,
                ["fullName"] = doc.FullName,
                ["equations"] = items.OrderBy(x => x.Key).Select(x => (object)x.Value).ToList(),
            };
        }

        /// <summary>
        /// Inserts a reference to an equation number at the cursor, as one field (GOTOBUTTON around
        /// REF, like MathType's): "(1.2.3)", or "1.2.3" with numberOnly (for "Eq. 1.2.3").
        /// </summary>
        public Dictionary<string, object> InsertReference(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            var name = Rpc.GetString(p, "bookmark");
            var numberOnly = Rpc.GetBool(p, "numberOnly");
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            bool exists, onlyExists;
            try
            {
                exists = doc.Bookmarks.Exists(name);
                onlyExists = doc.Bookmarks.Exists(NumberOnlyName(name));
            }
            finally { doc.Bookmarks.ShowHidden = hidden; }
            if (!exists) throw new RpcException(Rpc.NotFound, "That equation number is no longer in the document.");
            var target = numberOnly && onlyExists ? NumberOnlyName(name) : name;
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Insert equation reference");
            try
            {
                // Word's field commands, not XML: an XML insertion at the end of the last paragraph starts a
                // new paragraph (self-test 0.1.88–0.1.91); fields are inserted in place, in the sentence.
                InsertReferenceFields(doc, _app.Selection.Range, target);
                // The number the reference shows: the bookmarked number's text (the REF field inside
                // GOTOBUTTON's display text is not listed among the range's fields).
                var text = "";
                bool hid = doc.Bookmarks.ShowHidden;
                doc.Bookmarks.ShowHidden = true;
                try
                {
                    if (doc.Bookmarks.Exists(target)) text = doc.Bookmarks[target].Range.Text ?? "";
                }
                catch (COMException)
                {
                }
                finally
                {
                    doc.Bookmarks.ShowHidden = hid;
                }
                return new Dictionary<string, object> { ["text"] = text.Trim() };
            }
            finally
            {
                undo.EndCustomRecord();
            }
        }

        /// <summary>
        /// A reference as the add-in writes it — { GOTOBUTTON bookmark { REF bookmark \* Charformat \! } }
        /// (Ctrl+click jumps to the equation) — inserted at a point with Word's field commands; the caret
        /// ends after it.
        /// </summary>
        internal static void InsertReferenceFields(Word.Document doc, Word.Range at, string target)
        {
            int start = at.Start;
            Word.Field outer = null;
            try
            {
                outer = doc.Fields.Add(doc.Range(start, start), Word.WdFieldType.wdFieldEmpty, "GOTOBUTTON " + target + "  \\* MERGEFORMAT ", false);
                // The REF field goes at the end of GOTOBUTTON's code (the button's display text): a
                // collapsed copy of the code range, so the new field lands inside the code.
                var inside = outer.Code.Duplicate;
                inside.Collapse(Word.WdCollapseDirection.wdCollapseEnd);
                var inner = doc.Fields.Add(inside, Word.WdFieldType.wdFieldEmpty, "REF " + target + " \\* Charformat \\! \\* MERGEFORMAT", false);
                try { inner.Update(); } catch (Exception) { }
                // GOTOBUTTON has no result: the field ends right after its code.
                int end = Math.Min(outer.Code.End + 1, doc.Content.End - 1);
                doc.Range(end, end).Select();
                Log.Info("insert reference: fields inserted for " + target);
            }
            catch (Exception ex)
            {
                // Fallback: the XML insertion (stays in the paragraph except at the end of the last one).
                Log.Error("insert reference with fields failed; using XML instead", ex);
                try { outer?.Delete(); } catch (Exception) { }
                InsertInline(doc, doc.Range(start, start), NumberFields.Package(NumberFields.ReferenceRuns(target)));
            }
        }

        /// <summary>
        /// InsertXML of a one-paragraph package at a point, staying in that paragraph: at the end of a
        /// paragraph Word can add a paragraph mark before the inserted runs (self-test: a reference
        /// typed after "See " landed on a new line); that mark is removed.
        /// </summary>
        internal static void InsertInline(Word.Document doc, Word.Range at, string package)
        {
            // InsertXML over a placeholder character stays inside the paragraph (at an empty point at a
            // paragraph's end Word adds a paragraph mark before the inserted runs).
            int start = at.Start;
            doc.Range(start, start).InsertAfter("#");
            var placeholder = doc.Range(start, start + 1);
            int before = doc.Paragraphs.Count;
            placeholder.InsertXML(package);
            try
            {
                // The placeholder was a character in the paragraph: a paragraph mark now at its place was
                // added by Word (seen at the end of the last paragraph).
                if ((doc.Range(start, start + 1).Text ?? "") == "\r")
                {
                    doc.Range(start, start + 1).Delete();
                    Log.Info("insert: removed the paragraph mark Word added before inserted runs");
                }
            }
            catch (COMException)
            {
            }
        }

        /// <summary>
        /// Hidden chapter/section marker (for documents whose headings are not numbered by Word),
        /// like MathType's "Equation Chapter n Section m": it sets the chapter and section counters
        /// and restarts the equation counter. "Appendix" makes the chapter number a letter.
        /// </summary>
        internal static string MarkerRuns(int chapter, int section, bool appendix, bool restartEquations)
        {
            string hiddenInstr(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:instrText xml:space=\"preserve\">" + SecurityElement.Escape(t) + "</w:instrText></w:r>";
            string hb(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType=\"" + t + "\"/></w:r>";
            var label = (appendix ? "Equation Appendix " : "Equation Chapter ") + chapter + " Section " + section;
            return hb("begin") + hiddenInstr(" MACROBUTTON MBEquationSection ") + hiddenInstr(label)
                + (restartEquations ? hb("begin") + hiddenInstr(" SEQ MBEq \\r 0 \\h \\* MERGEFORMAT ") + hb("end") : "")
                + hb("begin") + hiddenInstr(" SEQ MBSec \\r " + section + " \\h \\* MERGEFORMAT ") + hb("end")
                + hb("begin") + hiddenInstr(" SEQ MBChap \\r " + chapter + " \\h \\* MERGEFORMAT ") + hb("end")
                + hb("end");
        }

        public Dictionary<string, object> InsertNumberMarker(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            int chapter = p.TryGetValue("chapter", out var c) ? Convert.ToInt32(c) : 1;
            int section = p.TryGetValue("section", out var s) ? Convert.ToInt32(s) : 1;
            bool appendix = Rpc.GetBool(p, "appendix");
            bool restartEquations = !p.ContainsKey("restartEquations") || Rpc.GetBool(p, "restartEquations");
            var runs = MarkerRuns(chapter, section, appendix, restartEquations);
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Insert equation chapter marker");
            try
            {
                // At an empty point at a paragraph's end, InsertXML adds a paragraph mark before the runs (the
                // marker would land after the cursor): through a placeholder it stays where the cursor is.
                var sel = _app.Selection;
                int at = sel.Start, length = doc.Content.End;
                InsertInline(doc, sel.Range, NumberFields.Package(runs));
                // The cursor goes after the marker, so what is typed or inserted next belongs to the new section.
                int after = at + (doc.Content.End - length);
                sel.SetRange(after, after);
                UpdateNumberFields(doc);
            }
            finally
            {
                undo.EndCustomRecord();
            }
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>
        /// Upgrade numbering: MathBlocks numbers built the old way (brackets as text, separate fields)
        /// become one field each, keeping their bookmark names, so every reference still points at the
        /// same equation; old references become one field too. MathType numbers are left alone.
        /// </summary>
        public Dictionary<string, object> UpgradeNumbering(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var fmt = NumberFields.NumberFormat.From(p);
            int numbers = 0, references = 0;
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            var undo = _app.UndoRecord;
            var own = !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Upgrade equation numbering");
            try
            {
                foreach (var cc0 in AllEquations(doc))
                {
                    var tag = cc0.Tag;
                    var para = cc0.Range.Paragraphs[1].Range;
                    if (!HasNumberField(para)) continue;
                    // Rebuilt every time (format changes apply too); the bookmark name is kept.
                    string name = null;
                    foreach (Word.Bookmark bm in para.Bookmarks)
                        if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal)) { name = bm.Name; break; }
                    if (name == null) name = BookmarkPrefix + InstanceId(tag);
                    RemoveNumber(doc, cc0);
                    var cc = FindByTag(doc, tag)[0];
                    var pr = cc.Range.Paragraphs[1];
                    var ps = pr.Range.Sections[1].PageSetup;
                    float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - pr.LeftIndent - pr.RightIndent;
                    pr.TabStops.ClearAll();
                    pr.TabStops.Add(width / 2, Word.WdTabAlignment.wdAlignTabCenter);
                    pr.TabStops.Add(width, Word.WdTabAlignment.wdAlignTabRight);
                    doc.Range(pr.Range.Start, pr.Range.Start).InsertBefore("\t");
                    InsertNumber(doc, FindByTag(doc, tag)[0], fmt, name);
                    numbers++;
                }
                // Old references: REF _MBEq_… not yet inside a GOTOBUTTON.
                var old = new List<Word.Field>();
                foreach (Word.Field f in doc.Fields)
                {
                    string code;
                    try { code = (f.Code.Text ?? "").Trim(); } catch (COMException) { continue; }
                    if (!code.StartsWith("REF " + BookmarkPrefix, StringComparison.Ordinal)) continue;
                    var before = doc.Range(Math.Max(0, f.Code.Start - 60), f.Code.Start).Text ?? "";
                    if (before.Contains("GOTOBUTTON")) continue;
                    old.Add(f);
                }
                foreach (var f in old)
                {
                    var code = (f.Code.Text ?? "").Trim();
                    var bookmark = code.Split(' ')[1];
                    int start = f.Code.Start - 1;
                    int end = f.Result.End + 1;
                    var r = doc.Range(start, end);
                    r.Text = "";
                    doc.Range(start, start).InsertXML(NumberFields.Package(NumberFields.ReferenceRuns(bookmark)));
                    references++;
                }
                UpdateNumberFields(doc);
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
                if (own) undo.EndCustomRecord();
            }
            Log.Info("upgradeNumbering in " + doc.Name + ": " + numbers + " numbers, " + references + " references");
            return new Dictionary<string, object> { ["numbers"] = numbers, ["references"] = references };
        }

        /// <summary>Updates equation numbers (SEQ MBEq / MTEqn, chapter fields) and references to them.</summary>
        public Dictionary<string, object> UpdateNumbers(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            return InOneUndo("Update equation numbers", () =>
            {
                bool screen = _app.ScreenUpdating;
                try
                {
                    _app.ScreenUpdating = false;
                    return UpdateNumberFields(doc);
                }
                finally
                {
                    _app.ScreenUpdating = screen;
                }
            }, null, doc);
        }

        private static Dictionary<string, object> UpdateNumberFields(Word.Document doc)
        {
            int numbers = 0, references = 0;
            var refs = new List<Word.Field>();
            foreach (Word.Field f in doc.Fields)
            {
                string code;
                try { code = f.Code?.Text ?? ""; } catch (COMException) { continue; }
                if (code.Contains("SEQ MBEq") || code.Contains("SEQ MTEqn") || code.Contains("MBPlaceRef") || code.Contains("SEQ MBChap") || code.Contains("SEQ MBSec") || (code.Contains("STYLEREF") && code.Contains("\\s") && HasNumberField(f.Code.Paragraphs[1].Range)))
                {
                    try { f.Update(); numbers++; } catch (COMException) { }
                }
                else if (code.Contains("REF " + BookmarkPrefix) || code.Contains("REF _MBEqN_") || code.Contains("REF " + MathTypeBookmarkPrefix) || code.Contains("GOTOBUTTON " + BookmarkPrefix)) refs.Add(f);
            }
            // References last, so they show the new numbers.
            foreach (var f in refs)
            {
                try { f.Update(); references++; } catch (COMException) { }
            }
            // References to equations that are gone (Word would show "Error! Reference source not found"):
            // listed with the text around them, so none goes unnoticed.
            var broken = new List<object>();
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (var f in refs)
                {
                    try
                    {
                        var code = (f.Code.Text ?? "").Trim();
                        if (!code.StartsWith("REF ", StringComparison.Ordinal)) continue;
                        var name = code.Substring(4).Trim().Split(' ')[0];
                        if (doc.Bookmarks.Exists(name)) continue;
                        var para = f.Code.Paragraphs[1].Range;
                        var raw = para.Text ?? "";
                        int rawAt = Math.Max(0, Math.Min(raw.Length, f.Code.Start - para.Start));
                        // As it reads on the page (no field codes); the position mapped through the same cleaning.
                        int at = DisplayText(raw.Substring(0, rawAt)).Length;
                        var text = DisplayText(raw).Replace("\r", " ").Replace("\a", " ").Replace("\t", " ").Trim();
                        at = Math.Max(0, Math.Min(text.Length, at));
                        int from = Math.Max(0, at - 40);
                        var snippet = (from > 0 ? "…" : "") + text.Substring(from, Math.Min(text.Length - from, 80)) + (from + 80 < text.Length ? "…" : "");
                        broken.Add(new Dictionary<string, object> { ["bookmark"] = name, ["snippet"] = snippet, ["at"] = f.Code.Start });
                    }
                    catch (COMException)
                    {
                    }
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            Log.Info("updateNumbers in " + doc.Name + ": " + numbers + " numbers, " + references + " references, " + broken.Count + " broken");
            return new Dictionary<string, object> { ["numbers"] = numbers, ["references"] = references, ["broken"] = broken };
        }
    }
}
