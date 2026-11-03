import type { Equation } from "./types";

/**
 * Library search. Every word must match the name, description, tags or LaTeX source.
 *   #tag        only equations with that tag (prefix match)
 *   is:fav      only favourites
 * Ranked: name prefix > name word > tag > description > LaTeX; ties: most recently used, then name.
 */
export function searchEquations(equations: Equation[], query: string): Equation[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return equations;
  const tagFilters = words.filter((w) => w.startsWith("#") && w.length > 1).map((w) => w.slice(1));
  const favOnly = words.includes("is:fav") || words.includes("is:favorite");
  const terms = words.filter((w) => !w.startsWith("#") && !w.startsWith("is:"));
  const scored: { q: Equation; s: number }[] = [];
  for (const q of equations) {
    if (favOnly && !q.favorite) continue;
    const tags = q.tags.map((t) => t.toLowerCase());
    if (!tagFilters.every((f) => tags.some((t) => t.startsWith(f)))) continue;
    const name = q.name.toLowerCase();
    let s = 0;
    let ok = true;
    for (const w of terms) {
      if (name.startsWith(w)) s += 8;
      else if (name.split(/[\s\-_(),.]+/).some((p) => p.startsWith(w))) s += 5;
      else if (tags.some((t) => t.startsWith(w))) s += 4;
      else if (name.includes(w)) s += 3;
      else if (q.description.toLowerCase().includes(w)) s += 2;
      else if (q.latex.toLowerCase().includes(w)) s += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ q, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || (b.q.lastUsedAt ?? 0) - (a.q.lastUsedAt ?? 0) || a.q.name.localeCompare(b.q.name))
    .map((x) => x.q);
}

/** Most recently used equations (inserted into Word or loaded), newest first. */
export const recentEquations = (equations: Equation[], limit = 8) =>
  equations.filter((q) => q.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, limit);
