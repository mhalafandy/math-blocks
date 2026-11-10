import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { buildObjectInsertion, MB_OBJECT_PROGID, readObjectData, type ObjectData } from "./equation";

/**
 * Embedded-object spike, part of the Word self-test: a Classic equation stored as an embedded OLE
 * object "MathBlocks.Equation.1" (as MathType stores its equations), in the self-test's own new
 * documents only. Tries every insertion route, then checks what Word keeps through paste, cut, move,
 * delete, undo/redo, numbering, save/reopen and PDF, and the file size against pictures.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

export interface SpikeContext {
  smoke: (op: string, params?: R) => Promise<R>;
  check: (name: string, ok: boolean | null, detail?: string) => void;
  setSection: (s: string) => void;
  step: <T>(name: string, run: () => Promise<T>) => Promise<T | undefined>;
  insertPicture: (latex: string, display: boolean) => Promise<{ tag: string; found: number }>;
  insertReference: (bookmark: string) => Promise<{ text: string }>;
}

export const SPIKE_MANUAL_CHECKS = [
  "Spike: open 'spike O.docx' (saved by the self-test). Click a MathBlocks object: the simple frame (like a MathType equation), no rotate handle, no Picture Format tab.",
  "Spike: double-click a MathBlocks object: no security prompt; MathBlocks shows that equation (read-only in the spike). Note any dialog Word shows.",
  "Spike: right-click a MathBlocks object: the add-in asks Word not to show its menu. Did a menu appear? Which one (its first items)?",
  "Spike: while opening 'spike O.docx' and while the self-test inserted objects: did Word show any warning, prompt or yellow bar (Protected View, 'This document contains objects…', ActiveX)?",
  "Spike: File → Options → Add-ins → COM Add-ins → untick MathBlocks, restart Word, open 'spike O.docx': the equations still show; double-click one and note Word's message. Then tick MathBlocks again.",
  "Spike: open 'spike O.pdf': the equations are sharp vector pictures at the right size and baseline.",
  "Spike (optional): upload 'spike O.docx' to Word on the web: the equations show as pictures.",
];

const norm = (l: string) => serializeLatex(parseLatex(l).root);
const ROUTES = ["insertXml", "insertFileXml", "insertFileDocx", "clipboard"] as const;
const PASTES = ["ctrlV", "keepSource", "merge", "pictureEmf", "picturePng", "keepTextOnly"] as const;

export async function runObjectSpike(c: SpikeContext) {
  const { smoke, check, step } = c;
  const snap = () => smoke("snapshot") as Promise<{ text: string; tags: string[] }>;
  const without = (text: string, tags: string[]) => tags.reduce((t, tag) => t.split(`⟦${tag}⟧`).join(""), text);
  const undoTo = async (target: string) => {
    for (let n = 1; n <= 4; n++) {
      await smoke("undo", { times: 1 });
      if ((await snap()).text === target) return n;
    }
    return -1;
  };
  /** An object's own data, checked against what was written. */
  const dataOk = (d: ObjectData | null, latex: string, tag?: string) =>
    !!d && norm(d.latex) === norm(latex) && (!tag || d.tag === tag) && typeof d.depthPt === "number" && !!d.mode && !!d.style;

  // ------------------------------------------------------------ insertion routes
  c.setSection("Spike: inserting a MathBlocks object (each route Word offers)");
  const docO = await smoke("newDocument");
  await smoke("typeText", { text: "Embedded-object spike." });
  await smoke("newParagraph");
  let route: string | null = null;
  for (const r of ROUTES) {
    await step(`route ${r}`, async () => {
      await smoke("caretTo", { where: "end" });
      await smoke("typeText", { text: `Route ${r}: ` });
      const b = await buildObjectInsertion("\\beta", false);
      const res = await smoke("insertRoute", { route: r, flatOpc: b.flatOpc });
      const info = await smoke("objectInfo", { tag: b.tag });
      const accepted = info.count === 1 && info.objectElement === true;
      check(`${r}: Word accepts the object`, accepted, `objects added ${res.objectsAdded}, inline shapes added ${res.picturesAdded}${res.error ? `, error: ${res.error}` : ""}; kind ${info.kind ?? "-"}, ProgID ${info.progId ?? "-"}, <w:object> ${info.objectElement ?? "-"}`);
      if (accepted && !route) route = r;
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
    });
  }
  check("an insertion route works", route !== null, route ? `using ${route} for the rest of the spike` : "Word refused the object by every route → fall back to pictures");
  if (!route) return { docO };
  const insertObject = async (latex: string, display: boolean) => {
    const b = await buildObjectInsertion(latex, display);
    await smoke("insertRoute", { route, flatOpc: b.flatOpc });
    return b;
  };

  // ------------------------------------------------------------ the object as Word holds it
  c.setSection("Spike: the object in Word (frame, baseline, data)");
  const objs: { latex: string; tag: string; data: ObjectData }[] = [];
  for (const latex of ["\\alpha", "\\beta", "\\gamma", "f", "p", "\\frac{a}{b}"]) {
    await step(`object ${latex}`, async () => {
      await smoke("caretTo", { where: "end" });
      await smoke("typeText", { text: `Object ${latex}: ` });
      const b = await insertObject(latex, false);
      await smoke("caretTo", { where: "after", tag: b.tag });
      await smoke("idle"); // what the add-in does when the caret rests after an equation
      await smoke("typeText", { text: " words after" });
      const info = await smoke("objectInfo", { tag: b.tag });
      check(`${latex}: an embedded object (simple frame), in line`, info.count === 1 && info.objectElement && info.oleObject && info.vml && !info.drawingml && info.kind === "wdInlineShapeEmbeddedOLEObject", `kind ${info.kind}, <w:object> ${info.objectElement}, VML ${info.vml}, DrawingML ${info.drawingml}, ProgID ${info.progId}`);
      check(`${latex}: run lowered by its depth`, Math.round(info.positionPt) === -Math.round(b.data.depthPt), `run ${info.positionPt} pt, depth ${b.data.depthPt} pt`);
      check(`${latex}: text after it sits on the line`, Math.round(info.nextPositionPt) === 0, `next "${info.nextText}" at ${info.nextPositionPt} pt (typed with the caret placed after the object)`);
      check(`${latex}: size as drawn`, Math.abs(info.widthPt - b.data.widthPt) < 0.6 && Math.abs(info.heightPt - b.data.heightPt) < 0.6, `${info.widthPt}×${info.heightPt} pt, drawn ${b.data.widthPt}×${b.data.heightPt}`);
      const d = await readObjectData(info.embedding);
      check(`${latex}: the object's own data holds LaTeX, ID, mode, depth and style`, dataOk(d, latex, b.tag), d ? `latex ${d.latex}, ID ${d.tag}, mode ${d.mode}, depth ${d.depthPt}, style ${d.style}` : "no data read from the object");
      check(`${latex}: the presentation picture is our EMF`, info.emf === true, `EMF ${info.emf}, WMF ${info.wmf}, PNG ${info.png}`);
      objs.push({ latex, tag: b.tag, data: b.data });
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
    });
  }
  const one = objs[1];
  if (!one) return { docO };

  // ------------------------------------------------------------ paste
  c.setSection("Spike: copy and paste the object (within and between documents)");
  const pasteCheck = async (mode: string, label: string, sourceTag: string) => {
    const r = await smoke("paste", { mode });
    const d = r.isObject ? await readObjectData(r.embedding) : null;
    const orig = await smoke("objectInfo", { tag: sourceTag });
    const same = r.isObject && r.objectElement && r.progId === MB_OBJECT_PROGID && Math.abs(r.widthPt - orig.widthPt) < 0.3 && Math.abs(r.heightPt - orig.heightPt) < 0.3 && Math.round(r.positionPt) === Math.round(orig.positionPt) && dataOk(d, one.latex);
    const strict = mode === "ctrlV" || mode === "keepSource" || mode === "merge";
    check(
      `${label} ${mode}: still a MathBlocks object, same frame, lowering and data`,
      same ? true : strict ? false : null,
      `object ${r.isObject ? "yes" : "no"}${r.error ? ` (${r.error})` : ""}, kind ${r.kind ?? "-"}, ProgID ${r.progId ?? "-"}, size ${r.widthPt ?? "-"}×${r.heightPt ?? "-"} (orig ${orig.widthPt}×${orig.heightPt}), lowering ${r.positionPt ?? "-"} (orig ${orig.positionPt}), data ${d ? `${d.latex} / ${d.tag}` : "none"}, picture ${r.picture ? `VML ${r.vml} DrawingML ${r.drawingml}` : "none"}`,
    );
    return r;
  };
  for (const mode of PASTES) {
    await step(`object paste ${mode}`, async () => {
      await smoke("caretTo", { where: "end" });
      await smoke("typeText", { text: `Paste ${mode}: ` });
      const pre = await snap();
      await smoke("copy", { tag: one.tag });
      await smoke("caretTo", { where: "end" });
      const pr = await pasteCheck(mode, "same document", one.tag);
      if ((await snap()).text === pre.text) check(`same document ${mode}: nothing was pasted, nothing to undo`, null, pr.error ?? "");
      else {
        const steps = await undoTo(pre.text);
        check(`same document ${mode}: Ctrl+Z removes the paste`, steps > 0, steps > 0 ? `${steps} undo step(s)` : "not restored in 4 steps");
      }
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
    });
  }
  const docP = await smoke("newDocument");
  await smoke("typeText", { text: "Spike: pasted from the object document." });
  await smoke("newParagraph");
  for (const mode of PASTES.filter((m) => m !== "keepTextOnly")) {
    await step(`object A → B ${mode}`, async () => {
      await smoke("copy", { tag: one.tag, name: docO.name });
      await smoke("caretTo", { where: "end", name: docP.name });
      const r = await smoke("paste", { mode, name: docP.name });
      const d = r.isObject ? await readObjectData(r.embedding) : null;
      check(`into another document ${mode}: still a MathBlocks object with its data`, r.isObject && dataOk(d, one.latex) ? true : mode === "ctrlV" || mode === "keepSource" || mode === "merge" ? false : null, `object ${r.isObject ? "yes" : "no"}, data ${d ? d.latex : "none"}`);
      await smoke("newParagraph", { name: docP.name });
      if (mode === "ctrlV" && r.isObject && r.objectTag) {
        await smoke("copy", { tag: r.objectTag, name: docP.name });
        await smoke("caretTo", { where: "end", name: docO.name });
        const back = await smoke("paste", { mode: "ctrlV", name: docO.name });
        const db = back.isObject ? await readObjectData(back.embedding) : null;
        check("back into the first document Ctrl+V: still a MathBlocks object with its data", back.isObject && dataOk(db, one.latex), `object ${back.isObject ? "yes" : "no"}`);
        await smoke("newParagraph", { name: docO.name });
      }
    });
  }
  await smoke("activate", { name: docO.name });

  // ------------------------------------------------------------ cut, move, delete, undo, redo
  c.setSection("Spike: cut, move, delete, undo and redo");
  const mv = objs[2];
  if (mv) {
    const objKey = `obj:${mv.tag}`;
    await step("object cut/paste", async () => {
      const before = await snap();
      await smoke("cut", { tag: mv.tag });
      await smoke("caretTo", { where: "end" });
      const r = await smoke("paste", { mode: "ctrlV" });
      const after = await snap();
      check("cut/paste: still the same object (data and ID)", r.isObject && r.objectTag === mv.tag, `object ${r.isObject}, ID ${r.objectTag}`);
      check("cut/paste: no other text changed", without(before.text, before.tags) === without(after.text, after.tags), "");
      const steps = await undoTo(before.text);
      check("cut/paste: Ctrl+Z restores", steps > 0, `${steps} step(s)`);
    });
    await step("object move", async () => {
      const target = objs[0];
      if (!target) return;
      const before = await snap();
      const to = (await smoke("caretTo", { where: "paragraphStart", tag: target.tag })).caret as number;
      await smoke("moveFormatted", { tag: mv.tag, to });
      const after = await snap();
      check("move: the object keeps its ID and data", after.tags.filter((t) => t === objKey).length === 1, `${after.tags.filter((t) => t === objKey).length} with its ID`);
      check("move: no other text changed", without(before.text, before.tags) === without(after.text, after.tags), "");
      const steps = await undoTo(before.text);
      check("move: Ctrl+Z restores", steps > 0, `${steps} step(s)`);
    });
    await step("object delete / undo / redo", async () => {
      const before = await snap();
      await smoke("delete", { tag: mv.tag });
      const gone = await snap();
      check("delete removes the object completely", !gone.tags.includes(objKey) && without(before.text, before.tags) === without(gone.text, gone.tags), "");
      await smoke("undo", { times: 1 });
      const back = await snap();
      check("Ctrl+Z brings it back with its data", back.text === before.text && (await readObjectData((await smoke("objectInfo", { tag: mv.tag })).embedding))?.tag === mv.tag, "");
      await smoke("redo", { times: 1 });
      check("Ctrl+Y deletes it again", !(await snap()).tags.includes(objKey), "");
      await smoke("undo", { times: 1 });
    });
  }

  // ------------------------------------------------------------ numbering and a reference
  c.setSection("Spike: numbering and a reference next to the object");
  await step("number next to an object", async () => {
    await smoke("caretTo", { where: "end" });
    await smoke("newParagraph");
    const b = await insertObject("E=mc^2", false);
    const n = await smoke("numberNextTo", { tag: b.tag });
    check("a number field next to the object", !!n.bookmark && /\d/.test(n.number), `number "${n.number}"`);
    await smoke("caretTo", { where: "end" });
    await smoke("typeText", { text: "See " });
    const ref = await c.insertReference(n.bookmark);
    await smoke("updateFields");
    const bt = await smoke("bookmarkText", { bookmark: n.bookmark });
    check("a reference to it shows the number", ref.text.replace(/\D/g, "") === String(bt.text).replace(/\D/g, ""), `reference "${ref.text}", number "${bt.text}"`);
    const info = await smoke("objectInfo", { tag: b.tag });
    check("the object is unchanged by its number", info.count === 1 && info.objectElement, `kind ${info.kind}`);
  });

  // ------------------------------------------------------------ save, reopen, PDF
  c.setSection("Spike: save, close, reopen, PDF");
  await step("save/close/reopen", async () => {
    const r = await smoke("saveCloseReopen", { file: "spike O.docx" });
    check("saved, closed and reopened (no prompt blocked the self-test)", !!r.name, `${r.path} (${r.bytes} bytes)`);
    let intact = 0;
    for (const o of objs) {
      const info = await smoke("objectInfo", { tag: o.tag });
      if (info.count >= 1 && dataOk(await readObjectData(info.embedding), o.latex, o.tag)) intact++;
    }
    check("after reopening, every object is still an object with its data", intact === objs.length, `${intact} of ${objs.length}`);
    const pdf = await smoke("savePdf", { file: "spike O.pdf" });
    check("Save as PDF", pdf.bytes > 0, `${pdf.path} (${pdf.bytes} bytes)`);
  });

  // ------------------------------------------------------------ size: objects vs pictures
  c.setSection("Spike: file size, objects compared with pictures");
  await step("file size", async () => {
    const set = ["\\alpha", "\\beta", "\\gamma", "f", "p", "\\frac{a}{b}", "\\vec{r}=\\frac{p}{1+e\\cos\\theta}\\hat{r}", "F=ma"];
    await smoke("newDocument");
    for (const l of set) {
      await smoke("caretTo", { where: "end" });
      await c.insertPicture(l, false);
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
    }
    const pics = await smoke("saveCloseReopen", { file: "size pictures.docx" });
    await smoke("close");
    await smoke("newDocument");
    for (const l of set) {
      await smoke("caretTo", { where: "end" });
      await insertObject(l, false);
      await smoke("caretTo", { where: "end" });
      await smoke("newParagraph");
    }
    const ob = await smoke("saveCloseReopen", { file: "size objects.docx" });
    await smoke("close");
    const per = (b: number) => Math.round(b / set.length);
    check("file size", null, `${set.length} equations: pictures ${pics.bytes} bytes, objects ${ob.bytes} bytes (${ob.bytes > pics.bytes ? "+" : ""}${per(ob.bytes - pics.bytes)} bytes per equation)`);
  });
  return { docO };
}
