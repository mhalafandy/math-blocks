using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using MathBlocks.WordConnector;

/// Equation number and reference fields: one outer field, no spaces in what is displayed,
/// bookmarks around "(…)" and the bare number, the right counters for each format.
static class Program
{
    static int failures;
    static void Check(bool ok, string what)
    {
        Console.WriteLine((ok ? "ok    " : "FAIL  ") + what);
        if (!ok) failures++;
    }

    static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    static XElement Para(string runs) => XElement.Parse("<w:p xmlns:w=\"" + W + "\">" + runs + "</w:p>");

    /// Field codes by nesting depth, and the displayed text of the outer field (its instrText at depth 1 outside nested fields).
    static (List<(int depth, string code)> codes, string display, int outerFields, List<string> bookmarkTexts) Analyse(XElement p)
    {
        var codes = new List<(int, string)>();
        var display = "";
        int depth = 0, outer = 0;
        var current = new Dictionary<int, string>();
        var marks = new Dictionary<string, string>();
        var open = new List<string>();
        var names = new Dictionary<string, string>();
        var inResult = new Dictionary<int, bool>();
        foreach (var el in p.Elements())
        {
            if (el.Name == W + "bookmarkStart") { names[(string)el.Attribute(W + "id")] = (string)el.Attribute(W + "name"); open.Add((string)el.Attribute(W + "id")); marks[(string)el.Attribute(W + "id")] = ""; continue; }
            if (el.Name == W + "bookmarkEnd") { open.Remove((string)el.Attribute(W + "id")); continue; }
            var fld = el.Element(W + "fldChar");
            if (fld != null)
            {
                var t = (string)fld.Attribute(W + "fldCharType");
                if (t == "begin") { depth++; if (depth == 1) outer++; current[depth] = ""; inResult[depth] = false; }
                else if (t == "separate") { inResult[depth] = true; }
                else if (t == "end") { codes.Add((depth, current[depth].Trim())); depth--; }
                continue;
            }
            var it = el.Element(W + "instrText");
            if (it == null) continue;
            var text = it.Value;
            if (depth >= 1 && !inResult[depth]) current[depth] += text;
            // Displayed: depth-1 display text, or the placeholder result of a depth-2 field.
            if ((depth == 1 && !inResult[1]) || (depth == 2 && inResult[2]))
            {
                if (depth == 1 && current[1].TrimStart().StartsWith("MACROBUTTON") && text.Contains("MACROBUTTON")) continue;
                if (depth == 1 && current[1].TrimStart().StartsWith("GOTOBUTTON") && text.Contains("GOTOBUTTON")) continue;
                display += text;
                foreach (var id in open) marks[id] += text;
            }
        }
        return (codes, display, outer, open.Count == 0 ? marks.Select(kv => names[kv.Key] + "=" + kv.Value).ToList() : new List<string> { "unclosed" });
    }

    static NumberFields.NumberFormat F(string parts, string source = "headings", string open = "(", string close = ")", string sep = ".", string restart = "chapter") =>
        new NumberFields.NumberFormat { Parts = parts, Source = source, Open = open, Close = close, Separator = sep, Restart = restart };

