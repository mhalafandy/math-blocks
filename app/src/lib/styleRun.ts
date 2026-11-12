import type { LetterRole, MathStyle } from "@mathblocks/math-core";
import { activeStyle, activeStyleHash, loadDocumentStyle, saveDocumentStyle } from "./docStyle";
import { checkStyle, classifyIndices, type LetterProposal, type StyleIssue } from "./styleCheck";
import { buildDocumentIndex, rewriteDocument, type DocumentIndex } from "./symbolIndex";
import { useApp } from "./store";

/**
 * Document style, acting on the Word document: redraw every equation in the style (one Ctrl+Z,
 * backup, text guard, progress — the safety layer of rewriteDocument), store a changed style and
 * redraw, conform Check style findings, keep findings as exceptions, store the classification.
 */

export interface StyleRunResult {
  equations: number;
  note: string;
}

/** Redraws every equation of the document in its style (LaTeX unchanged); stores the style in the document if it had none. */
export async function applyStyleToDocument(index?: DocumentIndex): Promise<StyleRunResult> {
  const doc = await loadDocumentStyle();
  if (doc && !doc.stored) await saveDocumentStyle(doc.style, doc.document);
  const ix = index ?? (await buildDocumentIndex());
  const r = await rewriteDocument(ix, ix.equations, (l) => l, "Apply style", () => true);
  return { equations: r.equations, note: r.note };
}

/** Stores a new style in the document, then redraws its equations (one Ctrl+Z undoes the redraw). */
export async function restyleDocument(style: MathStyle): Promise<StyleRunResult> {
  await loadDocumentStyle();
  await saveDocumentStyle(style);
  return applyStyleToDocument();
}

/** Check style on the open document: findings (exceptions left out) and the index they refer to. */
export async function checkDocumentStyle(): Promise<{ index: DocumentIndex; issues: StyleIssue[] }> {
  const index = await buildDocumentIndex();
  const issues = checkStyle(
    index.equations.map((e) => ({ latex: e.latex, id: e.tag, styleHash: e.kind === "picture" ? e.styleHash : undefined })),
    activeStyle(),
    activeStyleHash(),
  );
  return { index, issues };
}

/** Conforms findings to the style: their fixes per equation, and a redraw where one is needed (one Ctrl+Z). */
export async function conformIssues(index: DocumentIndex, issues: StyleIssue[]): Promise<StyleRunResult> {
  const fixes = new Map<number, ((l: string) => string)[]>();
  const redraw = new Set<number>();
  for (const i of issues) {
    for (const k of i.equations) {
      if (i.fix) fixes.set(k, [...(fixes.get(k) ?? []), i.fix]);
      if (i.redraw) redraw.add(k);
    }
  }
  const targets = index.equations.filter((_, k) => fixes.has(k) || redraw.has(k));
  if (!targets.length) return { equations: 0, note: "" };
  // rewriteDocument hands over the LaTeX only: fixes are keyed by it (fixes depend on the LaTeX alone).
  const byLatex = new Map<string, (l: string) => string>();
  const redrawLatex = new Set<string>();
  index.equations.forEach((e, k) => {
    const fs = fixes.get(k);
    if (fs) byLatex.set(e.latex, (l) => fs.reduce((acc, f) => f(acc), l));
    if (redraw.has(k)) redrawLatex.add(e.latex);
  });
  const r = await rewriteDocument(index, targets, (l) => byLatex.get(l)?.(l) ?? l, "Conform to style", (l) => redrawLatex.has(l));
  return { equations: r.equations, note: r.note };
}

/** Keeps findings as deliberate exceptions (stored in the document's style; not listed again). */
export async function keepAsExceptions(keys: string[]): Promise<void> {
  await loadDocumentStyle();
  const s = activeStyle();
  await saveDocumentStyle({ ...s, exceptions: [...new Set([...s.exceptions, ...keys])] });
}

/** Proposed meanings of the document's single-letter indices (with the stored choices). */
export async function proposeClassification(index?: DocumentIndex): Promise<{ index: DocumentIndex; proposals: LetterProposal[] }> {
  const ix = index ?? (await buildDocumentIndex());
  return { index: ix, proposals: classifyIndices(ix.equations.map((e) => e.latex)) };
}

/** Stores confirmed meanings (undecided letters are left out: drawn as variables). */
export async function saveClassification(letters: Record<string, LetterRole | null>): Promise<MathStyle> {
  await loadDocumentStyle();
  const s = activeStyle();
  const next: Record<string, LetterRole> = { ...s.letters };
  for (const [l, role] of Object.entries(letters)) {
    if (role) next[l] = role;
    else delete next[l];
  }
  const style = { ...s, letters: next };
  await saveDocumentStyle(style);
  return style;
}

/** Ribbon / command palette: Apply style to document, with a short report. */
export async function applyStyleCommand(o: { fromWord?: boolean } = {}) {
  const app = useApp.getState();
  const tell = async (text: string, kind: "info" | "error" = "info") => (await import("./wordUi")).tell(text, kind, !!o.fromWord);
  if (!app.connector.connected) return tell("Word is not connected.", "error");
  try {
    const r = await applyStyleToDocument();
    await tell(r.equations ? `Redrew ${r.equations} equation(s) in the document style. One Ctrl+Z in Word undoes it.${r.note}` : "There is no MathBlocks equation to redraw.");
  } catch (e) {
    await tell(e instanceof Error ? e.message : String(e), "error");
  }
}
