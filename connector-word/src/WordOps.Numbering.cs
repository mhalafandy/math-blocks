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
                if (code.Contains("MBPlaceRef") || code.Contains("MTPlaceRef")) return (f.Result?.Text ?? "").Replace("\t", "").Trim();
            }
            return "";
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
                var r = _app.Selection.Range;
                int start = r.Start;
                InsertInline(doc, r, NumberFields.Package(NumberFields.ReferenceRuns(target)));
                var inserted = doc.Range(start, _app.Selection.Range.End);
                inserted.Fields.Update();
                // The number shown is the REF field's result (inside GOTOBUTTON's display text).
                var text = "";
                foreach (Word.Field f in inserted.Fields)
                {
                    try
                    {
                        var code = f.Code.Text ?? "";
                        if (code.Contains("REF ") && !code.Contains("GOTOBUTTON")) { text = f.Result.Text ?? ""; break; }
                    }
                    catch (COMException)
                    {
                    }
                }
                return new Dictionary<string, object> { ["text"] = text.Trim() };
            }
            finally
            {
                undo.EndCustomRecord();
            }
        }

        /// <summary>
        /// InsertXML of a one-paragraph package at a point, staying in that paragraph: at the end of a
        /// paragraph Word can add a paragraph mark before the inserted runs (self-test: a reference
        /// typed after "See " landed on a new line); that mark is removed.
        /// </summary>
        internal static void InsertInline(Word.Document doc, Word.Range at, string package)
        {
            int start = at.Start;
            int before = doc.Paragraphs.Count;
            at.InsertXML(package);
            try
            {
                if (doc.Paragraphs.Count == before + 1 && (doc.Range(start, start + 1).Text ?? "") == "\r")
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
        public Dictionary<string, object> InsertNumberMarker(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            int chapter = p.TryGetValue("chapter", out var c) ? Convert.ToInt32(c) : 1;
            int section = p.TryGetValue("section", out var s) ? Convert.ToInt32(s) : 1;
            bool appendix = Rpc.GetBool(p, "appendix");
            bool restartEquations = !p.ContainsKey("restartEquations") || Rpc.GetBool(p, "restartEquations");
            string hiddenInstr(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:instrText xml:space=\"preserve\">" + SecurityElement.Escape(t) + "</w:instrText></w:r>";
            string hb(string t) => "<w:r><w:rPr><w:vanish/></w:rPr><w:fldChar w:fldCharType=\"" + t + "\"/></w:r>";
            var label = (appendix ? "Equation Appendix " : "Equation Chapter ") + chapter + " Section " + section;
            var runs = hb("begin") + hiddenInstr(" MACROBUTTON MBEquationSection ") + hiddenInstr(label)
                + (restartEquations ? hb("begin") + hiddenInstr(" SEQ MBEq \\r 0 \\h \\* MERGEFORMAT ") + hb("end") : "")
                + hb("begin") + hiddenInstr(" SEQ MBSec \\r " + section + " \\h \\* MERGEFORMAT ") + hb("end")
                + hb("begin") + hiddenInstr(" SEQ MBChap \\r " + chapter + " \\h \\* MERGEFORMAT ") + hb("end")
                + hb("end");
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Insert equation chapter marker");
            try
            {
                _app.Selection.Range.InsertXML(NumberFields.Package(runs));
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
            return UpdateNumberFields(doc);
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
            Log.Info("updateNumbers in " + doc.Name + ": " + numbers + " numbers, " + references + " references");
            return new Dictionary<string, object> { ["numbers"] = numbers, ["references"] = references };
        }
    }
}