    /// <summary>
    /// Reads back the .docx written by app/src/lib/wordInsertion.test.ts (the add-in's own insertion
    /// XML) with the add-in's detection code, as the click handlers see each picture: Word gives no
    /// title for a VML picture, the alt text as AlternativeText, the picture's XML as WordOpenXML.
    /// </summary>
    static void ReadBack()
    {
        var dir = System.IO.Path.Combine(AppContext.BaseDirectory, "../../../out");
        var docx = System.IO.Path.Combine(dir, "classic-insertions.docx");
        if (!System.IO.File.Exists(docx))
        {
            var required = Environment.GetEnvironmentVariable("CI") == "true";
            Console.WriteLine((required ? "FAIL  " : "skip  ") + "read-back: " + docx + " missing (run pnpm test first)");
            if (required) failures++;
            return;
        }
        var expected = System.IO.File.ReadAllLines(System.IO.Path.Combine(dir, "classic-insertions.expected.txt")).Where(l => l.Length > 0).Select(l => l.Split('\t')).ToList();
        using (var zip = System.IO.Compression.ZipFile.OpenRead(docx))
        {
            string Text(string name) { using (var r = new System.IO.StreamReader(zip.GetEntry(name).Open())) return r.ReadToEnd(); }
            byte[] Bytes(string name) { using (var ms = new System.IO.MemoryStream()) { zip.GetEntry(name).Open().CopyTo(ms); return ms.ToArray(); } }
            var doc = Text("word/document.xml");
            var rels = Regex.Matches(Text("word/_rels/document.xml.rels"), "<Relationship [^>]*>").Cast<Match>()
                .ToDictionary(m => Regex.Match(m.Value, "Id=\"([^\"]+)\"").Groups[1].Value, m => Regex.Match(m.Value, "Target=\"([^\"]+)\"").Groups[1].Value);
            var paragraphs = Regex.Matches(doc, "<w:p\\b.*?</w:p>", RegexOptions.Singleline).Cast<Match>().Select(m => m.Value).ToList();
            Check(paragraphs.Count == expected.Count, "read-back: one paragraph per inserted equation (" + paragraphs.Count + ")");
            Check(!doc.Contains("<w:sdt"), "read-back: no content control around Classic equations");
            for (int i = 0; i < Math.Min(paragraphs.Count, expected.Count); i++)
            {
                var p = paragraphs[i];
                var tag = expected[i][0];
                var latex = expected[i][1];
                var run = Regex.Match(p, "<w:r>(?:(?!</w:r>).)*?<v:shape\\b.*?</w:r>", RegexOptions.Singleline).Value;
                var shape = Regex.Match(run, "<v:shape\\b[^>]*>").Value;
                string Attr(string n) { var m = Regex.Match(shape, "\\b" + n + "=\"([^\"]*)\""); return m.Success ? System.Net.WebUtility.HtmlDecode(m.Groups[1].Value) : null; }
                var alt = Attr("alt");
                var rid = Regex.Match(run, "r:id=\"([^\"]+)\"").Groups[1].Value;
                var emf = Bytes("word/" + rels[rid]);
                // As Range.WordOpenXML gives it: the run plus the image part.
                var xml = "<pkg:package><pkg:part pkg:name=\"/word/document.xml\"><pkg:xmlData>" + run + "</pkg:xmlData></pkg:part>" +
                          "<pkg:part pkg:name=\"/word/media/image1.emf\" pkg:contentType=\"image/x-emf\" pkg:compression=\"store\"><pkg:binaryData>" + Convert.ToBase64String(emf, Base64FormattingOptions.InsertLineBreaks) + "</pkg:binaryData></pkg:part></pkg:package>";
                Check(PictureXml.Identify(null, alt, xml, out var how) == tag && how == "alt", "read-back " + latex + ": recognised by its alt text (no title, as Word gives for VML)");
                Check(PictureXml.Identify(null, "edited by the user", xml, out how) == tag && how == "source", "read-back " + latex + ": still recognised with its alt text edited (hidden source)");
                Check(PictureXml.Identify(Attr("title"), null, xml, out how) == tag && how == "title", "read-back " + latex + ": recognised by its title where Word keeps one");
                Check(EquationIdentity.FirstLatex(PictureXml.Source(xml)) == latex, "read-back " + latex + ": the source gives the LaTeX back");
                // Baseline: the picture's run alone is lowered (whole points); the text typed after it is not.
                var pos = Regex.Match(run, "<w:position w:val=\"(-?\\d+)\"/>");
                Check(!pos.Success || int.Parse(pos.Groups[1].Value) % 2 == 0, "read-back " + latex + ": lowering in whole points (" + (pos.Success ? pos.Groups[1].Value : "0") + " half-points)");
                var after = p.Substring(p.IndexOf(run, StringComparison.Ordinal) + run.Length);
                Check(after.Contains("words after") && !after.Contains("<w:position"), "read-back " + latex + ": text after the equation is not lowered");
            }
        }
    }

