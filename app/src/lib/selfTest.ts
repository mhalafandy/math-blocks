import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { addinSupports, connector } from "./connector";
import { buildInsertion, buildPictureInsertion, currentProfile } from "./equation";
import { numberFormat } from "./numbering";
import { readEquationXml } from "./readEquation";
import { planInterchange, type InterchangeScan } from "./latexInterchange";
import { useApp } from "./store";

/**
 * Word self-test (ribbon → Run Word self-test, or the command palette). Creates test documents and
 * drives Word through the add-in's own commands — the same calls as the buttons and clicks — then
 * checks what Word holds: the lowering of each picture's run against its depth, the text typed after
 * it, the caret after insertion, what each click path opens, numbering and references, every paste
 * mode within and between documents, cut/paste and a programmatic move (nothing else may change),
 * and undo after each operation. Writes report.txt and the test documents to
 * %LOCALAPPDATA%\MathBlocks\self-test\<date>\. The user's own documents are not touched.
 */

type Status = "PASS" | "FAIL" | "INFO";
interface Check {
  section: string;
  name: string;
  status: Status;
  detail: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const SLOW = 120_000;
const smoke = (op: string, params: R = {}) => connector.request("smoke", { op, ...params }, SLOW);
const norm = (latex: string) => serializeLatex(parseLatex(latex).root);
const latexOf = (flatOpc: string) => {
  const r = readEquationXml(flatOpc ?? "");
  return r ? serializeLatex(r.root) : null;
};

const INLINE: { name: string; latex: string }[] = [
  { name: "alpha", latex: "\\alpha" },
  { name: "beta", latex: "\\beta" },
  { name: "gamma", latex: "\\gamma" },
  { name: "f", latex: "f" },
  { name: "p", latex: "p" },
  { name: "fraction", latex: "\\frac{a}{b}" },
];
const PASTE_MODES = ["ctrlV", "keepSource", "merge", "pictureEmf", "picturePng", "keepTextOnly"] as const;
/** Paste modes that must keep the equation (it opens, as a copy with its own ID). */
const MUST_KEEP = new Set(["ctrlV", "keepSource", "merge"]);

export const MANUAL_CHECKS = [
  "The test documents are saved in this folder and closed: open 'self-test A.docx' for the checks below.",
  "Right-click a Classic equation (now an embedded object): only the floating editor opens on it, no Word menu; edit it and Apply — it stays an object (simple frame) with the new content.",
  "Right-click a native Word equation: only the floating editor, no Word menu.",
  "Double-click a Classic equation: MathBlocks opens it for editing (no prompt); Update in Word replaces it, still an object.",
  "Drag an equation with the mouse to another line, then to another document: only the equation moves; no other text changes; Ctrl+Z restores.",
  "Home → Paste → Paste Special → 'Picture (PNG)' (the self-test can only paste a bitmap, the nearest the object model offers).",
  "Look: inline α, β, γ, f, p and a fraction sit on the text baseline at 100 % and 200 % zoom, and in print.",
  "Add-in loaded mid-session: with a document with equations open, untick MathBlocks in File → Options → Add-ins → COM Add-ins, then tick it again (Word stays open): double-click and right-click on an equation in that open document work straight away.",
];

export async function runWordSelfTest(o: { spike?: boolean } = { spike: true }): Promise<string | null> {
  const app = useApp.getState();
  if (!app.connector.connected) {
    app.notify("Word is not connected. Start Word with the MathBlocks add-in.", "error");
    return null;
  }
  if (!addinSupports("smoke")) {
    app.notify("The MathBlocks add-in loaded in Word is too old for the self-test. Close Word completely and start it again.", "error");
    return null;
  }
  const checks: Check[] = [];
  let section = "";
  const check = (name: string, ok: boolean | null, detail = "") => checks.push({ section, name, status: ok === null ? "INFO" : ok ? "PASS" : "FAIL", detail });
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run();
    } catch (e) {
      check(name, false, `error: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };
  const profile = currentProfile();
  const insert = async (latex: string, display: boolean) => {
    const { tag, flatOpc } = await buildInsertion(latex, display, profile, undefined, "classic");
    const r = await connector.request("insertEquation", { flatOpc, tag, display, undoLabel: "Insert equation" }, SLOW);
    return { tag, found: r.found };
  };
  const number = async (tag: string, latex: string) => {
    const { flatOpc } = await buildInsertion(latex, false, profile, tag, "classic", true);
    // Plain (1), (2): the test document has no numbered headings, so a chapter format would show
    // Word's "Error! No text of specified style" (as it would in any document without them).
    return connector.request("numberEquation", { tag, flatOpc, ...numberFormat(useApp.getState().numberStyle), chapter: false, parts: "eq" }, SLOW);
  };
  const unnumber = async (tag: string, latex: string) => {
    const { flatOpc } = await buildInsertion(latex, true, profile, tag, "classic");
    return connector.request("unnumberEquation", { tag, flatOpc }, SLOW);
  };
  const snap = () => smoke("snapshot") as Promise<{ text: string; plain: string; tags: string[]; pictures: number; floating: number }>;
  /** The active document's text plus every equation's ID and LaTeX: what one Ctrl+Z must restore exactly. */
  const docState = async () => {
    const s = await snap();
    const r = await connector.request("listInstances", { includeContent: true }, SLOW).catch(() => ({ documents: [] as { name: string; instances: { tag: string; flatOpc?: string }[] }[] }));
    const front = (await smoke("activeName")).name as string;
    const d = r.documents.find((x) => x.name === front) ?? r.documents[0];
    const eqs = (d?.instances ?? []).map((i) => {
      const rd = i.flatOpc ? readEquationXml(i.flatOpc) : null;
      // The style a picture was drawn in: a restyle changes drawings, not text.
      return `${i.tag}=${rd ? serializeLatex(rd.root) : "?"}${rd?.styleHash ? `#${rd.styleHash}` : ""}`;
    });
    // Equation numbers are fields: their text is not in the document text above.
    // With the kind of number (MathType's or MathBlocks'): keeping the numbers changes the fields, not their text.
    const numbers = (await connector.request("listNumbered", {}, SLOW).catch(() => ({ equations: [] as { number: string; kind?: string }[] }))).equations.map((e) => `${e.number}${e.kind === "mathtype" ? "·MT" : ""}`).join(" ");
    return `${s.text}\n§${eqs.sort().join("|")}\n#${numbers}`;
  };
  /** Word window activations recorded by the add-in (with the MathBlocks request during which each happened). */
  type Activation = { document: string; during: string; ms: number };
  const activationLog: Activation[] = [];
  const takeActivations = async (): Promise<Activation[]> => {
    if (!addinSupports("smoke")) return [];
    const r = (await smoke("activations").catch(() => ({ list: [] }))) as { list?: Activation[] };
    const list = r.list ?? [];
    activationLog.push(...list);
    return list;
  };
  const describeActivations = (list: Activation[]) => list.map((a) => `${a.document} during ${a.during}`).join("; ") || "none recorded";
  /**
   * A whole-document operation: it must leave its document in front, change it, and be undone by exactly
   * one Ctrl+Z (text and every equation as before); Ctrl+Y redoes it.
   */
  const oneCtrlZ = async (label: string, docName: string, run: () => Promise<unknown>) => {
    const before = await docState();
    await run();
    const front = (await smoke("activeName")).name as string;
    check(`${label}: leaves its document in front`, front === docName, `in front: ${front}, worked on: ${docName}`);
    if (front !== docName) await smoke("activate", { name: docName });
    const after = await docState();
    if (after === before) {
      check(`${label}: changed the document`, false, "nothing changed, so its undo could not be checked");
      return;
    }
    await smoke("undo", { times: 1 });
    let steps = 1;
    let now = await docState();
    while (now !== before && steps < 10) {
      await smoke("undo", { times: 1 });
      steps++;
      now = await docState();
    }
    check(`${label}: one Ctrl+Z undoes it`, now === before && steps === 1, now === before ? `${steps} Ctrl+Z` : `not restored after ${steps} Ctrl+Z`);
    await smoke("redo", { times: steps });
    check(`${label}: Ctrl+Y redoes it`, null, (await docState()) === after ? "redone" : "differs from the result after redo");
    // The checks after it read the document in front: make sure it is still this one (another Word
    // window coming forward during the long test would make them read the wrong document).
    const still = (await smoke("activeName")).name as string;
    if (still !== docName) {
      const acts = (await takeActivations()).filter((a) => a.document === still);
      check(`${label}: another document came to the front after undo/redo`, null, `in front: ${still} (${describeActivations(acts)}); ${docName} brought back`);
      await smoke("activate", { name: docName });
    }
  };
  /** Undo until the document's text equals `target` again (at most 4 steps); returns the steps used, or -1. */
  const undoTo = async (target: string) => {
    for (let n = 1; n <= 4; n++) {
      await smoke("undo", { times: 1 });
      if ((await snap()).text === target) return n;
    }
    return -1;
  };
  const begin = await smoke("begin");
  await takeActivations();
  activationLog.length = 0;
  let closedDocs: { closed: number; saved: string[] } | null = null;
  let appVersion = "browser preview";
  try {
    if ((await import("./connector")).isDesktop()) appVersion = await (await import("@tauri-apps/api/app")).getVersion();
  } catch {
    appVersion = "unknown";
  }
  const lines: string[] = [];
  app.notify("Running the Word self-test… (Word will show test documents; do not type in Word until it finishes)");

  try {
    // ------------------------------------------------------------ inline equations, baseline, caret
    section = "Inline insertion and baseline";
    const docA = await smoke("newDocument");
    await smoke("typeText", { text: "MathBlocks self-test." });
    await smoke("newParagraph");
    const inline: { name: string; latex: string; tag: string }[] = [];
    for (const c of INLINE) {
      await step(`insert ${c.name}`, async () => {
        await smoke("typeText", { text: `Case ${c.name}: ` });
        const { tag, found } = await insert(c.latex, false);
        // Typed right after the insert, as a user does — nothing read from Word in between.
        const typed = ", words after";
        const caret = await smoke("typeText", { text: typed });
        check(`${c.name}: inserted and found by its ID`, found === 1, `found ${found}`);
        const info = await smoke("pictureInfo", { tag });
        check(`${c.name}: caret lands right of the equation`, caret.caret - typed.length === info.after, `typing started at ${caret.caret - typed.length}, equation ends ${info.after}`);
        check(`${c.name}: ID in the alt text and the hidden source`, String(info.alt).includes(`(${tag})`) && info.sourceTag === tag, `alt "${info.alt}", source ID ${info.sourceTag}`);
        const want = -Math.round(Number(info.depthPt ?? NaN));
        check(`${c.name}: its run is lowered by its depth`, Math.round(info.positionPt) === want, `run position ${info.positionPt} pt, depth ${info.depthPt} pt`);
        check(`${c.name}: text typed after it sits on the line`, Math.round(info.nextPositionPt) === 0, `next "${info.nextText}" at ${info.nextPositionPt} pt`);
        // The caret placed right after it again, and the idle checks run (the round-6 regression).
        await smoke("caretTo", { where: "after", tag });
        await smoke("idle");
        const again = await smoke("pictureInfo", { tag });
        check(`${c.name}: lowering kept when the caret returns next to it`, Math.round(again.positionPt) === want, `run position ${again.positionPt} pt`);
        await smoke("caretTo", { where: "end" });
        await smoke("newParagraph");
        inline.push({ ...c, tag });
      });
    }
    // Which caret reset Word honours for typed text (data for the fix if the checks above fail).
    if (inline[1]) {
      await step("typing probe", async () => {
        const pr = await smoke("typingProbe", { tag: inline[1]!.tag });
        check("typing probe: lowering of a character typed right after β, per reset method", null, Object.entries(pr).map(([k, v]) => `${k}: ${v}`).join(", "));
      });
    }

    // ------------------------------------------------------------ display and numbered
    section = "Display and numbered equations";
    const displayLatex = ["\\vec{r}=\\frac{p}{1+e\\cos\\theta}\\hat{r}", "F=ma", "E=mc^2"];
    const disp: { latex: string; tag: string }[] = [];
    for (const latex of displayLatex) {
      await step(`insert display ${latex}`, async () => {
        const { tag, found } = await insert(latex, true);
        check(`display ${latex}: inserted`, found === 1, `found ${found}`);
        const info = await smoke("pictureInfo", { tag });
        check(`display ${latex}: run lowered by its depth`, Math.round(info.positionPt) === -Math.round(Number(info.depthPt ?? NaN)), `run ${info.positionPt} pt, depth ${info.depthPt} pt`);
        await smoke("caretTo", { where: "end" });
        await smoke("newParagraph");
        disp.push({ latex, tag });
      });
    }

    // ------------------------------------------------------------ opening (click paths)
    section = "Opening each equation (double-click / menu → Edit)";
    for (const e of [...inline, ...disp]) {
      for (const via of ["double-click", "menu"]) {
        await step(`open ${e.latex} via ${via}`, async () => {
          const r = await smoke("open", { tag: e.tag, via });
          const got = r.flatOpc ? latexOf(r.flatOpc) : null;
          check(`${e.latex} via ${via}: opens as itself`, r.tag === e.tag && !r.problem && got === norm(e.latex), `tag ${r.tag}${r.problem ? `, problem: ${r.problem}` : ""}, LaTeX ${got}`);
          if (via === "menu") check(`${e.latex}: MathBlocks items show in Word's picture menu`, r.menuVisible === true, `visible ${r.menuVisible}`);
        });
      }
    }

    // ------------------------------------------------------------ numbering and references
    section = "Numbering and references";
    if (disp.length === 3) {
      const [d1, d2, d3] = disp as [{ latex: string; tag: string }, { latex: string; tag: string }, { latex: string; tag: string }];
      await step("number two equations", async () => {
        await number(d2.tag, d2.latex);
        await number(d3.tag, d3.latex);
        const list = await connector.request("listNumbered", {}, SLOW);
        const mine = list.equations.filter((x) => x.tag === d2.tag || x.tag === d3.tag);
        check("two equations numbered", mine.length === 2, mine.map((x) => x.number).join(", "));
        // Layout of a newly numbered equation: number at the right margin, equation centred.
        const pos = (await smoke("caretTo", { where: "paragraphStart", tag: d2.tag })).caret as number;
        const lay = await smoke("paraInfo", { pos });
        check("numbered equation: the number ends at the right margin", Math.abs(Number(lay.numberEnd) - Number(lay.textRight)) < 3, `number ends at ${Number(lay.numberEnd).toFixed(1)} pt, right margin ${Number(lay.textRight).toFixed(1)} pt`);
        check("numbered equation: the equation is centred on the text width", Math.abs(Number(lay.equationCenter) - Number(lay.textCenter)) < 3, `equation centre ${Number(lay.equationCenter).toFixed(1)} pt, text centre ${Number(lay.textCenter).toFixed(1)} pt`);
        const n3 = mine.find((x) => x.tag === d3.tag);
        if (!n3) return;
        await smoke("caretTo", { where: "end" });
        await smoke("typeText", { text: "See " });
        const ref = await connector.request("insertReference", { bookmark: n3.bookmark, numberOnly: false }, SLOW);
        check("reference shows the equation's number", ref.text.replace(/\s/g, "") === n3.number.replace(/\s/g, ""), `reference "${ref.text}", number "${n3.number}"`);
        await smoke("newParagraph");
        // A numbered equation inserted above: numbers and the reference follow.
        await smoke("caretTo", { where: "paragraphStart", tag: d1.tag });
        const above = await insert("a^2+b^2=c^2", true);
        await number(above.tag, "a^2+b^2=c^2");
        await connector.request("updateNumbers", {}, SLOW);
        const list2 = await connector.request("listNumbered", {}, SLOW);
        const n3b = list2.equations.find((x) => x.tag === d3.tag);
        const nAbove = list2.equations.find((x) => x.tag === above.tag);
        check("equation inserted above gets the earlier number", !!nAbove && !!n3b && list2.equations.indexOf(nAbove) < list2.equations.indexOf(n3b), `above ${nAbove?.number}, later ${n3b?.number}`);
        const after = await snap();
        const refs = n3b ? ((await smoke("refResults", { bookmark: n3b.bookmark })).results as string[]) : [];
        check("the reference shows the new number after Update", !!n3b && refs.length > 0 && refs.every((t) => t.replace(/\s/g, "") === n3b.number.replace(/\s/g, "")), `reference shows ${JSON.stringify(refs)}, number ${n3b?.number}`);
        check("the reference stays in the sentence (\"See (n)\" on one line)", after.text.includes("See \r") === false, after.text.includes("See \r") ? "the reference landed on the next line" : "");
        // Unnumber, then undo.
        const s0 = await snap();
        await unnumber(above.tag, "a^2+b^2=c^2");
        const list3 = await connector.request("listNumbered", {}, SLOW);
        check("unnumber removes the number", !list3.equations.some((x) => x.tag === above.tag), `${list3.equations.length} numbered`);
        const steps = await undoTo(s0.text);
        check("Ctrl+Z after unnumber restores the document", steps > 0, steps > 0 ? `${steps} undo step(s)` : "not restored in 4 steps");
      });
    } else check("display equations available for numbering", false, `${disp.length} of 3 inserted`);

    // ------------------------------------------------------------ copy / paste within the document
    section = "Copy and paste within the document";
    const src = inline[0];
    if (src) {
      for (const mode of PASTE_MODES) {
        await step(`paste ${mode}`, async () => {
          await smoke("caretTo", { where: "end" });
          await smoke("typeText", { text: `Paste ${mode}: ` });
          const pre = await snap();
          const orig = await smoke("pictureInfo", { tag: src.tag });
          await smoke("copy", { tag: src.tag });
          await smoke("caretTo", { where: "end" });
          const r = await smoke("paste", { mode });
          const kept = `picture ${r.picture ? "yes" : "no"}, alt "${r.alt ?? ""}", source ${r.hasSource ? (r.sourceTag ? "with ID" : "without ID") : "none"}, VML ${r.vml}, DrawingML ${r.drawingml}, EMF ${r.emf}, PNG ${r.png}${r.error ? `, ${r.error}` : ""}`;
          const opensAs = r.opensFlatOpc ? latexOf(r.opensFlatOpc) : null;
          const origStill = (await smoke("pictureInfo", { tag: src.tag }).catch(() => null)) != null;
          // Same representation as a freshly inserted equation: object kind (VML picture, not a modern
          // DrawingML picture), in line, same size, same lowering, alt text and hidden source kept.
          if (r.picture) {
            const o = orig;
            const diffs: string[] = [];
            if (r.frame !== o.frame) diffs.push(`frame ${r.frame === "legacy" ? "simple (VML)" : r.frame === "modern" ? "modern picture (DrawingML: rotate handle, Picture Format)" : r.frame} (original ${o.frame === "legacy" ? "simple (VML)" : o.frame})`);
            if (r.kind !== o.kind) diffs.push(`kind ${r.kind} (original ${o.kind})`);
            if ((r.afterIdleFloating ?? 0) !== 0 || (r.newFloating ?? 0) !== 0) diffs.push(`floating ${r.newFloating}`);
            if (Math.abs(r.widthPt - o.widthPt) > 0.2 || Math.abs(r.heightPt - o.heightPt) > 0.2) diffs.push(`size ${r.widthPt}×${r.heightPt} (original ${o.widthPt}×${o.heightPt})`);
            if (Math.round(r.positionPt) !== Math.round(o.positionPt)) diffs.push(`lowering ${r.positionPt} pt (original ${o.positionPt})`);
            const altBody = (a: string) => a.replace(/\(mb1\|[^)]*\)/, "");
            if (altBody(r.alt ?? "") !== altBody(o.alt ?? "")) diffs.push(`alt "${r.alt}"`);
            if (!r.hasSource) diffs.push("hidden source lost");
            // Paste Special EMF/PNG make a plain picture by design (as with MathType); only the normal pastes must keep the object.
            const strict = MUST_KEEP.has(mode);
            check(`${mode}: same representation as the original (format, frame, wrap, size, lowering, alt text, hidden source)`, diffs.length === 0 ? true : strict ? false : null, diffs.length ? diffs.join("; ") : "identical");
          }
          if (MUST_KEEP.has(mode)) {
            check(`${mode}: the copy is an equation with its own ID and opens`, !!r.recognisedAs && r.recognisedAs !== src.tag && !r.opensProblem && opensAs === norm(src.latex), `${kept}; recognised as ${r.recognisedAs}; opens ${opensAs}${r.opensProblem ? `, problem: ${r.opensProblem}` : ""}`);
          } else if (mode === "pictureEmf") {
            check(`${mode}: recognised from the hidden source and opens (expected when Word keeps the EMF comment)`, !!r.recognisedAs && r.recognisedAs !== src.tag && opensAs === norm(src.latex), `${kept}; recognised as ${r.recognisedAs}; opens ${opensAs}`);
          } else {
            check(`${mode}: never takes the original's ID`, r.recognisedAs !== src.tag, `${kept}; recognised as ${r.recognisedAs ?? "nothing"}`);
          }
          check(`${mode}: the original keeps its ID and opens`, origStill, "");
          check(`${mode}: pasted in line (no floating picture left)`, (r.afterIdleFloating ?? 0) === 0, `floating after idle ${r.afterIdleFloating}`);
          if ((await snap()).text === pre.text) check(`${mode}: nothing was pasted, nothing to undo`, null, r.error ?? "");
          else {
            const steps = await undoTo(pre.text);
            check(`${mode}: Ctrl+Z removes the paste`, steps > 0, steps > 0 ? `${steps} undo step(s)` : "not restored in 4 steps");
          }
          await smoke("caretTo", { where: "end" });
          await smoke("newParagraph");
        });
      }
    }

    // ------------------------------------------------------------ between documents
    section = "Copy and paste between documents";
    const docB = await smoke("newDocument");
    await smoke("typeText", { text: "Second test document." });
    await smoke("newParagraph");
    if (src) {
      for (const mode of PASTE_MODES.filter((m) => m !== "keepTextOnly")) {
        await step(`A → B ${mode}`, async () => {
          await smoke("copy", { tag: src.tag, name: docA.name });
          await smoke("caretTo", { where: "end", name: docB.name });
          const r = await smoke("paste", { mode, name: docB.name });
          const opensAs = r.opensFlatOpc ? latexOf(r.opensFlatOpc) : null;
          const ok = mode === "picturePng" ? null : !!r.recognisedAs && opensAs === norm(src.latex);
          check(`A → B ${mode}: recognised and opens in the other document`, ok, `alt "${r.alt ?? ""}", source ${r.hasSource ? "yes" : "no"}, recognised ${r.recognisedAs ?? "no"}, opens ${opensAs}`);
          await smoke("newParagraph", { name: docB.name });
          if (mode === "ctrlV" && r.recognisedAs) {
            // And back into A: a copy there, with its own ID.
            await smoke("copy", { tag: r.recognisedAs, name: docB.name });
            await smoke("caretTo", { where: "end", name: docA.name });
            const back = await smoke("paste", { mode: "ctrlV", name: docA.name });
            check("B → A Ctrl+V: a copy with its own ID that opens", !!back.recognisedAs && back.recognisedAs !== src.tag && latexOf(back.opensFlatOpc) === norm(src.latex), `recognised ${back.recognisedAs}`);
            await smoke("newParagraph", { name: docA.name });
          }
        });
      }
      await smoke("activate", { name: docA.name });
    }

    // ------------------------------------------------------------ cut / paste and move
    section = "Cut, paste and move (nothing else may change)";
    const moved = inline[2];
    if (moved) {
      await step("cut and paste", async () => {
        const before = await snap();
        await smoke("cut", { tag: moved.tag });
        const mid = await snap();
        check("cut (selected, Ctrl+X) removes the equation", !mid.tags.includes(moved.tag), mid.tags.includes(moved.tag) ? "still there after Cut" : "");
        await smoke("caretTo", { where: "end" });
        await smoke("paste", { mode: "ctrlV" });
        await smoke("idle");
        const after = await snap();
        check("cut/paste: the equation keeps its ID", after.tags.filter((t) => t === moved.tag).length === 1, `${after.tags.filter((t) => t === moved.tag).length} with its ID`);
        check("cut/paste: same equations before and after", [...before.tags].sort().join() === [...after.tags].sort().join(), `${before.tags.length} → ${after.tags.length}`);
        check("cut/paste: no other text changed", before.plain === after.plain, diffHint(before.plain, after.plain));
        const steps = await undoTo(before.text);
        check("cut/paste: Ctrl+Z restores the document", steps > 0, steps > 0 ? `${steps} undo step(s)` : "not restored in 4 steps");
      });
      await step("move (formatted text, nearest to a drag)", async () => {
        const target = inline[0];
        if (!target) return;
        const before = await snap();
        const to = (await smoke("caretTo", { where: "paragraphStart", tag: target.tag })).caret as number;
        await smoke("moveFormatted", { tag: moved.tag, to });
        await smoke("idle");
        const after = await snap();
        check("move: the equation keeps its ID", after.tags.filter((t) => t === moved.tag).length === 1, `${after.tags.filter((t) => t === moved.tag).length} with its ID`);
        check("move: no other text changed", before.plain === after.plain, diffHint(before.plain, after.plain));
        const steps = await undoTo(before.text);
        check("move: Ctrl+Z restores the document", steps > 0, steps > 0 ? `${steps} undo step(s)` : "not restored in 4 steps");
      });
    }

    // ------------------------------------------------------------ Convert MathType keeps the paragraph
    section = "Convert MathType keeps the paragraph (number at the right margin)";
    await step("convert a MathType paragraph", async () => {
      const docC = await smoke("newDocument");
      await smoke("typeText", { text: "Convert MathType test." });
      const { buildMathTypeControlInsertion } = await import("./equation");
      const made = await smoke("makeEquationParagraph", { flatOpc: await buildMathTypeControlInsertion(), number: "(1)" });
      const p0 = await smoke("paraInfo", { pos: made.start });
      const { convertOpenDocument } = await import("./convertMathType");
      await oneCtrlZ("Convert MathType (open document)", docC.name, () => convertOpenDocument(undefined, { quiet: true }));
      const p1 = await smoke("paraInfo", { pos: made.start });
      check("the MathType equation became a MathBlocks object", /MathBlocks\.Equation/.test(String(p1.equationKind)), `before ${p0.equationKind}, after ${p1.equationKind}`);
      check("the paragraph keeps its style, alignment and tab stops", p1.style === p0.style && p1.alignment === p0.alignment && JSON.stringify(p1.tabs) === JSON.stringify(p0.tabs), `before ${p0.style} ${p0.alignment} [${p0.tabs}], after ${p1.style} ${p1.alignment} [${p1.tabs}]`);
      check("the number ends at the right margin", Math.abs(Number(p1.numberEnd) - Number(p1.textRight)) < 3, `number ends at ${Number(p1.numberEnd).toFixed(1)} pt, right margin ${Number(p1.textRight).toFixed(1)} pt`);
      check("the equation is centred on the text width", Math.abs(Number(p1.equationCenter) - Number(p1.textCenter)) < 3, `equation centre ${Number(p1.equationCenter).toFixed(1)} pt, text centre ${Number(p1.textCenter).toFixed(1)} pt`);
    });

    // ------------------------------------------------------------ Repair converts Classic pictures to objects
    section = "Convert MathType: nothing passes through silently";
    await step("mathtype private use and empty objects", async () => {
      const { mathTypeDocx, mathTypeRun, styledParagraph } = await import("@mathblocks/mathtype");
      const { toBase64 } = await import("./render");
      const para = (n: number, text: string) => `<w:p>${styledParagraph(text).slice(5, -6)}${mathTypeRun(n)}</w:p>`;
      // A dot product written with MathType's private-use dot, and an empty MathType object alone in its paragraph.
      const docx = mathTypeDocx([para(1, "The product "), styledParagraph("Before the empty one."), `<w:p>${mathTypeRun(2)}</w:p>`], ["dotProduct", "empty"]);
      await smoke("openDocx", { file: "mathtype private use test.docx", base64: toBase64(docx) });
      const conv = await import("./convertMathType");
      await conv.convertOpenDocument(undefined, { quiet: true });
      const report = conv.useConversion.getState().report?.result;
      const dot = report?.equations.find((e) => e.latex?.includes("cdot"));
      check("the private-use dot (MT Extra) becomes \\cdot", !!dot && dot.status === "converted" && !/[-]/u.test(dot.latex ?? ""), dot?.latex ?? "not found");
      const held = report?.equations.filter((e) => e.status !== "converted") ?? [];
      check("the empty MathType object is listed, with where it is, and left as it is", held.length === 1 && /Empty MathType equation/.test(held[0]!.messages.join(" ")) && /Before the empty one/.test(held[0]!.where ?? ""), held.map((e) => `${e.where}: ${e.messages.join("; ")}`).join(" | ") || "nothing listed");
      const left = await connector.request("listMathTypeParagraphs", { from: 0, limit: 1 }, SLOW);
      check("after converting: the only MathType object left is the one listed", left.totalObjects === held.length, `${left.totalObjects} left, ${held.length} listed`);
      await smoke("save", { file: "mathtype private use test (converted).docx" });
    });

    section = "Equation objects: right-click opens the floating editor; the equation menu is in its Word-menu button";
    await step("object menu", async () => {
      const docO = await smoke("newDocument");
      await smoke("typeText", { text: "Menu test: " });
      const eq = await insert("E=mc^2", false);
      await smoke("typeText", { text: " end." });
      if (addinSupports("smoke")) {
        const rc = (await smoke("rightClick", { tag: eq.tag }).catch((e: Error) => ({ action: `error: ${e.message}` }))) as { action: string; tag?: string };
        check("a right-click on an equation object opens the floating editor (Word's menu suppressed)", rc.action === "panel" && rc.tag === eq.tag, `action ${rc.action}`);
      }
      const menu = (await smoke("objectMenu", { tag: eq.tag })) as { items: { id: string; label: string; enabled: boolean }[]; isObject: boolean };
      const ids = menu.items.map((i) => i.id).join(" ");
      check("an equation object gets the MathBlocks menu: Edit here first, then the window, numbering, LaTeX, Cut/Copy/Paste/Delete", menu.isObject && ids === "edit editWindow number copyLatex toLatex cut copy paste delete", menu.items.map((i) => `${i.label}${i.enabled ? "" : " (off)"}`).join(" · "));
      check("the numbering item says what it will do", menu.items.find((i) => i.id === "number")?.label === "Number equation");
      const latex = (await smoke("objectMenuRun", { tag: eq.tag, id: "copyLatex" })) as { result: string; clipboardText: string | null };
      check("Copy LaTeX puts the equation's LaTeX on the clipboard", norm(latex.clipboardText ?? "") === norm("E=mc^2"), `${latex.result}: ${latex.clipboardText}`);
      // A snapshot lists an object under its ID and as obj:ID: count equations, not entries.
      const eqCount = (tags: string[]) => new Set(tags.map((t) => t.replace(/^obj:/, ""))).size;
      const before = eqCount((await snap()).tags);
      await smoke("objectMenuRun", { tag: eq.tag, id: "cut" });
      const afterCut = await snap();
      check("Cut removes the equation (the text around it stays)", eqCount(afterCut.tags) === before - 1 && /Menu test:\s*end\./.test(afterCut.plain), `${before} → ${eqCount(afterCut.tags)} equation(s); “${afterCut.plain.trim()}”`);
      await smoke("caretTo", { where: "end" });
      await smoke("paste", { mode: "ctrlV" });
      const afterPaste = await snap();
      check("…and Paste brings it back, the same equation", eqCount(afterPaste.tags) === before && afterPaste.tags.includes(eq.tag), afterPaste.tags.join(", "));
      await smoke("objectMenuRun", { tag: eq.tag, id: "delete" });
      const afterDelete = eqCount((await snap()).tags);
      check("Delete removes it", afterDelete === before - 1, `${before} → ${afterDelete} equation(s)`);
      await smoke("undo", { times: 1 });
      check("…and Ctrl+Z restores it", (await snap()).tags.includes(eq.tag));
      // Edit here: the floating editor opens on that equation (the app's editing target).
      useApp.getState().setEditing(null);
      await smoke("objectMenuRun", { tag: eq.tag, id: "edit" });
      for (let i = 0; i < 20 && useApp.getState().editing?.tag !== eq.tag; i++) await new Promise((r) => setTimeout(r, 250));
      check("Edit equation here opens it for editing", useApp.getState().editing?.tag === eq.tag, useApp.getState().editing?.tag ?? "not opened");
      useApp.getState().setEditing(null);
      void docO;
      await smoke("save", { file: "object menu test.docx" });
    });

    section = "Equation objects: tracked changes, undo/redo, class registration, PDF";
    await step("objects end to end", async () => {
      const { buildDocumentIndex, rewriteDocument } = await import("./symbolIndex");
      const latexOfTag = async (tag: string) => (await buildDocumentIndex()).equations.find((e) => e.tag === tag)?.latex ?? null;
      const edit = async (tag: string, to: string) => {
        const ix = await buildDocumentIndex();
        await rewriteDocument(ix, ix.equations.filter((e) => e.tag === tag), () => to, "Edit equation");
      };
      // Undo and redo of an insert and of an edit.
      const docU = await smoke("newDocument");
      await smoke("typeText", { text: "Undo test: " });
      const a = await insert("a^2+b^2", false);
      check("an inserted equation is an embedded object", ((await smoke("objectMenu", { tag: a.tag })) as { isObject: boolean }).isObject);
      await smoke("undo", { times: 1 });
      check("Ctrl+Z removes an inserted equation", !(await snap()).tags.includes(a.tag));
      await smoke("redo", { times: 1 });
      check("Ctrl+Y brings it back, same ID", (await snap()).tags.includes(a.tag));
      await edit(a.tag, "a^2+b^2=c^2");
      check("an edit changes the equation", norm((await latexOfTag(a.tag)) ?? "") === norm("a^2+b^2=c^2"), (await latexOfTag(a.tag)) ?? "not found");
      await smoke("undo", { times: 1 });
      check("Ctrl+Z restores the equation before the edit", norm((await latexOfTag(a.tag)) ?? "") === norm("a^2+b^2"), (await latexOfTag(a.tag)) ?? "not found");
      await smoke("redo", { times: 1 });
      check("Ctrl+Y redoes the edit", norm((await latexOfTag(a.tag)) ?? "") === norm("a^2+b^2=c^2"), (await latexOfTag(a.tag)) ?? "not found");
      await smoke("save", { file: "objects undo test.docx" });
      void docU;

      // Tracked changes: insert, edit, delete with Track Changes on; accept and reject.
      await smoke("newDocument");
      await smoke("typeText", { text: "Tracked changes: " });
      await smoke("trackChanges", { on: true });
      const t = await insert("x+y", false);
      const r1 = ((await smoke("revisions")) as { count: number }).count;
      check("with Track Changes on, inserting an equation is a tracked change", r1 > 0, `${r1} revision(s)`);
      await edit(t.tag, "x+y+z");
      const ix = await buildDocumentIndex();
      const same = ix.equations.filter((e) => e.tag === t.tag);
      check("an edit with Track Changes on leaves one equation with that ID (the old one is a tracked deletion)", same.length === 1 && norm(same[0]!.latex) === norm("x+y+z"), same.map((e) => e.latex).join(" | ") || "not found");
      const menu = (await smoke("objectMenu", { tag: t.tag })) as { items: unknown[] };
      check("…and it can still be opened (its menu, its source)", menu.items.length > 0);
      await smoke("acceptAll");
      const afterAccept = await buildDocumentIndex();
      check("Accept all: the edited equation remains, readable", afterAccept.equations.filter((e) => e.tag === t.tag).length === 1 && norm(afterAccept.equations.find((e) => e.tag === t.tag)!.latex) === norm("x+y+z"));
      const t2 = await insert("p=q", false);
      await smoke("rejectAll");
      check("Reject all: an equation inserted with Track Changes on goes away", !(await snap()).tags.includes(t2.tag));
      await smoke("trackChanges", { on: false });
      await smoke("save", { file: "objects tracked changes test.docx" });

      // The class, registered for this user only, without a server.
      const reg = (await smoke("classRegistration")) as Record<string, string | null | undefined>;
      check("the MathBlocks equation class is registered for this user (no server)", reg.progId === "MathBlocks Equation" && reg.clsid === "MathBlocks Equation" && reg.clsidProgId === "MathBlocks.Equation.1" && !reg.server, JSON.stringify(reg));
      check("what Word reports for a MathBlocks object (class name)", null, `ProgID “${reg.wordProgId ?? "—"}”, class “${reg.wordClassType ?? "—"}”`);

      // PDF from Word: the equations are drawn (vector pictures), with alternative text.
      await smoke("newDocument");
      await smoke("typeText", { text: "PDF test: " });
      await insert("\\int_0^1 x^2\\,dx=\\frac{1}{3}", false);
      await smoke("newParagraph");
      await insert("\\pvec{r}=\\vectrix{F}^{\\T}\\cmat{r}", true);
      const pdf = (await smoke("exportPdf", { file: "objects test.pdf" })) as { size: number; pages: number; alt: boolean; alts?: string[]; images: number; path: string };
      check("PDF from Word: written, with the page", pdf.size > 1000 && pdf.pages >= 1, `${pdf.size} bytes, ${pdf.pages} page(s), ${pdf.images} raster image(s)`);
      check("PDF from Word: the equations carry alternative text (accessibility tags)", pdf.alt && (pdf.alts?.length ?? 0) >= 2, `${pdf.alts?.length ?? 0} alt text(s): ${(pdf.alts ?? []).join(" | ")}`);
      const printers = (await smoke("pdfPrinters")) as { printers: string[]; acrobat: boolean };
      check("PDF from Acrobat: open the saved “objects test.docx” and use Acrobat's Save as Adobe PDF (manual, in the trial checklist)", null, `${printers.acrobat ? "Acrobat found" : "Acrobat not found"}; PDF printers: ${printers.printers.filter((p) => /pdf/i.test(p)).join(", ") || "none"}`);
      await smoke("save", { file: "objects test.docx" });
    });

    section = "One Ctrl+Z for each whole-document operation";
    await step("whole-document operations", async () => {
      const docU = await smoke("newDocument");
      await smoke("typeText", { text: "Undo test: bold spread " });
      // Bold that spread onto the index (the parser already keeps \\mathbf{r_{i}} on the base).
      await insert("\\mathbf{r}_{\\mathbf{i}}", false);
      await smoke("typeText", { text: " and a transpose " });
      await insert("\\mathbf{A}^{\\mathbf{T}}\\mathbf{x}", false);
      await smoke("typeText", { text: "." });
      await smoke("newParagraph");
      const n1 = await insert("F=ma", true);
      await number(n1.tag, "F=ma");
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      const n2 = await insert("G=mg", true);
      await number(n2.tag, "G=mg");
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      await smoke("typeText", { text: "LaTeX to convert: $E=mc^2$ and $a^2+b^2=c^2$." });
      await smoke("newParagraph");
      await smoke("typeText", { text: "Older forms: " });
      await insert("\\overrightharpoon{\\mathbf{v}}=\\vec{\\mathbf{F}}^{\\mathbf{T}}\\mathbf{v}_{\\mathbf{f}}+\\hat{\\mathbf{f}}_{\\mathbf{1}}", false);
      const { buildDocumentIndex, rewriteDocument } = await import("./symbolIndex");
      const { normalizeBold } = await import("@mathblocks/math-core");
      const bolded = (l: string) => {
        const root = parseLatex(l).root;
        return normalizeBold(root) ? serializeLatex(root) : l;
      };
      let index = await buildDocumentIndex();
      // Review notation kinds (suggested rules): older forms become kinds, one Ctrl+Z. First, on the untouched
      // equation (index labels lose their forced look: the document style draws them).
      const { applyKindRules, SUGGESTED_KIND_RULES } = await import("./kindRules");
      // Only its own equation: the bold spread and the transpose above are left for the next two checks.
      const older = index.equations.filter((e) => e.latex.includes("overrightharpoon"));
      await oneCtrlZ("Apply notation kinds", docU.name, () => rewriteDocument(index, older, (l) => applyKindRules(l, SUGGESTED_KIND_RULES).latex, "Apply notation kinds"));
      const kinded = (await buildDocumentIndex()).equations.map((e) => e.latex).find((l) => l.includes("\\pvec{v}"));
      check("Apply notation kinds: the older forms became kinds", !!kinded && /\\vectrix\{F\}\^\{\\T\}/.test(kinded) && /\\cmat\{v\}_\{?f\}?/.test(kinded) && /\\bvec\{f\}_\{?1\}?/.test(kinded), kinded ?? "no equation with \\pvec{v}");
      index = await buildDocumentIndex();
      await oneCtrlZ("Normalize bold", docU.name, () => rewriteDocument(index, index.equations.filter((e) => bolded(e.latex) !== e.latex), bolded, "Normalize bold"));
      const { transposeToKind } = await import("./notation");
      index = await buildDocumentIndex();
      await oneCtrlZ("Change notation (transpose form)", docU.name, () => rewriteDocument(index, index.equations, (l) => transposeToKind(l), "Transpose form"));
      const numbersNow = async () => (await connector.request("listNumbered", {}, SLOW)).equations.map((e) => e.number).join(" ");
      const before0 = await numbersNow();
      const stale = await smoke("staleNumbers");
      const staleNow = await numbersNow();
      await oneCtrlZ("Update numbers", docU.name, () => connector.request("updateNumbers", {}, SLOW));
      check("Update numbers: the numbers (diagnosis)", null, `before ${before0}; with an extra counter at the top (${stale.fields} field added) ${staleNow}; after Update numbers ${await numbersNow()}`);
      const { convertAllLatex } = await import("./wordShortcuts");
      await oneCtrlZ("Convert LaTeX", docU.name, () => convertAllLatex(undefined, { yes: true }));
      // Text guard: a change that also deletes a letter outside the equations is undone automatically.
      const probe = await smoke("guardProbe");
      check("text guard: a change that touches text outside the equations is undone automatically", !!probe.guardFailed && probe.guardRestored === true && probe.textAfter === "Guard probe paragraph.", `deleted "${probe.deleted}"; guard: ${probe.guardFailed ?? "did not notice"}; restored ${probe.guardRestored}; the paragraph reads "${probe.textAfter}"`);
      await smoke("save", { file: "undo test.docx" });
    });

    section = "Document style: the look is the document's, the LaTeX never changes";
    await step("document style", async () => {
      const ds = await import("./docStyle");
      const run = await import("./styleRun");
      const { renderSvg } = await import("@mathblocks/math-render");
      const { loadFonts, classicStyle } = await import("./render");
      const { applyPreset, presetFrom } = await import("@mathblocks/math-core");
      const fonts = await loadFonts();
      const drawing = (latex: string, st: import("@mathblocks/math-core").MathStyle) => renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display: true, sizePt: st.sizePt, mathStyle: st }).svg;
      /** Each equation of the document in front: its LaTeX, the style it was drawn in, its size in Word. */
      const pictures = async () => {
        const front = (await smoke("activeName")).name as string;
        const r = await connector.request("listInstances", { includeContent: true }, SLOW);
        const d = r.documents.find((x) => x.name === front) ?? r.documents[0];
        return (d?.instances ?? []).map((i) => {
          const rd = i.flatOpc ? readEquationXml(i.flatOpc) : null;
          const size = /width:([\d.]+)pt;height:([\d.]+)pt/.exec(i.flatOpc ?? "");
          return { tag: i.tag, latex: rd ? serializeLatex(rd.root) : "?", styleHash: rd?.styleHash ?? "", size: size ? `${size[1]}×${size[2]}` : "?" };
        });
      };
      // A planted mix: labels (sf, max), a summation index, a variable used as an index, a letter with
      // nothing to go by, a hand-forced \mathrm on an index and on a symbol, the same index written two ways.
      const PLANTED = ["\\sigma_{sf}=E\\varepsilon_{sf}", "S=\\sum_{i=1}^{N}x_i", "u_t=a\\,t+b", "w_q=2", "v_{\\mathrm{max}}=\\mathrm{x}+v_{max}"];
      const docS = await smoke("newDocument");
      await smoke("typeText", { text: "Document style test." });
      for (const l of PLANTED) {
        await smoke("newParagraph");
        await insert(l, true);
        await smoke("caretTo", { where: "end" });
      }
      const loaded = await ds.loadDocumentStyle();
      check("a new document has no style of its own (drawn in the user's default)", loaded ? !loaded.stored : null, loaded ? `stored: ${loaded.stored}` : "the add-in cannot read document styles");
      await ds.saveDocumentStyle({ ...ds.activeStyle(), labels: "italic", letters: {}, exceptions: [] });
      check("the style is stored in the document", (await ds.readDocumentStyle((await ds.loadDocumentStyle())!.document)) !== null);
      let prev = ds.activeStyle();
      for (const labels of ["upright", "italic"] as const) {
        const before = await pictures();
        const next = { ...ds.activeStyle(), labels };
        await oneCtrlZ(`Restyle (index labels ${labels})`, docS.name, () => run.restyleDocument(next));
        const after = await pictures();
        const sameLatex = before.every((b) => after.find((a) => a.tag === b.tag)?.latex === b.latex);
        check(`Restyle (index labels ${labels}): every equation's LaTeX is unchanged`, sameLatex && after.length === PLANTED.length, after.map((a) => a.latex).join(" | "));
        const hash = ds.activeStyleHash();
        check(`Restyle (index labels ${labels}): every equation is drawn in the new style`, after.every((a) => a.styleHash === hash), `${after.filter((a) => a.styleHash === hash).length} of ${after.length}`);
        check(`Restyle (index labels ${labels}): the drawing of σ_sf changes`, drawing(PLANTED[0]!, prev) !== drawing(PLANTED[0]!, next), `size in Word before ${before[0]?.size}, after ${after[0]?.size}`);
        prev = next;
      }
      // Classification proposed from the document itself.
      const { proposals } = await run.proposeClassification();
      const role = (l: string) => proposals.find((p) => p.letter === l);
      check("Classification: i is proposed as an index variable (summation index)", role("i")?.proposed === "counter", role("i")?.reasons.join("; ") ?? "not found");
      check("Classification: t is proposed as a variable (also used on its own)", role("t")?.proposed === "variable", role("t")?.reasons.join("; ") ?? "not found");
      check("Classification: q has nothing to go by and is left undecided", !!role("q") && role("q")!.proposed === null, role("q")?.reasons.join("; ") ?? "not found");
      // Check style: the planted override and the index written two ways; keep as exception; conform.
      const c1 = await run.checkDocumentStyle();
      const forcedMax = c1.issues.find((i) => i.kind === "forced" && i.message.includes("“max”"));
      const forcedX = c1.issues.find((i) => i.kind === "forced" && i.message.includes("“x”"));
      const mixed = c1.issues.find((i) => i.kind === "mixed" && i.message.includes("“max”"));
      check("Check style: lists the hand-forced \\mathrm on an index", !!forcedMax, c1.issues.map((i) => i.message).join(" | "));
      check("Check style: lists the hand-forced \\mathrm on a symbol", !!forcedX);
      check("Check style: lists the index written two ways", !!mixed);
      if (mixed) {
        await run.keepAsExceptions([mixed.key]);
        const c2 = await run.checkDocumentStyle();
        check("Keep as exception: not listed again", !c2.issues.some((i) => i.key === mixed.key) && c2.issues.length === c1.issues.length - 1, `${c1.issues.length} → ${c2.issues.length} item(s)`);
        const fix = c2.issues.filter((i) => i.kind === "forced" && i.fix);
        await oneCtrlZ("Conform to style", docS.name, () => run.conformIssues(c2.index, fix));
        const conformed = (await pictures()).find((p) => p.latex.includes("max"))?.latex ?? "";
        check("Conform to style: the forced looks are gone, nothing else changed", !/\\mathrm/.test(conformed) && /v_\{?max\}?=x\+v_\{?max\}?/.test(conformed.replace(/\s/g, "")), conformed);
      }
      // A preset exported from this document and imported into a second one gives identical drawings.
      await run.restyleDocument({ ...ds.activeStyle(), labels: "upright", differential: "upright", constants: "upright", letters: {}, exceptions: ds.activeStyle().exceptions });
      const json = ds.presetToJson(presetFrom(ds.activeStyle(), "self-test", "Self-test preset"));
      const picsA = await pictures();
      const docB = await smoke("newDocument");
      for (const l of PLANTED.slice(0, 3)) {
        await insert(l, true);
        await smoke("caretTo", { where: "end" });
        await smoke("newParagraph");
      }
      await ds.loadDocumentStyle();
      const imported = ds.presetFromJson(json);
      await run.restyleDocument({ ...applyPreset(ds.activeStyle(), imported), letters: {}, exceptions: [] });
      const picsB = await pictures();
      const pairs = picsB.map((b) => [b, picsA.find((a) => a.latex === b.latex)] as const);
      check(
        "Preset exported and imported into a second document: identical drawings",
        pairs.length === 3 && pairs.every(([b, a]) => !!a && a.styleHash === b.styleHash && a.size === b.size),
        pairs.map(([b, a]) => `${b.latex}: ${a?.size ?? "?"} / ${b.size}`).join("; "),
      );
      await smoke("save", { file: "style test B.docx" });
      await smoke("activate", { name: docS.name });
      await smoke("save", { file: "style test.docx" });
      void docB;
    });

    section = "My styles: create, rename, duplicate, delete, export and import";
    await step("my styles", async () => {
      const ds = await import("./docStyle");
      const run = await import("./styleRun");
      const sp = await import("./stylePresets");
      const core = await import("@mathblocks/math-core");
      const builtIn = JSON.stringify(core.STYLE_PRESETS);
      const mineBefore = sp.myStyles().map((p) => p.id);
      // Names nobody would use, removed again at the end (your own styles are not touched).
      const stamp = Date.now().toString(36);
      const made: string[] = [];
      try {
        const a = sp.createStyle(`Self-test style ${stamp}`, "made by the self-test", "blank");
        made.push(a.id);
        check("New style from blank: neutral starting values", JSON.stringify(a.values) === JSON.stringify(core.BLANK_STYLE_VALUES), a.name);
        const r = sp.renameStyle(a.id, `Self-test style ${stamp} renamed`, "renamed by the self-test");
        check("Rename: the new name and description", r.name.endsWith("renamed") && r.description === "renamed by the self-test", r.name);
        const c = sp.duplicateStyle(r.id);
        made.push(c.id);
        check("Duplicate: a copy with the same look", c.name === `${r.name} (copy)` && JSON.stringify(c.values) === JSON.stringify(r.values), c.name);
        sp.deleteStyle(c.id);
        check("Delete: the copy is gone, the original stays", !sp.myStyles().some((p) => p.id === c.id) && sp.myStyles().some((p) => p.id === r.id));
        // Make it distinctive, then use it in one document, export it, import it into a second one.
        const edited = sp.updateStyle(r.id, { ...ds.activeStyle(), ...r.values, labels: "upright", differential: "upright" });
        const SAMPLE = ["\\sigma_{sf}+\\frac{dx}{dt}", "v_{max}=x_i"];
        const pics = async () => {
          const front = (await smoke("activeName")).name as string;
          const lr = await connector.request("listInstances", { includeContent: true }, SLOW);
          const d = lr.documents.find((x) => x.name === front) ?? lr.documents[0];
          return (d?.instances ?? []).map((i) => {
            const rd = i.flatOpc ? readEquationXml(i.flatOpc) : null;
            const size = /width:([\d.]+)pt;height:([\d.]+)pt/.exec(i.flatOpc ?? "");
            return { latex: rd ? serializeLatex(rd.root) : "?", styleHash: rd?.styleHash ?? "", size: size ? `${size[1]}×${size[2]}` : "?" };
          });
        };
        const docX = await smoke("newDocument");
        for (const l of SAMPLE) {
          await insert(l, true);
          await smoke("caretTo", { where: "end" });
          await smoke("newParagraph");
        }
        await ds.loadDocumentStyle();
        await run.restyleDocument({ ...core.applyPreset(ds.activeStyle(), edited), letters: {}, exceptions: [] });
        const picsX = await pics();
        check("the document says which style it uses", core.styleLabel(ds.activeStyle(), sp.allStyles()) === edited.name, core.styleLabel(ds.activeStyle(), sp.allStyles()));
        check("…and “modified” once its look differs", core.styleLabel({ ...ds.activeStyle(), labels: "italic" }, sp.allStyles()) === `${edited.name}, modified`);
        const json = ds.presetToJson(edited);
        sp.deleteStyle(edited.id);
        const imported = sp.addImportedStyle(ds.presetFromJson(json));
        made.push(imported.id);
        check("Export and import: name and description kept", imported.name === edited.name && imported.description === edited.description, imported.name);
        await smoke("save", { file: "my style X.docx" });
        const docY = await smoke("newDocument");
        for (const l of SAMPLE) {
          await insert(l, true);
          await smoke("caretTo", { where: "end" });
          await smoke("newParagraph");
        }
        await ds.loadDocumentStyle();
        await run.restyleDocument({ ...core.applyPreset(ds.activeStyle(), imported), letters: {}, exceptions: [] });
        const picsY = await pics();
        const pairs = picsY.map((y) => [y, picsX.find((x) => x.latex === y.latex)] as const);
        check("Imported into a second document: identical drawings", pairs.length === SAMPLE.length && pairs.every(([y, x]) => !!x && x.styleHash === y.styleHash && x.size === y.size), pairs.map(([y, x]) => `${y.latex}: ${x?.size ?? "?"} / ${y.size}`).join("; "));
        check("the built-in styles are unchanged", JSON.stringify(core.STYLE_PRESETS) === builtIn);
        await smoke("save", { file: "my style Y.docx" });
        void docX;
        void docY;
      } finally {
        for (const id of made) if (!mineBefore.includes(id) && sp.myStyles().some((p) => p.id === id)) sp.deleteStyle(id);
      }
      check("your own styles are as before the test", JSON.stringify(sp.myStyles().map((p) => p.id)) === JSON.stringify(mineBefore));
    });

    section = "Two documents open: no operation changes which one is in front";
    await step("two documents", async () => {
      const ds = await import("./docStyle");
      const run = await import("./styleRun");
      const { repairDocument } = await import("./repair");
      const { convertAllLatex } = await import("./wordShortcuts");
      const docA = await smoke("newDocument");
      await smoke("typeText", { text: "The other open document: " });
      await insert("a+b", false);
      const docB = await smoke("newDocument");
      await smoke("typeText", { text: "The document worked on: " });
      await insert("x_i+y", false);
      await smoke("newParagraph");
      const nb = await insert("F=ma", true);
      await number(nb.tag, "F=ma");
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      await smoke("typeText", { text: "LaTeX: $E=mc^2$." });
      await takeActivations();
      // Activations arrive a moment after the request that causes them (e.g. a closing window).
      const settle = () => new Promise((r) => setTimeout(r, 700));
      const OPS: [string, () => Promise<unknown>][] = [
        ["Insert equation", () => insert("c=d", true)],
        ["Update numbers", () => connector.request("updateNumbers", {}, SLOW)],
        ["Convert LaTeX (progress window)", () => convertAllLatex(undefined, { yes: true })],
        ["Repair", () => repairDocument(undefined, { quiet: true })],
        ["Apply style to document (progress window)", () => run.applyStyleCommand()],
        ["Restyle", () => run.restyleDocument({ ...ds.activeStyle(), labels: "upright" })],
        ["Check style", () => run.checkDocumentStyle()],
        ["Status-bar message", () => connector.request("showMessage", { text: "MathBlocks self-test: status message", kind: "info" })],
        ["Ctrl+Z", () => smoke("undo", { times: 1 })],
        ["Ctrl+Y", () => smoke("redo", { times: 1 })],
      ];
      for (const [label, op] of OPS) {
        await op();
        await settle();
        const front = (await smoke("activeName")).name as string;
        const acts = await takeActivations();
        const other = acts.filter((a) => a.document !== docB.name);
        check(`${label}: ${docB.name} stays in front (${docA.name} open too)`, front === docB.name && other.length === 0, front === docB.name && !other.length ? "no other window came forward" : `in front: ${front}; activations: ${describeActivations(acts)}`);
        if (front !== docB.name) await smoke("activate", { name: docB.name });
      }
      // Restyle undo: Word's Ctrl+Z restores the drawings; the stored style follows them.
      await ds.loadDocumentStyle();
      const before = ds.activeStyle();
      const newer = { ...before, labels: before.labels === "upright" ? ("italic" as const) : ("upright" as const) };
      await run.restyleDocument(newer);
      const { styleHash } = await import("@mathblocks/math-core");
      await smoke("undo", { times: 1 });
      // What Word's idle notification after Ctrl+Z makes the app do (the self-test turns those checks off).
      await ds.loadDocumentStyle();
      check("Ctrl+Z of a restyle: the stored style is the previous one again", styleHash(ds.activeStyle()) === styleHash(before), `labels ${ds.activeStyle().labels} (before: ${before.labels}, new: ${newer.labels})`);
      const cs = await run.checkDocumentStyle();
      check("…and Check style lists nothing", cs.issues.length === 0, cs.issues.map((i) => i.message).join(" | ") || "nothing");
      await smoke("redo", { times: 1 });
      await ds.loadDocumentStyle();
      check("Ctrl+Y of a restyle: the new style again", styleHash(ds.activeStyle()) === styleHash(newer), `labels ${ds.activeStyle().labels}`);
      const cs2 = await run.checkDocumentStyle();
      check("…and Check style lists nothing", cs2.issues.length === 0, cs2.issues.map((i) => i.message).join(" | ") || "nothing");
      await smoke("save", { file: "two documents B.docx" });
      await smoke("activate", { name: docA.name });
      await smoke("save", { file: "two documents A.docx" });
    });

    section = "Bold Greek (Symbol has no bold face: its outlines are emboldened)";
    await step("bold greek", async () => {
      const mr = await import("@mathblocks/math-render");
      const { loadFonts, classicStyle } = await import("./render");
      const { boldGreekStems } = await import("../components/BoldGreekSheet");
      const fonts = await loadFonts();
      const st = boldGreekStems(fonts);
      if (!fonts.symbol) check("bold Greek: the Symbol font was not found (drawn from Times New Roman Bold instead)", null);
      else {
        const em = (x: number) => `${(x * 1000).toFixed(1)}/1000 em`;
        const pct = (x: number) => `${((x - 1) * 100).toFixed(1)} % darker`;
        check("bold Greek (upright) is as much darker than regular Greek as Times Bold is than Times", Math.abs(st.darkness.greek - st.darkness.latin) / st.darkness.latin < 0.03, `Times Bold ${pct(st.darkness.latin)}; emboldened Symbol ${pct(st.darkness.greek)} (offset ${em(st.offsetUpright)}; stems: Symbol ${em(st.symbol)} → ${em(st.emboldened)}, Times Bold "I" ${em(st.timesBold)})`);
        check("bold Greek (italic) is as much darker as Times Bold Italic is than Times Italic", Math.abs(st.darkness.greekItalic - st.darkness.latinItalic) / st.darkness.latinItalic < 0.03, `Times Bold Italic ${pct(st.darkness.latinItalic)}; emboldened Symbol ${pct(st.darkness.greekItalic)} (offset ${em(st.offsetItalic)})`);
      }
      // The three meanings of one letter, Latin or Greek: \pvec bold upright with a harpoon, \cmat bold upright, plain italic.
      const ds = await import("./docStyle");
      const style = ds.activeStyle();
      const drawn = (latex: string) => {
        const out: { bold: boolean; slant: boolean }[] = [];
        const walk = (b: { items: unknown[] }) => {
          for (const it of b.items as { k: string; g?: { font: unknown }; thin?: number; slant?: number; box?: { items: unknown[] } }[]) {
            if (it.k === "g" && it.g) out.push({ bold: (it.thin ?? 0) < 0 || it.g.font === fonts.bold || it.g.font === fonts.boldItalic, slant: !!it.slant || it.g.font === fonts.italic || it.g.font === fonts.boldItalic });
            if (it.box) walk(it.box);
          }
        };
        walk(mr.layout(parseLatex(latex).root, { fonts, style: classicStyle(), display: false, mathStyle: style }));
        return out;
      };
      for (const l of ["\\omega", "r"]) {
        const p = drawn(`\\pvec{${l}}`)[0];
        const c = drawn(`\\cmat{${l}}`)[0];
        const plain = drawn(l)[0];
        check(`three meanings of ${l.replace("\\", "")}: \\pvec bold upright, \\cmat bold upright, plain ${style.greekLower === "italic" || l === "r" ? "italic" : "as the document style says"}`, !!p?.bold && !p.slant && !!c?.bold && !c.slant && !!plain && !plain.bold, `pvec ${JSON.stringify(p)}, cmat ${JSON.stringify(c)}, plain ${JSON.stringify(plain)}`);
      }
      // The sheet in Word (Classic pictures), to compare with MathType's bold Greek.
      await smoke("newDocument");
      await smoke("typeText", { text: "Bold Greek sheet: bold upright, bold italic, plain; then bold Latin." });
      for (const l of ["\\alpha", "\\beta", "\\gamma", "\\omega", "\\sigma", "\\tau", "\\theta", "\\phi", "\\Gamma", "\\Omega"]) {
        await smoke("newParagraph");
        await insert(`\\mathbf{${l}}\\ \\boldsymbol{${l}}\\ ${l}\\quad\\mathbf{a}\\,\\mathbf{r}\\ \\boldsymbol{a}\\,\\boldsymbol{r}`, false);
      }
      await smoke("newParagraph");
      await insert("\\pvec{\\omega},\\ \\cmat{\\omega},\\ \\omega\\qquad\\pvec{r},\\ \\cmat{r},\\ r", false);
      await smoke("save", { file: "bold greek sheet.docx" });
      check("bold Greek sheet saved (compare with MathType's bold Greek; the comparison sheet in the app shows 12 pt and 10 pt)", null, "bold greek sheet.docx");
    });

    section = "Convert LaTeX: interchange convention document";
    await step("interchange conversion", async () => {
      const { interchangeDocx, INTERCHANGE_EXPECTED: X } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      const docI = await smoke("openDocx", { file: "interchange test.docx", base64: toBase64(interchangeDocx()) });
      const { convertLatexDocument, describeResult } = await import("./latexInterchangeRun");
      let res: Awaited<ReturnType<typeof convertLatexDocument>> = null;
      await oneCtrlZ("Convert LaTeX (interchange document)", docI.name, async () => {
        res = await convertLatexDocument({ yes: true });
      });
      const r = res as Awaited<ReturnType<typeof convertLatexDocument>>;
      if (!r) {
        check("interchange conversion ran", false, "the add-in does not support it");
        return;
      }
      const c = r.plan.counts;
      const errs = r.plan.issues.filter((i) => i.severity === "error").length;
      const warns = r.plan.issues.filter((i) => i.severity === "warning").length;
      check("pre-flight: the counts of the convention document", c.inline === X.inline && c.display === X.display && c.numbered === X.numbered && c.references === X.references && c.markers === X.markers, `${c.inline} inline, ${c.display} display, ${c.numbered} numbered, ${c.references} references, ${c.markers} markers`);
      check("pre-flight: every deliberate error and warning is listed", errs === X.errors && warns === X.warnings, `${errs} error(s), ${warns} warning(s): ${r.plan.issues.map((i) => i.what.slice(0, 40)).join(" | ")}`);
      check("text guard: no false alarm on the conversion", !r.guardFailed, r.guardFailed ?? "no other text changed");
      check("every planned item was written", r.failed.length === 0 && r.written === r.planned, `${r.written}/${r.planned}${r.failed.length ? `; ${r.failed.map((f) => `${f.what}: ${f.problem}`).join("; ")}` : ""}`);
      check("time per equation", null, describeResult(r));
      check("Word kept the conversion in one undo record", !r.undoBrokenAt, r.undoBrokenAt ? `closed early at: ${r.undoBrokenAt}` : "intact");
      // Bookmarks named from the labels (eq:3.1.1 → _MBEq_3_1_1), showing chapter.section.equation numbers.
      const { labelBookmark } = await import("./latexInterchange");
      for (const [label, number] of Object.entries(X.numbers)) {
        const bm = labelBookmark(label);
        const t = await smoke("bookmarkText", { bookmark: bm });
        check(`eq:${label}: bookmark ${bm} shows ${number}`, t.exists && String(t.text).replace(/\s/g, "") === number, t.exists ? `shows "${t.text}"` : "no such bookmark");
      }
      // References within and across sections, also after Update numbers.
      const refsNow = async () => ({
        a: (await smoke("refResults", { bookmark: "_MBEq_3_1_1" })).results as string[],
        b: (await smoke("refResults", { bookmark: "_MBEqN_3_2_1" })).results as string[],
        c: (await smoke("refResults", { bookmark: "_MBEq_3_2_2" })).results as string[],
        d: (await smoke("refResults", { bookmark: "_MBEq_A_2_1" })).results as string[],
      });
      const refsText = (x: Awaited<ReturnType<typeof refsNow>>) => `\\eqref 3.1.1 ${JSON.stringify(x.a)}, \\ref 3.2.1 ${JSON.stringify(x.b)}, \\eqref 3.2.2 (from chapter 4) ${JSON.stringify(x.c)}, \\eqref A.2.1 ${JSON.stringify(x.d)}`;
      const refsRight = (x: Awaited<ReturnType<typeof refsNow>>, first: string) => x.a.length === 1 && x.a[0] === first && x.b.length === 1 && x.b[0] === "3.2.1" && x.c.length === 1 && x.c[0] === "(3.2.2)" && x.d.length === 1 && x.d[0] === "(A.2.1)";
      const r1 = await refsNow();
      check("references show chapter.section.equation (\\eqref with brackets, \\ref without), within and across sections", refsRight(r1, "(3.1.1)"), refsText(r1));
      await connector.request("updateNumbers", {}, SLOW);
      const r2 = await refsNow();
      check("references still right after Update numbers", refsRight(r2, "(3.1.1)"), refsText(r2));
      // Layout of a numbered equation: centred, number at the right margin.
      const at = await smoke("bookmarkPara", { bookmark: "_MBEq_3_1_2" });
      if (at.exists) {
        const pi = await smoke("paraInfo", { pos: at.start });
        check("numbered equation: kept its MTDisplayEquation style", pi.style === "MTDisplayEquation", `style ${pi.style}`);
        check("numbered equation: number at the right margin", Math.abs(Number(pi.numberEnd) - Number(pi.textRight)) < 3, `number ends at ${Number(pi.numberEnd).toFixed(1)} pt, right margin ${Number(pi.textRight).toFixed(1)} pt`);
        check("numbered equation: centred on the text width", Math.abs(Number(pi.equationCenter) - Number(pi.textCenter)) < 3, `equation centre ${Number(pi.equationCenter).toFixed(1)} pt, text centre ${Number(pi.textCenter).toFixed(1)} pt`);
      } else check("numbered equation layout", false, "bookmark _MBEq_3_1_2 not found");
      // Inline equations on the baseline, as objects.
      const inline = r.tags.find((t) => t.kind === "inline");
      if (inline) {
        const info = await smoke("pictureInfo", { tag: inline.tag });
        const want = -Math.round(Number(info.depthPt ?? NaN));
        check("inline equation: an embedded object lowered by its depth", info.frame === "object" && Math.round(info.positionPt) === want, `frame ${info.frame}, run position ${info.positionPt} pt, depth ${info.depthPt} pt`);
      }
      // What is left: only the deliberate errors; markers became hidden marker paragraphs.
      const again = planInterchange((await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan);
      const leftValid = again.equations.filter((e) => !e.invalid).length + again.markers.length + again.references.filter((x) => x.resolved).length;
      check("a second run finds only the deliberate errors", leftValid === 0, `${leftValid} item(s) still to convert; ${again.issues.length} issue(s) left`);
      const scan2 = (await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan;
      check("\\mbnumbering became numbering markers", scan2.paragraphs.filter((p) => p.marker).length === X.markers, `${scan2.paragraphs.filter((p) => p.marker).length} marker(s)`);
      // A new equation in section 3.1, before (3.1.1): after Update numbers the later ones shift and the
      // references follow their equations.
      const markers = { open: "(", close: ")", chapter: true, parts: "section" as const, separator: "." as const, restart: "section" as const, source: "markers" as const };
      const inlineInSection = r.tags.filter((t) => t.kind === "inline")[2];
      if (inlineInSection) {
        await smoke("caretTo", { where: "after", tag: inlineInSection.tag });
        const added = await insert("E = mc^{2}", true);
        const { flatOpc } = await buildInsertion("E = mc^{2}", false, profile, added.tag, "classic", true);
        await connector.request("numberEquation", { tag: added.tag, flatOpc, ...markers }, SLOW);
        await connector.request("updateNumbers", {}, SLOW);
        const t311 = await smoke("bookmarkText", { bookmark: "_MBEq_3_1_1" });
        const t312 = await smoke("bookmarkText", { bookmark: "_MBEq_3_1_2" });
        const r3 = await refsNow();
        check("after inserting an equation in section 3.1 and Update numbers: the later numbers shift", String(t311.text).replace(/\s/g, "") === "(3.1.2)" && String(t312.text).replace(/\s/g, "") === "(3.1.3)", `eq:3.1.1 shows "${t311.text}", eq:3.1.2 shows "${t312.text}"`);
        check("…and the references follow their equations", refsRight(r3, "(3.1.2)"), refsText(r3));
      } else check("insert an equation in section 3.1", false, "no inline equation to place it after");
      // Insert section marker: prefilled from the marker before the cursor (appendix A, section 2).
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      const before = await connector.request("markerBefore", {}, SLOW);
      check("Insert section marker: finds the marker before the cursor", before.chapter === 1 && before.appendix === true && before.section === 2, JSON.stringify(before));
      await connector.request("insertNumberMarker", { chapter: 1, section: 3, appendix: true, restartEquations: true }, SLOW);
      await smoke("newParagraph");
      const late = await insert("F = ma", true);
      const lateFlat = (await buildInsertion("F = ma", false, profile, late.tag, "classic", true)).flatOpc;
      const lateNo = await connector.request("numberEquation", { tag: late.tag, flatOpc: lateFlat, ...markers }, SLOW);
      check("an equation after the new section marker is numbered (A.3.1)", String(lateNo.number).replace(/\s/g, "") === "(A.3.1)", `numbered "${lateNo.number}"`);
      // The paragraphs with the deliberate errors were not touched by these steps.
      const still = planInterchange((await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan);
      check("the paragraphs with the deliberate errors are unchanged by the steps above", still.issues.filter((i) => i.severity === "error").length >= 5, still.issues.map((i) => i.what.slice(0, 50)).join(" | "));
      // Delete an equation that is referenced: Update numbers lists the broken reference.
      await smoke("deleteBookmarkPara", { bookmark: "_MBEq_A_2_1" });
      const upd = await connector.request("updateNumbers", {}, SLOW);
      const broken = upd.broken ?? [];
      check("Update numbers lists the reference to the deleted equation, with its text", broken.length === 1 && broken[0]!.bookmark === "_MBEq_A_2_1" && /quotes/.test(broken[0]!.snippet) && !/GOTOBUTTON|MERGEFORMAT/.test(broken[0]!.snippet), JSON.stringify(broken));
      await smoke("save", { file: "interchange test (converted).docx" });
    });
    await step("interchange speed", async () => {
      // Time per equation on a 150-equation document (100 numbered, 50 inline, 50 references).
      const { interchangeDocx, interchangeSpeedParagraphs } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      await smoke("openDocx", { file: "interchange speed.docx", base64: toBase64(interchangeDocx(interchangeSpeedParagraphs())) });
      const { convertLatexDocument, describeResult } = await import("./latexInterchangeRun");
      const r = await convertLatexDocument({ yes: true });
      check("150-equation document: all converted", !!r && r.equations === 150 && r.failed.length === 0, r ? `${r.equations} equation(s), ${r.failed.length} not written` : "did not run");
      check("150-equation document: time per equation", null, r ? describeResult(r) : "");
    });

    section = "Intermediate frames: F, F_I, F_II, their unit vectors and DCMs";
    await step("intermediate frames", async () => {
      // Generic example: a frame F, intermediate frames F_I and F_II, unit vectors with the frame's
      // numeral as a superscript, DCMs between them.
      const EQS = [
        { latex: "\\vectrix{F}_{I}=\\dcm{F_{I}}{F}\\vectrix{F}", display: false },
        { latex: "\\vectrix{F}_{II}=\\dcm{F_{II}}{F_{I}}\\vectrix{F}_{I}", display: true },
        { latex: "\\pvec{r}=x\\bvec{f}_1^{I}+y\\bvec{f}_2^{II}+z\\bvec{f}_3^{II}", display: false },
      ];
      const paragraphs = EQS.map((e) => (e.display ? { style: "MTDisplayEquation", text: `\t$$${e.latex}$$` } : { style: "Normal", text: `With $${e.latex}$ in the text.` }));
      const { interchangeDocx } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      const { activeStyle } = await import("./docStyle");
      const docF = await smoke("openDocx", { file: "intermediate frames test.docx", base64: toBase64(interchangeDocx(paragraphs)) });
      const scan = (await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan;
      const style = activeStyle();
      const plan = planInterchange(scan, { frameSubscriptWarning: style.frameSubscriptWarning });
      check("pre-flight: no warning for frames with a Roman-numeral index (the document's notation allows them)", style.frameSubscriptWarning ? null : plan.issues.length === 0, style.frameSubscriptWarning ? "this document asks for the warning (Document style)" : plan.issues.map((i) => i.what).join(" | ") || "none");
      const strict = planInterchange(scan, { frameSubscriptWarning: true });
      check("with “warn when a frame has a subscript” on: each frame subscript is listed", strict.issues.length === 3, `${strict.issues.length} warning(s)`);
      // How the style draws them: numerals in indices, superscripts and DCM frames in the Roman-numeral shape.
      const { styleAst } = await import("@mathblocks/math-core");
      const want = style.romans === "upright";
      for (const e of EQS) {
        const drawn = serializeLatex(styleAst(parseLatex(e.latex).root, style));
        const plainNumeral = /[_^]\{?(?:I{1,3}|IV|V)(?![A-Za-z])/.test(drawn);
        const upright = (drawn.match(/\\mathrm\{(?:I{1,3}|IV|V)\}/g) ?? []).length;
        check(`${e.latex}: Roman numerals drawn ${style.romans}`, want ? !plainNumeral && upright >= 2 : upright === 0, drawn);
      }
      const { convertLatexDocument } = await import("./latexInterchangeRun");
      let res: Awaited<ReturnType<typeof convertLatexDocument>> = null;
      await oneCtrlZ("Convert LaTeX (intermediate frames)", docF.name, async () => {
        res = await convertLatexDocument({ yes: true });
      });
      const r = res as Awaited<ReturnType<typeof convertLatexDocument>>;
      check("Convert LaTeX wrote the three equations", !!r && r.equations === 3 && r.failed.length === 0, r ? `${r.equations} equation(s), ${r.failed.length} not written` : "did not run");
      // Round trip: each equation keeps exactly the LaTeX written (no \mathrm added; frames and DCMs intact).
      const list = await connector.request("listInstances", { includeContent: true }, SLOW);
      const d = (list.documents as { name: string; instances: { tag: string; flatOpc?: string }[] }[]).find((x) => x.name === docF.name);
      const got = (d?.instances ?? []).map((i) => (i.flatOpc ? readEquationXml(i.flatOpc) : null)).filter((x) => !!x);
      for (const e of EQS) {
        const g = got.find((x) => serializeLatex(x!.root) === norm(e.latex));
        check(`round trip: ${e.latex}`, !!g, g ? `stored as written, drawn in style ${g.styleHash ?? "?"}` : `stored: ${got.map((x) => serializeLatex(x!.root)).join(" | ")}`);
      }
      const again = planInterchange((await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan);
      check("a second Convert LaTeX finds nothing left", again.equations.length === 0 && again.issues.length === 0, `${again.equations.length} equation(s), ${again.issues.length} issue(s)`);
      await smoke("save", { file: "intermediate frames test.docx" });
    });

    section = "One numbering scheme: MathType numbers → MathBlocks, then pasted LaTeX";
    await step("mathtype numbering, renumbered", async () => {
      const { mathTypeNumberingDocx } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      const docM = await smoke("openDocx", { file: "numbering test.docx", base64: toBase64(await mathTypeNumberingDocx(true)) });
      const { convertOpenDocument } = await import("./convertMathType");
      await convertOpenDocument(undefined, { quiet: true });
      // Convert LaTeX refuses to add numbers while MathType's numbering is there.
      const guard = planInterchange((await connector.request("scanInterchange", {}, SLOW)) as InterchangeScan);
      check("Convert LaTeX waits for Convert numbering while MathType's numbering is there", guard.needsNumberingConversion, guard.issues[0]?.what ?? "no warning");
      const { scanNumbering, convertNumbering } = await import("./numberingConversionRun");
      const { planNumberingConversion } = await import("./numberingConversion");
      const scanN = (await scanNumbering())!;
      const planN = planNumberingConversion(scanN, "renumber");
      check("how MathType's numbers read (diagnosis)", null, JSON.stringify((await smoke("numberDebug")).fields));
      check("renumber plan: (A.1)–(A.3) → (A.1.1)–(A.1.3), no problems", planN.changes.map((c) => `${c.old}→${c.new}`).join(" ") === "(A.1)→(A.1.1) (A.2)→(A.1.2) (A.3)→(A.1.3)" && planN.problems.length === 0, `${planN.changes.map((c) => `${c.old}→${c.new}`).join(" ")}; ${planN.problems.map((p) => p.what).join(" | ")}`);
      let resN: Awaited<ReturnType<typeof convertNumbering>> | null = null;
      await oneCtrlZ("Convert numbering (renumber)", docM.name, async () => {
        resN = await convertNumbering(scanN, "renumber");
      });
      const rn = resN as Awaited<ReturnType<typeof convertNumbering>> | null;
      check("text guard: no false alarm on Convert numbering", !!rn && !rn.guardFailed, rn?.guardFailed ?? "no other text changed");
      check("every converted number shows what was planned", !!rn && rn.mismatches.length === 0 && rn.problems.length === 0, rn ? `${JSON.stringify(rn.mismatches)} ${rn.problems.join("; ")}` : "did not run");
      const shows = async (bm: string) => String((await smoke("bookmarkText", { bookmark: bm })).text).replace(/\s/g, "");
      // Each MathType number now has a MathBlocks bookmark (_MBEq_…); MathType's references point at it.
      const mb = (zeqn: string) => rn?.aliases?.[zeqn] ?? "?";
      const mbN = (zeqn: string) => mb(zeqn).replace(/^_MBEq_/, "_MBEqN_");
      check("the converted numbers have MathBlocks bookmarks with the new numbers", (await shows(mb("ZEqnNum100001"))) === "(A.1.1)" && (await shows(mb("ZEqnNum100003"))) === "(A.1.3)", `${mb("ZEqnNum100001")} ${await shows(mb("ZEqnNum100001"))}, ${mb("ZEqnNum100003")} ${await shows(mb("ZEqnNum100003"))}`);
      const refs = async (bm: string) => (await smoke("refResults", { bookmark: bm })).results as string[];
      const old1 = await refs(mb("ZEqnNum100001"));
      const old3 = await refs(mb("ZEqnNum100003"));
      check("MathType's references are now MathBlocks references and follow their equations", old1.length === 1 && old1[0] === "(A.1.1)" && old3.length === 1 && old3[0] === "(A.1.3)", `to (A.1): ${JSON.stringify(old1)}, to (A.3): ${JSON.stringify(old3)}`);
      check(
        "every reference verified, MathType's bookmarks removed, no MathType numbering field left",
        !!rn && rn.referencesConverted === 2 && (rn.referenceMismatches ?? []).length === 0 && (rn.aliasesRemoved ?? 0) > 0 && (await refs("ZEqnNum100001")).length === 0 && (rn.leftovers ?? []).length === 0,
        rn ? `${rn.referencesConverted} reference(s), ${(rn.referenceMismatches ?? []).length} mismatch(es), ${rn.aliasesRemoved} MathType bookmark(s) removed, left: ${(rn.leftovers ?? []).map((l) => l.code).join(" | ") || "none"}` : "did not run",
      );
      // The pasted section: one more equation in A.1, section A.2, references to old and new equations.
      const { convertLatexDocument } = await import("./latexInterchangeRun");
      let resL: Awaited<ReturnType<typeof convertLatexDocument>> = null;
      await oneCtrlZ("Convert LaTeX after Convert numbering", docM.name, async () => {
        resL = await convertLatexDocument({ yes: true });
      });
      const rl = resL as Awaited<ReturnType<typeof convertLatexDocument>>;
      check("pasted section: no problems, everything written", !!rl && rl.plan.issues.length === 0 && rl.failed.length === 0, rl ? `${rl.plan.issues.map((i) => i.what).join(" | ")} ${rl.failed.map((f) => f.problem).join("; ")}` : "did not run");
      await connector.request("updateNumbers", {}, SLOW);
      const all = (await scanNumbering())!.items.filter((i) => i.type === "mbNumber").map((i) => (i as { text: string }).text.replace(/\s/g, ""));
      check("after Update numbers: every number correct and unique", all.join(" ") === "(A.1.1) (A.1.2) (A.1.3) (A.1.4) (A.2.1)", all.join(" "));
      const r13 = await refs(mb("ZEqnNum100003"));
      const r11n = await refs(mbN("ZEqnNum100001"));
      const r14 = await refs("_MBEq_A_1_4");
      const r21 = await refs("_MBEq_A_2_1");
      check(
        "references to old and new equations are right (by number to the converted ones, by label to the new ones)",
        r13.length === 2 && r13.every((x) => x === "(A.1.3)") && r11n.length === 1 && r11n[0] === "A.1.1" && r14.length === 1 && r14[0] === "(A.1.4)" && r21.length === 1 && r21[0] === "(A.2.1)",
        `(A.1.3) ${JSON.stringify(r13)}, A.1.1 ${JSON.stringify(r11n)}, (A.1.4) ${JSON.stringify(r14)}, (A.2.1) ${JSON.stringify(r21)}`,
      );
      await smoke("save", { file: "numbering test (converted).docx" });
    });
    await step("mathtype numbering, kept", async () => {
      const { mathTypeNumberingDocx } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      const docK = await smoke("openDocx", { file: "numbering keep test.docx", base64: toBase64(await mathTypeNumberingDocx(false)) });
      const { convertOpenDocument } = await import("./convertMathType");
      await convertOpenDocument(undefined, { quiet: true });
      const { scanNumbering, convertNumbering } = await import("./numberingConversionRun");
      const scanK = (await scanNumbering())!;
      let resK: Awaited<ReturnType<typeof convertNumbering>> | null = null;
      await oneCtrlZ("Convert numbering (keep the numbers)", docK.name, async () => {
        resK = await convertNumbering(scanK, "keep");
      });
      const rk = resK as Awaited<ReturnType<typeof convertNumbering>> | null;
      const all = (await scanNumbering())!.items.filter((i) => i.type === "mbNumber").map((i) => (i as { text: string }).text.replace(/\s/g, ""));
      check("keep the existing numbers: (A.1)–(A.3) unchanged, now MathBlocks numbers", !!rk && rk.mismatches.length === 0 && all.join(" ") === "(A.1) (A.2) (A.3)", `${all.join(" ")}${rk?.mismatches.length ? `; ${JSON.stringify(rk.mismatches)}` : ""}`);
      const r1 = (await smoke("refResults", { bookmark: rk?.aliases?.["ZEqnNum100001"] ?? "?" })).results as string[];
      check("keep: references unchanged (now MathBlocks references)", r1.length === 1 && r1[0] === "(A.1)", JSON.stringify(r1));
      await smoke("save", { file: "numbering keep test (converted).docx" });
    });
    await step("mathtype numbering, chapters with empty sections", async () => {
      const { mathTypeChaptersDocx } = await import("./interchangeFixture");
      const { toBase64 } = await import("./render");
      const docC = await smoke("openDocx", { file: "numbering chapters test.docx", base64: toBase64(await mathTypeChaptersDocx()) });
      const { convertOpenDocument } = await import("./convertMathType");
      await convertOpenDocument(undefined, { quiet: true });
      const { scanNumbering, convertNumbering } = await import("./numberingConversionRun");
      const { planNumberingConversion } = await import("./numberingConversion");
      const scanC = (await scanNumbering())!;
      const planC = planNumberingConversion(scanC, "keep");
      check("pre-flight: every MathType break becomes a marker (also without equations)", planC.counts.breaks === 6, `${planC.counts.breaks} break(s); ${planC.problems.map((p) => p.what).join(" | ") || "no problems"}`);
      check("pre-flight: the section heading without a MathType break is listed, with a marker offered", planC.headingsWithoutBreak.map((h) => `${h.text}→${h.chapter}.${h.section}`).join(" ") === "2.3 Control→2.3", planC.headingsWithoutBreak.map((h) => `${h.text}→${h.chapter}.${h.section}`).join(" ") || "none");
      let resC: Awaited<ReturnType<typeof convertNumbering>> | null = null;
      await oneCtrlZ("Convert numbering (chapters, keep)", docC.name, async () => {
        resC = await convertNumbering(scanC, "keep");
      });
      const rc = resC as Awaited<ReturnType<typeof convertNumbering>> | null;
      const after = (await scanNumbering())!;
      const markers = after.items.filter((i) => i.type === "mbMarker").length;
      check("every break is now a MathBlocks marker, plus the one for the heading", markers === 7 && after.items.every((i) => i.type !== "mtBreak"), `${markers} marker(s), ${after.items.filter((i) => i.type === "mtBreak").length} MathType break(s) left`);
      check("no MathType numbering field left (MTEqn, MTSec, MTChap, breaks, numbers)", !!rc && (rc.leftovers ?? []).length === 0, (rc?.leftovers ?? []).map((l) => `${l.code} — ${l.snippet}`).join(" | ") || "none");
      check("the reference is a MathBlocks reference showing its number", !!rc && rc.referencesConverted === 1 && (rc.referenceMismatches ?? []).length === 0, rc ? `${rc.referencesConverted} reference(s), mismatches ${JSON.stringify(rc.referenceMismatches)}` : "did not run");
      // New equations in a later section, in the section without a MathType break, and in the next chapter.
      const { convertLatexDocument } = await import("./latexInterchangeRun");
      const rl = await convertLatexDocument({ yes: true });
      check("new equations converted without problems", !!rl && rl.plan.issues.length === 0 && rl.failed.length === 0, rl ? `${rl.plan.issues.map((i) => i.what).join(" | ")} ${rl.failed.map((f) => f.problem).join("; ")}` : "did not run");
      await connector.request("updateNumbers", {}, SLOW);
      const shows = async (bm: string) => String((await smoke("bookmarkText", { bookmark: bm })).text).replace(/\s/g, "");
      const got = [await shows("_MBEq_2_2_1"), await shows("_MBEq_2_3_1"), await shows("_MBEq_3_1_1")];
      check("a new equation in a later section, in the heading-only section and in the next chapter: (2.2.1), (2.3.1), (3.1.1)", got.join(" ") === "(2.2.1) (2.3.1) (3.1.1)", got.join(" "));
      await smoke("save", { file: "numbering chapters test (converted).docx" });
    });

    section = "Repair: Classic pictures become embedded objects";
    await step("repair conversion", async () => {
      const docR = await smoke("newDocument");
      await smoke("typeText", { text: "Repair test: inline " });
      // Equations in the form before objects (VML pictures), as in older documents.
      const pin = await buildPictureInsertion("\\alpha+\\beta", false);
      await connector.request("insertEquation", { flatOpc: pin.flatOpc, tag: pin.tag, display: false, undoLabel: "Insert equation" }, SLOW);
      await smoke("typeText", { text: " and text after." });
      await smoke("newParagraph");
      const pdisp = await buildPictureInsertion("\\vec{r}=\\frac{p}{1+e\\cos\\theta}", true);
      await connector.request("insertEquation", { flatOpc: pdisp.flatOpc, tag: pdisp.tag, display: true, undoLabel: "Insert equation" }, SLOW);
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      const pnum = await buildPictureInsertion("F=ma", true);
      await connector.request("insertEquation", { flatOpc: pnum.flatOpc, tag: pnum.tag, display: true, undoLabel: "Insert equation" }, SLOW);
      const numberedPic = await buildPictureInsertion("F=ma", false, pnum.tag, true);
      await connector.request("numberEquation", { tag: pnum.tag, flatOpc: numberedPic.flatOpc, ...numberFormat(useApp.getState().numberStyle), chapter: false, parts: "eq" }, SLOW);
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
      const list0 = await connector.request("listNumbered", {}, SLOW);
      const n0 = list0.equations.find((x) => x.tag === pnum.tag);
      await smoke("typeText", { text: "See " });
      if (n0) await connector.request("insertReference", { bookmark: n0.bookmark, numberOnly: false }, SLOW);
      await smoke("typeText", { text: " for the force." });
      const tags = [pin.tag, pdisp.tag, pnum.tag];
      const before = await snap();
      const frames0 = await Promise.all(tags.map(async (t) => (await smoke("pictureInfo", { tag: t })).frame));
      check("before Repair: the three equations are Classic pictures", frames0.every((f) => f === "legacy" || f === "modern"), frames0.join(", "));
      // Diagnosis: which call ends an undo record (each alone in a fresh record; nothing is changed).
      const probe = (await smoke("undoProbe", { tag: pin.tag }).catch((e) => ({ error: String(e) }))) as Record<string, string>;
      check("undo probe: calls that end Word's undo record", null, Object.entries(probe).map(([k, v]) => `${k}: ${v}`).join("; "));
      const { repairDocument } = await import("./repair");
      const rep = await repairDocument(undefined, { quiet: true });
      const front = (await smoke("activeName")).name as string;
      check("Repair leaves its document in front (another open document does not come forward)", front === docR.name, `in front: ${front}, repaired: ${docR.name}`);
      if (front !== docR.name) await smoke("activate", { name: docR.name });
      const after = await snap();
      const frames = await Promise.all(tags.map(async (t) => (await smoke("pictureInfo", { tag: t }).catch(() => ({ frame: "missing" }))).frame));
      check("Repair converts every Classic picture to an embedded object, same ID", frames.every((f) => f === "object"), frames.join(", "));
      check("Repair reports counts and time", !!rep && rep.toObjects === 3, rep ? `converted ${rep.toObjects}, redrawn ${rep.redrawn}, ${rep.ms} ms${rep.backup ? `, backup ${rep.backup}` : ""}` : "no report");
      check("Repair keeps the text around the equations", before.plain === after.plain, before.plain === after.plain ? "" : `before ${JSON.stringify(before.plain.slice(0, 120))}, after ${JSON.stringify(after.plain.slice(0, 120))}`);
      const list1 = await connector.request("listNumbered", {}, SLOW);
      const n1 = list1.equations.find((x) => x.tag === pnum.tag);
      check("Repair keeps the number and its bookmark on the same equation", !!n0 && !!n1 && n1.number === n0.number && n1.bookmark === n0.bookmark, `before ${n0?.number} ${n0?.bookmark}, after ${n1?.number} ${n1?.bookmark}`);
      const refs = n1 ? ((await smoke("refResults", { bookmark: n1.bookmark })).results as string[]) : [];
      check("the reference still shows that number", !!n1 && refs.length > 0 && refs.every((t) => t.replace(/\s/g, "") === n1.number.replace(/\s/g, "")), JSON.stringify(refs));
      // One Ctrl+Z brings the pictures back; Ctrl+Y converts again.
      check("Word kept Repair in one undo record", rep ? !rep.undoBrokenAt : null, rep?.undoBrokenAt ? `record closed early at: ${rep.undoBrokenAt}` : "intact");
      const framesNow = async () => Promise.all(tags.map(async (t) => (await smoke("pictureInfo", { tag: t }).catch(() => ({ frame: "missing" }))).frame));
      const isPictures = (fs: string[]) => fs.every((f) => f === "legacy" || f === "modern");
      await smoke("undo", { times: 1 });
      const undone = await framesNow();
      check("one Ctrl+Z undoes the whole Repair", isPictures(undone) && (await snap()).plain === before.plain, undone.join(", "));
      // Diagnosis: how many Ctrl+Z it takes when one is not enough.
      let undoSteps = 1;
      if (!isPictures(undone)) {
        while (undoSteps < 12 && !isPictures(await framesNow())) {
          await smoke("undo", { times: 1 });
          undoSteps++;
        }
        check("Ctrl+Z steps needed to undo Repair", null, isPictures(await framesNow()) ? `${undoSteps}` : `more than ${undoSteps}`);
      }
      await smoke("redo", { times: undoSteps });
      const redone = await Promise.all(tags.map(async (t) => (await smoke("pictureInfo", { tag: t }).catch(() => ({ frame: "missing" }))).frame));
      check("Ctrl+Y redoes the Repair", null, redone.join(", "));
      if (!redone.every((f) => f === "object")) await repairDocument(undefined, { quiet: true });
      // Converting twice changes nothing (on this document: it is brought to the front first).
      const frontR = (await smoke("activeName")).name as string;
      if (frontR !== docR.name) check("another document came to the front during the Repair test", null, `in front: ${frontR}; ${docR.name} brought back`);
      await smoke("activate", { name: docR.name });
      const again = await snap();
      const rep2 = await repairDocument(undefined, { quiet: true });
      const after2 = await snap();
      check("a second Repair changes nothing", !!rep2 && rep2.toObjects === 0 && rep2.redrawn === 0 && after2.text === again.text, rep2 ? `converted ${rep2.toObjects}, redrawn ${rep2.redrawn}, lowered ${rep2.lowered}, renamed ${rep2.renamed}` : "no report");
      // A numbered equation paragraph that lost its style and tab stops (what an earlier Convert MathType
      // left): Repair gives them back, so the number is at the right margin again.
      const { buildObjectInsertion } = await import("./equation");
      const lost = await buildObjectInsertion("E=mc^2", false, undefined, true, { keepParagraph: true, mode: "numbered" });
      await smoke("activate", { name: docR.name });
      const made = await smoke("makeEquationParagraph", { flatOpc: lost.flatOpc, withoutTabs: true, numberField: true });
      const l0 = await smoke("paraInfo", { pos: made.start });
      const rep3 = await repairDocument(undefined, { quiet: true });
      const l1 = await smoke("paraInfo", { pos: made.start });
      check("Repair restores a numbered equation paragraph's lost style / tab stops", !!rep3 && rep3.styled >= 1 && (l1.tabs as string[]).length >= 2, `styled ${rep3?.styled}; before [${l0.tabs}] number at ${Number(l0.numberEnd).toFixed(1)}, after ${l1.style} [${l1.tabs}]`);
      check("after Repair the number ends at the right margin again", Math.abs(Number(l1.numberEnd) - Number(l1.textRight)) < 3, `number ends at ${Number(l1.numberEnd).toFixed(1)} pt, right margin ${Number(l1.textRight).toFixed(1)} pt`);
      await smoke("save", { file: "repair test.docx" });
    });

    // ------------------------------------------------------------ save
    section = "Window activations";
    {
      await takeActivations();
      const outside = activationLog.filter((a) => !a.during.startsWith("smoke"));
      check("windows that came forward not by a self-test step", null, describeActivations(outside));
    }

    section = "Every palette entry in Word, checked as it prints (inline and display, PDF)";
    await step("print check", async () => {
      const { printEntries, printParagraphs } = await import("./printCheck");
      const { analysePrint, contactSheet } = await import("./printCheckPdf");
      const { interchangeDocx } = await import("./interchangeFixture");
      const { toBase64, loadFonts, classicStyle } = await import("./render");
      const { activeStyle } = await import("./docStyle");
      const { renderTile, SYMBOL_CELL, STRUCTURE_CELL } = await import("./tiles");
      const entries = printEntries();
      const docP = await smoke("openDocx", { file: "print check.docx", base64: toBase64(interchangeDocx(printParagraphs(entries))) });
      const { convertLatexDocument } = await import("./latexInterchangeRun");
      const t0 = performance.now();
      const r = await convertLatexDocument({ yes: true });
      check(`Convert LaTeX wrote every entry inline and as a display equation (${entries.length} entries)`, !!r && r.equations === 2 * entries.length && r.failed.length === 0, r ? `${r.equations} equation(s), ${r.failed.length} not written${r.failed.length ? `: ${r.failed.slice(0, 5).map((f) => `${f.what}: ${f.problem}`).join("; ")}` : ""}; ${Math.round((performance.now() - t0) / 1000)} s` : "did not run");
      await smoke("save", { file: "print check.docx" });
      const pdf = (await smoke("exportPdf", { file: "print check.pdf" })) as { path: string; pages: number };
      const bytes = Uint8Array.from(atob(((await smoke("readFile", { file: "print check.pdf" })) as { base64: string }).base64), (c) => c.charCodeAt(0));
      const fonts = await loadFonts();
      const save = async (file: string, dataUrl: string) => void (await smoke("writeFile", { file, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) }));
      const { rows, pages } = await analysePrint(bytes, entries, { fonts, style: classicStyle(), mathStyle: activeStyle(), sizePt: activeStyle().sizePt, save });
      for (const row of rows) {
        const cell = /\\begin|\\frac|\\sqrt|\\sum|\\int|\\prod|\\lim|\\left|\\over|\\under|[_^]/.test(row.entry.latex) ? STRUCTURE_CELL : SYMBOL_CELL;
        try {
          row.tile = renderTile(row.entry.latex, cell, { fonts, style: classicStyle(), mathStyle: activeStyle() }).svg;
        } catch {
          row.tile = "";
        }
      }
      const sheet = contactSheet(rows, `MathBlocks print check — ${new Date().toLocaleString()}`);
      await smoke("writeFile", { file: "print/contact-sheet.html", text: sheet });
      check("PDF rendered to page images (print/page-NNN.png) and the contact sheet written (print/contact-sheet.html)", pages > 0, `${pages} page(s); ${pdf.path}`);
      const flagged = rows.filter((x) => x.inline.flags.length || x.display.flags.length);
      const count = (f: string) => rows.filter((x) => x.inline.flags.includes(f as never) || x.display.flags.includes(f as never)).length;
      for (const f of ["not converted", "empty", "missing glyph", "clipped", "touches its neighbours", "off the baseline", "different size"]) check(`entries flagged “${f}”`, null, String(count(f)));
      check(
        "every palette entry printed faithfully (no flags; see print/contact-sheet.html)",
        flagged.length === 0,
        flagged
          .slice(0, 25)
          .map((x) => `${x.entry.name} [${[...new Set([...x.inline.flags.map((f) => `inline ${f}`), ...x.display.flags.map((f) => `display ${f}`)])].join(", ")}]`)
          .join(" | ") || "none flagged",
      );
      // The square root, as MathType draws it: Symbol's radical and its extender bar.
      const root = rows.find((x) => x.entry.latex === "\\sqrt{x}" || x.entry.latex.startsWith("\\sqrt{"));
      if (root) check("square root printed (inline and display) without flags", !root.inline.flags.length && !root.display.flags.length, [...root.inline.flags, ...root.display.flags].join(", ") || "ok");
      void docP;
    });

    section = "Palette tiles: drawn by math-render in the document style, on this PC's fonts";
    await step("palette tiles", async () => {
      const { ALL_ITEMS, GROUPS } = await import("./palette");
      const { renderTile, SYMBOL_CELL, STRUCTURE_CELL, LARGE_CELL, ICON_CELL } = await import("./tiles");
      const { loadFonts, classicStyle } = await import("./render");
      const { activeStyle } = await import("./docStyle");
      const fonts = await loadFonts();
      const t0 = performance.now();
      const failed: string[] = [];
      let enlarged = 0;
      let wrongSize = 0;
      let colored = 0;
      for (const x of ALL_ITEMS) {
        const cell = x.item.glyph ? SYMBOL_CELL : x.group.row === "tabs" ? LARGE_CELL : STRUCTURE_CELL;
        try {
          const t = renderTile(x.item.latex, cell, { fonts, style: classicStyle(), mathStyle: activeStyle() });
          if (t.scale > 1) enlarged++;
          if (!t.svg.includes(`viewBox="0 0 ${cell.w} ${cell.h}"`)) wrongSize++;
          if (/fill="#|stroke="#/.test(t.svg)) colored++;
        } catch (e) {
          failed.push(`${x.item.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      for (const g of GROUPS) {
        try {
          renderTile(g.iconTex ? g.icon : g.icon.trim().split(/\s+/).join("\\,"), ICON_CELL, { fonts, style: classicStyle(), mathStyle: activeStyle() });
        } catch (e) {
          failed.push(`group ${g.label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const ms = performance.now() - t0;
      check(`every palette entry draws (${ALL_ITEMS.length} entries, ${GROUPS.length} group buttons)`, failed.length === 0, failed.slice(0, 8).join(" | ") || "all drawn");
      check("every tile has its cell's size, is never enlarged, and is drawn in currentColor (follows light/dark)", enlarged === 0 && wrongSize === 0 && colored === 0, `${enlarged} enlarged, ${wrongSize} wrong size, ${colored} with a fixed colour`);
      check("time to draw the whole palette once (then cached until the style changes)", null, `${Math.round(ms)} ms, ${(ms / ALL_ITEMS.length).toFixed(2)} ms per tile; fonts: ${fonts.regular === fonts.math ? "STIX (Times New Roman not found)" : "Times New Roman"}${fonts.symbol ? " + Symbol" : ""}`);
    });

    section = "Visual comparison with MathType (a document you choose; it stays on this PC)";
    await step("mathtype comparison", async () => {
      if (!(await import("./connector")).isDesktop()) return check("comparison with MathType", null, "desktop only");
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ title: "Visual comparison: choose a Word document with MathType equations (Cancel to skip)", multiple: false, filters: [{ name: "Word document", extensions: ["docx", "docm"] }] });
      if (!picked || Array.isArray(picked)) return check("comparison with MathType", null, "skipped (no document chosen)");
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = new Uint8Array(await invoke<ArrayBuffer>("document_read", { path: picked }));
      const { mathTypeSamples, readWmf } = await import("@mathblocks/mathtype");
      const { CATEGORIES, categoryOf, compareDrawings, compareReport, mathTypeSizePt, ourDrawing, wmfToSvg } = await import("./mtCompare");
      const { loadFonts, classicStyle } = await import("./render");
      const { activeStyle } = await import("./docStyle");
      const fonts = await loadFonts();
      const samples = mathTypeSamples(bytes);
      const rows: import("./mtCompare").CompareRow[] = [];
      const t0 = performance.now();
      for (const sm of samples) {
        if (!sm.latex?.trim()) {
          rows.push({ sample: sm, category: "spacing", sizePt: null, result: null, problem: "empty equation" });
          continue;
        }
        if (!sm.picture || sm.pictureType !== "wmf") {
          rows.push({ sample: sm, category: categoryOf(sm.latex), sizePt: null, result: null, problem: `preview picture: ${sm.pictureType ?? "none"}` });
          continue;
        }
        try {
          const wmf = readWmf(sm.picture);
          const sizePt = mathTypeSizePt(wmf, sm.heightPt) ?? activeStyle().sizePt;
          const mt = { svg: wmfToSvg(wmf, fonts, sm.widthPt, sm.heightPt), widthPt: sm.widthPt, heightPt: sm.heightPt, depthPt: sm.depthPt };
          const ours = ourDrawing(sm.latex, sm.display, { fonts, style: classicStyle(), mathStyle: activeStyle(), sizePt });
          rows.push({ sample: sm, category: categoryOf(sm.latex), sizePt, result: await compareDrawings(mt, ours) });
        } catch (e) {
          rows.push({ sample: sm, category: categoryOf(sm.latex), sizePt: null, result: null, problem: e instanceof Error ? e.message : String(e) });
        }
      }
      const scored = rows.filter((r) => r.result);
      await smoke("writeFile", { file: "mathtype-compare/report.html", text: compareReport(rows, `MathBlocks vs MathType — ${new Date().toLocaleString()}`) });
      check(`compared ${scored.length} of ${samples.length} MathType equation(s); report written (mathtype-compare/report.html)`, scored.length > 0 || samples.length === 0, `${Math.round((performance.now() - t0) / 1000)} s; skipped: ${rows.length - scored.length}`);
      // Only scores here (no equations): the report with the pictures stays in the folder.
      const mean = (l: typeof scored) => (l.length ? (l.reduce((x, r) => x + r.result!.score, 0) / l.length).toFixed(1) : "—");
      check("overall mean difference score (0 = identical, 100 = nothing in common)", null, `${mean(scored)} over ${scored.length}`);
      for (const c of CATEGORIES) {
        const l = scored.filter((r) => r.category === c.id);
        if (l.length) check(`category “${c.label}”: mean score`, null, `${mean(l)} (${l.length} equation(s); worst ${Math.max(...l.map((r) => r.result!.score))})`);
      }
    });

    section = "Saved test documents";
    const a = await step("save A", () => smoke("save", { file: "self-test A.docx" }));
    await smoke("activate", { name: docB.name });
    const b = await step("save B", () => smoke("save", { file: "self-test B.docx" }));
    check("test documents saved", !!a && !!b, [a?.path, b?.path].filter(Boolean).join(" ; "));

    // ------------------------------------------------------------ embedded-object spike (test documents only)
    if (o.spike) {
      const { runObjectSpike } = await import("./selfTestSpike");
      await runObjectSpike({
        smoke,
        check,
        setSection: (x) => (section = x),
        step,
        insertPicture: (latex, display) => insert(latex, display),
        insertPackage: async (flatOpc, tag, display) => connector.request("insertEquation", { flatOpc, tag, display, undoLabel: "Insert equation" }, SLOW),
        insertReference: (bookmark) => connector.request("insertReference", { bookmark, numberOnly: false }, SLOW),
      }).catch((e) => {
        check("the spike stopped early", false, `in "${section}": ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  } catch (e) {
    // Whatever stops the run, the report is still written with everything checked so far.
    check("the self-test stopped early", false, `in "${section}": ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    // Every document the test opened is saved in the test folder and closed (the user's stay open).
    closedDocs = (await smoke("closeTestDocuments").catch(() => null)) as typeof closedDocs;
    await smoke("end").catch(() => undefined);
  }

  const fails = checks.filter((c) => c.status === "FAIL").length;
  const count = (list: Check[]) => `${list.length} checks: ${list.filter((c) => c.status === "PASS").length} passed, ${list.filter((c) => c.status === "FAIL").length} failed, ${list.filter((c) => c.status === "INFO").length} for information`;
  const main = checks.filter((c) => !c.section.startsWith("Spike"));
  const spike = checks.filter((c) => c.section.startsWith("Spike"));
  lines.push(
    `MathBlocks Word self-test — ${new Date().toLocaleString()}`,
    `MathBlocks app ${appVersion}; Word add-in ${begin.addin ?? "unknown (older add-in)"}`,
    `Word ${begin.word}; look ${useApp.getState().look}; equation size ${useApp.getState().equationSizePt} pt; Word's smart cut and paste ${begin.smartCutPaste ? "on (turned off during the test, restored after)" : "off"}`,
    `Current design (pictures): ${count(main)}`,
    ...(spike.length ? [`Embedded-object spike: ${count(spike)}`] : []),
    closedDocs ? `Test documents: ${(closedDocs as { closed: number }).closed} saved in this folder and closed` : "Test documents: not closed (older add-in, or Word refused)",
    "",
  );
  let last = "";
  for (const c of checks) {
    if (c.section !== last) {
      lines.push("", `== ${c.section}`);
      last = c.section;
    }
    lines.push(`${c.status}  ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
  }
  const { SPIKE_MANUAL_CHECKS } = await import("./selfTestSpike");
  lines.push("", "== Manual checks (Word's object model cannot do these)", ...MANUAL_CHECKS.map((m) => `[ ]  ${m}`), ...(o.spike ? SPIKE_MANUAL_CHECKS.map((m) => `[ ]  ${m}`) : []));
  const report = lines.join("\n") + "\n";
  const written = await smoke("writeReport", { text: report, show: true }).catch(() => null);
  if (!written) {
    // Word could not write it (stuck on a dialog?): the report goes to the clipboard instead.
    await navigator.clipboard?.writeText(report).catch(() => undefined);
    app.notify("Word self-test: Word could not save report.txt — the report is on the clipboard; paste it into a text file and send it.", "error");
    return report;
  }
  app.notify(`Word self-test: ${fails === 0 ? "all checks passed" : `${fails} check(s) failed`}. Report: ${written?.path ?? begin.folder}`, fails ? "error" : "info");
  return report;
}

/** Where two texts first differ (for the report). */
function diffHint(a: string, b: string): string {
  if (a === b) return "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const show = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 20), i + 40));
  return `first difference at ${i}: before ${show(a)}, after ${show(b)}`;
}
