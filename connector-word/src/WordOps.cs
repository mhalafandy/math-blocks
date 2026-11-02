using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Document operations requested by the app. Must run on Word's main thread.
    /// </summary>
    internal sealed class WordOps
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

        private static List<Word.ContentControl> FindByTag(Word.Document doc, string tag)
        {
            var list = new List<Word.ContentControl>();
            foreach (Word.ContentControl cc in doc.SelectContentControlsByTag(tag)) list.Add(cc);
            return list;
        }

        /// <summary>Inserts a Flat OPC package (one paragraph holding a tagged content control) at the selection.</summary>
        public Dictionary<string, object> InsertEquation(Dictionary<string, object> p)
        {
            var flatOpc = Rpc.GetString(p, "flatOpc");
            var tag = Rpc.GetString(p, "tag");
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "Insert equation";
            var doc = ActiveDocument();
            var range = _app.Selection.Range;

            var undo = _app.UndoRecord;
            undo.StartCustomRecord(undoLabel);
            try
            {
                range.InsertXML(flatOpc);
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
            foreach (var cc in found)
            {
                try
                {
                    // Keep the identity wrapper but do not draw its box/label around Word's own
                    // equation frame (Word 2013+). Set here rather than in the XML so that an
                    // unexpected XML element can never make Word reject the insertion.
                    cc.Appearance = Word.WdContentControlAppearance.wdContentControlHidden;
                }
                catch (COMException)
                {
                    // Older Word: the box stays visible, which is harmless.
                }
            }
            if (found.Count == 1)
            {
                try
                {
                    // Put the cursor just after the new equation so typing continues naturally.
                    var end = found[0].Range.End + 1;
                    doc.Range(end, end).Select();
                }
                catch (COMException)
                {
                    // Cursor placement is cosmetic.
                }
            }
            Log.Info("insertEquation " + tag + " -> found " + found.Count);
            return new Dictionary<string, object> { ["found"] = found.Count };
        }

        public Dictionary<string, object> ReadEquation(Dictionary<string, object> p)
        {
            var tag = Rpc.GetString(p, "tag");
            var found = FindByTag(ActiveDocument(), tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "No equation with tag " + tag);
            var cc = found[0];
            return new Dictionary<string, object> { ["flatOpc"] = cc.Range.WordOpenXML, ["locked"] = cc.LockContents };
        }

        public Dictionary<string, object> DocumentInfo()
        {
            var doc = ActiveDocument();
            var tags = new List<string>();
            foreach (Word.ContentControl cc in doc.ContentControls)
            {
                var t = cc.Tag;
                if (t != null && t.StartsWith(TagPrefix, StringComparison.Ordinal)) tags.Add(t);
            }
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
