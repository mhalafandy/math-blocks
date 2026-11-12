import { hasNotation, styleAst } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { readOmml, toOmml } from "@mathblocks/math-omml";
import { parseTag } from "@mathblocks/ooxml";
import { currentProfile } from "./equation";
import { readRegistry, writeRegistry } from "./linking";
import { readEquationXml } from "./readEquation";
import { activeStyle } from "./docStyle";

/**
 * Native Word equations with notation kinds: Word's equations cannot hold \pvec, so the source
 * goes into the document registry with a hash of the content as written. Reading the equation
 * back, an unchanged hash gives the kinds back; a different hash means it was edited in Word,
 * and the user decides (keep Word's edit, or restore the MathBlocks version) — never silently.
 */

/** FNV-1a, hex. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Hash of what Word shows for this source (written as OMML and read back, so Word's rewriting does not matter). */
export function nativeHash(latex: string): string {
  const omml = toOmml(parseLatex(latex).root, { display: true, profile: currentProfile(), standalone: true, mathStyle: activeStyle() });
  const back = readOmml(omml);
  return fnv(back ? serializeLatex(back.root) : latex);
}

/** Hash of an equation as it is now in Word. */
export function wordHash(flatOpc: string): string | null {
  const r = readEquationXml(flatOpc);
  return r && r.kind === "native" ? fnv(serializeLatex(r.root)) : null;
}

/**
 * Whether Word's copy cannot give the source back: kinds, or letters the document style draws
 * differently from their default (an upright label read back would become \mathrm{…}).
 */
export const needsSource = (latex: string) => {
  const root = parseLatex(latex).root;
  return hasNotation(root) || serializeLatex(styleAst(root, activeStyle())) !== serializeLatex(root);
};

/** Records (or clears) the sources of native equations after they were written. */
export async function recordNativeSources(document: string | undefined, entries: { tag: string; latex: string }[]) {
  if (!entries.length) return;
  const reg = await readRegistry(document);
  let changed = false;
  for (const e of entries) {
    const id = parseTag(e.tag)?.instanceId;
    if (!id) continue;
    if (needsSource(e.latex)) {
      (reg.sources ??= {})[id] = { id, latex: e.latex, hash: nativeHash(e.latex) };
      changed = true;
    } else if (reg.sources?.[id]) {
      delete reg.sources[id];
      changed = true;
    }
  }
  if (changed) await writeRegistry(document, reg);
}

export type SourceState = { state: "none" } | { state: "same"; latex: string } | { state: "edited"; latex: string; wordLatex: string };

/** The stored source of a native equation, and whether Word's content still matches it. */
export async function sourceOf(document: string | undefined, tag: string, flatOpc: string): Promise<SourceState> {
  const id = parseTag(tag)?.instanceId;
  if (!id) return { state: "none" };
  const reg = await readRegistry(document).catch(() => null);
  const src = reg?.sources?.[id];
  if (!src) return { state: "none" };
  const now = wordHash(flatOpc);
  if (now === null) return { state: "none" };
  if (now === src.hash) return { state: "same", latex: src.latex };
  const r = readEquationXml(flatOpc);
  return { state: "edited", latex: src.latex, wordLatex: r ? serializeLatex(r.root) : "" };
}
