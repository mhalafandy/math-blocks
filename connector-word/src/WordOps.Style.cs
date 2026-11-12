using System;
using System.Collections.Generic;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The document style (how the document's equations look: italic/upright categories, notation
    /// kinds, size…) is stored in the document itself, in a Custom XML Part, so it travels with it.
    /// The app owns its content (JSON inside one element); this side only reads and replaces it.
    /// </summary>
    internal sealed partial class WordOps
    {
        public const string StyleNamespace = "urn:mathblocks:style:v1";

        private static List<dynamic> StyleParts(Word.Document doc)
        {
            var list = new List<dynamic>();
            dynamic parts = ((dynamic)doc).CustomXMLParts.SelectByNamespace(StyleNamespace);
            foreach (dynamic part in parts) list.Add(part);
            return list;
        }

        public Dictionary<string, object> GetDocumentStyle(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            foreach (var part in StyleParts(doc))
                return new Dictionary<string, object> { ["xml"] = (string)part.XML, ["fullName"] = doc.FullName, ["name"] = doc.Name };
            return new Dictionary<string, object> { ["xml"] = null, ["fullName"] = doc.FullName, ["name"] = doc.Name };
        }

        public Dictionary<string, object> SetDocumentStyle(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var xml = Rpc.GetString(p, "xml");
            if (string.IsNullOrEmpty(xml) || xml.IndexOf(StyleNamespace, StringComparison.Ordinal) < 0) throw new RpcException(Rpc.InvalidParams, "Not a MathBlocks style");
            var old = StyleParts(doc);
            ((dynamic)doc).CustomXMLParts.Add(xml);
            foreach (var part in old) part.Delete();
            return new Dictionary<string, object> { ["ok"] = true, ["fullName"] = doc.FullName };
        }

        /// <summary>The open documents (for "copy style from another document").</summary>
        public Dictionary<string, object> ListDocuments()
        {
            var list = new List<object>();
            string active = null;
            try { active = _app.ActiveDocument?.FullName; } catch (System.Runtime.InteropServices.COMException) { }
            foreach (Word.Document doc in _app.Documents)
            {
                bool hasStyle = false;
                try { hasStyle = StyleParts(doc).Count > 0; } catch (Exception) { }
                list.Add(new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName, ["active"] = doc.FullName == active, ["hasStyle"] = hasStyle });
            }
            return new Dictionary<string, object> { ["documents"] = list };
        }
    }
}
