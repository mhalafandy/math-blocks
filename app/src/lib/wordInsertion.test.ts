import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { TUNED_PROFILE } from "@mathblocks/math-omml";
import { emfComment } from "@mathblocks/math-render";

/**
 * What the add-in inserts for a Classic equation, checked as Word will see it: the picture alone
 * (no content control), its ID in the alt text and in the EMF's hidden source, the baseline
 * lowering of its own run equal to its depth in whole points, and MathType-like padding.
 *
 * It also writes connector-word/tests/out/classic-insertions.docx and its expectations, which the
 * C# tests (same CI job, run after this) read back with the add-in's own detection code
 * (PictureXml.Identify — what the click handlers use).
 */

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const stixFile = join(dirname(require.resolve("@fontsource/stix-two-math/package.json", { paths: [join(here, "../../../packages/math-render")] })), "files", "stix-two-math-latin-400-normal.woff");
vi.stubGlobal("fetch", async () => ({ arrayBuffer: async () => new Uint8Array(readFileSync(stixFile)).buffer }));

const CASES: { latex: string; display: boolean; tag: string }[] = [
  { latex: "\\alpha", display: false, tag: "mb1|-|alpha0000001" },
  { latex: "\\beta", display: false, tag: "mb1|-|beta00000001" },
  { latex: "\\gamma", display: false, tag: "mb1|-|gamma0000001" },
  { latex: "f", display: false, tag: "mb1|-|fff000000001" },
  { latex: "p", display: false, tag: "mb1|-|ppp000000001" },
  { latex: "y", display: false, tag: "mb1|-|yyy000000001" },
  { latex: "\\frac{a}{b}", display: false, tag: "mb1|-|frac00000001" },
  { latex: "\\vec{r}=\\frac{p}{1+e\\cos\\theta}\\hat{r}", display: true, tag: "mb1|BLOCK1BLOCK1BLOC|disp00000001" },
];

const partsOf = (flat: string) =>
  [...flat.matchAll(/<pkg:part\b([^>]*)>([\s\S]*?)<\/pkg:part>/g)].map((m) => ({
    name: /pkg:name="\/?([^"]+)"/.exec(m[1]!)![1]!,
    type: /pkg:contentType="([^"]+)"/.exec(m[1]!)?.[1] ?? "",
    body: m[2]!,
  }));

