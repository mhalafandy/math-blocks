using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// What "Change symbol…" reads besides the equations and definitions (read-only): the headings (the preview groups
    /// occurrences by section), plain-text mentions of the symbol outside equations (listed with Go to, never changed),
    /// and selecting a range (Go to).
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>The main text's headings in order: position, outline level (1–9) and text.</summary>
        public Dictionary<string, object> ListHeadings(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var list = new List<object>();
            // Go To heading jumps from one heading to the next (fast even in long documents).
            var r = doc.Range(0, 0);
            int last = -1;
            for (int guard = 0; guard < 20000; guard++)
            {
                Word.Range h;
                try
                {
                    object what = Word.WdGoToItem.wdGoToHeading;
                    object which = guard == 0 ? Word.WdGoToDirection.wdGoToFirst : Word.WdGoToDirection.wdGoToNext;
                    h = r.GoTo(ref what, ref which);
                }
                catch (COMException)
                {
                    break;
                }
                if (h == null || h.Start <= last) break;
                last = h.Start;
                var para = h.Paragraphs.First;
                int level;
                try { level = (int)para.OutlineLevel; } catch (COMException) { level = 10; }
                if (level >= 1 && level <= 9) list.Add(new Dictionary<string, object> { ["start"] = para.Range.Start, ["level"] = level, ["text"] = VisibleContext(para.Range) });
                r = doc.Range(para.Range.End, para.Range.End);
            }
            return new Dictionary<string, object> { ["headings"] = list };
        }

        /// <summary>
        /// Plain-text mentions in the main text: every match of each text outside equations, pictures and fields
        /// (start, end, the paragraph's text). Params: texts [{ text, wholeWord, matchCase }].
        /// </summary>
        public Dictionary<string, object> FindTextMentions(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var found = new List<object>();
            var skip = new List<int[]>();
            try { foreach (Word.OMath m in doc.OMaths) skip.Add(new[] { m.Range.Start, m.Range.End }); } catch (COMException) { }
            try
            {
                foreach (Word.Field f in doc.Fields)
                {
                    try { skip.Add(new[] { f.Code.Start - 1, Math.Max(f.Code.End, f.Result?.End ?? f.Code.End) + 1 }); } catch (COMException) { }
                }
            }
            catch (COMException) { }
            bool inside(int a, int b) { foreach (var s in skip) if (a >= s[0] && b <= s[1]) return true; return false; }
            if (p.TryGetValue("texts", out var raw) && raw is IEnumerable items)
            {
                foreach (var o in items)
                {
                    if (!(o is Dictionary<string, object> t)) continue;
                    var text = Rpc.GetOptString(t, "text");
                    if (string.IsNullOrEmpty(text)) continue;
                    var r = doc.Content;
                    var find = r.Find;
                    find.ClearFormatting();
                    find.Text = text;
                    find.MatchWholeWord = Rpc.GetBool(t, "wholeWord");
                    find.MatchCase = Rpc.GetBool(t, "matchCase", true);
                    find.MatchWildcards = false;
                    find.Forward = true;
                    find.Wrap = Word.WdFindWrap.wdFindStop;
                    for (int n = 0; n < 2000 && find.Execute(); n++)
                    {
                        if (!inside(r.Start, r.End))
                            found.Add(new Dictionary<string, object> { ["text"] = text, ["start"] = r.Start, ["end"] = r.End, ["context"] = VisibleContext(r.Paragraphs.First.Range) });
                        r.Collapse(Word.WdCollapseDirection.wdCollapseEnd);
                    }
                }
            }
            return new Dictionary<string, object> { ["mentions"] = found };
        }

        /// <summary>Selects a range of the main text and shows it (Go to).</summary>
        public Dictionary<string, object> SelectRange(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            int start = Rpc.GetInt(p, "start"), end = Rpc.GetInt(p, "end", Rpc.GetInt(p, "start"));
            var r = doc.Range(Math.Max(0, start), Math.Min(doc.Content.End, Math.Max(start, end)));
            doc.Activate();
            r.Select();
            try { doc.ActiveWindow.ScrollIntoView(r, true); } catch (COMException) { }
            return new Dictionary<string, object> { ["ok"] = true };
        }
    }
}
