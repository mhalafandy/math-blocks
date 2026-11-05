using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// One MathBlocks equation in a document, whatever form it has:
    /// - a Classic equation is a picture whose Title is its ID (mb1|block|instance) and whose EMF
    ///   comment carries its source (with the ID again, as a fallback when the title is edited);
    /// - a native Word equation (OMML) sits in a content control whose tag is its ID (OMML has no
    ///   place for an ID); so does a Classic equation from an older build until Repair converts it.
    /// </summary>
    internal sealed class Eq
    {
        public readonly Word.ContentControl Control;
        public readonly Word.InlineShape Picture;

        public Eq(Word.ContentControl control) => Control = control;
        public Eq(Word.InlineShape picture) => Picture = picture;

        public bool IsPicture => Picture != null;

        public string Tag
        {
            get => IsPicture ? Picture.Title : Control.Tag;
            set
            {
                if (IsPicture) Picture.Title = value;
                else Control.Tag = value;
            }
        }

        public Word.Range Range => IsPicture ? Picture.Range : Control.Range;

        /// <summary>Position just before the equation (outside a wrapper's start mark).</summary>
        public int Before => IsPicture ? Picture.Range.Start : Control.Range.Start - 1;

        /// <summary>Position just after the equation (outside a wrapper's end mark).</summary>
        public int After => IsPicture ? Picture.Range.End : Control.Range.End + 1;

        public Word.Range Paragraph => Range.Paragraphs[1].Range;

        public string Xml => Range.WordOpenXML;

        public override string ToString() => (IsPicture ? "picture " : "wrapper ") + Tag;
    }

    internal sealed partial class WordOps
    {

        internal static bool IsTag(string t) => t != null && t.StartsWith(TagPrefix, StringComparison.Ordinal);

        internal static string TitleOf(Word.InlineShape s)
        {
            try
            {
                return s.Title;
            }
            catch (COMException)
            {
                return null;
            }
        }

        internal static string AltOf(Word.InlineShape s)
        {
            try
            {
                return s.AlternativeText;
            }
            catch (COMException)
            {
                return null;
            }
        }

        /// <summary>A picture that is a Classic equation, judged without reading its XML (title or alt text).</summary>
        internal static bool LooksLikeEquation(Word.InlineShape s)
        {
            if (IsTag(TitleOf(s))) return true;
            var alt = AltOf(s) ?? "";
            return alt.StartsWith("MathBlocks display:", StringComparison.Ordinal) || alt.StartsWith("MathBlocks inline:", StringComparison.Ordinal) || alt.StartsWith("MathBlocks numbered:", StringComparison.Ordinal);
        }

        /// <summary>The ID stored in a picture's hidden source (EMF comment JSON), if any.</summary>
        internal static string SourceTag(string source) => EquationIdentity.SourceTag(source);

        /// <summary>Content controls tagged as MathBlocks wrappers (native equations; older Classic ones).</summary>
        internal static List<Word.ContentControl> WrapperControls(Word.Document doc)
        {
            var list = new List<Word.ContentControl>();
            foreach (Word.ContentControl cc in doc.ContentControls)
                if (IsMathBlocks(cc)) list.Add(cc);
            return list;
        }

        /// <summary>Every MathBlocks equation of the document, in document order.</summary>
        internal static List<Eq> AllEquations(Word.Document doc)
        {
            var list = new List<Eq>();
            foreach (Word.InlineShape s in doc.InlineShapes)
            {
                if (!IsTag(TitleOf(s))) continue;
                if (InsideMathBlocksControl(s.Range)) continue; // an older wrapped equation: listed by its wrapper
                list.Add(new Eq(s));
            }
            foreach (var cc in WrapperControls(doc)) list.Add(new Eq(cc));
            return WithoutTrackedDeletions(doc, list).OrderBy(e => SafeStart(e)).ToList();
        }

        /// <summary>
        /// With track changes, an updated or deleted equation stays in the document as a tracked deletion
        /// (with the same ID) until the change is accepted: it is not an equation any more, nor a duplicate.
        /// </summary>
        private static List<Eq> WithoutTrackedDeletions(Word.Document doc, List<Eq> list)
        {
            try
            {
                if (doc.Revisions.Count == 0) return list;
            }
            catch (COMException)
            {
                return list;
            }
            return list.Where(e => !IsTrackedDeletion(e)).ToList();
        }

        private static bool IsTrackedDeletion(Eq e)
        {
            try
            {
                foreach (Word.Revision r in e.Range.Revisions)
                    if (r.Type == Word.WdRevisionType.wdRevisionDelete) return true;
            }
            catch (COMException)
            {
            }
            return false;
        }

        private static int SafeStart(Eq e)
        {
            try
            {
                return e.Range.Start;
            }
            catch (COMException)
            {
                return int.MaxValue;
            }
        }

        /// <summary>The equations with this ID (one normally; copies share it until they get their own).</summary>
        internal static List<Eq> FindByTag(Word.Document doc, string tag)
        {
            var list = new List<Eq>();
            foreach (Word.InlineShape s in doc.InlineShapes)
                if (TitleOf(s) == tag && !InsideMathBlocksControl(s.Range)) list.Add(new Eq(s));
            foreach (Word.ContentControl cc in doc.SelectContentControlsByTag(tag)) list.Add(new Eq(cc));
            return WithoutTrackedDeletions(doc, list).OrderBy(e => SafeStart(e)).ToList();
        }

        private static string NewTagLike(string tag)
        {
            var parts = (tag ?? "").Split('|');
            return "mb1|" + (parts.Length == 3 ? parts[1] : "-") + "|" + RandomId(12);
        }

        /// <summary>
        /// A picture's ID: its title; if the title was edited or lost, the ID in its hidden source
        /// (and the title is restored); a MathBlocks picture with neither gets a new ID. Null when the
        /// picture is not a MathBlocks equation.
        /// </summary>
        internal string EnsurePictureTag(Word.InlineShape s)
        {
            var title = TitleOf(s);
            if (IsTag(title)) return title;
            var source = PictureSource(s.Range.WordOpenXML);
            if (source == null) return null;
            var tag = SourceTag(source);
            var why = "restored from its hidden source";
            var block = Regex.Match(source, "\"block\"\\s*:\\s*\"([0-9A-Za-z]{16})\"").Groups[1].Value;
            if (tag == null)
            {
                // No ID in the source (e.g. converted from MathType): the number bookmark in its paragraph, if
                // no other equation already has that ID, keeps the equation tied to its number and references.
                var id = BookmarkedInstance(s);
                if (id != null)
                {
                    var candidate = "mb1|" + (string.IsNullOrEmpty(block) ? "-" : block) + "|" + id;
                    if (FindByTag(s.Range.Document, candidate).Count == 0)
                    {
                        tag = candidate;
                        why = "restored from its number bookmark";
                    }
                }
            }
            if (tag == null)
            {
                tag = "mb1|" + (string.IsNullOrEmpty(block) ? "-" : block) + "|" + RandomId(12);
                why = "new (no ID in its source)";
            }
            s.Title = tag;
            Log.Info("picture ID " + why + ": " + tag + (string.IsNullOrEmpty(title) ? "" : " (its title was \"" + title + "\")"));
            return tag;
        }

        /// <summary>The instance ID of a _MBEq_ bookmark in the picture's paragraph, when that paragraph holds only this equation.</summary>
        private static string BookmarkedInstance(Word.InlineShape s)
        {
            try
            {
                var para = s.Range.Paragraphs[1].Range;
                int pictures = 0;
                foreach (Word.InlineShape o in para.InlineShapes)
                    if (LooksLikeEquation(o) || IsTag(TitleOf(o))) pictures++;
                if (pictures != 1) return null;
                var doc = s.Range.Document;
                bool hidden = doc.Bookmarks.ShowHidden;
                doc.Bookmarks.ShowHidden = true;
                try
                {
                    foreach (Word.Bookmark bm in para.Bookmarks)
                    {
                        if (!bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal)) continue;
                        var id = bm.Name.Substring(BookmarkPrefix.Length);
                        if (Regex.IsMatch(id, "^[0-9A-Za-z]{6,}$")) return id;
                    }
                }
                finally
                {
                    doc.Bookmarks.ShowHidden = hidden;
                }
            }
            catch (COMException)
            {
            }
            return null;
        }

        /// <summary>
        /// Copies, not originals, get a new ID. Among equations sharing an ID, the one the number
        /// bookmark (and so the references) belongs to keeps it; otherwise the earliest in the document.
        /// Linked copies keep their block (a copy of a linked equation is another linked copy). The
        /// decision is logged. Returns the renamed pairs (from → to).
        /// </summary>
        internal List<Dictionary<string, object>> ResolveDuplicates(Word.Document doc, string onlyTag = null)
        {
            var pairs = new List<Dictionary<string, object>>();
            var groups = (onlyTag != null ? FindByTag(doc, onlyTag) : AllEquations(doc)).GroupBy(e => e.Tag).Where(g => g.Count() > 1).ToList();
            if (groups.Count == 0) return pairs;
            var undo = _app.UndoRecord;
            var own = !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Give copied equations their own ID");
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (var g in groups)
                {
                    var tag = g.Key;
                    var list = g.ToList();
                    var bookmark = BookmarkPrefix + InstanceId(tag);
                    var marks = new List<bool>();
                    foreach (var e in list)
                    {
                        bool has = false;
                        try
                        {
                            foreach (Word.Bookmark bm in e.Paragraph.Bookmarks)
                                if (bm.Name == bookmark || bm.Name == NumberOnlyName(bookmark)) { has = true; break; }
                        }
                        catch (COMException)
                        {
                        }
                        marks.Add(has);
                    }
                    var keeper = list[EquationIdentity.ChooseKeeper(marks, out var reason)];
                    foreach (var e in list)
                    {
                        if (e == keeper) continue;
                        var newTag = NewTagLike(tag);
                        if (!e.IsPicture) Unlock(e.Control);
                        e.Tag = newTag;
                        pairs.Add(new Dictionary<string, object> { ["from"] = tag, ["to"] = newTag });
                        Log.Info("duplicate ID " + tag + ": the " + (e.IsPicture ? "picture" : "wrapper") + " at " + SafeStart(e) + " is a copy → " + newTag + "; the one at " + SafeStart(keeper) + " keeps it (" + reason + ")");
                    }
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
                if (own) undo.EndCustomRecord();
            }
            return pairs;
        }

        /// <summary>
        /// Floating MathBlocks pictures (a paste can make them float) go back in line with the text,
        /// in one undo step. Returns how many.
        /// </summary>
        internal int InlineFloatingNow(Word.Document doc, Word.Range only = null)
        {
            var list = new List<Word.Shape>();
            try
            {
                foreach (Word.Shape sh in only != null ? only.ShapeRange : (System.Collections.IEnumerable)doc.Shapes)
                    if (IsMathBlocksShape(sh)) list.Add(sh);
            }
            catch (COMException)
            {
                return 0;
            }
            if (list.Count == 0) return 0;
            var undo = _app.UndoRecord;
            var own = !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Put equation back in line");
            int n = 0;
            try
            {
                foreach (var sh in list)
                {
                    try
                    {
                        string wrap = "?";
                        try { wrap = sh.WrapFormat.Type.ToString(); } catch (COMException) { }
                        var inline = sh.ConvertToInlineShape();
                        n++;
                        var tag = EnsurePictureTag(inline);
                        Log.Info("floating MathBlocks picture (" + wrap + ") put back in line: " + tag);
                    }
                    catch (COMException ex)
                    {
                        Log.Error("could not put a floating MathBlocks picture back in line", ex);
                    }
                }
            }
            finally
            {
                if (own) undo.EndCustomRecord();
            }
            return n;
        }

        /// <summary>Pictures with MathBlocks alt text but no ID title (just inserted or pasted): their ID (title).</summary>
        internal int EnsureTitles(Word.Range range)
        {
            int n = 0;
            foreach (Word.InlineShape s in range.InlineShapes)
            {
                if (IsTag(TitleOf(s)) || InsideMathBlocksControl(s.Range)) continue;
                if (!LooksLikeEquation(s)) continue;
                if (EnsurePictureTag(s) != null) n++;
            }
            return n;
        }

        /// <summary>The picture just inserted at a position (InsertXML), with its ID set as its title.</summary>
        internal Eq TitleInsertedPicture(Word.Document doc, int at, string tag)
        {
            var near = doc.Range(at, Math.Min(doc.Content.End, at + 400));
            Word.InlineShape candidate = null;
            foreach (Word.InlineShape s in near.InlineShapes)
            {
                var title = TitleOf(s);
                if (title == tag) return new Eq(s);
                if (candidate == null && !IsTag(title) && LooksLikeEquation(s)) candidate = s;
            }
            if (candidate == null)
            {
                foreach (Word.InlineShape s in doc.InlineShapes)
                    if (TitleOf(s) == tag) return new Eq(s);
                return null;
            }
            candidate.Title = tag;
            return new Eq(candidate);
        }

        /// <summary>
        /// The equation a command is about: the selected picture, the picture right next to a caret,
        /// or the wrapper around the selection (native equations). Pictures without an ID title get
        /// theirs (from the hidden source, else a new one).
        /// </summary>
        internal Eq EquationAt(Word.Document doc, Word.Range r)
        {
            try
            {
                var wrapper = WrapperAt(doc, r);
                // A selected picture, or the picture just before/after the caret.
                var probes = new List<Word.Range> { r };
                if (r.Start == r.End)
                {
                    if (r.Start > 0) probes.Add(doc.Range(r.Start - 1, r.Start));
                    probes.Add(doc.Range(r.Start, Math.Min(r.Start + 1, doc.Content.End)));
                }
                foreach (var probe in probes)
                {
                    foreach (Word.InlineShape s in probe.InlineShapes)
                    {
                        if (InsideMathBlocksControl(s.Range)) continue;
                        if (!IsTag(TitleOf(s)) && !LooksLikeEquation(s) && PictureSource(s.Range.WordOpenXML) == null) continue;
                        var tag = EnsurePictureTag(s);
                        if (tag != null) return new Eq(s);
                    }
                }
                if (wrapper != null) return new Eq(wrapper);
            }
            catch (COMException)
            {
            }
            return null;
        }

        // ------------------------------------------------------------------ change watch (selection change)

        private readonly Dictionary<string, (int inline, int shapes, int controls)> _counts = new Dictionary<string, (int, int, int)>();

        /// <summary>
        /// Cheap watch on every selection change: only when the document's picture counts changed
        /// (a paste, a drop, a deletion) — floating MathBlocks pictures go back in line, and the
        /// equations near the selection are checked for a duplicated ID.
        /// </summary>
        internal void WatchChanges(Word.Selection sel)
        {
            var doc = sel.Document;
            string key;
            int ic, sc, cc;
            try
            {
                key = doc.FullName;
                ic = doc.InlineShapes.Count;
                sc = doc.Shapes.Count;
                cc = doc.ContentControls.Count;
            }
            catch (COMException)
            {
                return;
            }
            var had = _counts.TryGetValue(key, out var last);
            _counts[key] = (ic, sc, cc);
            if (!had || (last.inline == ic && last.shapes == sc && last.controls == cc)) return;
            Log.Info("document changed (paste, drop or delete?): pictures in line " + last.inline + "→" + ic + ", floating " + last.shapes + "→" + sc + ", content controls " + last.controls + "→" + cc);
            if (sc > 0 && sc != last.shapes) InlineFloatingNow(doc);
            if (ic > last.inline || cc > last.controls)
            {
                // Near the selection: the paragraph(s) around it.
                Word.Range near;
                try
                {
                    var p = sel.Range.Paragraphs;
                    near = doc.Range(Math.Max(0, p.First.Range.Start - 1), Math.Min(doc.Content.End, p.Last.Range.End + 1));
                    if (near.Start > 0) near = doc.Range(near.Start > 0 ? doc.Range(near.Start - 1, near.Start).Paragraphs[1].Range.Start : 0, near.End);
                }
                catch (COMException)
                {
                    return;
                }
                // Native equations: a pasted wrapper keeps its tag.
                foreach (Word.ContentControl w in near.ContentControls)
                {
                    var t = w.Tag;
                    if (IsTag(t) && FindByTag(doc, t).Count > 1) ResolveDuplicates(doc, t);
                }
                foreach (Word.InlineShape s in near.InlineShapes)
                {
                    var tag = TitleOf(s);
                    try
                    {
                        // Paste diagnosis: what a pasted picture kept (title, alt text, hidden source, format).
                        var xml = s.Range.WordOpenXML;
                        Log.Info("  near the selection: picture title \"" + (tag ?? "") + "\", alt " + (LooksLikeEquation(s) ? "MathBlocks" : "other") + ", source " + (PictureSource(xml) != null ? (SourceTag(PictureSource(xml)) != null ? "with ID" : "without ID") : "none") + ", VML " + xml.Contains("<v:imagedata") + ", DrawingML " + xml.Contains("<pic:pic") + ", EMF " + xml.Contains("image/x-emf") + ", PNG " + xml.Contains("image/png") + ", in wrapper " + InsideMathBlocksControl(s.Range));
                    }
                    catch (COMException)
                    {
                    }
                    if (!IsTag(tag))
                    {
                        if (LooksLikeEquation(s) && !InsideMathBlocksControl(s.Range)) tag = EnsurePictureTag(s);
                        if (!IsTag(tag)) continue;
                    }
                    if (FindByTag(doc, tag).Count > 1) ResolveDuplicates(doc, tag);
                }
            }
        }

        /// <summary>When a document opens: floating pictures back in line, duplicated IDs resolved, wrappers unlocked.</summary>
        internal void OnOpen(Word.Document doc)
        {
            InlineFloatingNow(doc);
            var renamed = ResolveDuplicates(doc);
            UnlockAll(doc);
            try
            {
                _counts[doc.FullName] = (doc.InlineShapes.Count, doc.Shapes.Count, doc.ContentControls.Count);
            }
            catch (COMException)
            {
            }
            if (renamed.Count > 0) Log.Info("on open: " + renamed.Count + " copied equation(s) got their own ID in " + doc.Name);
        }
    }
}
