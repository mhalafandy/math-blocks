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
    const numbers = (await connector.request("listNumbered", {}, SLOW).catch(() => ({ equations: [] as { number: string }[] }))).equations.map((e) => e.number).join(" ");
    return `${s.text}\n§${eqs.sort().join("|")}\n#${numbers}`;
  };
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
      check("MathType's bookmarks now carry the new numbers", (await shows("ZEqnNum100001")) === "(A.1.1)" && (await shows("ZEqnNum100003")) === "(A.1.3)", `ZEqnNum100001 ${await shows("ZEqnNum100001")}, ZEqnNum100003 ${await shows("ZEqnNum100003")}`);
      const refs = async (bm: string) => (await smoke("refResults", { bookmark: bm })).results as string[];
      const old1 = await refs("ZEqnNum100001");
      const old3 = await refs("ZEqnNum100003");
      check("MathType's references follow their equations", old1.length === 1 && old1[0] === "(A.1.1)" && old3.length === 1 && old3[0] === "(A.1.3)", `to (A.1): ${JSON.stringify(old1)}, to (A.3): ${JSON.stringify(old3)}`);
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
      const r13 = await refs("ZEqnNum100003");
      const r11n = await refs("ZEqnNum100001N");
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
      const r1 = (await smoke("refResults", { bookmark: "ZEqnNum100001" })).results as string[];
      check("keep: references unchanged", r1.length === 1 && r1[0] === "(A.1)", JSON.stringify(r1));
      await smoke("save", { file: "numbering keep test (converted).docx" });
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
      // Converting twice changes nothing.
      const again = await snap();
      const rep2 = await repairDocument(undefined, { quiet: true });
      const after2 = await snap();
      check("a second Repair changes nothing", !!rep2 && rep2.toObjects === 0 && rep2.redrawn === 0 && after2.text === again.text, rep2 ? `converted ${rep2.toObjects}, redrawn ${rep2.redrawn}, lowered ${rep2.lowered}, renamed ${rep2.renamed}` : "no report");
      // A numbered equation paragraph that lost its style and tab stops (what an earlier Convert MathType
      // left): Repair gives them back, so the number is at the right margin again.
      const { buildObjectInsertion } = await import("./equation");
      const lost = await buildObjectInsertion("E=mc^2", false, undefined, true, { keepParagraph: true, mode: "numbered" });
      const made = await smoke("makeEquationParagraph", { flatOpc: lost.flatOpc, withoutTabs: true, numberField: true });
      const l0 = await smoke("paraInfo", { pos: made.start });
      const rep3 = await repairDocument(undefined, { quiet: true });
      const l1 = await smoke("paraInfo", { pos: made.start });
      check("Repair restores a numbered equation paragraph's lost style / tab stops", !!rep3 && rep3.styled >= 1 && (l1.tabs as string[]).length >= 2, `styled ${rep3?.styled}; before [${l0.tabs}] number at ${Number(l0.numberEnd).toFixed(1)}, after ${l1.style} [${l1.tabs}]`);
      check("after Repair the number ends at the right margin again", Math.abs(Number(l1.numberEnd) - Number(l1.textRight)) < 3, `number ends at ${Number(l1.numberEnd).toFixed(1)} pt, right margin ${Number(l1.textRight).toFixed(1)} pt`);
      await smoke("save", { file: "repair test.docx" });
    });

    // ------------------------------------------------------------ save
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
