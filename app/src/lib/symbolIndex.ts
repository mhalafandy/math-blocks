import type { MathNode, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { readEquationXml as readOmml } from "./readEquation";
import { connector } from "./connector";
import { parseTag } from "@mathblocks/ooxml";
import { readRegistry } from "./linking";
import { recordNativeSources, wordHash } from "./nativeSources";
import { BACKUP_ABOVE, describeOperation, replaceInDocument, type ReplaceItem } from "./docOps";
import { buildInsertion, currentProfile } from "./equation";
import { linkOf } from "./linkPlan";
import { listSymbols, renameInLatex } from "./symbols";

/**
 * Symbol index of a Word document (M11, first part of the dependency manager): which symbols the
 * document's equations use, where each is defined (first equation with it alone on the left of
 * "="), where it is used, and renaming a symbol in every equation at once.
 */

export interface IndexedEquation {
  tag: string;
  page: number;
  context: string;
  latex: string;
  /** As it is in Word (numbered equations are inline math). */
  display: boolean;
  blockId: string | null;
  /** Classic picture or native Word equation (kept when it is rewritten). */
  kind?: "native" | "picture";
  numbered?: boolean;
  /** Its number in the document, e.g. "(2.3)". */
  number?: string | null;
  /** Its XML as read (restored if a document-wide change is cancelled). */
  flatOpc?: string;
  /** Native equation edited in Word since MathBlocks wrote it (its kinds are not in Word's version). */
  editedInWord?: boolean;
}

export interface IndexedSymbol {
  key: string;
  /** Occurrences in all equations. */
  count: number;
  equations: IndexedEquation[];
  definedIn: IndexedEquation | null;
}

const DEFINING = new Set(["=", "≔", "≡", "≜"]);

/** Symbols on the left of the first defining relation, when that side is a single symbol. */
export function definedSymbol(root: Row): string | null {
  const i = root.children.findIndex((n: MathNode) => n.kind === "operator" && DEFINING.has(n.text));
  if (i <= 0) return null;
  const lhs = listSymbols({ kind: "row", children: root.children.slice(0, i) });
  return lhs.length === 1 && lhs[0]!.count === 1 ? lhs[0]!.key : null;
}

export function indexEquations(equations: IndexedEquation[]): IndexedSymbol[] {
  const map = new Map<string, IndexedSymbol>();
  for (const eq of equations) {
    const root = parseLatex(eq.latex).root;
    const defined = definedSymbol(root);
    for (const s of listSymbols(root)) {
      let e = map.get(s.key);
      if (!e) map.set(s.key, (e = { key: s.key, count: 0, equations: [], definedIn: null }));
      e.count += s.count;
      e.equations.push(eq);
      if (defined === s.key && !e.definedIn) e.definedIn = eq;
    }
  }
  return [...map.values()];
}

export interface DocumentIndex {
  document: string;
  name: string;
  equations: IndexedEquation[];
  symbols: IndexedSymbol[];
}

export async function buildDocumentIndex(): Promise<DocumentIndex> {
  const r = await connector.request("listInstances", { includeContent: true }, 120_000);
  const doc = r.documents[0];
  if (!doc) throw new Error("No document is open in Word");
  const equations: IndexedEquation[] = [];
  const sources = await readRegistry(doc.fullName).then((r) => r.sources).catch(() => undefined);
  for (const i of doc.instances) {
    const read = i.flatOpc ? readOmml(i.flatOpc) : null;
    if (!read || !read.root.children.length) continue;
    let latex = serializeLatex(read.root);
    let editedInWord = false;
    const id = parseTag(i.tag)?.instanceId;
    const src = id ? sources?.[id] : undefined;
    if (src && read.kind === "native") {
      if (wordHash(i.flatOpc!) === src.hash) latex = src.latex;
      else editedInWord = true;
    }
    equations.push({ tag: i.tag, page: i.page, context: i.context, latex, display: read.display, blockId: linkOf(i.tag)?.blockId ?? null, kind: read.kind, numbered: read.numbered, number: i.number ?? null, flatOpc: i.flatOpc ?? undefined, editedInWord });
  }
  return { document: doc.fullName, name: doc.name, equations, symbols: indexEquations(equations) };
}

/**
 * Renames a symbol in every equation of the document that uses it, in one undo step. Linked
 * copies are renamed through their library equation (a new version), so every copy follows.
 */
export async function renameInDocument(index: DocumentIndex, key: string, to: string): Promise<{ equations: number; libraryEquations: number }> {
  const sym = index.symbols.find((s) => s.key === key);
  if (!sym || !to.trim()) return { equations: 0, libraryEquations: 0 };
  const renames = { [key]: to.trim() };
  return rewriteDocument(index, sym.equations, (latex) => renameInLatex(latex, renames), `Rename ${key}`);
}

/**
 * Rewrites equations of a document with `transform`, in one undo step; equations it leaves
 * unchanged are not touched. Linked copies change through their library equation (a new
 * version), so all their copies follow.
 */
export async function rewriteDocument(
  index: DocumentIndex,
  equations: IndexedEquation[],
  transform: (latex: string) => string,
  undoLabel: string,
): Promise<{ equations: number; libraryEquations: number; note: string }> {
  const profile = currentProfile();
  const items: ReplaceItem[] = [];
  const blocks = new Set<string>();
  const skipped = equations.filter((e) => e.editedInWord && !e.blockId).length;
  for (const eq of equations) {
    // Edited in Word: its kinds would be lost; listed, left alone until the user decides.
    if (eq.editedInWord && !eq.blockId) continue;
    if (eq.blockId) {
      blocks.add(eq.blockId);
      continue;
    }
    const next = transform(eq.latex);
    if (next === eq.latex) continue;
    items.push({ tag: eq.tag, flatOpc: (await buildInsertion(next, eq.numbered ? false : eq.display, profile, eq.tag, eq.kind === "picture" ? "classic" : "native", eq.display)).flatOpc, previous: eq.flatOpc });
  }
  let note = "";
  if (items.length) {
    const op = await replaceInDocument({ document: index.document, title: undoLabel, undoLabel, items });
    if (op.cancelled) throw new Error(describeOperation(op, undoLabel));
    note = op.replaced > BACKUP_ABOVE ? ` ${describeOperation(op, "Done")}` : "";
    const natives = items.map((it) => equations.find((e) => e.tag === it.tag)!).filter((e) => e.kind === "native");
    if (natives.length) await recordNativeSources(index.document, natives.map((e) => ({ tag: e.tag, latex: transform(e.latex) })));
  }
  if (skipped) note += ` ${skipped} equation(s) edited directly in Word were left unchanged (double-click one to decide).`;
  let libraryEquations = 0;
  if (blocks.size) {
    const { useLibrary } = await import("./library/useLibrary");
    const { propagate } = await import("./linking");
    const lib = useLibrary.getState();
    for (const id of blocks) {
      const q = lib.equations.find((x) => x.id === id);
      if (!q) continue;
      const next = transform(q.latex);
      if (next === q.latex) continue;
      const saved = await lib.store!.save("", { ...q, id, latex: next });
      await propagate(saved, q.latex);
      libraryEquations++;
    }
    await lib.refresh();
  }
  return { equations: items.length, libraryEquations, note };
}

export type DefinitionStatus = "defined" | "undefined" | "usedBefore";

/**
 * How a symbol is introduced: defined by an equation before any use, never defined by an
 * equation (it may be defined in the text), or used in an equation that comes before its
 * definition. Equations are in document order.
 */
export function definitionStatus(index: Pick<DocumentIndex, "equations">, s: IndexedSymbol): DefinitionStatus {
  if (!s.definedIn) return "undefined";
  const at = index.equations.indexOf(s.definedIn);
  return s.equations.some((e) => index.equations.indexOf(e) < at) ? "usedBefore" : "defined";
}

/** The equations whose definitions an equation uses, and the equations that use its definition. */
export function dependencies(index: DocumentIndex, tag: string): { equation: IndexedEquation | null; dependsOn: { symbol: string; equation: IndexedEquation }[]; usedBy: IndexedEquation[] } {
  const equation = index.equations.find((e) => e.tag === tag) ?? null;
  if (!equation) return { equation, dependsOn: [], usedBy: [] };
  const dependsOn: { symbol: string; equation: IndexedEquation }[] = [];
  const usedBy = new Set<IndexedEquation>();
  for (const s of index.symbols) {
    if (!s.equations.includes(equation)) continue;
    if (s.definedIn && s.definedIn !== equation) dependsOn.push({ symbol: s.key, equation: s.definedIn });
    if (s.definedIn === equation) for (const e of s.equations) if (e !== equation) usedBy.add(e);
  }
  const order = (e: IndexedEquation) => index.equations.indexOf(e);
  return { equation, dependsOn: dependsOn.sort((a, b) => order(a.equation) - order(b.equation)), usedBy: [...usedBy].sort((a, b) => order(a) - order(b)) };
}
