using System;
using System.Collections.Generic;
using System.Security;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The XML of equation numbers and references (no Word dependency, so it can be tested on its
    /// own: connector-word/tests). See WordOps.Numbering for where they are inserted.
    /// </summary>
    public static class NumberFields
    {
        /// <summary>How an equation number is built (from the app's number style).</summary>
        public sealed class NumberFormat
        {
            public string Open = "(";
            public string Close = ")";
            /// <summary>"eq" (1), "chapter" (1.1), "section" (1.2.3).</summary>
            public string Parts = "eq";
            public string Separator = ".";
            /// <summary>Equation counter restarts at each "chapter" or "section".</summary>
            public string Restart = "chapter";
            /// <summary>Chapter/section numbers from Word's "headings" numbering or MathBlocks "markers".</summary>
            public string Source = "headings";

            public static NumberFormat From(Dictionary<string, object> p)
            {
                var f = new NumberFormat();
                if (p.TryGetValue("open", out var o) && o is string os) f.Open = os;
                if (p.TryGetValue("close", out var c) && c is string cs) f.Close = cs;
                if (p.TryGetValue("parts", out var pa) && pa is string ps) f.Parts = ps;
                else if ((p.TryGetValue("chapter", out var ch) && ch is bool chb && chb)) f.Parts = "chapter";
                if (p.TryGetValue("separator", out var se) && se is string ss) f.Separator = ss;
                if (p.TryGetValue("restart", out var re) && re is string rs) f.Restart = rs;
                if (p.TryGetValue("source", out var so) && so is string sos) f.Source = sos;
                return f;
            }
        }

        private static string Esc(string s) => SecurityElement.Escape(s);
        private static string Instr(string s) => "<w:r><w:instrText xml:space=\"preserve\">" + Esc(s) + "</w:instrText></w:r>";
        private const string FldBegin = "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>";
        private const string FldSep = "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>";
        private const string FldEnd = "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";

        /// <summary>A complete nested field with a placeholder result.</summary>
        private static string Field(string code, string result = "1") => FldBegin + Instr(" " + code + " ") + FldSep + Instr(result) + FldEnd;

        /// <summary>
        /// The number as ONE field, like MathType's: MACROBUTTON MBPlaceRef whose display text holds the
        /// brackets and the counters (one grey block, no spaces). A hidden SEQ MBEq \h counts; the
        /// display shows SEQ MBEq \c. Bookmark &lt;name&gt; covers "(1.2.3)", &lt;nameN&gt; "1.2.3".
        /// </summary>
        public static string NumberRuns(NumberFormat f, string name, string nameN, bool appendix)
        {
            var reset = f.Source == "headings" && f.Parts != "eq" ? (f.Restart == "section" && f.Parts == "section" ? " \\s 2" : " \\s 1") : "";
            string chapterPart;
            if (f.Parts == "eq") chapterPart = "";
            else if (f.Source == "markers")
            {
                var chap = Field("SEQ MBChap \\c \\* " + (appendix ? "ALPHABETIC" : "ARABIC") + " \\* MERGEFORMAT");
                chapterPart = f.Parts == "section" ? chap + Instr(f.Separator) + Field("SEQ MBSec \\c \\* ARABIC \\* MERGEFORMAT") : chap;
            }
            else chapterPart = Field(f.Parts == "section" ? "STYLEREF 2 \\s" : "STYLEREF 1 \\s");
            return FldBegin + Instr(" MACROBUTTON MBPlaceRef \\* MERGEFORMAT ")
                + FldBegin + Instr(" SEQ MBEq \\h" + reset + " \\* MERGEFORMAT ") + FldEnd
                + "<w:bookmarkStart w:id=\"9001\" w:name=\"" + Esc(name) + "\"/>"
                + (f.Open.Length > 0 ? Instr(f.Open) : "")
                + "<w:bookmarkStart w:id=\"9002\" w:name=\"" + Esc(nameN) + "\"/>"
                + (chapterPart.Length > 0 ? chapterPart + Instr(f.Separator) : "")
                + Field("SEQ MBEq \\c \\* Arabic \\* MERGEFORMAT")
                + "<w:bookmarkEnd w:id=\"9002\"/>"
                + (f.Close.Length > 0 ? Instr(f.Close) : "")
                + "<w:bookmarkEnd w:id=\"9001\"/>"
                + FldEnd;
        }

        /// <summary>A reference as one field: GOTOBUTTON around REF (same look as the number).</summary>
        public static string ReferenceRuns(string bookmark) =>
            FldBegin + Instr(" GOTOBUTTON " + bookmark + "  \\* MERGEFORMAT ")
            + Field("REF " + bookmark + " \\* Charformat \\! \\* MERGEFORMAT", "(1)")
            + FldEnd;

        public static string Package(string runs) =>
            "<?xml version=\"1.0\" standalone=\"yes\"?><pkg:package xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\">"
            + "<pkg:part pkg:name=\"/_rels/.rels\" pkg:contentType=\"application/vnd.openxmlformats-package.relationships+xml\"><pkg:xmlData>"
            + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
            + "</pkg:xmlData></pkg:part><pkg:part pkg:name=\"/word/document.xml\" pkg:contentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"><pkg:xmlData>"
            + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p>" + runs + "</w:p></w:body></w:document>"
            + "</pkg:xmlData></pkg:part></pkg:package>";

    }
}
