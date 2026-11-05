import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Equation identity end to end, against a simulated Word document whose add-in follows the real
 * rules (EquationIdentity.cs): a wrapper is read only when it holds exactly one equation and no
 * text; a write needs a unique ID, a clean wrapper and the fingerprint that was read. Text typed
 * or pasted before and after equations stays outside their wrappers (the add-in locks them and
 * guards the caret); a wrapper that grew anyway is refused, never written.
 */

interface Wrapper {
  tag: string;
  /** LaTeX of each equation in the wrapper (a grown wrapper holds several). */
  equations: string[];
  /** Characters of text inside the wrapper. */
  text: number;
  numbered: boolean;
}

const word = vi.hoisted(() => ({
  doc: [] as { kind: "text"; text: string }[] | ({ kind: "text"; text: string } | { kind: "eq"; w: unknown })[],
  wrappers: [] as unknown[],
  cursor: "",
  writes: [] as { method: string; tag: string }[],
}));

const W = () => word.wrappers as Wrapper[];
const fp = (w: Wrapper) => `fp:${w.equations.join("|")}`;

vi.mock("./connector", async () => {
  const { buildNativeInsertion } = await import("./equation");
  const { readEquationXml } = await import("./readEquation");
  const { serializeLatex } = await import("@mathblocks/math-latex");
  const { TUNED_PROFILE } = await import("@mathblocks/math-omml");
  const latexOf = (flatOpc: string) => serializeLatex(readEquationXml(flatOpc)!.root);
  const problemOf = (w: Wrapper) =>
    w.equations.length !== 1 ? `its wrapper holds ${w.equations.length} equations` : w.text > 0 ? `its wrapper holds ${w.text} character(s) of text` : null;
  const verify = (tag: string, expect?: string) => {
    const same = W().filter((w) => w.tag === tag);
    if (!same.length) throw new Error("The equation is no longer in the document.");
    if (same.length > 1) throw new Error(`Not changed: ${same.length} equations in the document share this ID (copies).`);
    const w = same[0]!;
    const p = problemOf(w);
    if (p) throw new Error(`Not changed: ${p}.`);
    if (expect && expect !== fp(w)) throw new Error("Not changed: the equation in Word is no longer the one that was opened.");
    return w;
  };
  return {
    isDesktop: () => false,
    addinSupports: () => true,
    activateEquation: (await vi.importActual<typeof import("./connector")>("./connector")).activateEquation,
    connector: {
      async request(method: string, params: Record<string, unknown>) {
        if (method === "selectionInfo") {
          const w = W().find((x) => x.tag === word.cursor)!;
          const problem = problemOf(w);
          return {
            document: "C:\\\\t.docx",
            rect: null,
            tag: w.tag,
            fingerprint: fp(w),
            ...(problem ? { problem: `This equation cannot be opened safely: ${problem}.`, flatOpc: "" } : { flatOpc: buildNativeInsertion(w.equations[0]!, true, TUNED_PROFILE, w.tag).flatOpc }),
            number: null,
          };
        }
        if (method === "replaceEquation") {
          const w = verify(params.tag as string, params.expect as string | undefined);
          w.equations = [latexOf(params.flatOpc as string)];
          word.writes.push({ method, tag: w.tag });
          return { found: 1 };
        }
        if (method === "numberEquation") {
          const w = verify(params.tag as string, params.expect as string | undefined);
          w.equations = [latexOf(params.flatOpc as string)];
          w.numbered = true;
          word.writes.push({ method, tag: w.tag });
          return { bookmark: `_MBEq_${w.tag}`, number: `(${W().filter((x) => x.numbered).length})` };
        }
        if (method === "insertEquation") {
          // Always its own wrapper: the add-in never inserts inside another one.
          W().push({ tag: params.tag as string, equations: [latexOf(params.flatOpc as string)], text: 0, numbered: false });
          word.writes.push({ method, tag: params.tag as string });
          return { found: 1 };
        }
        if (method === "getRegistry") return { xml: null, fullName: "C:\\\\t.docx" };
        if (method === "setRegistry") return { ok: true };
        throw new Error(`unexpected ${method}`);
      },
    },
  };
});
vi.mock("../components/Dialogs", () => ({ askConfirm: async () => true, askText: async () => null }));

const { useApp } = await import("./store");
const ws = await import("./wordShortcuts");
const { sendToWord } = await import("./sendToWord");
const { toggleNumberFromRibbon } = await import("./numbering");
const { buildNativeInsertion } = await import("./equation");
const { TUNED_PROFILE } = await import("@mathblocks/math-omml");

