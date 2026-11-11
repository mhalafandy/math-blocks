using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Pasted Classic equations. Copying only the picture (or some paste modes) drops the content
    /// control that gives an equation its identity; the picture still carries its source (EMF
    /// comment "MathBlocks1:{…}", alt text "MathBlocks display: …" as a backup). Such pictures are
    /// recognised and wrapped again, with a new instance id so two copies never share one.
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>What MathBlocks data a picture's XML carries: "emf", "alt", or null.</summary>
        internal static string MathBlocksData(string xml, out string emfJson) => PictureXml.Data(xml, out emfJson);

        private static bool InsideMathBlocksControl(Word.Range r)
        {
            try
            {
                var cc = r.ParentContentControl;
                while (cc != null)
                {
                    if (cc.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal)) return true;
                    cc = cc.ParentContentControl;
                }
            }
            catch (COMException)
            {
            }
            return false;
        }

        /// <summary>The MathBlocks picture in (or right next to) a range that has lost its content control.</summary>
        internal Word.InlineShape UnwrappedPictureAt(Word.Document doc, Word.Range r, out string how)
        {
            how = null;
            // A floating MathBlocks picture under the selection (pasted as floating): back in line first.
            try
            {
                var sel = _app.Selection;
                if (sel.Type == Word.WdSelectionType.wdSelectionShape && sel.ShapeRange.Count > 0)
                {
                    foreach (Word.Shape sh in sel.ShapeRange)
                    {
                        // Only a really floating picture: an in-line one is never converted.
                        if (sh.WrapFormat.Type == Word.WdWrapType.wdWrapInline || !IsMathBlocksShape(sh)) continue;
                        string wrap = "?";
                        try { wrap = sh.WrapFormat.Type.ToString(); } catch (COMException) { }
                        Log.Info("a pasted MathBlocks picture is floating (" + wrap + "); putting it back in line");
                        var inline = sh.ConvertToInlineShape();
                        Log.Info("a floating MathBlocks picture was put back in line with the text");
                        how = MathBlocksData(inline.Range.WordOpenXML, out _) ?? "alt";
                        return inline;
                    }
                }
            }
            catch (COMException)
            {
                // No shapes in the selection.
            }
            var ranges = new List<Word.Range> { r };
            if (r.Start == r.End)
            {
                ranges.Add(doc.Range(r.Start, Math.Min(r.Start + 1, doc.Content.End)));
                if (r.Start > 0) ranges.Add(doc.Range(r.Start - 1, r.Start));
            }
            foreach (var range in ranges)
            {
                foreach (Word.InlineShape s in range.InlineShapes)
                {
                    if (InsideMathBlocksControl(s.Range)) continue;
                    var xml = s.Range.WordOpenXML;
                    how = MathBlocksData(xml, out _);
                    if (how != null)
                    {
                        // Diagnosis of how pastes arrive (which paste modes keep what).
                        Log.Info("unwrapped MathBlocks picture: data " + how + ", VML " + xml.Contains("<v:imagedata") + ", DrawingML " + xml.Contains("<pic:pic") + ", EMF " + xml.Contains("image/x-emf") + ", PNG " + xml.Contains("image/png"));
                        return s;
                    }
                }
            }
            return null;
        }

        /// <summary>
        /// A MathBlocks picture that had no ID title (pasted or dropped): its ID — the one in its hidden
        /// source when there is one (its identity is restored), else a new one. No wrapper: the picture
        /// is the equation. Returns the tag.
        /// </summary>
        internal string AdoptPicture(Word.Document doc, Word.InlineShape shape, string blockId = null)
        {
            var undo = _app.UndoRecord;
            var own = !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Restore MathBlocks equation");
            string tag;
            try
            {
                tag = EnsurePictureTag(shape);
                if (tag == null)
                {
                    tag = "mb1|" + (string.IsNullOrEmpty(blockId) ? "-" : blockId) + "|" + RandomId(12);
                    SetPictureTag(shape, tag);
                }
                // A copy keeps its source's ID: the original keeps it, this one gets its own.
                if (FindByTag(doc, tag).Count > 1) ResolveDuplicates(doc, tag);
                tag = TagOf(shape);
            }
            finally
            {
                if (own) undo.EndCustomRecord();
            }
            Log.Info("pasted MathBlocks picture identified as " + tag);
            return tag;
        }

        /// <summary>
        /// Older documents: a Classic equation inside a wrapper becomes a titled picture (the wrapper's
        /// ID moves to the picture's title, the wrapper goes). Native equations and MathType objects
        /// are left alone. Returns how many.
        /// </summary>
        internal int ConvertWrappedPictures(Word.Document doc, bool dry)
        {
            int n = 0;
            foreach (var cc in WrapperControls(doc))
            {
                try
                {
                    if (UnwrapClassic(doc, cc, dry, "repair")) n++;
                }
                catch (COMException ex)
                {
                    Log.Error("repair: could not convert a wrapped equation", ex);
                }
            }
            return n;
        }

        /// <summary>
        /// A wrapper holding exactly one Classic picture (and nothing else): the picture takes the
        /// wrapper's tag as its title and the wrapper goes. Native equations keep their wrapper.
        /// </summary>
        internal bool UnwrapClassic(Word.Document doc, Word.ContentControl cc, bool dry, string why)
        {
            var r = cc.Range;
            if (r.OMaths.Count > 0) return false; // a native equation keeps its wrapper
            var c = Inspect(doc, new Eq(cc));
            if (c.PictureSources.Count != 1 || EquationIdentity.Problem(c) != null) return false;
            Word.InlineShape picture = null;
            foreach (Word.InlineShape s in r.InlineShapes)
                if (PictureSource(s.Range.WordOpenXML) != null) { picture = s; break; }
            if (picture == null) return false;
            if (dry) return true;
            var tag = cc.Tag;
            Unlock(cc);
            SetPictureTag(picture, tag);
            cc.Delete(false);
            Log.Info(why + ": the wrapped Classic equation " + tag + " is now a titled picture");
            return true;
        }

        private static readonly System.Text.RegularExpressions.Regex XmlTagRe =
            new System.Text.RegularExpressions.Regex("w:tag w:val=\"(mb1\\|[^\"]+)\"", System.Text.RegularExpressions.RegexOptions.Compiled);

        /// <summary>
        /// After inserting app content (Flat OPC): the Classic equations it brought become titled pictures
        /// (no wrapper), a picture inserted without a wrapper gets its ID title, native wrappers are secured.
        /// </summary>
        internal void FinishInserted(Word.Document doc, string flatOpc, int at = -1, string tag = null)
        {
            if (!flatOpc.Contains("<w:sdt"))
            {
                if (tag != null && at >= 0) TitleInsertedPicture(doc, at, tag);
                return;
            }
            var tags = new HashSet<string>();
            foreach (System.Text.RegularExpressions.Match m in XmlTagRe.Matches(flatOpc)) tags.Add(m.Groups[1].Value);
            if (tag != null) tags.Add(tag);
            foreach (var t in tags)
            {
                foreach (var e in FindByTag(doc, t))
                {
                    if (e.IsPicture) continue;
                    try
                    {
                        if (!UnwrapClassic(doc, e.Control, false, "insert")) Secure(e.Control);
                    }
                    catch (COMException ex)
                    {
                        Log.Error("insert: could not finish " + t, ex);
                    }
                }
            }
        }

        /// <summary>
        /// Repair equations: floating pictures back in line, wrappers that grew split, wrapped Classic
        /// equations converted to titled pictures, pictures without ID identified (from their hidden
        /// source), copies given their own ID (originals keep theirs), numbered copies bookmarked.
        /// Native equations and MathType objects are left alone. Reports what it found.
        /// </summary>
        public Dictionary<string, object> RepairEquations(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            // Dry run: count what would be repaired (to decide on a backup first), change nothing.
            var dry = Rpc.GetBool(p, "dryRun");
            var renamed = new List<object>();
            var wrapped = new List<object>();
            var splitReport = new List<object>();
            int split = 0, unlocked = 0, inlined = 0, converted = 0;
            int ok = 0, plainPictures = 0, bookmarks = 0, lowered = 0, toObjects = 0, idRewrites = 0, styled = 0;
            var redraw = new List<object>();
            bool screen = _app.ScreenUpdating;
            var undo = _app.UndoRecord;
            var own = !dry && !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Repair MathBlocks equations");
            try
            {
                _app.ScreenUpdating = false;
                // Pasted pictures that came in floating: back in line first.
                inlined = dry ? InlineFloatingPictures(doc, true) : InlineFloatingNow(doc);
                // Wrappers that grew (several equations, text, nested wrappers): one equation each again.
                split = SplitWrappers(doc, dry, splitReport);
                // Older documents: wrapped Classic equations become titled pictures.
                converted = ConvertWrappedPictures(doc, dry);
                // Pictures with MathBlocks data but no ID title: identified.
                var shapes = new List<Word.InlineShape>();
                foreach (Word.InlineShape s in doc.InlineShapes) shapes.Add(s);
                foreach (var s in shapes)
                {
                    if (InsideMathBlocksControl(s.Range) || IsTag(TagOf(s)))
                    {
                        ok++;
                        continue;
                    }
                    var how = MathBlocksData(s.Range.WordOpenXML, out _);
                    if (how == null)
                    {
                        plainPictures++;
                        continue;
                    }
                    var tag = dry ? "" : EnsurePictureTag(s);
                    wrapped.Add(new Dictionary<string, object> { ["tag"] = tag ?? "", ["source"] = how });
                }
                if (dry)
                {
                    var seen = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var e in AllEquations(doc)) if (!seen.Add(e.Tag)) renamed.Add(new Dictionary<string, object> { ["from"] = e.Tag, ["to"] = "" });
                }
                else foreach (var pair in ResolveDuplicates(doc)) renamed.Add(pair);
                bookmarks = BookmarkNumberedEquations(doc, dry);
                // Numbered equation paragraphs that lost their style (an earlier Convert MathType rewrote
                // the paragraphs): MTDisplayEquation back, or the numbering's tab stops.
                styled = RestoreEquationParagraphStyles(doc, dry);
                // Every Classic equation: its baseline lowering back from its stored depth; Classic pictures
                // (the form before embedded objects) and objects holding another ID inside are listed for
                // the app to redraw as objects with the same ID.
                foreach (var e in AllEquations(doc))
                {
                    if (!e.IsPicture) continue;
                    try
                    {
                        PictureXml.Data(e.Xml, out var json);
                        var depth = DepthOf(e.Picture);
                        if (depth != null)
                        {
                            var want = -(int)Math.Round(depth.Value);
                            var cur = LoweringOf(e.Picture);
                            if (cur != null && (int)Math.Round(cur.Value) != want)
                            {
                                lowered++;
                                if (!dry) e.Range.Font.Position = want;
                            }
                        }
                        // Redrawn by the app as an embedded object, same ID: every Classic picture (the form
                        // before objects), and objects whose own data holds another ID (a copy).
                        string reason = null;
                        if (!e.IsObject) reason = "picture";
                        else if (ObjectDataTag(e.Picture) != e.Tag) reason = "id";
                        if (reason != null)
                        {
                            var full = PictureXml.Source(e.Xml) ?? json;
                            var latex = EquationIdentity.FirstLatex(full) ?? EquationIdentity.AltParts(AltOf(e.Picture))?[1];
                            var mode = PictureXml.Mode(full) ?? EquationIdentity.AltParts(AltOf(e.Picture))?[0] ?? "inline";
                            if (!string.IsNullOrEmpty(latex))
                            {
                                redraw.Add(new Dictionary<string, object> { ["tag"] = e.Tag, ["latex"] = latex, ["mode"] = mode, ["reason"] = reason });
                                if (reason == "picture") toObjects++; else idRewrites++;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Log.Error("repair: checking a picture's source", ex);
                    }
                }
                if (!dry) unlocked = UnlockAll(doc);
            }
            finally
            {
                _app.ScreenUpdating = screen;
                if (own) undo.EndCustomRecord();
            }
            // Left untouched, reported: native Word equations (they keep their wrapper) and MathType objects.
            int native = 0, mathType = 0;
            try
            {
                foreach (var cc in WrapperControls(doc)) if (cc.Range.OMaths.Count > 0) native++;
                mathType = CountMathType(doc.Content);
            }
            catch (COMException)
            {
            }
            Log.Info("repair in " + doc.Name + (dry ? " (dry run)" : "") + ": " + inlined + " floating picture(s) put in line, " + split + " wrapper(s) split, " + converted + " wrapped Classic equation(s) converted, " + wrapped.Count + " picture(s) identified, " + renamed.Count + " copies given their own ID, " + bookmarks + " bookmarks, " + unlocked + " unlocked, " + plainPictures + " other pictures, " + lowered + " baselines restored, " + redraw.Count + " to redraw (ID/depth missing in the source); untouched: " + native + " native, " + mathType + " MathType");
            return new Dictionary<string, object>
            {
                ["document"] = doc.FullName,
                ["renamed"] = renamed,
                ["split"] = splitReport,
                ["inlined"] = inlined,
                ["converted"] = converted,
                ["native"] = native,
                ["mathType"] = mathType,
                ["lowered"] = lowered,
                ["toObjects"] = toObjects,
                ["styled"] = styled,
                ["idRewrites"] = idRewrites,
                ["redraw"] = redraw,
                ["wrapped"] = wrapped,
                ["wrappedOk"] = ok,
                ["bookmarks"] = bookmarks,
                ["otherPictures"] = plainPictures,
            };
        }

        /// <summary>
        /// A paragraph laid out as a numbered equation — tab, MathBlocks equation, tab, number (MathType's
        /// MACROBUTTON or ours) — but with no style and no tab stops of its own: its number falls on Word's
        /// default tab right after the equation. It gets the document's display-equation style back
        /// (MTDisplayEquation, as MathType defines it: centre and right tab stops), else the tab stops the
        /// add-in's numbering uses (centre of the text column, right margin). Returns how many.
        /// </summary>
        private int RestoreEquationParagraphStyles(Word.Document doc, bool dry)
        {
            Word.Style display = null;
            foreach (var name in new[] { "MTDisplayEquation", "MathBlocks Display Equation" })
            {
                try
                {
                    display = doc.Styles[name];
                    break;
                }
                catch (Exception)
                {
                }
            }
            int n = 0;
            var seen = new HashSet<int>();
            foreach (var e in AllEquations(doc))
            {
                try
                {
                    var para = e.Range.Paragraphs[1];
                    var pr = para.Range;
                    if (!seen.Add(pr.Start)) continue;
                    var text = pr.Text ?? "";
                    // tab, equation, tab, number: the equation's character sits between two tabs.
                    int rel = e.Range.Start - pr.Start;
                    bool shape = rel >= 1 && text.Length > rel + 1 && text[rel - 1] == '\t' && text.IndexOf('\t', rel + 1) > rel;
                    if (!shape) continue;
                    bool numbered = false;
                    foreach (Word.Field f in pr.Fields)
                    {
                        var code = f.Code.Text ?? "";
                        if (code.Contains("MTPlaceRef") || code.Contains("SEQ MBEq") || code.Contains("SEQ MTEqn") || code.Contains("MBEq")) { numbered = true; break; }
                    }
                    if (!numbered) continue;
                    var styleName = "";
                    try { styleName = ((Word.Style)para.get_Style()).NameLocal ?? ""; } catch (Exception) { }
                    bool plainStyle = styleName == "" || styleName == ((Word.Style)doc.Styles[Word.WdBuiltinStyle.wdStyleNormal]).NameLocal;
                    if (!plainStyle || para.TabStops.Count > 0) continue;
                    n++;
                    if (dry) continue;
                    if (display != null) para.set_Style(display);
                    else
                    {
                        var ps = pr.Sections[1].PageSetup;
                        float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - para.LeftIndent - para.RightIndent;
                        para.TabStops.Add(width / 2, Word.WdTabAlignment.wdAlignTabCenter);
                        para.TabStops.Add(width, Word.WdTabAlignment.wdAlignTabRight);
                    }
                }
                catch (Exception ex)
                {
                    Log.Error("repair: restoring an equation paragraph's style", ex);
                }
            }
            if (n > 0) Log.Info("repair: " + n + " numbered equation paragraph(s) " + (dry ? "would get" : "got") + " " + (display != null ? display.NameLocal : "the numbering tab stops") + " back");
            return n;
        }

        /// <summary>Numbered MathBlocks equations whose paragraph has no number bookmark (a pasted copy) get one.</summary>
        private int BookmarkNumberedEquations(Word.Document doc, bool dry = false)
        {
            int added = 0;
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (var cc in AllEquations(doc))
                {
                    var para = cc.Range.Paragraphs[1];
                    if (!HasNumberField(para.Range)) continue;
                    bool has = false;
                    foreach (Word.Bookmark bm in para.Range.Bookmarks)
                        if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) || bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal)) has = true;
                    if (has) continue;
                    int numStart = cc.After;
                    while (numStart < para.Range.End - 1 && doc.Range(numStart, numStart + 1).Text == "\t") numStart++;
                    if (numStart >= para.Range.End - 1) continue;
                    if (dry)
                    {
                        added++;
                        continue;
                    }
                    var name = BookmarkPrefix + InstanceId(cc.Tag);
                    if (doc.Bookmarks.Exists(name)) name = BookmarkPrefix + RandomId(12);
                    doc.Bookmarks.Add(name, doc.Range(numStart, para.Range.End - 1));
                    added++;
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            return added;
        }
    }
}
