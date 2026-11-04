import { memo } from "react";
import { convertLatexToMarkup } from "mathlive/ssr";
import { expandNotation, KINDS } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { useApp } from "../lib/store";

const KIND_MACRO = new RegExp(`\\\\(${KINDS.map((k) => k.macro).join("|")})(?![a-zA-Z])`);

/** Previews draw notation kinds in the profile's style (MathLive has no \\pvec). */
export function expandKindsForPreview(latex: string): string {
  if (!KIND_MACRO.test(latex)) return latex;
  return serializeLatex(expandNotation(parseLatex(latex).root, useApp.getState().notationProfile));
}

const cache = new Map<string, string>();

/** Static (non-editable) rendering of LaTeX, cached. Used for library thumbnails and history. */
export const MathPreview = memo(function MathPreview({ latex, className }: { latex: string; className?: string }) {
  let html = cache.get(latex);
  if (html === undefined) {
    try {
      html = convertLatexToMarkup(expandKindsForPreview(latex).replace(/\\placeholder\{\}/g, "\\square"));
    } catch {
      html = "";
    }
    if (cache.size > 500) cache.clear();
    cache.set(latex, html);
  }
  return <span className={className ?? "math-preview"} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
});
