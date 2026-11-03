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

        /// <summary>Flat OPC with the runs "tab ( [chapter .] number )".</summary>
        private static string NumberXml(string open, string close, bool chapter)
        {
            string t(string s) => "<w:r><w:t xml:space=\"preserve\">" + SecurityElement.Escape(s) + "</w:t></w:r>";
            string field(string instr) => "<w:fldSimple w:instr=\" " + instr + " \"><w:r><w:t>1</w:t></w:r></w:fldSimple>";
            var runs = "<w:r><w:tab/></w:r>" + t(open)
                + (chapter ? field("STYLEREF 1 \\s") + t(".") + field("SEQ MBEq \\* ARABIC \\s 1") : field("SEQ MBEq \\* ARABIC"))
                + t(close);
            return "<?xml version=\"1.0\" standalone=\"yes\"?><pkg:package xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\">"
                + "<pkg:part pkg:name=\"/_rels/.rels\" pkg:contentType=\"application/vnd.openxmlformats-package.relationships+xml\"><pkg:xmlData>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
                + "</pkg:xmlData></pkg:part><pkg:part pkg:name=\"/word/document.xml\" pkg:contentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"><pkg:xmlData>"
                + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p>" + runs + "</w:p></w:body></w:document>"
                + "</pkg:xmlData></pkg:part></pkg:package>";
        }

        private static bool IsBlank(string s) => string.IsNullOrEmpty(s) || s.All(c => char.IsWhiteSpace(c) || c == '\t');

        /// <summary>Gives the equation its own paragraph with a number (or keeps its number, re-laid out).</summary>
        public Dictionary<string, object> NumberEquation(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var open = p.TryGetValue("open", out var o) && o is string os ? os : "(";
            var close = p.TryGetValue("close", out var c) && c is string cs ? cs : ")";
            var chapter = Rpc.GetBool(p, "chapter");
            var found = FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "The equation is no longer in the document.");

            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Number equation");
            try
            {
                RemoveNumber(doc, found[0]);
                ReplaceControl(doc, FindByTag(doc, tag)[0], flatOpc);
                var cc = FindByTag(doc, tag)[0];
                TryHide(cc);

                // Own paragraph: split off text before and after.
                var para = cc.Range.Paragraphs[1];
                int ccStart = cc.Range.Start - 1, ccEnd = cc.Range.End + 1;
                if (!IsBlank(doc.Range(para.Range.Start, ccStart).Text)) doc.Range(ccStart, ccStart).InsertParagraphBefore();
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                ccEnd = cc.Range.End + 1;
                if (!IsBlank(doc.Range(ccEnd, para.Range.End - 1).Text)) doc.Range(ccEnd, ccEnd).InsertParagraphAfter();

                // Only the equation is left in the paragraph (plus blanks): clear those.
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                ccEnd = cc.Range.End + 1;
                if (para.Range.End - 1 > ccEnd) doc.Range(ccEnd, para.Range.End - 1).Delete();
                ccStart = cc.Range.Start - 1;
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
                int pos = cc.Range.End + 1;
                doc.Range(pos, pos).InsertXML(NumberXml(open, close, chapter));

                // Bookmark the number (after the tab) for cross-references.
                cc = FindByTag(doc, tag)[0];
                para = cc.Range.Paragraphs[1];
                int numStart = cc.Range.End + 1;
                while (numStart < para.Range.End - 1 && doc.Range(numStart, numStart + 1).Text == "\t") numStart++;
                var numRange = doc.Range(numStart, para.Range.End - 1);
                var name = BookmarkPrefix + InstanceId(tag);
                doc.Bookmarks.Add(name, numRange);
                numRange.Fields.Update();
                UpdateNumberFields(doc);
                return new Dictionary<string, object> { ["bookmark"] = name, ["number"] = (numRange.Text ?? "").Trim() };
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
            var found = FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "The equation is no longer in the document.");
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Remove equation number");
            try
            {
                RemoveNumber(doc, found[0]);
                ReplaceControl(doc, FindByTag(doc, tag)[0], flatOpc);
                foreach (var cc in FindByTag(doc, tag)) TryHide(cc);
                UpdateNumberFields(doc);
            }
            finally
            {
                undo.EndCustomRecord();
            }
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>Deletes the number, tabs and bookmark around a numbered equation (if any).</summary>
        private static void RemoveNumber(Word.Document doc, Word.ContentControl cc)
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
            int ccEnd = cc.Range.End + 1, ccStart = cc.Range.Start - 1;
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
        internal static Dictionary<string, object> NumberInfo(Word.ContentControl cc)
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

        private static string NumberText(Word.Bookmark bm)
        {
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
                    foreach (Word.ContentControl cc in para.ContentControls)
                    {
                        if (cc.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal))
                        {
                            tag = cc.Tag;
                            if (includeContent) flatOpc = cc.Range.WordOpenXML;
                            break;
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

        /// <summary>Inserts a cross-reference (REF field) to an equation number at the cursor.</summary>
        public Dictionary<string, object> InsertReference(Dictionary<string, object> p)
        {
            var doc = ActiveDocument();
            var name = Rpc.GetString(p, "bookmark");
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            bool exists;
            try { exists = doc.Bookmarks.Exists(name); }
            finally { doc.Bookmarks.ShowHidden = hidden; }
            if (!exists) throw new RpcException(Rpc.NotFound, "That equation number is no longer in the document.");
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Insert equation reference");
            try
            {
                var r = _app.Selection.Range;
                var field = doc.Fields.Add(r, Word.WdFieldType.wdFieldEmpty, "REF " + name + " \\h", false);
                field.Update();
                var end = field.Result.End;
                // Continue typing after the reference.
                doc.Range(end + 1, end + 1).Select();
                return new Dictionary<string, object> { ["text"] = field.Result.Text };
            }
            finally
            {
                undo.EndCustomRecord();
            }
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
                if (code.Contains("SEQ MBEq") || code.Contains("SEQ MTEqn") || (code.Contains("STYLEREF") && code.Contains("\\s") && HasNumberField(f.Code.Paragraphs[1].Range)))
                {
                    try { f.Update(); numbers++; } catch (COMException) { }
                }
                else if (code.Contains("REF " + BookmarkPrefix) || code.Contains("REF " + MathTypeBookmarkPrefix)) refs.Add(f);
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
