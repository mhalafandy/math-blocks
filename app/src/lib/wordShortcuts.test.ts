import { beforeEach, describe, expect, it, vi } from "vitest";

const word = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[], selection: {} as Record<string, unknown>, latex: [] as { start: number; end: number; text: string; alone: boolean }[], trapped: false, repaired: false, dontAsk: false }));

vi.mock("./connector", () => ({
  isDesktop: () => false,
  addinSupports: () => true,
  activateEquation: vi.fn(async () => undefined),
  connector: {
    async request(method: string, params: Record<string, unknown>) {
      word.calls.push({ method, params });
      if (method === "selectionInfo") return { document: "C:\\t.docx", rect: null, ...word.selection };
      if (method === "findLatex") {
        // LaTeX typed into an equation's wrapper is reported until Repair moved it out.
        if (word.trapped && !word.repaired) return { name: "t.docx", fullName: "C:\\t.docx", items: [], skippedInside: 1, insideWrapper: 1 };
        return { name: "t.docx", fullName: "C:\\t.docx", items: word.latex, selection: !!params.selectionOnly };
      }
      if (method === "repairEquations") {
        if (!params.dryRun) word.repaired = true;
        return { document: "C:\\t.docx", renamed: [], wrapped: [], wrappedOk: 0, bookmarks: 0, otherPictures: 0, split: word.trapped && !word.repaired ? [{ tag: "mb1|-|x", equations: 1, text: 4, nested: 0, otherPictures: 0 }] : [] };
      }
      // Repair runs as one operation (one undo step).
      if (method === "beginOperation") return { ok: true };
      if (method === "operationProgress") return { cancelled: false };
      if (method === "endOperation") return { ms: 1 };
      if (method === "replaceMany") return { replaced: (params.items as unknown[]).length, missing: [] };
      if (method === "confirm") return { ok: true, dontAsk: word.dontAsk };
      if (method === "showMessage") return { ok: true };
      if (method === "getRegistry") return { xml: null, fullName: "C:\\t.docx" };
      if (method === "replaceRanges") return { replaced: (params.items as unknown[]).length, skipped: 0 };
      if (method === "equationToText") return { ok: true };
      throw new Error(`unexpected ${method}`);
    },
  },
}));
vi.mock("../components/Dialogs", () => ({ askConfirm: async () => true, askText: async () => null }));

const { useApp } = await import("./store");
const ws = await import("./wordShortcuts");
const { buildNativeInsertion } = await import("./equation");
const { TUNED_PROFILE } = await import("@mathblocks/math-omml");

beforeEach(() => {
  word.calls = [];
  word.selection = {};
  word.latex = [];
  word.trapped = false;
  word.repaired = false;
  word.dontAsk = false;
  useApp.setState({ connector: { available: true, connected: true }, look: "native" });
});

