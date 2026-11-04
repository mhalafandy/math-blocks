using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Linked equations (M6): listing, bulk replacement, unlinking, navigation, the document
    /// registry (a Custom XML Part) and highlighting. The linking logic itself lives in the app
    /// (app/src/lib/linking.ts); these are the document primitives it needs.
    /// </summary>
    internal sealed partial class WordOps
    {
        public const string RegistryNamespace = "urn:mathblocks:registry:v1";

        /// <summary>The document named by params["document"] (FullName), or the active one.</summary>
        private Word.Document ResolveDocument(Dictionary<string, object> p)
        {
            if (p != null && p.TryGetValue("document", out var d) && d is string fullName && fullName.Length > 0)
            {
                foreach (Word.Document doc in _app.Documents)
                    if (string.Equals(doc.FullName, fullName, StringComparison.OrdinalIgnoreCase)) return doc;
                throw new RpcException(Rpc.NotFound, "The document is no longer open: " + fullName);
            }
            return ActiveDocument();
        }

        private static List<Word.ContentControl> MathBlocksControls(Word.Document doc)
        {
            var list = new List<Word.ContentControl>();
            foreach (Word.ContentControl cc in doc.ContentControls)
            {
                var t = cc.Tag;
                if (t != null && t.StartsWith(TagPrefix, StringComparison.Ordinal)) list.Add(cc);
            }
            return list;
        }

        /// <summary>
        /// Copying an equation in Word copies its tag. Give every duplicate (all but the first) a new
        /// instance id; the block id stays, so the copy remains linked.
        /// </summary>
        private int Dedupe(Word.Document doc)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            int fixedCount = 0;
            foreach (var cc in MathBlocksControls(doc))
            {
                var tag = cc.Tag;
                if (seen.Add(tag)) continue;
                var parts = tag.Split('|');
                if (parts.Length != 3) continue;
                var newTag = parts[0] + "|" + parts[1] + "|" + RandomId(12);
                cc.Tag = newTag;
                seen.Add(newTag);
                fixedCount++;
            }
            if (fixedCount > 0) Log.Info("gave " + fixedCount + " copied equation(s) new instance ids in " + doc.Name);
            return fixedCount;
        }

        private IEnumerable<Word.Document> TargetDocuments(Dictionary<string, object> p)
        {
            if (Rpc.GetBool(p, "all"))
            {
                foreach (Word.Document doc in _app.Documents) yield return doc;
            }
            else yield return ResolveDocument(p);
        }

        public Dictionary<string, object> ListInstances(Dictionary<string, object> p)
        {
            var blockFilter = p.TryGetValue("blockId", out var b) ? b as string : null;
            var includeContent = Rpc.GetBool(p, "includeContent");
            // Page numbers and context make Word lay out the document (visible as flicker):
            // only computed when asked for (lists shown to the user), not for background checks.
            var light = Rpc.GetBool(p, "light");
            var docs = new List<object>();
            bool screen = _app.ScreenUpdating;
            try
            {
                _app.ScreenUpdating = false;
                foreach (var doc in TargetDocuments(p))
                {
                    Dedupe(doc);
                    var items = new List<object>();
                    foreach (var cc in MathBlocksControls(doc))
                    {
                        var tag = cc.Tag;
                        if (blockFilter != null && tag.Split('|')[1] != blockFilter) continue;
                        var item = light
                            ? new Dictionary<string, object> { ["tag"] = tag, ["page"] = 0, ["context"] = "" }
                            : new Dictionary<string, object> { ["tag"] = tag, ["page"] = PageOf(cc), ["context"] = ContextOf(cc), ["number"] = NumberInfo(cc)?["number"] };
                        if (includeContent) item["flatOpc"] = cc.Range.WordOpenXML;
                        items.Add(item);
                    }
                    docs.Add(new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName, ["instances"] = items });
                }
            }
            finally
            {
                _app.ScreenUpdating = screen;
            }
            return new Dictionary<string, object> { ["documents"] = docs };
        }

        private static int PageOf(Word.ContentControl cc)
        {
            try
            {
                object page = cc.Range.get_Information(Word.WdInformation.wdActiveEndPageNumber);
                return Convert.ToInt32(page);
            }
            catch (Exception)
            {
                return 0;
            }
        }

        /// <summary>Plain text of the paragraph around the equation, for the instance list.</summary>
        private static string ContextOf(Word.ContentControl cc)
        {
            try
            {
                var text = cc.Range.Paragraphs.First.Range.Text ?? "";
                var sb = new System.Text.StringBuilder();
                foreach (var ch in text)
                {
                    if (char.IsControl(ch)) sb.Append(' ');
                    else if (ch < 0xE000 || ch > 0xF8FF) sb.Append(ch); // drop private-use math glyphs
                }
                var s = System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
                return s.Length > 90 ? s.Substring(0, 90) + "…" : s;
            }
            catch (Exception)
            {
                return "";
            }
        }

        /// <summary>Replaces several equations (by tag) in one undo step.</summary>
        public Dictionary<string, object> ReplaceMany(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string s ? s : "Update linked equations";
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            int replaced = 0;
            var missing = new List<object>();
            var undo = _app.UndoRecord;
            undo.StartCustomRecord(undoLabel);
            try
            {
                foreach (var o in list)
                {
                    if (!(o is Dictionary<string, object> item)) continue;
                    var tag = Rpc.GetString(item, "tag");
                    var flatOpc = Rpc.GetString(item, "flatOpc");
                    var found = FindByTag(doc, tag);
                    if (found.Count == 0)
                    {
                        missing.Add(tag);
                        continue;
                    }
                    ReplaceControl(doc, found[0], flatOpc);
                    foreach (var c in FindByTag(doc, tag)) TryHide(c);
                    replaced++;
                }
            }
            catch (COMException ex)
            {
                throw new RpcException(Rpc.WordRejected, "Word refused the update: " + ex.Message);
            }
            finally
            {
                undo.EndCustomRecord();
            }
            Log.Info("replaceMany in " + doc.Name + ": " + replaced + " replaced, " + missing.Count + " missing");
            return new Dictionary<string, object> { ["replaced"] = replaced, ["missing"] = missing };
        }

        /// <summary>Changes a control's tag (used to unlink: mb1|block|id → mb1|-|id).</summary>
        public Dictionary<string, object> Retag(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var newTag = Rpc.GetString(p, "newTag");
            var found = FindByTag(doc, tag);
            foreach (var cc in found) cc.Tag = newTag;
            return new Dictionary<string, object> { ["found"] = found.Count };
        }

        /// <summary>Brings the document to the front and selects the equation.</summary>
        public Dictionary<string, object> SelectInstance(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var tag = Rpc.GetString(p, "tag");
            var found = FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "That equation is no longer in the document.");
            doc.Activate();
            var r = found[0].Range;
            r.Select();
            try
            {
                _app.ActiveWindow.ScrollIntoView(r);
            }
            catch (COMException)
            {
                // Scrolling is cosmetic.
            }
            _app.Activate();
            return new Dictionary<string, object> { ["found"] = found.Count };
        }

        // CustomXMLParts belong to office.dll; late binding keeps the add-in free of that dependency.
        private static List<dynamic> RegistryParts(Word.Document doc)
        {
            var list = new List<dynamic>();
            dynamic parts = ((dynamic)doc).CustomXMLParts.SelectByNamespace(RegistryNamespace);
            foreach (dynamic part in parts) list.Add(part);
            return list;
        }

        public Dictionary<string, object> GetRegistry(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            foreach (var part in RegistryParts(doc))
                return new Dictionary<string, object> { ["xml"] = (string)part.XML, ["fullName"] = doc.FullName };
            return new Dictionary<string, object> { ["xml"] = null, ["fullName"] = doc.FullName };
        }

        public Dictionary<string, object> SetRegistry(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var xml = Rpc.GetString(p, "xml");
            var old = RegistryParts(doc);
            ((dynamic)doc).CustomXMLParts.Add(xml);
            foreach (var part in old) part.Delete();
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>Shows (or hides again) a coloured frame around linked equations in every open document.</summary>
        public int HighlightLinked(bool on)
        {
            int n = 0;
            foreach (Word.Document doc in _app.Documents)
            {
                foreach (var cc in MathBlocksControls(doc))
                {
                    var parts = cc.Tag.Split('|');
                    if (parts.Length != 3 || parts[1] == "-") continue;
                    try
                    {
                        cc.Appearance = on ? Word.WdContentControlAppearance.wdContentControlBoundingBox : Word.WdContentControlAppearance.wdContentControlHidden;
                        if (on) cc.Color = Word.WdColor.wdColorBlue;
                        n++;
                    }
                    catch (COMException)
                    {
                        // Word 2010: no appearance property.
                    }
                }
            }
            return n;
        }

        /// <summary>True when the document holds MathBlocks equations.</summary>
        public static bool HasEquations(Word.Document doc) => MathBlocksControls(doc).Count > 0;
    }
}
