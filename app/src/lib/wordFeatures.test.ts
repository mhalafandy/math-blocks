import { beforeEach, describe, expect, it, vi } from "vitest";
import { ch, line, mathTypeObject, mtef, numberedParagraph, tf, v } from "../../../packages/mathtype/test/build";

/** In-Word MathType conversion and numbering, against a simulated connector. */

const word = vi.hoisted(() => ({ instances: [] as { tag: string; page: number; context: string; flatOpc: string }[], calls: [] as { method: string; params: Record<string, unknown> }[], paragraphs: [] as { start: number; end: number; objects: number; flatOpc: string }[], confirm: true }));

vi.mock("./connector", () => ({
  isDesktop: () => false,
  addinSupports: () => true,
  connector: {
    async request(method: string, params: Record<string, unknown>) {
      word.calls.push({ method, params });
      switch (method) {
        case "listMathTypeParagraphs": {
          const from = params.from as number, limit = params.limit as number;
          return { name: "thesis.docx", fullName: "C:\\thesis.docx", total: word.paragraphs.length, totalObjects: word.paragraphs.reduce((n, p) => n + p.objects, 0), paragraphs: word.paragraphs.slice(from, from + limit) };
        }
        case "replaceParagraphs":
          return { replaced: (params.items as unknown[]).length, skipped: 0 };
        case "numberEquation":
          return { bookmark: "_MBEq_x", number: "(1)" };
        case "unnumberEquation":
          return { ok: true };
        case "listNumbered":
          return { name: "thesis.docx", fullName: "C:\\thesis.docx", equations: [{ bookmark: "ZEqnNum1", number: "(A.1)", kind: "mathtype", page: 3, tag: null, context: "" }] };
        case "insertReference":
          return { text: "(A.1)" };
        case "activateObject":
          return { ok: true };
        case "listInstances":
          return { documents: [{ name: "thesis.docx", fullName: "C:\\thesis.docx", instances: word.instances }] };
        case "replaceMany":
          return { replaced: (params.items as unknown[]).length, missing: [] };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  },
}));
vi.mock("../components/Dialogs", () => ({ askConfirm: async () => word.confirm, askText: async () => null }));

const { useApp } = await import("./store");
const conv = await import("./convertMathType");
const numbering = await import("./numbering");

function flatOpcOf(paragraphXml: string, ole: Uint8Array) {
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
  return `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document ${ns}><w:body>${paragraphXml}</w:body></w:document></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/_rels/document.xml.rels"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOle1" Target="embeddings/oleObject1.bin"/></Relationships></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/embeddings/oleObject1.bin"><pkg:binaryData>${btoa(String.fromCharCode(...ole))}</pkg:binaryData></pkg:part></pkg:package>`;
}

beforeEach(() => {
  word.calls = [];
  word.confirm = true;
  const ole = mathTypeObject(mtef(line(ch(tf.vec, "F"), ch(tf.sym, "="), v("ma"))));
  word.paragraphs = Array.from({ length: 20 }, (_, i) => ({ start: i * 100, end: i * 100 + 50, objects: 1, flatOpc: flatOpcOf(numberedParagraph(1, `A.${i + 1}`), ole) }));
  useApp.setState({ connector: { available: true, connected: true }, notice: null, editing: null, display: true, numbered: false });
  conv.useConversion.setState({ busy: false, progress: null, report: null });
});

describe("converting MathType in the open document", () => {
  it("pages through the paragraphs and writes them back in one request", async () => {
    await conv.convertOpenDocument();
    const lists = word.calls.filter((c) => c.method === "listMathTypeParagraphs");
    expect(lists.length).toBe(2); // 15 + 5
    const replace = word.calls.find((c) => c.method === "replaceParagraphs")!;
    const items = replace.params.items as { flatOpc: string; start: number }[];
    expect(items).toHaveLength(20);
    expect(items.every((i) => !i.flatOpc.includes("<w:object") && i.flatOpc.includes("<m:oMath>"))).toBe(true);
    const report = conv.useConversion.getState().report!;
    expect(report.inPlace).toBe(true);
    expect(report.result.converted).toBe(20);
    expect(report.result.equations[19]!.number).toBe("(A.20)");
  });

  it("does nothing when the user says no", async () => {
    word.confirm = false;
    await conv.convertOpenDocument();
    expect(word.calls.some((c) => c.method === "replaceParagraphs")).toBe(false);
  });

  it("double-click on a MathType equation converts it and opens it for editing", async () => {
    const p = word.paragraphs[0]!;
    await conv.onMathTypeActivated({ ...p, document: "C:\\thesis.docx", index: 0 });
    const st = useApp.getState();
    expect(st.latex).toBe("\\mathbf{F}=ma");
    expect(st.editing).toMatchObject({ numbered: true, adopted: true });
    expect(st.numbered).toBe(true);
    expect(word.calls.map((c) => c.method)).toEqual(["replaceParagraphs"]);
  });

  it("Cancel opens it in MathType instead", async () => {
    word.confirm = false;
    await conv.onMathTypeActivated({ ...word.paragraphs[0]!, document: "C:\\thesis.docx", index: 0 });
    expect(word.calls.map((c) => c.method)).toEqual(["activateObject"]);
  });
});

describe("numbering", () => {
  it("numbers with the chosen style, using the inline version of the equation", async () => {
    useApp.setState({ numberStyle: { open: "[", close: "]", chapter: true } });
    await numbering.numberInWord("mb1|-|abcdefghijkl", "E=mc^2");
    const c = word.calls[0]!;
    expect(c.method).toBe("numberEquation");
    expect(c.params).toMatchObject({ tag: "mb1|-|abcdefghijkl", open: "[", close: "]", chapter: true });
    expect(c.params.flatOpc).toContain("<m:oMath");
    expect(c.params.flatOpc).not.toContain("<m:oMathPara");
  });

  it("lists numbered equations (MathType ones too) and inserts a reference", async () => {
    await numbering.openReferencePicker();
    const items = numbering.useReferences.getState().items;
    expect(items.map((i) => i.number)).toEqual(["(A.1)"]);
    await numbering.insertReference(items[0]!);
    expect(word.calls.at(-1)).toMatchObject({ method: "insertReference", params: { bookmark: "ZEqnNum1" } });
    expect(numbering.useReferences.getState().open).toBe(false);
  });
});

describe("symbol index of the document", () => {
  it("renames a symbol in every equation that uses it, keeping each equation's tag and shape", async () => {
    const { buildInsertion } = await import("./equation");
    const { TUNED_PROFILE } = await import("@mathblocks/math-omml");
    const mk = (latex: string, display: boolean, id: string) => {
      const tag = `mb1|-|${id}`;
      return { tag, page: 1, context: "", flatOpc: buildInsertion(latex, display, TUNED_PROFILE, tag).flatOpc };
    };
    word.instances = [mk("v=v_0+at", true, "aaaaaaaaaaaa"), mk("x=v_0t", false, "bbbbbbbbbbbb"), mk("E=mc^2", true, "cccccccccccc")];
    const { buildDocumentIndex, renameInDocument } = await import("./symbolIndex");
    const index = await buildDocumentIndex();
    expect(index.symbols.find((s) => s.key === "v_0")!.equations).toHaveLength(2);
    const r = await renameInDocument(index, "v_0", "u");
    expect(r.equations).toBe(2);
    const call = word.calls.find((c) => c.method === "replaceMany")!;
    const items = call.params.items as { tag: string; flatOpc: string }[];
    expect(items.map((i) => i.tag)).toEqual(["mb1|-|aaaaaaaaaaaa", "mb1|-|bbbbbbbbbbbb"]);
    expect(items[0]!.flatOpc).toContain("oMathPara");
    expect(items[1]!.flatOpc).not.toContain("oMathPara");
  });
});
