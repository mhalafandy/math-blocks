using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace MathBlocks.WordConnector
{
    /// <summary>LaTeX spans in a paragraph's text (no Word dependency: tested in connector-word/tests).</summary>
    internal static class LatexText
    {
        /// <summary>$$…$$, \[…\], \(…\) and $…$ (not across paragraphs; "$5 and $6" is not LaTeX).</summary>
        internal static readonly Regex Spans = new Regex(@"\$\$[^\r]+?\$\$|\\\[[^\r]+?\\\]|\\\([^\r]+?\\\)|(?<![\\$])\$[^\s$\r](?:[^$\r]*?[^\s$\\\r])?\$(?!\$)", RegexOptions.Compiled);

        internal sealed class Span
        {
            public int Index;
            public int Length;
            public string Text;
            /// <summary>The span is all the paragraph holds: a display equation.</summary>
            public bool Alone;
        }

        internal static List<Span> Find(string paragraphText)
        {
            var list = new List<Span>();
            if (string.IsNullOrEmpty(paragraphText) || (paragraphText.IndexOf('$') < 0 && paragraphText.IndexOf('\\') < 0)) return list;
            var trimmed = paragraphText.Trim('\r', '\a', '\n', ' ', '\t', ' ', '\v', '\f');
            foreach (Match m in Spans.Matches(paragraphText))
                list.Add(new Span { Index = m.Index, Length = m.Length, Text = m.Value, Alone = trimmed == m.Value });
            return list;
        }
    }
}
