using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The text guard's comparison, with no Word dependency (tested on recorded documents: connector-word/tests,
    /// fixtures in connector-word/tests/guard-fixtures). WordOps.Operation records a <see cref="GuardDoc"/> from Word
    /// before and after a whole-document operation; the operation is undone when <see cref="Canonical"/> differs.
    ///
    /// What is compared: the document's text outside everything MathBlocks writes or replaces — fields (numbers,
    /// references, hidden markers, equation objects: code and result, by their range, whatever Word's range text
    /// shows for them), equations (Word equations and inline pictures), the list of symbols (its marker and table)
    /// and the ranges the operation was asked to replace. Inside the remaining text, runs of white space count as
    /// one space (so a deleted space between words is a change), and white space next to a left-out range is
    /// ignored (an operation may add or remove the space or tab around what it writes).
    /// </summary>
    public sealed class GuardDoc
    {
        /// <summary>End of the main text (Word character position).</summary>
        public int End;
        /// <summary>Fields: start (the field's begin character) and end (after its end character), and the code.</summary>
        public List<GuardField> Fields = new List<GuardField>();
        /// <summary>Word equations and inline pictures: [start, end).</summary>
        public List<int[]> Equations = new List<int[]>();
        /// <summary>Lists of symbols: from the marker field to the end of the table after it.</summary>
        public List<int[]> Lists = new List<int[]>();
        /// <summary>The text Word gives for each stretch between consecutive boundaries (every range's start and end).</summary>
        public List<GuardChunk> Chunks = new List<GuardChunk>();
        /// <summary>Each inline picture's alternative text, in order (what an equation holds; for undoing back to before).</summary>
        public string Shapes = "";
    }

    public sealed class GuardField
    {
        public int Start;
        public int End;
        public string Code;
    }

    public sealed class GuardChunk
    {
        public int Start;
        public int End;
        public string Text;
    }

    public static class GuardText
    {
        private static readonly Regex Space = new Regex("[\\s \u000B\u000C\u0007]+");
        private static readonly Regex Control = new Regex("[\u0001\u0002\u0005\u0008\u0013\u0014\u0015]");

        /// <summary>
        /// Where a field ends (after its end mark). Word reports the empty result of a field that shows nothing
        /// (MACROBUTTON markers, SEQ \h) collapsed after the end mark, so "result end + 1" would take the next
        /// character into the field. <paramref name="atCodeEnd"/>: Word's text of the two characters after the code.
        /// </summary>
        public static int FieldEnd(int codeEnd, int resultStart, int resultEnd, string atCodeEnd)
        {
            if (resultEnd > resultStart) return Math.Max(codeEnd, resultEnd) + 1;
            int i = atCodeEnd?.IndexOf('\u0015') ?? -1;
            if (i >= 0) return codeEnd + i + 1;
            return Math.Max(codeEnd, resultEnd) + 1;
        }

        /// <summary>
        /// Every position a chunk must start or end at, for these ranges: the recorder reads Word's text between
        /// consecutive boundaries, so that each chunk is wholly inside or wholly outside each range.
        /// </summary>
        public static List<int> Boundaries(int end, IEnumerable<int[]> ranges)
        {
            var set = new SortedSet<int> { 0, end };
            foreach (var r in ranges)
            {
                if (r == null || r.Length < 2) continue;
                set.Add(Math.Max(0, Math.Min(end, r[0])));
                set.Add(Math.Max(0, Math.Min(end, r[1])));
            }
            return new List<int>(set);
        }

        /// <summary>All ranges the guard leaves out: fields, equations, lists and the extra ones (sorted, merged).</summary>
        public static List<int[]> LeftOut(GuardDoc d, IEnumerable<int[]> extra)
        {
            var all = new List<int[]>();
            foreach (var f in d.Fields) all.Add(new[] { f.Start, f.End });
            all.AddRange(d.Equations);
            all.AddRange(d.Lists);
            if (extra != null)
                foreach (var r in extra)
                    if (r != null && r.Length >= 2 && r[1] > r[0]) all.Add(new[] { r[0], r[1] });
            all.Sort((a, b) => a[0] != b[0] ? a[0].CompareTo(b[0]) : b[1].CompareTo(a[1]));
            var merged = new List<int[]>();
            foreach (var r in all)
            {
                if (merged.Count > 0 && r[0] <= merged[merged.Count - 1][1]) merged[merged.Count - 1][1] = Math.Max(merged[merged.Count - 1][1], r[1]);
                else merged.Add(new[] { r[0], r[1] });
            }
            return merged;
        }

        /// <summary>The document's text as the guard compares it (see the class summary).</summary>
        public static string Canonical(GuardDoc d, IEnumerable<int[]> exclude)
        {
            var left = LeftOut(d, exclude);
            var segments = new List<string>();
            var cur = new StringBuilder();
            int li = 0;
            var chunks = new List<GuardChunk>(d.Chunks);
            chunks.Sort((a, b) => a.Start.CompareTo(b.Start));
            foreach (var c in chunks)
            {
                while (li < left.Count && left[li][1] <= c.Start) li++;
                bool inside = li < left.Count && left[li][0] <= c.Start && c.End <= left[li][1];
                if (inside)
                {
                    // A left-out range ends the current piece of text.
                    if (cur.Length > 0) { segments.Add(cur.ToString()); cur.Clear(); }
                    continue;
                }
                cur.Append(c.Text ?? "");
            }
            if (cur.Length > 0) segments.Add(cur.ToString());
            var sb = new StringBuilder();
            foreach (var s in segments)
            {
                var t = Space.Replace(Control.Replace(s, ""), " ").Trim();
                if (t.Length == 0) continue;
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(t);
            }
            return sb.ToString();
        }

        /// <summary>
        /// Text an operation wrote on purpose (left out of the comparison): each range must hold exactly the text the
        /// operation says it wrote, and nothing else, so a range reported too wide cannot hide a change next to it.
        /// Null when every range holds its text; else what is wrong.
        /// </summary>
        public static string WrittenMismatch(GuardDoc after, IList<int[]> written, IList<string> texts)
        {
            if (written == null || written.Count == 0) return null;
            if (texts == null || texts.Count != written.Count) return "the text written was not reported with its ranges";
            var chunks = new List<GuardChunk>(after.Chunks);
            chunks.Sort((a, b) => a.Start.CompareTo(b.Start));
            for (int i = 0; i < written.Count; i++)
            {
                int s = written[i][0], e = written[i][1];
                var sb = new StringBuilder();
                bool covered = true;
                int pos = s;
                foreach (var c in chunks)
                {
                    if (c.End <= s || c.Start >= e) continue;
                    // The range must be made of whole chunks (it is a boundary of the record).
                    if (c.Start < s || c.End > e || c.Start != pos) { covered = false; break; }
                    sb.Append(c.Text ?? "");
                    pos = c.End;
                }
                if (pos != e) covered = false;
                var got = sb.ToString();
                if (!covered || got != texts[i])
                    return "the text written at " + s + " is not exactly what the operation wrote (holds \u201c" + Short(got) + "\u201d, wrote \u201c" + Short(texts[i] ?? "") + "\u201d)";
            }
            return null;
        }

        private static string Short(string s) => s.Length <= 60 ? s : s.Substring(0, 57) + "…";

        /// <summary>Null when the guarded text is unchanged; else where it differs (for the message and the log).</summary>
        public static string Difference(string before, string after)
        {
            if (before == after) return null;
            int i = 0;
            while (i < after.Length && i < before.Length && after[i] == before[i]) i++;
            string around(string s) => s.Substring(Math.Max(0, i - 30), Math.Min(s.Length, i + 30) - Math.Max(0, i - 30));
            return "text outside the equations changed near “…" + around(before) + "…” (now “…" + around(after) + "…”)";
        }
    }
}