describe("LaTeX in Word", () => {
  it("unwraps the usual delimiters", () => {
    expect(ws.unwrapLatex("$x^2$")).toEqual({ latex: "x^2", display: false });
    expect(ws.unwrapLatex("$$E=mc^2$$")).toEqual({ latex: "E=mc^2", display: true });
    expect(ws.unwrapLatex("\\[a\\]")).toEqual({ latex: "a", display: true });
    expect(ws.unwrapLatex("\\(b\\)")).toEqual({ latex: "b", display: false });
    expect(ws.wrapLatex("x", true)).toBe("$$x$$");
  });

  it("Ctrl+Alt+L on an equation turns it into its LaTeX", async () => {
    const tag = "mb1|-|abcdefghijkl";
    word.selection = { tag, flatOpc: buildNativeInsertion("\\frac{a}{b}", true, TUNED_PROFILE, tag).flatOpc, number: null };
    await ws.toggleLatexAtCursor();
    expect(word.calls.at(-1)).toMatchObject({ method: "equationToText", params: { tag, text: "$$\\frac{a}{b}$$" } });
  });

  it("Ctrl+Alt+L on LaTeX text turns it into an equation", async () => {
    word.selection = { text: "$x^2+1$", start: 10, end: 17 };
    await ws.toggleLatexAtCursor();
    const call = word.calls.at(-1)!;
    expect(call.method).toBe("replaceRanges");
    const item = (call.params.items as { start: number; expect: string; flatOpc: string }[])[0]!;
    expect(item).toMatchObject({ start: 10, expect: "$x^2+1$" });
    expect(item.flatOpc).toContain("<m:oMath");
  });

  it("converts all LaTeX of a document, leaving broken LaTeX as text", async () => {
    word.latex = [
      { start: 0, end: 5, text: "$x^2$", alone: false },
      { start: 20, end: 32, text: "$$\\frac{a}{b}$$", alone: true },
      { start: 40, end: 48, text: "$\\frac{a$", alone: false },
    ];
    await ws.convertAllLatex();
    const call = word.calls.find((c) => c.method === "replaceRanges")!;
    const items = call.params.items as { start: number; flatOpc: string }[];
    expect(items.map((i) => i.start)).toEqual([0, 20]);
    expect(items[1]!.flatOpc).toContain("<m:oMathPara");
    expect(items[0]!.flatOpc).not.toContain("<m:oMathPara");
  });

  it("converts every delimiter type, several in one paragraph, inline and alone", async () => {
    word.latex = [
      { start: 0, end: 8, text: "$\\alpha$", alone: true },
      { start: 10, end: 17, text: "$$a+b$$", alone: true },
      { start: 20, end: 27, text: "$$c+d$$", alone: false },
      { start: 30, end: 37, text: "\\(e+f\\)", alone: false },
      { start: 40, end: 47, text: "\\[g=h\\]", alone: true },
      { start: 50, end: 57, text: "\\[i=j\\]", alone: false },
      { start: 60, end: 63, text: "$k$", alone: false },
      { start: 64, end: 67, text: "$l$", alone: false },
    ];
    await ws.convertAllLatex();
    const items = word.calls.find((c) => c.method === "replaceRanges")!.params.items as { start: number; expect: string; flatOpc: string }[];
    expect(items.map((i) => i.start)).toEqual([0, 10, 20, 30, 40, 50, 60, 64]);
    const display = items.map((i) => i.flatOpc.includes("<m:oMathPara"));
    // Display only when display LaTeX ($$ or \[) stands alone in its paragraph; $…$ alone stays inline.
    expect(display).toEqual([false, true, false, false, true, false, false, false]);
    for (const i of items) expect(i.flatOpc).toContain("mb1|");
  });

  it("LaTeX typed into an equation's wrapper is moved out (Repair) and then converted", async () => {
    word.trapped = true;
    word.latex = [{ start: 3, end: 8, text: "$x^2$", alone: false }];
    await ws.convertAllLatex();
    const methods = word.calls.map((c) => c.method);
    expect(methods.filter((m) => m === "repairEquations")).toHaveLength(2); // dry run, then the repair
    expect(methods.lastIndexOf("findLatex")).toBeGreaterThan(methods.indexOf("repairEquations"));
    expect(word.calls.find((c) => c.method === "replaceRanges")).toBeTruthy();
  });

  it("started from Word: the question and the result appear over Word; the selection only when there is one", async () => {
    word.latex = [{ start: 0, end: 5, text: "$x^2$", alone: false }];
    await ws.convertAllLatex(undefined, { fromWord: true, selectionOnly: true });
    expect(word.calls.find((c) => c.method === "findLatex")!.params.selectionOnly).toBe(true);
    expect(word.calls.some((c) => c.method === "confirm")).toBe(true);
    expect(word.calls.find((c) => c.method === "showMessage")!.params.text).toMatch(/Converted 1/);
  });

  it("“Don't ask again” is remembered: the next conversion from Word asks nothing", async () => {
    word.latex = [{ start: 0, end: 5, text: "$x^2$", alone: false }];
    word.dontAsk = true;
    await ws.convertAllLatex(undefined, { fromWord: true });
    expect(useApp.getState().confirmWordCommands).toBe(false);
    word.calls = [];
    await ws.convertAllLatex(undefined, { fromWord: true });
    expect(word.calls.some((c) => c.method === "confirm")).toBe(false);
    expect(word.calls.some((c) => c.method === "replaceRanges")).toBe(true);
    useApp.setState({ confirmWordCommands: true });
  });

  it("explains when LaTeX was found but none can be converted", async () => {
    word.latex = [];
    const notes: string[] = [];
    useApp.setState({ notify: ((t: string) => notes.push(t)) as never });
    await ws.convertAllLatex();
    expect(notes.at(-1)).toMatch(/No LaTeX found/);
  });
});
