using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// MathBlocks equations as embedded objects ("MathBlocks.Equation.1", as MathType stores its equations):
    /// recognising them and reading the ID in their own data.
    /// </summary>
    internal sealed partial class WordOps
    {
        internal const string ObjectProgIdPrefix = "MathBlocks.Equation";

        private static readonly Regex OleEmbedding = new Regex("<pkg:part [^>]*pkg:contentType=\"application/vnd\\.openxmlformats-officedocument\\.oleObject\"[^>]*>\\s*<pkg:binaryData>([^<]*)</pkg:binaryData>", RegexOptions.Compiled);

        /// <summary>
        /// The ProgID of an embedded object. Word may return an empty or different ProgID for a class
        /// that is not registered on the PC (instead of failing), so the object's XML is read as well.
        /// </summary>
        internal static string ProgIdOf(Word.InlineShape s)
        {
            string fromWord = null;
            try
            {
                if (s.Type != Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject) return null;
                fromWord = s.OLEFormat.ProgID;
            }
            catch (Exception)
            {
            }
            // Word knows the ProgID (a registered class, e.g. MathType's): that is the answer, no XML read.
            if (!string.IsNullOrEmpty(fromWord)) return fromWord;
            // For a class not registered on the PC Word returns an empty ProgID but the right class name.
            try
            {
                var cls = s.OLEFormat.ClassType;
                if (!string.IsNullOrEmpty(cls) && cls.StartsWith(ObjectProgIdPrefix, StringComparison.Ordinal)) return cls;
            }
            catch (Exception)
            {
            }
            try
            {
                var m = Regex.Match(ShapeXml(s), "ProgID=\"([^\"]+)\"");
                if (m.Success) return m.Groups[1].Value;
            }
            catch (Exception)
            {
            }
            return fromWord;
        }

        internal static bool IsMathBlocksObject(Word.InlineShape s)
        {
            var p = ProgIdOf(s);
            return p != null && p.StartsWith(ObjectProgIdPrefix, StringComparison.Ordinal);
        }

        /// <summary>The MathBlocks object under the selection (a click selects it), or null.</summary>
        internal static Word.InlineShape MathBlocksObjectIn(Word.Selection sel)
        {
            try
            {
                foreach (Word.InlineShape s in sel.Range.InlineShapes)
                    if (IsMathBlocksObject(s)) return s;
            }
            catch (Exception)
            {
            }
            return null;
        }

        /// <summary>The ID in a MathBlocks object's own data ("MathBlocks" stream), or null.</summary>
        internal static string ObjectDataTag(Word.InlineShape s)
        {
            try
            {
                return ObjectDataTagXml(ShapeXml(s));
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>ObjectDataTag from XML already read.</summary>
        internal static string ObjectDataTagXml(string xml)
        {
            try
            {
                var m = OleEmbedding.Match(xml);
                if (!m.Success) return null;
                var bytes = Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, "\\s+", ""));
                var t = Regex.Match(Encoding.ASCII.GetString(bytes), "\"tag\":\"(mb1\\|[^\"|]+\\|[0-9A-Za-z]+)\"");
                return t.Success ? t.Groups[1].Value : null;
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
