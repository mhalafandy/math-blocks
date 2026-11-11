import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { addinSupports, connector } from "./connector";
import { buildInsertion, buildPictureInsertion, currentProfile } from "./equation";
import { numberFormat } from "./numbering";
import { readEquationXml } from "./readEquation";
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
  "Right-click a Classic equation (now an embedded object): only the floating editor opens on it, no Word menu; edit it and Apply — it stays an object (simple frame) with the new content.",
  "Right-click a native Word equation: only the floating editor, no Word menu.",
  "Double-click a Classic equation: MathBlocks opens it for editing (no prompt); Update in Word replaces it, still an object.",
  "Drag an equation with the mouse to another line, then to another document: only the equation moves; no other text changes; Ctrl+Z restores.",
  "Home → Paste → Paste Special → 'Picture (PNG)' (the self-test can only paste a bitmap, the nearest the object model offers).",
  "Look: inline α, β, γ, f, p and a fraction sit on the text baseline at 100 % and 200 % zoom, and in print.",
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
  /** Undo until the document's text equals `target` again (at most 4 steps); returns the steps used, or -1. */
  const undoTo = async (target: string) => {
    for (let n = 1; n <= 4; n++) {
      await smoke("undo", { times: 1 });
      if ((await snap()).text === target) return n;
    }
    return -1;
  };
  const begin = await smoke("begin");
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
      await smoke("newDocument");
      await smoke("typeText", { text: "Convert MathType test." });
      const { buildMathTypeControlInsertion } = await import("./equation");
      const made = await smoke("makeEquationParagraph", { flatOpc: await buildMathTypeControlInsertion(), number: "(1)" });
      const p0 = await smoke("paraInfo", { pos: made.start });
      const { convertOpenDocument } = await import("./convertMathType");
      await convertOpenDocument(undefined, { quiet: true });
      const p1 = await smoke("paraInfo", { pos: made.start });
      check("the MathType equation became a MathBlocks object", /MathBlocks\.Equation/.test(String(p1.equationKind)), `before ${p0.equationKind}, after ${p1.equationKind}`);
      check("the paragraph keeps its style, alignment and tab stops", p1.style === p0.style && p1.alignment === p0.alignment && JSON.stringify(p1.tabs) === JSON.stringify(p0.tabs), `before ${p0.style} ${p0.alignment} [${p0.tabs}], after ${p1.style} ${p1.alignment} [${p1.tabs}]`);
      check("the number ends at the right margin", Math.abs(Number(p1.numberEnd) - Number(p1.textRight)) < 3, `number ends at ${Number(p1.numberEnd).toFixed(1)} pt, right margin ${Number(p1.textRight).toFixed(1)} pt`);
      check("the equation is centred on the text width", Math.abs(Number(p1.equationCenter) - Number(p1.textCenter)) < 3, `equation centre ${Number(p1.equationCenter).toFixed(1)} pt, text centre ${Number(p1.textCenter).toFixed(1)} pt`);
    });

    // ------------------------------------------------------------ Repair converts Classic pictures to objects
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
      const { repairDocument } = await import("./repair");
      const rep = await repairDocument(undefined, { quiet: true });
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
      await smoke("undo", { times: 1 });
      const undone = await Promise.all(tags.map(async (t) => (await smoke("pictureInfo", { tag: t }).catch(() => ({ frame: "missing" }))).frame));
      check("one Ctrl+Z undoes the whole Repair", undone.every((f) => f === "legacy" || f === "modern") && (await snap()).plain === before.plain, undone.join(", "));
      await smoke("redo", { times: 1 });
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
      void docR;
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
