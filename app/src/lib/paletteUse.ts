import { SHORTCUT_TABLE } from "./editorShortcuts";
import { findItem, type IndexedItem } from "./palette";
import { loadSnippets, type Snippet } from "./snippets";

/**
 * What the palette remembers about use: Recent (newest first, one per LaTeX), how often each LaTeX was
 * inserted (search ranks frequent items first), and which "faster: type …" hints were already shown.
 * Pure functions: the palette applies them to the preferences, the tests check them.
 */

export const MAX_RECENTS = 16;
/** Clicks on the same item before the one-time hint about its shortcut or snippet. */
export const HINT_AFTER = 3;

type Find = (key: string) => IndexedItem | undefined;

/** Recent after inserting x: x first, then the others, one per LaTeX, at most 16. */
export function nextRecents(recents: string[], x: IndexedItem, find: Find = findItem): string[] {
  return dedupeByLatex([x.key, ...recents], find, x).map((i) => i.key);
}

/** The items of Recent, one per LaTeX (lists saved by older versions may hold the same symbol twice). */
export function recentItems(recents: string[], find: Find = findItem): IndexedItem[] {
  return dedupeByLatex(recents, find);
}

function dedupeByLatex(keys: string[], find: Find, first?: IndexedItem): IndexedItem[] {
  const out: IndexedItem[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const it = first && k === first.key ? first : find(k);
    if (!it || seen.has(it.item.latex)) continue;
    seen.add(it.item.latex);
    out.push(it);
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

const norm = (latex: string) => latex.replace(/\s+/g, "").replace(/#0|#\?/g, "#");

/** The fastest way to type an item: its editor shortcut, or a snippet that inserts the same LaTeX. */
export function fastWay(latex: string, snippets: Snippet[] = loadSnippets()): string | null {
  const l = norm(latex);
  const sc = SHORTCUT_TABLE.find((s) => s.insert && norm(s.insert) === l);
  if (sc) return `press ${sc.keys}`;
  const sn = snippets.find((s) => norm(s.latex) === l);
  if (sn) return `type ${sn.trigger} Tab`;
  return null;
}

/**
 * After an insertion: the new use counts, and the one-time hint to show (null: none). The hint comes
 * once per item, when it has been clicked HINT_AFTER times and has a shortcut or snippet.
 */
export function afterUse(latex: string, use: Record<string, number>, shown: string[], fast = fastWay(latex)): { use: Record<string, number>; hint: string | null; shown: string[] } {
  const n = (use[latex] ?? 0) + 1;
  const next = { ...use, [latex]: n };
  if (n < HINT_AFTER || !fast || shown.includes(latex)) return { use: next, hint: null, shown };
  return { use: next, hint: `Faster: ${fast}`, shown: [...shown, latex] };
}

/** Favourites after dragging `from` onto `to` (it takes that place; the others move along). */
export function reorderFavorites(favorites: string[], from: string, to: string): string[] {
  if (from === to || !favorites.includes(from) || !favorites.includes(to)) return favorites;
  const rest = favorites.filter((k) => k !== from);
  const at = rest.indexOf(to);
  const fromAt = favorites.indexOf(from);
  const toAt = favorites.indexOf(to);
  // Dragged forward: after the target; backward: before it.
  rest.splice(fromAt < toAt ? at + 1 : at, 0, from);
  return rest;
}
