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
});
