using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>The width an equation has on its line (page-width check in the app).</summary>
    internal sealed partial class WordOps
    {
        /// <summary>
        /// Text width (points) of the paragraph holding the equation (tag) or the cursor: page width
        /// minus margins, gutter and the paragraph's indents. Numbered equations use a centre tab at
        /// half of it and a right tab at its end (see NumberEquation).
        /// </summary>
        public Dictionary<string, object> TextWidth(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            Word.Range r = null;
            if (p.TryGetValue("tag", out var t) && t is string tag && tag.Length > 0)
            {
                var found = FindByTag(doc, tag);
                if (found.Count > 0) r = found[0].Range;
            }
            if (r == null) r = _app.Selection.Range;
            var para = r.Paragraphs[1];
            var ps = r.Sections[1].PageSetup;
            float gutter = 0;
            try
            {
                gutter = ps.Gutter;
            }
            catch (COMException)
            {
            }
            float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - gutter - para.LeftIndent - para.RightIndent;
            return new Dictionary<string, object> { ["textWidthPt"] = Math.Round(width, 2), ["document"] = doc.FullName };
        }
    }
}
