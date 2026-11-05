using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Document operations requested by the app. Must run on Word's main thread.
    /// </summary>
    internal sealed partial class WordOps
    {
        public const string TagPrefix = "mb1|";
        private readonly Word.Application _app;

        public WordOps(Word.Application app)
        {
            _app = app;
        }

        private Word.Document ActiveDocument()
        {
            try
            {
                if (_app.Documents.Count > 0) return _app.ActiveDocument;
            }
            catch (COMException)
            {
                // Protected View or no active window
            }
            throw new RpcException(Rpc.NoDocument, "Open a document in Word first.");
        }

        /// <summary>
        /// Inserts an equation at the selection: a Classic picture (its ID becomes its title) or a native
        /// equation in its tagged wrapper.
        /// </summary>
        public Dictionary<string, object> InsertEquation(Dictionary<string, object> p)
        {
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var tag = Rpc.GetString(p, "tag");
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "Insert equation";
            var doc = ActiveDocument();
            // Never inside an existing equation's wrapper, never replacing an equation.
            var range = SafeInsertionPoint(doc, _app.Selection.Range);

            var undo = _app.UndoRecord;
            undo.StartCustomRecord(undoLabel);
            int at = range.Start;
            try
            {
                range.InsertXML(flatOpc);
                FinishInserted(doc, flatOpc, at, tag);
            }
            catch (COMException ex)
            {
                throw new RpcException(Rpc.WordRejected, "Word refused the insertion: " + ex.Message);
            }
            finally
            {
                undo.EndCustomRecord();
            }

            var found = FindByTag(doc, tag);
            // A native equation's wrapper: no box or label around Word's own equation frame (Word 2013+).
            foreach (var e in found) if (!e.IsPicture) Secure(e.Control);
            if (found.Count == 1)
            {
                try
                {
                    // Put the cursor just after the new equation so typing continues naturally.
                    var end = found[0].After;
                    doc.Range(end, end).Select();
                }
                catch (COMException)
                {
                    // Cursor placement is cosmetic.
                }
            }
            Log.Info("insertEquation " + (found.Count > 0 ? EquationIdentity.Describe(tag, Inspect(doc, found[0])) : tag) + " -> found " + found.Count);
            return new Dictionary<string, object> { ["found"] = found.Count };
        }

        /// <summary>
        /// Replaces an existing MathBlocks equation (found by tag) with new content that carries the
        /// same tag, in one undo step. The old control is removed and the new one inserted at its place.
        /// </summary>
        public Dictionary<string, object> ReplaceEquation(Dictionary<string, object> p)
        {
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var tag = Rpc.GetString(p, "tag");
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "Update equation";
            var doc = ActiveDocument();
            // Exactly one clean equation with this ID, and still the one the app read.
            var eq = VerifyForWrite(doc, tag, p, "replaceEquation");

            var undo = _app.UndoRecord;
            undo.StartCustomRecord(undoLabel);
            try
            {
                ReplaceEquationContent(doc, eq, flatOpc, tag);
            }
            catch (COMException ex)
            {
                throw new RpcException(Rpc.WordRejected, "Word refused the update: " + ex.Message);
            }
            finally
            {
                undo.EndCustomRecord();
            }

            var after = FindByTag(doc, tag);
            foreach (var e in after) if (!e.IsPicture) Secure(e.Control);
            Log.Info("replaceEquation " + tag + " -> found " + after.Count);
            return new Dictionary<string, object> { ["found"] = after.Count };
        }

        /// <summary>
        /// Wraps a native Word equation (typed in Word, no MathBlocks wrapper) in a hidden MathBlocks
        /// content control so the app can edit and later replace it. Returns the new tag.
        /// </summary>
        public string AdoptEquation(Word.OMath math)
        {
            var doc = ActiveDocument();
            var tag = "mb1|-|" + RandomId(12);
            var undo = _app.UndoRecord;
            undo.StartCustomRecord("Prepare equation for MathBlocks");
            try
            {
                object range = math.Range;
                var cc = doc.ContentControls.Add(Word.WdContentControlType.wdContentControlRichText, ref range);
                cc.Tag = tag;
                cc.Title = "MathBlocks equation";
                TryHide(cc);
            }
            finally
            {
                undo.EndCustomRecord();
            }
            Log.Info("adopted native equation as " + tag);
            return tag;
        }

        private static void TryHide(Word.ContentControl cc)
        {
            try
            {
                cc.Appearance = Word.WdContentControlAppearance.wdContentControlHidden;
            }
            catch (COMException)
            {
                // Older Word: the box stays visible.
            }
        }

        private static readonly char[] Base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".ToCharArray();

        private static string RandomId(int length)
        {
            var bytes = new byte[length * 2];
            using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            var sb = new System.Text.StringBuilder(length);
            foreach (var b in bytes)
            {
                if (b >= 248) continue; // rejection sampling keeps the distribution uniform
                sb.Append(Base62[b % 62]);
                if (sb.Length == length) break;
            }
            while (sb.Length < length) sb.Append('0');
            return sb.ToString();
        }

        public Dictionary<string, object> ReadEquation(Dictionary<string, object> p)
        {
            var tag = Rpc.GetString(p, "tag");
            var found = FindByTag(ActiveDocument(), tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "No equation with tag " + tag);
            var eq = found[0];
            var xml = eq.Xml;
            LogMathStructure("readEquation " + tag, xml);
            return new Dictionary<string, object> { ["flatOpc"] = xml, ["locked"] = false, ["number"] = NumberInfo(eq) };
        }

        public Dictionary<string, object> DocumentInfo()
        {
            var doc = ActiveDocument();
            var tags = new List<string>();
            foreach (var e in AllEquations(doc)) tags.Add(e.Tag);
            return new Dictionary<string, object>
            {
                ["name"] = doc.Name,
                ["fullName"] = doc.FullName,
                ["saved"] = doc.Saved,
                ["equationTags"] = tags,
            };
        }
    }
}
