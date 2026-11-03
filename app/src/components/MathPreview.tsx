import { memo } from "react";
import { convertLatexToMarkup } from "mathlive/ssr";

const cache = new Map<string, string>();

/** Static (non-editable) rendering of LaTeX, cached. Used for library thumbnails and history. */
export const MathPreview = memo(function MathPreview({ latex, className }: { latex: string; className?: string }) {
  let html = cache.get(latex);
  if (html === undefined) {
    try {
      html = convertLatexToMarkup(latex.replace(/\\placeholder\{\}/g, "\\square"));
    } catch {
      html = "";
    }
    if (cache.size > 500) cache.clear();
    cache.set(latex, html);
  }
  return <span className={className ?? "math-preview"} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
});