    static int Main()
    {
        var cases = new (string label, NumberFields.NumberFormat f, bool appendix, string display, string[] mustCodes)[]
        {
            ("(1)", F("eq"), false, "(1)", new[] { "SEQ MBEq \\h \\* MERGEFORMAT", "SEQ MBEq \\c \\* Arabic \\* MERGEFORMAT" }),
            ("(1.1) headings", F("chapter"), false, "(1.1)", new[] { "SEQ MBEq \\h \\s 1 \\* MERGEFORMAT", "STYLEREF 1 \\s" }),
            ("(1.2.3) headings, restart per section", F("section", restart: "section"), false, "(1.1)", new[] { "SEQ MBEq \\h \\s 2 \\* MERGEFORMAT", "STYLEREF 2 \\s" }),
            ("(1.2.3) headings, restart per chapter", F("section"), false, "(1.1)", new[] { "SEQ MBEq \\h \\s 1 \\* MERGEFORMAT", "STYLEREF 2 \\s" }),
            ("[1-1] markers", F("chapter", "markers", "[", "]", "-"), false, "[1-1]", new[] { "SEQ MBChap \\c \\* ARABIC \\* MERGEFORMAT" }),
            ("(A.1) markers appendix", F("chapter", "markers"), true, "(1.1)", new[] { "SEQ MBChap \\c \\* ALPHABETIC \\* MERGEFORMAT" }),
            ("(A.1.1) markers appendix section", F("section", "markers"), true, "(1.1.1)", new[] { "SEQ MBChap \\c \\* ALPHABETIC \\* MERGEFORMAT", "SEQ MBSec \\c \\* ARABIC \\* MERGEFORMAT" }),
            ("1 no brackets", F("eq", open: "", close: ""), false, "1", new string[0]),
        };
        foreach (var c in cases)
        {
            var p = Para(NumberFields.NumberRuns(c.f, "_MBEq_abc123def456", "_MBEqN_abc123def456", c.appendix));
            var a = Analyse(p);
            Check(a.outerFields == 1, c.label + ": one outer field");
            Check(a.codes.Any(x => x.depth == 1 && x.code.StartsWith("MACROBUTTON MBPlaceRef")), c.label + ": outer field is MACROBUTTON MBPlaceRef");
            Check(!a.display.Contains(" "), c.label + ": no spaces in the displayed number (\"" + a.display + "\")");
            Check(a.display == c.display, c.label + ": displays " + c.display + " (got " + a.display + ")");
            foreach (var m in c.mustCodes) Check(a.codes.Any(x => x.code == m), c.label + ": has field " + m);
            Check(a.bookmarkTexts.Contains("_MBEq_abc123def456=" + c.display), c.label + ": bookmark covers the whole number with brackets");
            var bare = c.display.Trim('(', ')', '[', ']');
            Check(a.bookmarkTexts.Contains("_MBEqN_abc123def456=" + bare), c.label + ": number-only bookmark covers " + bare);
        }
        // Reference: one REF field with the hyperlink switch (Ctrl+click in Word, a link in the PDF), no GOTOBUTTON.
        var r = Analyse(Para(NumberFields.ReferenceRuns("_MBEq_abc123def456")));
        Check(r.outerFields == 1, "reference: one field");
        Check(r.codes.Any(x => x.depth == 1 && x.code == "REF _MBEq_abc123def456 \\h \\* Charformat \\! \\* MERGEFORMAT"), "reference: REF to the bookmark with \\h (a link) and \\! (keeps the referenced number)");
        Check(!r.codes.Any(x => x.code.Contains("GOTOBUTTON")), "reference: no GOTOBUTTON");
        // The package is well-formed XML.
        try { XDocument.Parse(NumberFields.Package(NumberFields.NumberRuns(F("section"), "_MBEq_x", "_MBEqN_x", false))); Check(true, "package is well-formed"); }
        catch (Exception e) { Check(false, "package is well-formed: " + e.Message); }
        // Convert LaTeX: spans of every delimiter type, several per paragraph, inline and alone.
        void Spans(string para, string expect, string what)
        {
            var got = string.Join(" | ", LatexText.Find(para).Select(x => x.Text + (x.Alone ? " [alone]" : "")));
            Check(got == expect, "latex spans: " + what + " → " + got);
        }
        Spans("The energy $E=mc^2$ is.\r", "$E=mc^2$", "inline $…$");
        Spans("$\\alpha$\r", "$\\alpha$ [alone]", "$…$ alone");
        Spans("$$\\int_0^1 x\\,dx$$\r", "$$\\int_0^1 x\\,dx$$ [alone]", "$$…$$ alone");
        Spans("see $$a+b$$ here\r", "$$a+b$$", "$$…$$ inline");
        Spans("\\(a+b\\) and \\[c\\] and $d$\r", "\\(a+b\\) | \\[c\\] | $d$", "\\( \\), \\[ \\] and $ in one paragraph");
        Spans("\t\\[x=1\\] \r", "\\[x=1\\] [alone]", "\\[…\\] alone with tab and space");
        Spans("a $x$ and $y$ b\r", "$x$ | $y$", "two $…$");
        Spans("Cost $5 and $6\r", "", "prices are not LaTeX");
        Spans("text\a", "", "table cell without LaTeX");
        Spans("$x$\a", "$x$ [alone]", "alone in a table cell");
        // Equation identity: a wrapper is one clean equation, and a write needs the same content that was read.
        EquationIdentity.WrapperContents W(int pics, int text = 0, int nested = 0, int same = 1, int other = 0, string src = "{\"latex\":\"x\"}")
        {
            var w = new EquationIdentity.WrapperContents { TextChars = text, NestedControls = nested, SameTag = same, OtherPictures = other };
            for (int i = 0; i < pics; i++) w.PictureSources.Add(i == 0 ? src : "{\"latex\":\"r_2\"}");
            return w;
        }
        var clean = W(1);
        var fp = EquationIdentity.Fingerprint(clean);
        Check(EquationIdentity.Problem(clean) == null, "identity: one picture, nothing else → clean");
        Check(EquationIdentity.RefuseWrite(clean, fp) == null, "identity: write allowed with the fingerprint that was read");
        Check(EquationIdentity.RefuseWrite(clean, null) == null, "identity: write allowed without fingerprint (insert-time update)");
        Check(EquationIdentity.RefuseWrite(W(1, src: "{\"latex\":\"y\"}"), fp) != null, "identity: refused when the content changed since it was read");
        Check(EquationIdentity.RefuseWrite(W(2), null)?.Contains("2 equations") == true, "identity: refused when the wrapper holds two equations (the r₂ case)");
        Check(EquationIdentity.RefuseWrite(W(1, text: 12), null)?.Contains("12 character(s) of text") == true, "identity: refused when text was typed into the wrapper");
        Check(EquationIdentity.RefuseWrite(W(1, nested: 1), null)?.Contains("nested") == true, "identity: refused with a nested wrapper");
        Check(EquationIdentity.RefuseWrite(W(1, same: 3), null)?.Contains("3 equations in the document share this ID") == true, "identity: refused when the ID is duplicated");
        Check(EquationIdentity.RefuseWrite(W(1, other: 1), null) != null, "identity: refused with another picture inside");
        Check(EquationIdentity.Fingerprint(W(2)) != fp, "identity: the fingerprint sees a second equation");
        Check(EquationIdentity.FirstLatex("{\"latex\":\"\\\\pvec{r}_2\",\"mode\":\"display\"}") == "\\pvec{r}_2", "identity: first LaTeX read from the source JSON");
        Check(EquationIdentity.Describe("mb1|-|abc", W(2, text: 5)).Contains("pictures 2+0") , "identity: log line counts pictures and text");
        // Hybrid identity: the ID in a picture's hidden source, and which duplicate keeps the ID.
        Check(EquationIdentity.SourceTag("{\"latex\":\"x\",\"mode\":\"display\",\"tag\":\"mb1|-|abc123DEF456\"}") == "mb1|-|abc123DEF456", "hybrid: ID read from the hidden source");
        Check(EquationIdentity.SourceTag("{\"latex\":\"x\",\"block\":\"BLOCK1BLOCK1BLOC\",\"tag\":\"mb1|BLOCK1BLOCK1BLOC|inst00000001\"}") == "mb1|BLOCK1BLOCK1BLOC|inst00000001", "hybrid: linked copy's ID read from the hidden source");
        Check(EquationIdentity.SourceTag("{\"latex\":\"x\"}") == null, "hybrid: no ID in an older source");
        Check(EquationIdentity.SourceTag("{\"latex\":\"\\\\text{tag}\",\"tag\":\"oops\"}") == null, "hybrid: a malformed ID is not taken");
        Check(EquationIdentity.ChooseKeeper(new[] { false, true }, out var why1) == 1 && why1.Contains("bookmark"), "hybrid: the copy pasted BEFORE the numbered original does not take its ID");
        Check(EquationIdentity.ChooseKeeper(new[] { true, false, false }, out _) == 0, "hybrid: the numbered original keeps its ID, both copies are renamed");
        Check(EquationIdentity.ChooseKeeper(new[] { false, false }, out var why2) == 0 && why2.Contains("earliest"), "hybrid: unnumbered duplicates — the earliest keeps the ID (logged)");
        // Alt text carries the ID (Word has no title on VML pictures).
        Check(EquationIdentity.AltTag("MathBlocks inline (mb1|-|abc123DEF456): \\beta") == "mb1|-|abc123DEF456", "alt: ID read from the alt text");
        Check(EquationIdentity.AltTag("MathBlocks inline: \\beta") == null && EquationIdentity.IsEquationAlt("MathBlocks inline: \\beta"), "alt: older alt text without ID is still ours");
        Check(EquationIdentity.AltWithTag("my own description", "mb1|-|x1", "display", "a=b") == "MathBlocks display (mb1|-|x1): a=b", "alt: edited alt text rebuilt from the source");
        Check(EquationIdentity.AltWithTag("MathBlocks inline (mb1|-|old): f", "mb1|-|new") == "MathBlocks inline (mb1|-|new): f", "alt: a copy's alt text gets its new ID");
        Check(EquationIdentity.ResolvePictureTag(null, "MathBlocks inline (mb1|-|a1): f", "{\"tag\":\"mb1|-|s1\"}", out var from1) == "mb1|-|a1" && from1 == "alt", "identity: no title (VML) → the alt text");
        Check(EquationIdentity.ResolvePictureTag(null, "edited", "{\"tag\":\"mb1|-|s1\"}", out var from2) == "mb1|-|s1" && from2 == "source", "identity: alt text edited → the hidden source");
        Check(EquationIdentity.ResolvePictureTag("Figure 3", "MathBlocks inline (mb1|-|a1): f", null, out _) == "mb1|-|a1", "identity: a title that is not an ID is ignored");
        ReadBack();
        // Replacing in place: the new equation's package brings no paragraph properties.
        var pkg = "<pkg:package><w:document><w:body><w:p><w:pPr><w:pStyle w:val=\"X\"/><w:jc w:val=\"center\"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document></pkg:package>";
        Check(!PictureXml.RunsOnly(pkg).Contains("<w:pPr>") && PictureXml.RunsOnly(pkg).Contains("<w:r><w:t>x</w:t></w:r>"), "replace in place: the package's paragraph properties are removed, its runs kept");
        Check(PictureXml.RunsOnly("<w:body><w:p><w:r/></w:p></w:body>") == "<w:body><w:p><w:r/></w:p></w:body>", "replace in place: a package without paragraph properties is unchanged");
        Console.WriteLine(failures == 0 ? "all number-field checks passed" : failures + " check(s) failed");
        return failures == 0 ? 0 : 1;
    }
}
