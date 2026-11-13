import { styleAst, type MathNode, type MathStyle, type Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Save as block keeps meaning, not a look (docs/BLOCKS-DESIGN.md §6b): a font command on a letter that only
 * repeats what the document's kinds draw anyway (\mathrm{d} where the operator kind is upright) is removed;
 * any other (a look the kinds would not give) is kept, and listed. Rules of the document are left out of the
 * comparison (they are the document's, not the block's).
 */
export function stripRedundantFonts(latex: string, style: MathStyle): { latex: string; kept: string[] } {
  let root: Row;
  try {
    root = parseLatex(latex).root;
  } catch {
    return { latex, kept: [] };
  }
  const plain = JSON.parse(JSON.stringify(root)) as Row;
  const forced: { orig: MathNode & { variant?: string }; copy: MathNode & { variant?: string } }[] = [];
  const pair = (a: unknown, b: unknown) => {
    if (!a || typeof a !== "object") return;
    if (Array.isArray(a)) return a.forEach((x, i) => pair(x, (b as unknown[])[i]));
    const n = a as MathNode & { variant?: string };
    if (n.kind === "ident" && (n.variant === "normal" || n.variant === "italic")) {
      forced.push({ orig: n, copy: b as MathNode & { variant?: string } });
      delete (b as { variant?: string }).variant;
    }
    for (const [k, v] of Object.entries(n)) if (k !== "meta") pair(v, (b as Record<string, unknown>)[k]);
  };
  pair(root, plain);
  if (!forced.length) return { latex, kept: [] };
  // How the kinds draw the plain copy (same structure: no symbol rules, which could replace letters).
  const drawn = styleAst(plain, { ...style, symbols: style.symbols.filter((r) => !r.when?.bold && ["label", "counter", "variable", "constant"].includes(r.kind) && !r.sub) });
  const drawnIdents: (MathNode & { variant?: string })[] = [];
  const plainIdents: (MathNode & { variant?: string })[] = [];
  const collect = (n: unknown, out: (MathNode & { variant?: string })[]) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => collect(x, out));
    const m = n as MathNode;
    if (m.kind === "ident") out.push(m as MathNode & { variant?: string });
    for (const [k, v] of Object.entries(m)) if (k !== "meta") collect(v, out);
  };
  collect(plain, plainIdents);
  collect(drawn, drawnIdents);
  const kept: string[] = [];
  for (const f of forced) {
    const i = plainIdents.indexOf(f.copy);
    const d = drawnIdents[i];
    const wouldBe = d?.variant === "normal" ? "normal" : d?.variant === "italic" || d?.variant === undefined ? "italic" : d?.variant;
    if (wouldBe === f.orig.variant) delete f.orig.variant;
    else kept.push(`${f.orig.variant === "normal" ? "\\mathrm" : "\\mathit"}{${(f.orig as { text: string }).text}}`);
  }
  return { latex: serializeLatex(root), kept: [...new Set(kept)] };
}
