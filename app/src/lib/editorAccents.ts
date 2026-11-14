/**
 * The visual editor (MathLive) builds stretchy accents — \overrightharpoon, \overrightarrow, \widehat… — as
 * over/under atoms, so a following _ or ^ becomes a limit: the index is drawn under the letter, centred, and
 * the accent stretches over it. In the editor's form these accents are grouped when a script follows
 * ({\overrightharpoon{r}}_{P/O}), so the script sits at the subscript position as math-render (and Word) draws
 * it; the braces are removed again on the way back, so the stored LaTeX never changes.
 * (\overbrace and \underbrace are left alone: their scripts are meant above and below.)
 */

const STRETCHY = ["overrightharpoon", "overleftharpoon", "overrightarrow", "overleftarrow", "overleftrightarrow", "widehat", "widetilde", "widecheck", "overline", "underline"];
const OPEN_RE = new RegExp(`\\\\(?:${STRETCHY.join("|")})(?![A-Za-z])\\s*\\{`, "g");

/** Index of the brace matching the one at `open` (escaped braces skipped). */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

const scriptNext = (s: string, i: number) => /^\s*[_^]/.test(s.slice(i));

/** Stretchy accents followed by a script, grouped: \overrightharpoon{r}_{a} → {\overrightharpoon{r}}_{a}. */
export function groupScriptedAccents(latex: string): string {
  const spans: [number, number][] = [];
  for (const m of latex.matchAll(OPEN_RE)) {
    const start = m.index!;
    const close = matchBrace(latex, start + m[0].length - 1);
    if (close < 0 || !scriptNext(latex, close + 1)) continue;
    // Already grouped: { right before, } right after.
    if (latex[start - 1] === "{" && latex[close + 1] === "}") continue;
    spans.push([start, close]);
  }
  let out = latex;
  for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) out = `${out.slice(0, a)}{${out.slice(a, b + 1)}}${out.slice(b + 1)}`;
  return out;
}

/** The grouping removed: {\overrightharpoon{r}}_{a} → \overrightharpoon{r}_{a} (only around one such accent before a script). */
export function ungroupScriptedAccents(latex: string): string {
  const spans: [number, number][] = [];
  for (const m of latex.matchAll(OPEN_RE)) {
    const start = m.index!;
    if (latex[start - 1] !== "{") continue;
    // A command's argument ({ right after \name or after \class{…}) is not a group.
    const before = latex.slice(0, start - 1);
    if (/\\[A-Za-z]+\s*$/.test(before) || /\\class\{[^{}]*\}\s*$/.test(before)) continue;
    const close = matchBrace(latex, start + m[0].length - 1);
    if (close < 0 || latex[close + 1] !== "}" || !scriptNext(latex, close + 2)) continue;
    // The outer group must hold exactly the accent.
    if (matchBrace(latex, start - 1) !== close + 1) continue;
    spans.push([start - 1, close + 1]);
  }
  let out = latex;
  for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) out = `${out.slice(0, a)}${out.slice(a + 1, b)}${out.slice(b + 1)}`;
  return out;
}

/**
 * Editor display of harpoons (\overrightharpoon and the kinds drawn with it), added to the visual editor's shadow
 * root: MathLive draws a stretchy harpoon at least 0.888 em wide and pads the letter with two null delimiters, so
 * the accent box is wider than the letter and the index starts after the harpoon's end. These rules size the
 * harpoon to the letter and bring it a little closer above it, so the index starts right after the letter (as in
 * Word). Display only: the LaTeX is unchanged. The harpoon is recognised by its SVG path (MathLive's
 * rightharpoon); tools/accent-index-check.ts measures the result in headless MathLive.
 */
const HARPOON = '.ML__vlist:has(> .ML__center path[d^="M0 241v40h399993"])';
export const EDITOR_ACCENT_CSS = `
${HARPOON} > .ML__center > span > .ML__nulldelimiter { width: 0 !important; }
${HARPOON} > .ML__center > span:has(> span[style*="min-width"]) { width: 100%; }
${HARPOON} > .ML__center > span > span[style*="min-width"] { min-width: 0 !important; width: 100%; transform: translateY(0.1em); }
`;
