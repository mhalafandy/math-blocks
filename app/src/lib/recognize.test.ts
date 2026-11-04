import { describe, expect, it } from "vitest";
import { cleanLatex } from "./recognize";
import { DEFAULT_SNIPPETS, matchSnippet } from "./snippets";

describe("recognised LaTeX clean-up", () => {
  it("strips delimiters, fences, equation environments and tags", () => {
    expect(cleanLatex("```latex\n$$E=mc^2$$\n```")).toBe("E=mc^2");
    expect(cleanLatex("\\[ x^2 \\]")).toBe("x^2");
    expect(cleanLatex("\\begin{equation} a=b \\tag{2.1} \\end{equation}")).toBe("a=b");
    expect(cleanLatex("\\begin{align} a&=b\\\\c&=d \\end{align}")).toBe("\\begin{aligned} a&=b\\\\c&=d \\end{aligned}");
  });
});

describe("snippets", () => {
  const before = (text: string) => (n: number) => text.slice(Math.max(0, text.length - n));
  it("matches the longest trigger before the cursor", () => {
    expect(matchSnippet(before("x+ddt"), DEFAULT_SNIPPETS)?.trigger).toBe("ddt");
    expect(matchSnippet(before("pdvt"), DEFAULT_SNIPPETS)?.trigger).toBe("pdvt");
    expect(matchSnippet(before("y"), DEFAULT_SNIPPETS)).toBeNull();
  });
});

describe("kind snippets with a prefix", async () => {
  const { kindSnippets, matchSnippet, BASE_SNIPPETS } = await import("./snippets");
  const list = [...kindSnippets(";"), ...BASE_SNIPPETS];
  const before = (text: string) => (n: number) => text.slice(-n);
  it("needs the prefix, so a product uv + Tab stays a product", () => {
    expect(matchSnippet(before("x+uv"), list)).toBeNull();
    expect(matchSnippet(before("x+;uv"), list)?.latex).toBe("\\uvec{#?}");
    expect(matchSnippet(before("2;dc"), list)?.latex).toBe("\\dcm{#?}{#?}");
    expect(matchSnippet(before(";tp"), list)?.latex).toBe("^{\\T}");
  });
  it("plain snippets keep working", () => {
    expect(matchSnippet(before("pdv"), list)?.trigger).toBe("pdv");
  });
});

describe("snippet triggers as the editor reports them", async () => {
  const { kindSnippets, findTrigger, BASE_SNIPPETS, loadSnippets, saveSnippets } = await import("./snippets");
  /** Editor positions → LaTeX, one array entry per position (a prime takes one superscript group). */
  const editor = (atoms: string[]) => (k: number) => atoms.slice(-k).join("");
  it("replaces the whole trigger, prefix included, for every prefix", () => {
    for (const p of [";", ":", "!", "."]) {
      const r = findTrigger(editor(["x", "+", p, "p", "v"]), [...kindSnippets(p), ...BASE_SNIPPETS]);
      expect(r).toMatchObject({ positions: 3, snippet: { latex: "\\pvec{#?}" } });
    }
  });
  it("a prime prefix (a superscript in the editor) and \; spellings are read as typed", () => {
    expect(findTrigger(editor(["x", "^{\\prime}", "p", "v"]), kindSnippets("'"))).toMatchObject({ positions: 3 });
    expect(findTrigger(editor(["x", "\;", "p", "v"]), kindSnippets(";"))).toMatchObject({ positions: 3 });
  });
  it("autocorrected letters (in → ∈) still trigger", () => {
    expect(findTrigger(editor(["x", "\\in", "v"]), BASE_SNIPPETS)).toMatchObject({ positions: 2, snippet: { trigger: "inv" } });
  });
  it("an old saved kind snippet without prefix never beats the prefixed one", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    saveSnippets([{ trigger: "pv", latex: "\\pvec{#?}", name: "old" }, { trigger: ";pv", latex: "\\pvec[#?]{#?}", name: "old 2" }, { trigger: "myv", latex: "\\pvec{v}", name: "mine" }]);
    const list = loadSnippets();
    // Old kind snippets are replaced by the current ones; the user's own snippet stays.
    expect(list.filter((s) => s.trigger.endsWith("pv")).map((s) => s.trigger)).toEqual([";pv"]);
    expect(list.some((s) => s.trigger === "myv")).toBe(true);
    expect(findTrigger(editor(["x", ";", "p", "v"]), list)).toMatchObject({ positions: 3 });
  });
});
