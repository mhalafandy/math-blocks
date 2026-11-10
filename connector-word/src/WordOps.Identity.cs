using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Equation identity: a MathBlocks wrapper must hold exactly one equation and nothing else.
    /// Word puts text typed or pasted at a content control's edge inside it, and a copied equation
    /// keeps its wrapper's ID; so wrappers are content-locked (Classic pictures), the caret is kept
    /// out of their edges, insertion never lands inside one, and every read and write checks the
    /// wrapper (one equation, no text, unique ID, unchanged fingerprint) before acting.
    /// </summary>
    internal sealed partial class WordOps
    {
        internal static bool IsMathBlocks(Word.ContentControl cc)
        {
            try
            {
                return cc?.Tag != null && cc.Tag.StartsWith(TagPrefix, StringComparison.Ordinal);
            }
            catch (COMException)
            {
                return false;
            }
        }

        /// <summary>The picture's MathBlocks alt text when it is ours (read through Word, not the XML); else null.</summary>
        internal static string AltSourceOf(Word.InlineShape s)
        {
            var alt = AltOf(s);
            return EquationIdentity.IsEquationAlt(alt) ? alt : null;
        }

        /// <summary>
        /// The XML sent to the app for a picture: Word's own, or — when it carries neither the EMF nor the
        /// alt text (seen after some pastes) — a minimal package with the alt text, so the app reads the LaTeX.
        /// </summary>
        internal static string PictureXmlForApp(Eq eq)
        {
            var xml = eq.Xml;
            if (!eq.IsPicture || PictureXml.Data(xml, out _) != null) return xml;
            var alt = AltSourceOf(eq.Picture);
            if (alt == null) return xml;
            Log.Info("picture " + eq.Tag + ": its XML has no MathBlocks data (VML " + xml.Contains("<v:imagedata") + ", DrawingML " + xml.Contains("<pic:pic") + ", EMF " + xml.Contains("image/x-emf") + ", PNG " + xml.Contains("image/png") + ", " + xml.Length + " chars) — read from its alt text");
            return "<pkg:package xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\"><pkg:part pkg:name=\"/word/document.xml\"><pkg:xmlData><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:v=\"urn:schemas-microsoft-com:vml\"><w:body><w:p><w:r><w:pict><v:shape alt=\"" + System.Security.SecurityElement.Escape(alt) + "\"/></w:pict></w:r></w:p></w:body></w:document></pkg:xmlData></pkg:part></pkg:package>";
        }

        /// <summary>The source a picture carries (EMF comment JSON, else its alt text); null when it is not ours.</summary>
        internal static string PictureSource(string xml) => PictureXml.Source(xml);

        /// <summary>Everything a wrapper holds: equations, other pictures, nested wrappers, text.</summary>
        internal EquationIdentity.WrapperContents Inspect(Word.Document doc, Word.ContentControl cc) => Inspect(doc, new Eq(cc));

        /// <summary>What an equation holds: a Classic picture is always exactly itself; a wrapper may hold more.</summary>
        internal EquationIdentity.WrapperContents Inspect(Word.Document doc, Eq eq)
        {
            var c = new EquationIdentity.WrapperContents();
            if (eq.IsPicture)
            {
                // A pasted picture's XML may lack the EMF (Word re-encodes some pastes); its alt text still
                // identifies it and gives its LaTeX.
                var src = PictureSource(eq.Picture.Range.WordOpenXML) ?? AltSourceOf(eq.Picture);
                if (src != null) c.PictureSources.Add(src);
                else c.OtherPictures++;
                try
                {
                    c.SameTag = FindByTag(doc, eq.Tag).Count;
                }
                catch (COMException)
                {
                }
                return c;
            }
            var cc = eq.Control;
            var r = cc.Range;
            foreach (Word.InlineShape s in r.InlineShapes)
            {
                var src = PictureSource(s.Range.WordOpenXML);
                if (src != null) c.PictureSources.Add(src);
                else c.OtherPictures++;
            }
            try
            {
                // Floating pictures anchored inside the wrapper (a paste can make them floating).
                foreach (Word.Shape sh in r.ShapeRange)
                {
                    string src = null;
                    try
                    {
                        src = PictureSource(sh.Anchor.WordOpenXML);
                    }
                    catch (COMException)
                    {
                    }
                    if (src != null && !c.PictureSources.Contains(src)) c.PictureSources.Add(src);
                    else if (src == null) c.OtherPictures++;
                }
            }
            catch (COMException)
            {
                // No shapes.
            }
            foreach (Word.OMath m in r.OMaths) c.MathTexts.Add(m.Range.Text ?? "");
            try
            {
                c.NestedControls = r.ContentControls.Count;
            }
            catch (COMException)
            {
            }
            c.TextChars = TextCharsOutsideEquations(r);
            try
            {
                c.SameTag = FindByTag(doc, cc.Tag).Count;
            }
            catch (COMException)
            {
            }
            return c;
        }

        /// <summary>Ordinary characters in a range, not counting pictures, equations and control characters.</summary>
        private static int TextCharsOutsideEquations(Word.Range r)
        {
            int n = 0, seen = 0;
            foreach (Word.Range ch in r.Characters)
            {
                if (++seen > 4000) break;
                var t = ch.Text;
                if (string.IsNullOrEmpty(t)) continue;
                var c0 = t[0];
                if (char.IsWhiteSpace(c0) || c0 < 32) continue;
                try
                {
                    if (ch.InlineShapes.Count > 0 || ch.OMaths.Count > 0) continue;
                }
                catch (COMException)
                {
                    continue;
                }
                n++;
            }
            return n;
        }

        /// <summary>
        /// Hides the wrapper's box. Wrappers are never locked: a lock blocked Delete, Cut, drag and
        /// numbering of a selected equation. Growth is prevented by the caret guard, by insertion
        /// that never lands inside a wrapper, and by the checks before every read and write.
        /// </summary>
        internal static void Secure(Word.ContentControl cc)
        {
            TryHide(cc);
            Unlock(cc);
        }

        internal static void Unlock(Word.ContentControl cc)
        {
            try
            {
                if (cc.LockContents) cc.LockContents = false;
                if (cc.LockContentControl) cc.LockContentControl = false;
            }
            catch (COMException)
            {
            }
        }

        /// <summary>Unlocks every MathBlocks wrapper of a document (a previous build locked them). Returns how many.</summary>
        internal int UnlockAll(Word.Document doc)
        {
            int n = 0;
            foreach (var cc in MathBlocksControls(doc))
            {
                try
                {
                    if (!cc.LockContents && !cc.LockContentControl) continue;
                    Unlock(cc);
                    n++;
                }
                catch (COMException)
                {
                }
            }
            if (n > 0) Log.Info("unlocked " + n + " MathBlocks wrapper(s) in " + doc.Name);
            return n;
        }

        /// <summary>The outermost MathBlocks wrapper around a position, if any.</summary>
        internal static Word.ContentControl OutermostWrapper(Word.Range r)
        {
            Word.ContentControl outer = null;
            try
            {
                for (var cc = r.ParentContentControl; cc != null; cc = cc.ParentContentControl)
                    if (IsMathBlocks(cc)) outer = cc;
            }
            catch (COMException)
            {
            }
            return outer;
        }

        /// <summary>
        /// Where a new equation goes: the selection's end, moved out of any MathBlocks wrapper (after
        /// it). A selection holding an equation is never replaced.
        /// </summary>
        internal Word.Range SafeInsertionPoint(Word.Document doc, Word.Range sel)
        {
            bool replaceText = sel.Start != sel.End;
            try
            {
                if (replaceText && (sel.ContentControls.Count > 0 || sel.InlineShapes.Count > 0 || sel.OMaths.Count > 0)) replaceText = false;
            }
            catch (COMException)
            {
                replaceText = false;
            }
            var outer = OutermostWrapper(sel);
            if (replaceText && outer == null) return sel;
            int pos = sel.End;
            if (outer != null)
            {
                pos = pos <= outer.Range.Start ? outer.Range.Start - 1 : outer.Range.End + 1;
                Log.Info("insert: the cursor was inside " + outer.Tag + "; inserting after it, not inside");
            }
            return doc.Range(pos, pos);
        }

        /// <summary>
        /// Text typed right after an inline equation takes the formatting of the character before it —
        /// the picture's run, lowered by the equation's depth. The insertion point gets position 0, so
        /// typed text sits on the line (only the picture's own run is lowered). Not a document change.
        /// </summary>
        internal static void CleanTypingFormat(Word.Selection sel)
        {
            try
            {
                if (sel.Start == 0 || sel.Start != sel.End) return;
                var doc = sel.Document;
                var before = doc.Range(sel.Start - 1, sel.Start);
                if (before.InlineShapes.Count != 1) return;
                var pic = before.InlineShapes[1];
                if (!LooksLikeEquation(pic)) return;
                // Word applies formatting at a caret inside a word to the whole word — the picture's own
                // run would lose its lowering (round 6: α β γ above the line). Only when the caret is at a
                // word's end: before a space, tab, line or paragraph end, or the end of the document.
                if (sel.End < doc.Content.End - 1)
                {
                    var next = doc.Range(sel.Start, sel.Start + 1).Text ?? "";
                    if (next.Length > 0 && " \t\r\n\v\a\u00a0".IndexOf(next[0]) < 0) return;
                }
                var keep = pic.Range.Font.Position;
                // Like Ctrl+Space at the caret: the next typed text gets the paragraph's normal formatting.
                // (Word reports the paragraph mark's formatting here — 0 — while typing would take the
                // picture run's lowering, so the reset is always applied, not only when it reads non-zero.)
                sel.Font.Reset();
                if (sel.Font.Position != 0) sel.Font.Position = 0;
                // Safety net: if Word changed the picture anyway, its lowering comes back.
                if (pic.Range.Font.Position != keep)
                {
                    pic.Range.Font.Position = keep;
                    Log.Info("typing reset touched the equation's lowering; restored to " + keep + " pt");
                }
            }
            catch (Exception)
            {
                // Cosmetic.
            }
        }

        /// <summary>
        /// The caret was placed at a wrapper's edge (where Word would put typed text inside it): move
        /// it just outside. Not inside a native equation (Word's own editing) and not on a selection.
        /// </summary>
        internal void GuardCaret(Word.Selection sel)
        {
            if (sel == null || sel.Start != sel.End) return;
            CleanTypingFormat(sel);
            // Our own commands run inside an undo record: leave the caret to them.
            try
            {
                if (_app.UndoRecord.IsRecordingCustomRecord) return;
            }
            catch (COMException)
            {
            }
            var outer = OutermostWrapper(sel.Range);
            if (outer == null) return;
            // The equation was deleted (Delete or Cut on its picture): remove the empty wrapper, which
            // Word would otherwise show as placeholder text.
            try
            {
                if (outer.Range.Start >= outer.Range.End || (outer.Range.Text ?? "").Trim().Length == 0 && outer.Range.InlineShapes.Count == 0 && outer.Range.OMaths.Count == 0 && outer.Range.ShapeRange.Count == 0)
                {
                    var tag = outer.Tag;
                    Unlock(outer);
                    outer.Delete(true);
                    Log.Info("removed the empty wrapper of a deleted equation (" + tag + ")");
                    return;
                }
            }
            catch (COMException)
            {
            }
            try
            {
                if (sel.Range.OMaths.Count > 0) return;
            }
            catch (COMException)
            {
                return;
            }
            int pos = sel.Start <= outer.Range.Start ? outer.Range.Start - 1 : outer.Range.End + 1;
            if (pos == sel.Start) return;
            sel.Document.Range(pos, pos).Select();
        }

        /// <summary>
        /// The MathBlocks wrapper a command is about: around the selection, inside it, or right next
        /// to a collapsed caret (which the caret guard keeps just outside wrappers).
        /// </summary>
        internal static Word.ContentControl WrapperAt(Word.Document doc, Word.Range r)
        {
            try
            {
                for (var cc = r.ParentContentControl; cc != null; cc = cc.ParentContentControl)
                    if (IsMathBlocks(cc)) return cc;
                foreach (Word.ContentControl c in r.ContentControls)
                    if (IsMathBlocks(c)) return c;
                if (r.Start == r.End)
                {
                    if (r.Start > 0)
                    {
                        var before = doc.Range(r.Start - 1, r.Start);
                        for (var cc = before.ParentContentControl; cc != null; cc = cc.ParentContentControl)
                            if (IsMathBlocks(cc) && cc.Range.End + 1 >= r.Start) return cc;
                    }
                    var after = doc.Range(r.Start, Math.Min(r.Start + 1, doc.Content.End));
                    for (var cc = after.ParentContentControl; cc != null; cc = cc.ParentContentControl)
                        if (IsMathBlocks(cc) && cc.Range.Start - 1 <= r.Start) return cc;
                }
            }
            catch (COMException)
            {
            }
            return null;
        }

        /// <summary>
        /// Checks a wrapper before the app reads it. A copied wrapper sharing its ID gets a new one
        /// (identity first); returns the problem that blocks reading (null when it can be read) and
        /// fills the fingerprint.
        /// </summary>
        internal string PrepareRead(Word.Document doc, ref Eq cc, string what, out string fingerprint)
        {
            if (!cc.IsPicture) Unlock(cc.Control);
            // Copies first: the original keeps the ID, copies get their own — before the app sees any ID.
            if (FindByTag(doc, cc.Tag).Count > 1) ResolveDuplicates(doc, cc.Tag);
            var c = Inspect(doc, cc);
            fingerprint = EquationIdentity.Fingerprint(c);
            var problem = EquationIdentity.Problem(c);
            Log.Info(what + " resolved to " + EquationIdentity.Describe(cc.Tag, c) + (problem != null ? " — refused: " + problem : ""));
            return problem;
        }

        /// <summary>The wrapper a write is for, verified (one equation, no text, unique ID, unchanged); throws otherwise.</summary>
        internal Eq VerifyForWrite(Word.Document doc, string tag, Dictionary<string, object> p, string what)
        {
            var found = FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "The equation is no longer in the document.");
            // Copies that appeared since the equation was opened get their own ID; the original keeps it.
            if (found.Count > 1)
            {
                ResolveDuplicates(doc, tag);
                found = FindByTag(doc, tag);
            }
            var cc = found[0];
            // Nothing in the paragraph may be locked for our own write (number, update, repair).
            try
            {
                foreach (Word.ContentControl other in cc.Range.Paragraphs[1].Range.ContentControls) Unlock(other);
            }
            catch (COMException)
            {
            }
            if (!cc.IsPicture) Unlock(cc.Control);
            var c = Inspect(doc, cc);
            c.SameTag = found.Count;
            var expect = p != null && p.TryGetValue("expect", out var e) ? e as string : null;
            var refusal = EquationIdentity.RefuseWrite(c, expect);
            Log.Info(what + " → " + EquationIdentity.Describe(tag, c) + (refusal != null ? " — refused" : " — verified"));
            if (refusal != null) throw new RpcException(Rpc.Conflict, refusal);
            return cc;
        }

        // ------------------------------------------------------------------ floating pictures

        /// <summary>A floating MathBlocks picture (Word's "Insert/paste pictures as" can make a paste float): known by its alt text.</summary>
        internal static bool IsMathBlocksShape(Word.Shape sh)
        {
            try
            {
                return EquationIdentity.IsEquationAlt(sh.AlternativeText);
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>Floating MathBlocks pictures back in line with the text (where they are anchored). Returns how many.</summary>
        internal int InlineFloatingPictures(Word.Document doc, bool dry, Word.Range only = null)
        {
            var list = new List<Word.Shape>();
            foreach (Word.Shape sh in only != null ? only.ShapeRange : (System.Collections.IEnumerable)doc.Shapes)
                if (IsMathBlocksShape(sh)) list.Add(sh);
            if (dry) return list.Count;
            int n = 0;
            foreach (var sh in list)
            {
                try
                {
                    sh.ConvertToInlineShape();
                    n++;
                }
                catch (COMException ex)
                {
                    Log.Error("could not put a floating MathBlocks picture back in line", ex);
                }
            }
            if (n > 0) Log.Info("put " + n + " floating MathBlocks picture(s) back in line with the text");
            return n;
        }

        // ------------------------------------------------------------------ repair: split and dedupe

        /// <summary>
        /// Splits wrappers that hold more than one equation, other pictures, nested wrappers or text:
        /// the wrapper is removed (its content stays where it is) and each equation in it gets its own
        /// wrapper; text stays outside. The first equation keeps the wrapper's ID. Returns how many.
        /// </summary>
        internal int SplitWrappers(Word.Document doc, bool dry, List<object> report)
        {
            int split = 0;
            for (int pass = 0; pass < 6; pass++)
            {
                Word.ContentControl bad = null;
                EquationIdentity.WrapperContents contents = null;
                foreach (var cc in MathBlocksControls(doc))
                {
                    var c = Inspect(doc, cc);
                    if (EquationIdentity.Problem(c) == null || c.Equations == 0 && c.NestedControls == 0 && c.TextChars == 0 && c.OtherPictures == 0) continue;
                    // Innermost first: a wrapper without nested wrappers.
                    if (bad == null || c.NestedControls < contents.NestedControls)
                    {
                        bad = cc;
                        contents = c;
                    }
                }
                if (bad == null) break;
                var tag = bad.Tag;
                report.Add(new Dictionary<string, object> { ["tag"] = tag, ["equations"] = contents.Equations, ["text"] = contents.TextChars, ["nested"] = contents.NestedControls, ["otherPictures"] = contents.OtherPictures });
                Log.Info("repair: splitting " + EquationIdentity.Describe(tag, contents));
                split++;
                if (dry)
                {
                    // Count every bad wrapper once without changing anything.
                    int more = 0;
                    foreach (var cc in MathBlocksControls(doc))
                        if (cc.Tag != tag && EquationIdentity.Problem(Inspect(doc, cc)) != null) more++;
                    return split + more;
                }
                int start = bad.Range.Start - 1, end = bad.Range.End + 1;
                bad.LockContents = false;
                bad.LockContentControl = false;
                bad.Delete(false);
                var region = doc.Range(Math.Max(0, start), Math.Max(start, end - 2));
                bool first = true;
                // Its equations, each in its own wrapper (not those already inside another wrapper).
                var shapes = new List<Word.InlineShape>();
                foreach (Word.InlineShape s in region.InlineShapes) shapes.Add(s);
                foreach (var s in shapes)
                {
                    if (InsideMathBlocksControl(s.Range)) continue;
                    if (PictureSource(s.Range.WordOpenXML) == null) continue;
                    WrapRange(doc, s.Range, first ? tag : null);
                    first = false;
                }
                var maths = new List<Word.OMath>();
                foreach (Word.OMath m in region.OMaths) maths.Add(m);
                foreach (var m in maths)
                {
                    if (InsideMathBlocksControl(m.Range)) continue;
                    WrapRange(doc, m.Range, first ? tag : null);
                    first = false;
                }
            }
            return split;
        }

        private void WrapRange(Word.Document doc, Word.Range range, string tag)
        {
            // A Classic picture needs no wrapper: its title is its ID.
            if (range.InlineShapes.Count == 1 && range.OMaths.Count == 0)
            {
                var pic = range.InlineShapes[1];
                var newTag = tag ?? "mb1|-|" + RandomId(12);
                SetPictureTag(pic, newTag);
                Log.Info("repair: split off one Classic equation as the picture " + newTag);
                return;
            }
            object r = range;
            var cc = doc.ContentControls.Add(Word.WdContentControlType.wdContentControlRichText, ref r);
            cc.Tag = tag ?? "mb1|-|" + RandomId(12);
            cc.Title = "MathBlocks equation";
            Secure(cc);
            Log.Info("repair: wrapped one equation as " + cc.Tag);
        }

        /// <summary>Repair: every wrapper unlocked (no lock may block editing).</summary>
        internal int SecureAll(Word.Document doc) => UnlockAll(doc);
    }
}
