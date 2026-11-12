import { kindMacroRe } from "../lib/kinds";
import { memo } from "react";
import { convertLatexToMarkup } from "mathlive/ssr";
import { expandNotation, KINDS, styleAst, styleNotation } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { useApp } from "../lib/store";
import { activeStyle } from "../lib/docStyle";


/** Previews draw notation kinds in the profile's style (MathLive has no \\pvec). */
export function expandKindsForPreview(latex: string): string {
  // Drawn in the document's style too (upright labels, d, e…), as in Word.
  const ms = activeStyle();
  return serializeLatex(expandNotation(styleAst(parseLatex(latex).root, ms), styleNotation(ms)));
}

const cache = new Map<string, string>();

/** Static (non-editable) rendering of LaTeX, cached. Used for library thumbnails and history. */
export const MathPreview = memo(function MathPreview({ latex, className }: { latex: string; className?: string }) {
  // Kinds are drawn in the current notation: re-rendered when it changes.
  const profile = useApp((s) => s.notationProfile);
  const custom = useApp((s) => s.customKinds);
  const doc = useApp((s) => s.docStyle);
  const key = `${JSON.stringify(doc?.style ?? profile)}${kindMacroRe().test(latex) ? JSON.stringify(custom) : ""}\u0000${latex}`;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = convertLatexToMarkup(expandKindsForPreview(latex).replace(/\\placeholder\{\}/g, "\\square"));
    } catch {
      html = "";
    }
    if (cache.size > 500) cache.clear();
    cache.set(key, html);
  }
  return <span className={className ?? "math-preview"} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
});