const send = () => sendToWord({ errors: 0, profile: TUNED_PROFILE });
/** Opens the equation under the cursor, as Ctrl+Alt+M / right-click / double-click do. */
async function open(tag: string) {
  word.cursor = tag;
  await ws.editAtCursor();
}
/** What the ribbon's Number button sends for the equation under the cursor. */
function ribbonNumber(tag: string) {
  const w = W().find((x) => x.tag === tag)!;
  const clean = w.equations.length === 1 && w.text === 0;
  return toggleNumberFromRibbon({
    tag,
    fingerprint: fp(w),
    numbered: w.numbered,
    ...(clean ? { flatOpc: buildNativeInsertion(w.equations[0]!, true, TUNED_PROFILE, tag).flatOpc } : { problem: "This equation cannot be numbered safely: its wrapper holds 2 equations." }),
  });
}

beforeEach(() => {
  // Text typed and pasted before and after each equation stays outside the wrappers.
  word.wrappers = [
    { tag: "mb1|-|AAAAAAAAAAAA", equations: ["a+b=c"], text: 0, numbered: false },
    { tag: "mb1|-|BBBBBBBBBBBB", equations: ["q_2"], text: 0, numbered: false },
    { tag: "mb1|-|CCCCCCCCCCCC", equations: ["v\\times\\omega+\\sum_i i^2"], text: 0, numbered: false },
  ] satisfies Wrapper[];
  word.writes = [];
  useApp.setState({ connector: { available: true, connected: true }, look: "native", editing: null, notice: null, latex: "", numbered: false, display: true });
});

describe("each command acts on the equation it was given, and only on it", () => {
  it("open, edit and update each equation in turn: each keeps its own content", async () => {
    for (const w of [...W()]) {
      const before = W().map((x) => [...x.equations]);
      await open(w.tag);
      expect(useApp.getState().editing?.tag).toBe(w.tag);
      expect(useApp.getState().latex).toBe(w.equations[0]);
      useApp.getState().setLatex(`${w.equations[0]}+1`, "visual");
      await send();
      W().forEach((x, i) => expect(x.equations).toEqual(x.tag === w.tag ? [`${before[i]![0]}+1`] : before[i]));
      // The edit is over: no stale target left behind.
      expect(useApp.getState().editing).toBeNull();
    }
    expect(W().every((x) => x.equations.length === 1)).toBe(true);
  });

  it("after an update, a new equation is inserted — never written over the last one opened", async () => {
    await open("mb1|-|BBBBBBBBBBBB");
    useApp.getState().setLatex("q_3", "visual");
    await send();
    useApp.getState().setLatex("E=mc^2", "visual");
    await send();
    expect(W().find((x) => x.tag === "mb1|-|BBBBBBBBBBBB")!.equations).toEqual(["q_3"]);
    expect(W().some((x) => x.equations[0] === "E=mc^2" && x.tag !== "mb1|-|BBBBBBBBBBBB")).toBe(true);
    expect(word.writes.map((x) => x.method)).toEqual(["replaceEquation", "insertEquation"]);
  });

  it("number each equation in turn: each is numbered with its own content", async () => {
    for (const w of [...W()]) {
      const mine = w.equations[0];
      await ribbonNumber(w.tag);
      expect(W().find((x) => x.tag === w.tag)!).toMatchObject({ numbered: true, equations: [mine] });
    }
    expect(new Set(W().map((x) => x.equations[0])).size).toBe(3);
  });

  it("a wrapper that grew around two equations is never opened, numbered or written", async () => {
    W()[1]!.equations = ["q_2", "v\\times\\omega"]; // r₂ and the long equation in one wrapper
    const before = JSON.stringify(W());
    await open("mb1|-|BBBBBBBBBBBB");
    expect(useApp.getState().editing).toBeNull();
    expect(useApp.getState().notice?.text).toMatch(/cannot be opened safely: its wrapper holds 2 equations/);
    await ribbonNumber("mb1|-|BBBBBBBBBBBB");
    expect(JSON.stringify(W())).toBe(before);
    expect(word.writes).toEqual([]);
  });

  it("text typed into a wrapper blocks it as well", async () => {
    W()[0]!.text = 7;
    await open("mb1|-|AAAAAAAAAAAA");
    expect(useApp.getState().notice?.text).toMatch(/7 character\(s\) of text/);
    expect(word.writes).toEqual([]);
  });

  it("an equation changed in Word after it was opened is not overwritten", async () => {
    await open("mb1|-|AAAAAAAAAAAA");
    W()[0]!.equations = ["x=y"]; // edited or replaced meanwhile
    useApp.getState().setLatex("a+b=d", "visual");
    await send();
    expect(W()[0]!.equations).toEqual(["x=y"]);
    expect(useApp.getState().editing).toBeNull();
  });

  it("a duplicated ID (a copy) is refused", async () => {
    await open("mb1|-|AAAAAAAAAAAA");
    W().push({ tag: "mb1|-|AAAAAAAAAAAA", equations: ["a+b=c"], text: 0, numbered: false });
    useApp.getState().setLatex("a+b=e", "visual");
    await send();
    expect(W().filter((x) => x.tag === "mb1|-|AAAAAAAAAAAA").map((x) => x.equations[0])).toEqual(["a+b=c", "a+b=c"]);
  });
});
