using System;
using System.Text;
using System.Text.RegularExpressions;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Word-free reading of a Classic equation picture (tested in CI on generated documents): the
    /// hidden source in its EMF (comment "MathBlocks1:{…}"), its alt text, and its ID from whichever
    /// of title, alt text and source survived. The click handlers use exactly this.
    /// </summary>
    internal static class PictureXml
    {
        private static readonly Regex AltMark = new Regex("(?:alt|descr)=\"MathBlocks (?:display|inline|numbered)(?: \\([^)\"]*\\))?:", RegexOptions.Compiled);
        private static readonly Regex AltSource = new Regex("(?:alt|descr)=\"(MathBlocks (?:display|inline|numbered)(?: \\([^)\"]*\\))?:[^\"]*)\"", RegexOptions.Compiled);
        private static readonly Regex EmfPart = new Regex("<pkg:part [^>]*pkg:contentType=\"image/x-emf\"[^>]*>\\s*<pkg:binaryData>([^<]*)</pkg:binaryData>", RegexOptions.Compiled);
        private static readonly byte[] EmfMarker = Encoding.ASCII.GetBytes("MathBlocks1:");

        /// <summary>What MathBlocks data a picture's XML (Flat OPC, as Range.WordOpenXML) carries: "emf", "alt", or null.</summary>
        public static string Data(string xml, out string emfJson)
        {
            emfJson = null;
            if (string.IsNullOrEmpty(xml)) return null;
            foreach (Match m in EmfPart.Matches(xml))
            {
                try
                {
                    emfJson = EmfSource(Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, "\\s+", "")));
                    if (emfJson != null) return "emf";
                }
                catch (FormatException)
                {
                    // Not base64: not ours.
                }
            }
            return AltMark.IsMatch(xml) ? "alt" : null;
        }

        /// <summary>The source JSON in an EMF's MathBlocks comment, or null.</summary>
        public static string EmfSource(byte[] bytes)
        {
            var at = IndexOf(bytes, EmfMarker);
            if (at < 0) return null;
            // The JSON runs to the end of the comment record: take up to the first NUL.
            int end = at + EmfMarker.Length;
            while (end < bytes.Length && bytes[end] != 0) end++;
            return Encoding.UTF8.GetString(bytes, at + EmfMarker.Length, end - at - EmfMarker.Length);
        }

        /// <summary>The source a picture carries (EMF comment JSON, else its alt text); null when it is not ours.</summary>
        public static string Source(string xml)
        {
            var how = Data(xml, out var json);
            if (how == "emf") return json;
            if (how == "alt")
            {
                var m = AltSource.Match(xml);
                return m.Success ? m.Groups[1].Value : "alt";
            }
            return null;
        }

        /// <summary>
        /// A picture's ID as the click handlers find it: title, else alt text, else the hidden source.
        /// Null when the picture carries none (then it gets a new ID if it is ours at all).
        /// </summary>
        public static string Identify(string title, string alt, string xml, out string from)
        {
            var tag = EquationIdentity.ResolvePictureTag(title, alt, null, out from);
            if (tag != null) return tag;
            return EquationIdentity.ResolvePictureTag(null, null, Source(xml), out from);
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
    }
}
