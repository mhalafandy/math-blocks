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
        private static readonly Regex AltMark = new Regex("(?:alt|descr)=\"MathBlocks (?:display|inline|numbered):", RegexOptions.Compiled);
        private static readonly Regex EmfPart = new Regex("<pkg:part [^>]*pkg:contentType=\"image/x-emf\"[^>]*>\\s*<pkg:binaryData>([^<]*)</pkg:binaryData>", RegexOptions.Compiled);
        private static readonly byte[] EmfMarker = Encoding.ASCII.GetBytes("MathBlocks1:");

        /// <summary>What MathBlocks data a picture's XML carries: "emf", "alt", or null.</summary>
        internal static string MathBlocksData(string xml, out string emfJson)
        {
            emfJson = null;
            if (string.IsNullOrEmpty(xml)) return null;
            foreach (Match m in EmfPart.Matches(xml))
            {
                try
                {
                    var bytes = Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, "\\s+", ""));
                    var at = IndexOf(bytes, EmfMarker);
                    if (at < 0) continue;
                    // The JSON runs to the end of the comment record: take up to the first NUL.
                    int end = at + EmfMarker.Length;
                    while (end < bytes.Length && bytes[end] != 0) end++;
                    emfJson = Encoding.UTF8.GetString(bytes, at + EmfMarker.Length, end - at - EmfMarker.Length);
                    return "emf";
                }
                catch (FormatException)
                {
                    // Not base64: not ours.
                }
            }
            return AltMark.IsMatch(xml) ? "alt" : null;
        }

        private static int IndexOf(byte[] hay, byte[] needle)
        {
            for (int i = 0; i + needle.Length <= hay.Length; i++)
            {
                int k = 0;
                while (k < needle.Length && hay[i + k] == needle[k]) k++;
                if (k == needle.Length) return i;
            }
            return -1;
        }

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
                if (sel.ShapeRange.Count > 0)
                {
                    foreach (Word.Shape sh in sel.ShapeRange)
                    {
                        if (!IsMathBlocksShape(sh)) continue;
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

        /// <summary>Wraps a MathBlocks picture in a new content control (new instance id); returns the tag.</summary>
        internal string AdoptPicture(Word.Document doc, Word.InlineShape shape, string blockId = null)
        {
            var tag = "mb1|" + (string.IsNullOrEmpty(blockId) ? "-" : blockId) + "|" + RandomId(12);
            var undo = _app.UndoRecord;
            var own = !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Restore MathBlocks equation");
            try
            {
                object range = shape.Range;
                var cc = doc.ContentControls.Add(Word.WdContentControlType.wdContentControlRichText, ref range);
                cc.Tag = tag;
                cc.Title = "MathBlocks equation";
                Secure(cc);
            }
            finally
            {
                if (own) undo.EndCustomRecord();
            }
            Log.Info("re-wrapped a pasted MathBlocks picture as " + tag);
            return tag;
        }

        /// <summary>
        /// Repair equations: copies with duplicated instance ids get new ids, MathBlocks pictures that
        /// lost their wrapper are wrapped again, numbered equations without a bookmark get one.
        /// Reports what it found (also for diagnosing which paste modes keep what).
        /// </summary>
        public Dictionary<string, object> RepairEquations(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            // Dry run: count what would be repaired (to decide on a backup first), change nothing.
            var dry = Rpc.GetBool(p, "dryRun");
            var renamed = new List<object>();
            var wrapped = new List<object>();
            var splitReport = new List<object>();
            int split = 0, secured = 0, inlined = 0;
            int wrappedOk = 0, plainPictures = 0, bookmarks = 0;
            bool screen = _app.ScreenUpdating;
            var undo = _app.UndoRecord;
            var own = !dry && !undo.IsRecordingCustomRecord;
            if (own) undo.StartCustomRecord("Repair MathBlocks equations");
            try
            {
                _app.ScreenUpdating = false;
                // Pasted pictures that came in floating (Word's paste setting): back in line first.
                inlined = InlineFloatingPictures(doc, dry);
                // Wrappers that grew (several equations, text, nested wrappers): one wrapper per equation again.
                split = SplitWrappers(doc, dry, splitReport);
                if (dry)
                {
                    var seen = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var cc in MathBlocksControls(doc)) if (!seen.Add(cc.Tag)) renamed.Add(new Dictionary<string, object> { ["from"] = cc.Tag, ["to"] = "" });
                }
                else foreach (var pair in Dedupe(doc, true)) renamed.Add(pair);
                var shapes = new List<Word.InlineShape>();
                foreach (Word.InlineShape s in doc.InlineShapes) shapes.Add(s);
                foreach (var s in shapes)
                {
                    if (InsideMathBlocksControl(s.Range))
                    {
                        wrappedOk++;
                        continue;
                    }
                    var how = MathBlocksData(s.Range.WordOpenXML, out var json);
                    if (how == null)
                    {
                        plainPictures++;
                        continue;
                    }
                    var block = json != null ? Regex.Match(json, "\"block\"\\s*:\\s*\"([0-9A-Za-z]{16})\"").Groups[1].Value : null;
                    var tag = dry ? "" : AdoptPicture(doc, s, block);
                    wrapped.Add(new Dictionary<string, object> { ["tag"] = tag, ["source"] = how });
                }
                bookmarks = BookmarkNumberedEquations(doc, dry);
                if (!dry) secured = SecureAll(doc);
            }
            finally
            {
                _app.ScreenUpdating = screen;
                if (own) undo.EndCustomRecord();
            }
            Log.Info("repair in " + doc.Name + ": " + inlined + " floating picture(s) put in line, " + split + " wrapper(s) split, " + renamed.Count + " new ids, " + wrapped.Count + " re-wrapped, " + bookmarks + " bookmarks, " + secured + " unlocked, " + plainPictures + " other pictures");
            return new Dictionary<string, object>
            {
                ["document"] = doc.FullName,
                ["renamed"] = renamed,
                ["split"] = splitReport,
                ["inlined"] = inlined,
                ["wrapped"] = wrapped,
                ["wrappedOk"] = wrappedOk,
                ["bookmarks"] = bookmarks,
                ["otherPictures"] = plainPictures,
            };
        }

        /// <summary>Numbered MathBlocks equations whose paragraph has no number bookmark (a pasted copy) get one.</summary>
        private int BookmarkNumberedEquations(Word.Document doc, bool dry = false)
        {
            int added = 0;
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (var cc in MathBlocksControls(doc))
                {
                    var para = cc.Range.Paragraphs[1];
                    if (!HasNumberField(para.Range)) continue;
                    bool has = false;
                    foreach (Word.Bookmark bm in para.Range.Bookmarks)
                        if (bm.Name.StartsWith(BookmarkPrefix, StringComparison.Ordinal) || bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal)) has = true;
                    if (has) continue;
                    int numStart = cc.Range.End + 1;
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
