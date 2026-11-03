import { describe, expect, it } from "vitest";
import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { parseXml, readOmml, toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE } from "../src";
import { REFERENCE_EQUATIONS } from "../../../fixtures/reference-equations";

/**
 * Removes the information OMML cannot carry, so that a write → read round trip can be compared
 * exactly: forced fraction sizes, wide accent variants, negative spaces.
 */
function normalize<T>(node: T): T {
  return JSON.parse(
    JSON.stringify(node, (key, value) => {
      if (key === "size") return undefined;
      if (key === "accent") return ({ widehat: "hat", widetilde: "tilde", overrightarrow: "vec" } as Record<string, string>)[value] ?? value;
      return value;
    }),
    (_k, v) => {
      if (v && typeof v === "object" && Array.isArray(v.children)) {
        v.children = (v.children as MathNode[]).filter((c) => !(c.kind === "space" && c.width === "negthin"));
      }
      return v;
    },
  );
}

const roundTrip = (latex: string, display = true, profile = TUNED_PROFILE) => {
  const ast = parseLatex(latex).root;
  const back = readOmml(toOmml(ast, { display, profile, standalone: true }));
  return { ast, back };
};

describe("readOmml — round trip of every reference equation", () => {
  for (const eq of REFERENCE_EQUATIONS) {
    it(`${eq.id}: ${eq.title}`, () => {
      const { ast, back } = roundTrip(eq.latex, eq.display);
      expect(back).not.toBeNull();
      expect(back!.unknown).toEqual([]);
      expect(back!.display).toBe(eq.display);
      expect(normalize(back!.root)).toEqual(normalize(ast));
    });
  }

  it("also round-trips with the Word-default profile (no bracket strut)", () => {
    for (const eq of REFERENCE_EQUATIONS) {
      const { ast, back } = roundTrip(eq.latex, eq.display, WORD_DEFAULT_PROFILE);
      expect(normalize(back!.root), eq.id).toEqual(normalize(ast));
    }
  });
});

describe("readOmml — Word's own markup", () => {
  const wrap = (inner: string) => `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`;
  const kids = (xml: string): MathNode[] => readOmml(wrap(xml))!.root.children;

  it("splits multi-character runs into letters, numbers and operators", () => {
    expect(kids("<m:r><m:t>2x+10=y</m:t></m:r>").map((n) => ("text" in n ? n.text : n.kind))).toEqual(["2", "x", "+", "10", "=", "y"]);
  });

  it("uses Word's defaults when properties are omitted", () => {
    expect(kids("<m:nary><m:sub/><m:sup/><m:e><m:r><m:t>f</m:t></m:r></m:e></m:nary>")[0]).toMatchObject({ kind: "nary", op: "∫", limits: "auto" });
    expect(kids("<m:d><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d>")[0]).toMatchObject({ kind: "delimited", open: "(", close: ")" });
    expect(kids("<m:acc><m:e><m:r><m:t>x</m:t></m:r></m:e></m:acc>")[0]).toMatchObject({ kind: "accent", accent: "hat" });
  });

  it("reads styled runs as font variants", () => {
    expect(kids('<m:r><m:rPr><m:sty m:val="b"/></m:rPr><m:t>v</m:t></m:r>')[0]).toEqual({ kind: "ident", text: "v", variant: "bold" });
    expect(kids('<m:r><m:rPr><m:scr m:val="double-struck"/><m:sty m:val="p"/></m:rPr><m:t>R</m:t></m:r>')[0]).toEqual({ kind: "ident", text: "R", variant: "double-struck" });
  });

  it("keeps unknown structures as raw text instead of dropping them", () => {
    const r = readOmml(wrap("<m:mystery><m:r><m:t>q</m:t></m:r></m:mystery>"))!;
    expect(r.unknown).toEqual(["mystery"]);
    expect(r.root.children[0]).toMatchObject({ kind: "raw", latex: "q" });
  });

  it("finds the equation inside a full WordprocessingML package", () => {
    const pkg = `<?xml version="1.0"?><pkg:package xmlns:pkg="x"><w:document xmlns:w="y"><w:body><w:p><w:sdt><w:sdtContent>${toOmml(parseLatex("a^2").root, { display: true, standalone: true })}</w:sdtContent></w:sdt></w:p></w:body></w:document></pkg:package>`;
    const r = readOmml(pkg)!;
    expect(r.display).toBe(true);
    expect(r.root.children[0]).toMatchObject({ kind: "scripts" });
  });

  it("returns null when there is no equation", () => {
    expect(readOmml("<w:p><w:r><w:t>text</w:t></w:r></w:p>")).toBeNull();
  });
});

describe("parseXml", () => {
  it("decodes entities and keeps attribute values", () => {
    const doc = parseXml(`<a x="1 &amp; 2"><b>&lt;&#x3B1;&#946;&gt;</b><c/></a>`);
    const a = doc.children[0] as { attrs: Record<string, string>; children: { children: string[] }[] };
    expect(a.attrs.x).toBe("1 & 2");
    expect(a.children[0]!.children[0]).toBe("<αβ>");
  });
});

describe("harpoon vectors", () => {
  it("write U+20D1 and read back as \\overrightharpoon", () => {
    const xml = toOmml(parseLatex("\\overrightharpoon{\\mathbf{r}}").root, { standalone: true });
    expect(xml).toContain('m:val="⃑"');
    expect(readOmml(xml)!.root.children[0]).toMatchObject({ kind: "accent", accent: "overrightharpoon" });
  });

  it("the harpoon vector style turns \\vec into a harpoon in Word", () => {
    const xml = toOmml(parseLatex("\\vec{v}").root, { standalone: true, profile: { ...TUNED_PROFILE, vectorStyle: "harpoon" } });
    expect(xml).toContain('m:val="⃑"');
  });
});

describe("Word wrapping the math in other markup", () => {
  const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
  const sdt = (inner: string) => `<w:sdt><w:sdtPr><w:tag w:val="mb1|-|abcdefghijkl"/></w:sdtPr><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
  const cases: [string, string, boolean][] = [
    ["content control around oMathPara", `<w:p ${M}>${sdt(`<m:oMathPara><m:oMath>${r("x=1")}</m:oMath></m:oMathPara>`)}</w:p>`, true],
    ["content control inside oMathPara", `<w:p ${M}><m:oMathPara><m:oMathParaPr/>${sdt(`<m:oMath>${r("x=1")}</m:oMath>`)}</m:oMathPara></w:p>`, true],
    ["content control inside oMath", `<w:p ${M}><m:oMath>${sdt(r("x=1"))}</m:oMath></w:p>`, false],
    ["bookmarks and tracked insertions", `<w:p ${M}><m:oMath><w:bookmarkStart w:id="0" w:name="a"/><w:ins w:id="1">${r("x")}</w:ins>${r("=1")}<w:del w:id="2">${r("9")}</w:del><w:bookmarkEnd w:id="0"/></m:oMath></w:p>`, false],
  ];
  for (const [name, xml, display] of cases)
    it(name, () => {
      const res = readOmml(xml)!;
      expect(res.unknown).toEqual([]);
      expect(res.display).toBe(display);
      expect(res.root.children.map((n) => ("text" in n ? n.text : n.kind)).join("")).toBe("x=1");
    });
});
