import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { readOmml, toOmml, TUNED_PROFILE } from "@mathblocks/math-omml";
import { contentControl, flatOpc, paragraph, parseRegistry } from "@mathblocks/ooxml";

/**
 * End-to-end tests of linked equations against a simulated Word: the same requests the real
 * connector answers (connector-word/src/WordOps*.cs), on in-memory documents.
 */

interface FakeDoc {
  name: string;
  fullName: string;
  instances: { tag: string; flatOpc: string }[];
  registry: string | null;
}

const word = vi.hoisted(() => ({ docs: [] as FakeDoc[], active: 0, confirm: true }));

vi.mock("./connector", () => ({
  isDesktop: () => false,
  connector: {
    async request(method: string, p: Record<string, unknown>) {
      const docByName = (n?: unknown) => (typeof n === "string" && n ? word.docs.find((d) => d.fullName === n) : word.docs[word.active])!;
      switch (method) {
        case "insertEquation": {
          const d = docByName();
          d.instances.push({ tag: p.tag as string, flatOpc: p.flatOpc as string });
          return { found: d.instances.filter((i) => i.tag === p.tag).length };
        }
        case "listInstances": {
          const docs = p.all ? word.docs : [docByName(p.document)];
          return {
            documents: docs.map((d) => {
              // Like the connector: copies sharing a tag get a new instance id first.
              const seen = new Set<string>();
              for (const i of d.instances) {
                if (seen.has(i.tag)) i.tag = i.tag.replace(/\|[0-9A-Za-z]{12}$/, `|${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`);
                seen.add(i.tag);
              }
              return {
                name: d.name,
                fullName: d.fullName,
                instances: d.instances
                  .filter((i) => !p.blockId || i.tag.split("|")[1] === p.blockId)
                  .map((i) => ({ tag: i.tag, page: 1, context: "", ...(p.includeContent ? { flatOpc: i.flatOpc } : {}) })),
              };
            }),
          };
        }
        case "replaceMany": {
          const d = docByName(p.document);
          let replaced = 0;
          for (const it of p.items as { tag: string; flatOpc: string }[]) {
            const i = d.instances.find((x) => x.tag === it.tag);
            if (i) (i.flatOpc = it.flatOpc), replaced++;
          }
          return { replaced, missing: [] };
        }
        case "retag": {
          const d = docByName(p.document);
          for (const i of d.instances) if (i.tag === p.tag) i.tag = p.newTag as string;
          return { found: 1 };
        }
        case "getRegistry":
          return { xml: docByName(p.document).registry, fullName: docByName(p.document).fullName };
        case "setRegistry":
          docByName(p.document).registry = p.xml as string;
          return { ok: true };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  },
}));

vi.mock("../components/Dialogs", () => ({ askConfirm: async () => word.confirm, askText: async () => null }));

const { useApp } = await import("./store");
const { useLibrary } = await import("./library/useLibrary");
const linking = await import("./linking");

const latexIn = (i: { flatOpc: string }) => serializeLatex(readOmml(i.flatOpc)!.root);
const norm = (latex: string) => serializeLatex(readOmml(toOmml(parseLatex(latex).root, { display: true, profile: TUNED_PROFILE, standalone: true }))!.root);
const wordWritten = (latex: string, tag: string) => flatOpc([paragraph(contentControl(toOmml(parseLatex(latex).root, { display: true, profile: TUNED_PROFILE }), { tag }))]);

async function newLibraryEquation(name: string, latex: string) {
  const lib = useLibrary.getState();
  const q = await lib.store!.save(`${name.replace(/\W/g, "").padEnd(16, "X").slice(0, 16)}`, { folderId: null, name, description: "", latex, display: true, favorite: false, tags: [] });
  await lib.refresh();
  return q;
}

beforeEach(async () => {
  word.docs = [{ name: "thesis.docx", fullName: "C:\\thesis.docx", instances: [], registry: null }];
  word.active = 0;
  word.confirm = true;
  useLibrary.setState({ store: null, equations: [], folders: [], open: null });
  await useLibrary.getState().init();
  useApp.setState({ connector: { available: true, connected: true }, notice: null, editing: null, display: true, look: "native" });
});

describe("linked equations", () => {
  it("inserts linked copies and records the block in the document registry", async () => {
    const q = await newLibraryEquation("Newton", "F=ma");
    await linking.insertLinked(q);
    await linking.insertLinked(q);
    const d = word.docs[0]!;
    expect(d.instances.map((i) => i.tag.split("|")[1])).toEqual([q.id, q.id]);
    expect(new Set(d.instances.map((i) => i.tag)).size).toBe(2);
    expect(parseRegistry(d.registry).blocks[q.id]).toMatchObject({ latex: "F=ma", version: 1 });
  });

  it("a new library version updates every copy in every open document", async () => {
    const q = await newLibraryEquation("Newton", "F=ma");
    await linking.insertLinked(q);
    word.docs.push({ name: "paper.docx", fullName: "C:\\paper.docx", instances: [], registry: null });
    word.active = 1;
    await linking.insertLinked(q);
    const v2 = await useLibrary.getState().store!.save("", { ...q, id: q.id, latex: "\\vec{F}=m\\vec{a}" });
    expect(await linking.propagate(v2, "F=ma")).toBe(2);
    for (const d of word.docs) {
      expect(d.instances.map(latexIn)).toEqual([norm("\\vec{F}=m\\vec{a}")]);
      expect(parseRegistry(d.registry).blocks[q.id]!.version).toBe(2);
    }
  });

  it("copies pasted in Word stay linked and are updated too", async () => {
    const q = await newLibraryEquation("Kepler", "M=E-e\\sin E");
    await linking.insertLinked(q);
    const d = word.docs[0]!;
    d.instances.push({ ...d.instances[0]! }); // Ctrl+C / Ctrl+V in Word: same tag
    const v2 = await useLibrary.getState().store!.save("", { ...q, id: q.id, latex: "M=E-e\\,\\sin E" });
    expect(await linking.propagate(v2, q.latex)).toBe(2);
    expect(new Set(d.instances.map((i) => i.tag)).size).toBe(2);
  });

  it("asks before overwriting a copy edited directly in Word; Cancel unlinks it", async () => {
    const q = await newLibraryEquation("Newton", "F=ma");
    await linking.insertLinked(q);
    await linking.insertLinked(q);
    const d = word.docs[0]!;
    d.instances[1]!.flatOpc = wordWritten("F=2ma", d.instances[1]!.tag); // edited in Word
    word.confirm = false;
    const v2 = await useLibrary.getState().store!.save("", { ...q, id: q.id, latex: "F=m a+0" });
    expect(await linking.propagate(v2, "F=ma")).toBe(1);
    expect(latexIn(d.instances[0]!)).toBe(norm("F=m a+0"));
    expect(latexIn(d.instances[1]!)).toBe(norm("F=2ma"));
    expect(d.instances[1]!.tag.split("|")[1]).toBe("-"); // unlinked, Word edit kept
  });

  it("a document opened after the library changed gets an 'Update now' notice", async () => {
    const q = await newLibraryEquation("Vis-viva", "v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)");
    await linking.insertLinked(q);
    // The document is closed; the equation changes in the library meanwhile.
    useApp.setState({ connector: { available: true, connected: false } });
    await useLibrary.getState().store!.save("", { ...q, id: q.id, latex: "v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)+0" });
    await useLibrary.getState().refresh();
    useApp.setState({ connector: { available: true, connected: true } });
    await linking.checkDocument("C:\\thesis.docx");
    const notice = useApp.getState().notice!;
    expect(notice.text).toContain("older than your library");
    await notice.actions[0]!.run();
    expect(latexIn(word.docs[0]!.instances[0]!)).toBe(norm("v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)+0"));
    expect(useApp.getState().notice).toBeNull();
  });

  it("offers to add blocks from another computer to the library", async () => {
    const q = await newLibraryEquation("Period", "T=2\\pi\\sqrt{\\frac{a^3}{\\mu}}");
    await linking.insertLinked(q);
    await useLibrary.getState().store!.delete(q.id);
    await useLibrary.getState().refresh();
    await linking.checkDocument("C:\\thesis.docx");
    await useApp.getState().notice!.actions[0]!.run();
    expect(useLibrary.getState().equations.find((x) => x.id === q.id)?.latex).toBe(q.latex);
  });

  it("double-clicking a linked copy opens its library equation", async () => {
    const q = await newLibraryEquation("Newton", "F=ma");
    await linking.insertLinked(q);
    const tag = word.docs[0]!.instances[0]!.tag;
    expect(await linking.openLinkedForEditing(tag)).toBe(true);
    expect(useLibrary.getState().open?.id).toBe(q.id);
    expect(useApp.getState().editing).toMatchObject({ tag, blockId: q.id });
    await linking.unlinkEditing();
    expect(word.docs[0]!.instances[0]!.tag.split("|")[1]).toBe("-");
    expect(useApp.getState().editing?.blockId).toBeUndefined();
  });
});
