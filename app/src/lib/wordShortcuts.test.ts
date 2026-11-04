import { beforeEach, describe, expect, it, vi } from "vitest";

const word = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[], selection: {} as Record<string, unknown>, latex: [] as { start: number; end: number; text: string; alone: boolean }[] }));

vi.mock("./connector", () => ({
  isDesktop: () => false,
  addinSupports: () => true,
  activateEquation: vi.fn(async () => undefined),
  connector: {
    async request(method: string, params: Record<string, unknown>) {
      word.calls.push({ method, params });
      if (method === "selectionInfo") return { document: "C:\\t.docx", rect: null, ...word.selection };
      if (method === "findLatex") return { name: "t.docx", fullName: "C:\\t.docx", items: word.latex };
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

  it("explains when LaTeX was found but none can be converted", async () => {
    word.latex = [];
    const notes: string[] = [];
    useApp.setState({ notify: ((t: string) => notes.push(t)) as never });
    await ws.convertAllLatex();
    expect(notes.at(-1)).toMatch(/No LaTeX found/);
  });
});
