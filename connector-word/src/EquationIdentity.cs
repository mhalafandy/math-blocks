using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// What a MathBlocks wrapper (content control) holds, and whether it may be read or written:
    /// exactly one equation, nothing else, a unique ID, and — before a write — the same content that
    /// was read (fingerprint). No Word dependency: unit-tested in connector-word/tests.
    /// </summary>
    internal static class EquationIdentity
    {
        private static readonly Regex SourceTagRe = new Regex("\"tag\"\\s*:\\s*\"(mb1\\|[^\"|]+\\|[0-9A-Za-z]+)\"", RegexOptions.Compiled);

        /// <summary>The equation ID kept in a picture's hidden source (EMF comment JSON), or null.</summary>
        public static string SourceTag(string source)
        {
            if (source == null) return null;
            var m = SourceTagRe.Match(source);
            return m.Success ? m.Groups[1].Value : null;
        }

        /// <summary>
        /// Which of several equations sharing an ID is the original (keeps the ID); the others are copies.
        /// The one whose paragraph holds the number bookmark (so the references point at it) wins;
        /// otherwise the earliest in the document. `hasBookmark` is in document order.
        /// </summary>
        public static int ChooseKeeper(IList<bool> hasBookmark, out string reason)
        {
            for (int i = 0; i < hasBookmark.Count; i++)
            {
                if (!hasBookmark[i]) continue;
                reason = "its number bookmark (and references) belong to it";
                return i;
            }
            reason = "no number bookmark decides it: the earliest in the document";
            return 0;
        }

        internal sealed class WrapperContents
        {
            /// <summary>MathBlocks Classic pictures (their source, from the EMF comment or alt text).</summary>
            public List<string> PictureSources = new List<string>();
            /// <summary>Pictures without MathBlocks data (pasted images, MathType objects…).</summary>
            public int OtherPictures;
            /// <summary>Native Word equations (their text).</summary>
            public List<string> MathTexts = new List<string>();
            /// <summary>Content controls nested inside the wrapper.</summary>
            public int NestedControls;
            /// <summary>Characters of ordinary text (not equations) inside the wrapper.</summary>
            public int TextChars;
            /// <summary>Wrappers in the document with the same tag (1 = unique).</summary>
            public int SameTag = 1;

            public int Equations => PictureSources.Count + MathTexts.Count;
        }

        /// <summary>A short fingerprint of the wrapper's equation content (sources and equation text, in order).</summary>
        internal static string Fingerprint(WrapperContents c)
        {
            var sb = new StringBuilder();
            foreach (var s in c.PictureSources) sb.Append("P:").Append(s).Append('\n');
            foreach (var m in c.MathTexts) sb.Append("M:").Append(m).Append('\n');
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
                var hex = new StringBuilder();
                for (int i = 0; i < 8; i++) hex.Append(hash[i].ToString("x2"));
                return hex.ToString();
            }
        }

        /// <summary>Why the wrapper cannot be used as one equation (null when it can).</summary>
        internal static string Problem(WrapperContents c)
        {
            var parts = new List<string>();
            if (c.Equations == 0) parts.Add("no equation");
            if (c.Equations > 1) parts.Add(c.Equations + " equations");
            if (c.OtherPictures > 0) parts.Add(c.OtherPictures + " other picture(s)");
            if (c.NestedControls > 0) parts.Add(c.NestedControls + " nested wrapper(s)");
            if (c.TextChars > 0) parts.Add(c.TextChars + " character(s) of text");
            if (parts.Count == 0) return null;
            return "its wrapper holds " + string.Join(", ", parts);
        }

        /// <summary>
        /// Whether a write may replace this wrapper: one clean equation, unique ID, and the content
        /// the app read (when it sent a fingerprint). Null when allowed, else the refusal message.
        /// </summary>
        internal static string RefuseWrite(WrapperContents c, string expectedFingerprint)
        {
            if (c.SameTag > 1) return "Not changed: " + c.SameTag + " equations in the document share this ID (copies). Run Repair equations, then try again.";
            var problem = Problem(c);
            if (problem != null) return "Not changed: " + problem + ". Run Repair equations to split it, then try again.";
            if (!string.IsNullOrEmpty(expectedFingerprint) && expectedFingerprint != Fingerprint(c))
                return "Not changed: the equation in Word is no longer the one that was opened (it was edited or replaced meanwhile). Open it again.";
            return null;
        }

        /// <summary>One log line: what the wrapper holds and the first characters of its source.</summary>
        internal static string Describe(string tag, WrapperContents c)
        {
            string first = c.PictureSources.Count > 0 ? FirstLatex(c.PictureSources[0]) : c.MathTexts.Count > 0 ? c.MathTexts[0] : "";
            if (first.Length > 48) first = first.Substring(0, 48) + "…";
            return tag + " [pictures " + c.PictureSources.Count + "+" + c.OtherPictures + ", math " + c.MathTexts.Count + ", nested " + c.NestedControls
                + ", text " + c.TextChars + ", same-tag " + c.SameTag + "] \"" + first + "\"";
        }

        /// <summary>The "latex" value of a picture source JSON (or the alt text as is).</summary>
        internal static string FirstLatex(string source)
        {
            if (string.IsNullOrEmpty(source)) return "";
            int at = source.IndexOf("\"latex\"", StringComparison.Ordinal);
            if (at < 0) return source;
            int q = source.IndexOf('"', source.IndexOf(':', at) + 1);
            if (q < 0) return source;
            var sb = new StringBuilder();
            for (int i = q + 1; i < source.Length; i++)
            {
                char ch = source[i];
                if (ch == '\\' && i + 1 < source.Length)
                {
                    sb.Append(source[++i]);
                    continue;
                }
                if (ch == '"') break;
                sb.Append(ch);
            }
            return sb.ToString();
        }
    }
}
