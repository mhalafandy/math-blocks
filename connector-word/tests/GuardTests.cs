using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using MathBlocks.WordConnector;

/// The text guard (GuardText) on recorded documents: every operation's before/after record in guard-fixtures/
/// gives the expected verdict (operations that only write MathBlocks' own content pass; real text changes are
/// caught), and a word typed or a space deleted in the text of any passing fixture is caught.
/// rec-*.json: recorded by the self-test in Word; gen-*.json: tools/make-guard-fixtures.ts (the add-in's field codes).
static class GuardTests
{
    public static void Run(Action<bool, string> check)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "guard-fixtures");
        var files = Directory.Exists(dir) ? Directory.GetFiles(dir, "*.json").OrderBy(x => x).ToArray() : new string[0];
        check(files.Length >= 8, "guard: fixtures found (" + files.Length + ")");
        int passing = 0, mutated = 0;
        foreach (var file in files)
        {
            var name = Path.GetFileNameWithoutExtension(file);
            using var json = JsonDocument.Parse(File.ReadAllText(file));
            var root = json.RootElement;
            var op = root.TryGetProperty("operation", out var o) ? o.GetString() : name;
            var expect = root.TryGetProperty("expect", out var e) ? e.GetString() : "unchanged";
            var exclude = Ranges(root.GetProperty("exclude"));
            var before = Doc(root.GetProperty("before"));
            var after = Doc(root.GetProperty("after"));
            // Text the operation wrote on purpose (Toggle LaTeX), left out afterwards as the replaced ranges are before.
            var written = root.TryGetProperty("written", out var wr) ? Ranges(wr) : null;
            var verdict = GuardText.Difference(GuardText.Canonical(before, exclude), GuardText.Canonical(after, written));
            check((verdict == null) == (expect == "unchanged"), "guard " + name + " (" + op + "): " + expect + (verdict != null ? " — " + verdict : ""));
            if (expect != "unchanged") continue;
            passing++;
            // A real change in the text around: a typed word, then a deleted space between two words.
            // Recorded documents with no two words side by side (only equations, or "ab $x$ cd") have nothing to mutate.
            var typed = Mutate(after, null, (s, i) => s.Insert(i + 1, "zz "));
            var joined = Mutate(after, null, (s, i) => s.Remove(i, 1));
            if (typed == null && name.StartsWith("rec-")) continue;
            mutated++;
            check(typed != null && GuardText.Difference(GuardText.Canonical(before, exclude), GuardText.Canonical(typed, null)) != null, "guard " + name + ": a typed word is caught");
            check(joined != null && GuardText.Difference(GuardText.Canonical(before, exclude), GuardText.Canonical(joined, null)) != null, "guard " + name + ": a deleted space is caught");
        }
        check(passing >= 5, "guard: at least five operations that must pass (" + passing + ")");
        check(mutated >= 20, "guard: a typed word and a deleted space checked in at least 20 operations (" + mutated + ")");
        // The 0.1.141–0.1.145 regression: the old comparison (fields removed by their field characters in the text)
        // reads a linked reference's number as new text, so Convert LaTeX was undone.
        var conv = files.FirstOrDefault(x => Path.GetFileName(x) == "gen-convert-latex.json");
        if (conv != null)
        {
            using var json = JsonDocument.Parse(File.ReadAllText(conv));
            var r = json.RootElement;
            var ex = Ranges(r.GetProperty("exclude"));
            var b = Doc(r.GetProperty("before"));
            var a = Doc(r.GetProperty("after"));
            check(OldCanonical(b, ex) != OldCanonical(a, null), "guard: the old comparison fails on linked references (the regression these fixtures catch)");
            check(GuardText.Canonical(b, ex) == GuardText.Canonical(a, null), "guard: the current comparison passes the same operation");
        }
        ListRegression(check);
        FieldEnds(check);
    }

    /// <summary>0.1.161: a field that shows nothing (MACROBUTTON, SEQ \h) reports its empty result after its end mark.</summary>
    public static void FieldEnds(Action<bool, string> check)
    {
        // MACROBUTTON at 10: code 11..40, end mark at 40, empty result reported at 41..41, a comma at 41.
        check(GuardText.FieldEnd(40, 41, 41, "\u0015,") == 41, "field end: an empty result after the end mark does not take the next character");
        // Separator at 40, empty result at 41, end mark at 41.
        check(GuardText.FieldEnd(40, 41, 41, "\u0014\u0015") == 42, "field end: an empty result between separator and end mark");
        // A result 41..45, end mark at 45.
        check(GuardText.FieldEnd(40, 41, 45, "\u00141") == 46, "field end: a field with a result ends after it");
        check(GuardText.FieldEnd(40, 40, 40, "") == 41, "field end: unreadable text falls back to after the code");
    }

    /// <summary>0.1.148's list-of-symbols failure: without leaving the list out, inserting it reads as new text.</summary>
    public static void ListRegression(Action<bool, string> check)
    {
        var file = Path.Combine(AppContext.BaseDirectory, "guard-fixtures", "gen-symbol-list-insert.json");
        if (!File.Exists(file)) { check(false, "guard: gen-symbol-list-insert.json found"); return; }
        using var json = JsonDocument.Parse(File.ReadAllText(file));
        var r = json.RootElement;
        var b = Doc(r.GetProperty("before"));
        var a = Doc(r.GetProperty("after"));
        a.Lists = new List<int[]>();
        check(GuardText.Difference(GuardText.Canonical(b, null), GuardText.Canonical(a, null)) != null, "guard: without leaving the list of symbols out, its table reads as changed text (0.1.148's failure)");
    }

    /// <summary>A copy of the document with one space between two letters, outside every left-out range, changed.</summary>
    static GuardDoc Mutate(GuardDoc d, IEnumerable<int[]> exclude, Func<string, int, string> change)
    {
        var left = GuardText.LeftOut(d, exclude);
        var copy = new GuardDoc { End = d.End, Fields = d.Fields, Equations = d.Equations, Lists = d.Lists, Chunks = d.Chunks.Select(c => new GuardChunk { Start = c.Start, End = c.End, Text = c.Text }).ToList() };
        foreach (var c in copy.Chunks)
        {
            if (left.Any(r => r[0] <= c.Start && c.End <= r[1])) continue;
            var m = Regex.Match(c.Text ?? "", "[A-Za-z] [A-Za-z]");
            if (!m.Success) continue;
            c.Text = change(c.Text, m.Index + 1);
            return copy;
        }
        return null;
    }

    /// <summary>The comparison as it was in 0.1.141–0.1.147 (for the regression check).</summary>
    static string OldCanonical(GuardDoc d, List<int[]> exclude)
    {
        var ranges = new List<int[]>(d.Equations);
        if (exclude != null) ranges.AddRange(exclude);
        var text = string.Concat(d.Chunks.Where(c => !ranges.Any(r => r[0] <= c.Start && c.End <= r[1])).Select(c => c.Text));
        for (int i = 0; i < 50; i++)
        {
            var next = Regex.Replace(text, "\u0013[^\u0013\u0015]*\u0015", "");
            if (next == text) break;
            text = next;
        }
        text = text.Replace("\u0013", "").Replace("\u0014", "").Replace("\u0015", "");
        return Regex.Replace(text, "[\\s\u0001\u0002\u0005\u0007\u0008\u000B\u000C ]", "");
    }

    static List<int[]> Ranges(JsonElement e)
    {
        var list = new List<int[]>();
        if (e.ValueKind != JsonValueKind.Array) return list;
        foreach (var r in e.EnumerateArray())
        {
            if (r.ValueKind == JsonValueKind.Array) list.Add(new[] { r[0].GetInt32(), r[1].GetInt32() });
            else if (r.ValueKind == JsonValueKind.Object) list.Add(new[] { r.GetProperty("start").GetInt32(), r.GetProperty("end").GetInt32() });
        }
        return list;
    }

    static GuardDoc Doc(JsonElement e)
    {
        var d = new GuardDoc { End = e.GetProperty("end").GetInt32(), Equations = Ranges(e.GetProperty("equations")), Lists = Ranges(e.GetProperty("lists")) };
        foreach (var f in e.GetProperty("fields").EnumerateArray()) d.Fields.Add(new GuardField { Start = f.GetProperty("start").GetInt32(), End = f.GetProperty("end").GetInt32(), Code = f.GetProperty("code").GetString() });
        foreach (var c in e.GetProperty("chunks").EnumerateArray()) d.Chunks.Add(new GuardChunk { Start = c.GetProperty("start").GetInt32(), End = c.GetProperty("end").GetInt32(), Text = c.GetProperty("text").GetString() });
        return d;
    }
}