describe("Classic insertion as Word receives it", async () => {
  const { buildInsertion } = await import("./equation");
  const built: { latex: string; display: boolean; tag: string; flatOpc: string }[] = [];
  for (const c of CASES) built.push({ ...c, ...(await buildInsertion(c.latex, c.display, TUNED_PROFILE, c.tag, "classic")) });

  it("is a picture alone: no content control, the ID in the alt text, the title and the EMF source", () => {
    for (const b of built) {
      expect(b.flatOpc, b.latex).not.toContain("<w:sdt");
      const shape = /<v:shape\b[^>]*>/.exec(b.flatOpc)![0];
      expect(shape).toContain(`alt="MathBlocks ${b.display ? "display" : "inline"} (${b.tag}): `);
      expect(shape).toContain(`title="${b.tag}"`);
      const emf = partsOf(b.flatOpc).find((p) => p.type === "image/x-emf")!;
      const bytes = Uint8Array.from(atob(/<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/.exec(emf.body)![1]!.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      expect(JSON.parse(emfComment(bytes)!).tag, b.latex).toBe(b.tag);
    }
  });

  it("lowers only its own run, by the depth in whole points (α, β, γ, f, p, y, a fraction sit on the baseline)", async () => {
    const { renderPicture } = await import("./render");
    for (const b of built) {
      const runs = [...b.flatOpc.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) => m[0]);
      expect(runs.length, b.latex).toBe(1); // the picture's run only: nothing after it inherits the lowering
      const pic = await renderPicture(b.latex, b.display, 12, b.display ? "display" : "inline");
      expect(Number.isInteger(Math.round(pic.depthPt * 1000) / 1000), `${b.latex} depth ${pic.depthPt}`).toBe(true);
      const pos = /<w:position w:val="(-?\d+)"\/>/.exec(runs[0]!)?.[1];
      expect(Number(pos ?? 0), b.latex).toBe(-Math.round(pic.depthPt * 2));
    }
    // Each letter: the depth is its own ink below the baseline + the bottom padding, rounded up to a whole
    // point — so the math baseline lands on the text baseline whatever the letter (descender or not).
    for (const l of ["\\alpha", "\\beta", "\\gamma", "f", "p", "y", "x", "z"]) {
      const pic = await renderPicture(l, false, 12, "inline");
      const ink = Math.max(0, pic.box.d) * 12;
      expect(pic.depthPt, l).toBeGreaterThanOrEqual(ink + 2 - 1e-6);
      expect(pic.depthPt, l).toBeLessThan(ink + 3 + 1e-6);
    }
  });

  it("has MathType-like padding around the ink (about 2 pt at 12 pt), in whole points", async () => {
    const { renderPicture } = await import("./render");
    const x = await renderPicture("x", false, 12, "inline");
    const ink = x.box;
    const left = 2;
    expect(x.widthPt).toBeGreaterThanOrEqual(ink.w * 12 + 2 * left - 0.01);
    expect(x.widthPt).toBeLessThan(ink.w * 12 + 2 * left + 1.01);
    expect(x.depthPt).toBeGreaterThanOrEqual(Math.max(0, ink.d) * 12 + 2 - 0.01);
    expect(x.heightPt - x.depthPt).toBeGreaterThanOrEqual(ink.h * 12 + 2.3 - 0.01);
    for (const v of [x.widthPt, x.heightPt, x.depthPt]) expect(Math.abs(v - Math.round(v))).toBeLessThan(1e-6);
  });

  it("writes a .docx of these insertions for the C# read-back test", () => {
    let body = "";
    const rels: string[] = [];
    const media: Record<string, Uint8Array> = {};
    built.forEach((b, i) => {
      const parts = partsOf(b.flatOpc);
      const doc = parts.find((p) => p.name === "word/document.xml")!;
      // The insertion's paragraph(s) only (the package also holds a section break).
      let xml = /<w:body>([\s\S]*?)<\/w:body>/.exec(doc.body)![1]!.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, "");
      for (const p of parts.filter((x) => x.type.startsWith("image/"))) {
        const rel = parts.find((x) => x.name.endsWith("document.xml.rels"))!;
        const id = [...rel.body.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(p.name.replace(/^word\//, "")))!;
        const oldId = /Id="([^"]+)"/.exec(id)![1]!;
        const newId = `rIdPic${i}`;
        const file = `media/eq${i}.emf`;
        xml = xml.split(`r:id="${oldId}"`).join(`r:id="${newId}"`);
        rels.push(`<Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${file}"/>`);
        media[`word/${file}`] = Uint8Array.from(atob(/<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/.exec(p.body)![1]!.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      }
      // Text typed after the equation, as the user does (its own run, no lowering).
      body += xml.replace(/<\/w:p>\s*$/, `<w:r><w:t xml:space="preserve"> words after</w:t></w:r></w:p>`);
    });
    const ns = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"`;
    const files: Record<string, Uint8Array> = {
      "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="emf" ContentType="image/x-emf"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
      "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
      "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${ns}><w:body>${body}</w:body></w:document>`),
      "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`),
      ...media,
    };
    const out = join(here, "../../../connector-word/tests/out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "classic-insertions.docx"), zipSync(files));
    writeFileSync(join(out, "classic-insertions.expected.txt"), built.map((b) => `${b.tag}\t${b.latex}`).join("\n") + "\n");
    expect(Object.keys(media).length).toBe(built.length);
  });

  it("spike: an embedded MathBlocks object carries everything in its own data", async () => {
    const { buildObjectInsertion, readObjectData, MB_OBJECT_PROGID } = await import("./equation");
    const b = await buildObjectInsertion("\\beta", false, "mb1|-|objectspike1");
    expect(b.flatOpc).toContain("<w:object ");
    expect(b.flatOpc).toContain(`ProgID="${MB_OBJECT_PROGID}"`);
    expect(b.flatOpc).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"');
    expect(b.flatOpc).toMatch(/<w:position w:val="-\d+"\/>/);
    const bin = partsOf(b.flatOpc).find((p) => p.type === "application/vnd.openxmlformats-officedocument.oleObject")!;
    const data = await readObjectData(/<pkg:binaryData>([\s\S]*?)<\/pkg:binaryData>/.exec(bin.body)![1]!);
    expect(data).toMatchObject({ latex: "\\beta", tag: "mb1|-|objectspike1", mode: "inline", style: expect.any(String) });
    expect(data!.depthPt).toBe(b.data.depthPt);
  });
});
