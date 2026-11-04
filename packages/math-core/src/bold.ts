import type { MathNode, MathVariant, Row } from "./ast";

/**
 * Bold as MathType applies it: on the letters of the base only. Subscripts, superscripts (frame
 * labels, indices, the transpose T) and accents keep their weight unless the scope says otherwise.
 * Works on the AST, so the editor, the Classic pictures, Word (OMML) and LaTeX all agree.
 */
export type BoldScope = "base" | "scripts" | "all";

const GREEK = /^[Α-Ωα-ωϑϕϖϰϱϵς]$/u;
const isBold = (v: MathVariant | undefined) => v === "bold" || v === "bold-italic";

/** Calls `f` on every letter/digit the scope covers. */
function eachLetter(row: Row, scope: BoldScope, f: (n: Extract<MathNode, { kind: "ident" | "number" }>) => void) {
  const visitRow = (r: Row | undefined) => r?.children.forEach(visit);
  const visit = (n: MathNode) => {
    switch (n.kind) {
      case "ident":
      case "number":
        f(n);
        return;
      case "scripts":
        visitRow(n.base);
        if (scope !== "base") {
          visitRow(n.sub);
          visitRow(n.sup);
        }
        return;
      case "prescripts":
        visitRow(n.base);
        if (scope !== "base") {
          visitRow(n.sub);
          visitRow(n.sup);
        }
        return;
      case "nary":
        // ∑ and ∫ limits are scripts too.
        if (scope !== "base") {
          visitRow(n.sub);
          visitRow(n.sup);
        }
        visitRow(n.body);
        return;
      default:
        for (const [k, v] of Object.entries(n)) {
          if (k === "meta") continue;
          const each = (x: unknown) => {
            if (!x || typeof x !== "object") return;
            if (Array.isArray(x)) return x.forEach(each);
            const o = x as MathNode;
            if (o.kind === "row") visitRow(o);
          };
          each(v);
        }
    }
  };
  visitRow(row);
}

/** Whether every letter the scope covers is bold (and there is at least one). */
export function isAllBold(row: Row, scope: BoldScope = "base"): boolean {
  let any = false;
  let all = true;
  eachLetter(row, scope, (n) => {
    any = true;
    if (!isBold(n.variant)) all = false;
  });
  return any && all;
}

/** Bold on (letters: \mathbf, Greek: \boldsymbol) or off for the letters the scope covers. Mutates and returns the row. */
export function setBold(row: Row, on: boolean, scope: BoldScope = "base"): Row {
  eachLetter(row, scope, (n) => {
    if (on) n.variant = n.kind === "ident" && GREEK.test(n.text) ? "bold-italic" : "bold";
    else if (isBold(n.variant)) delete n.variant;
  });
  return row;
}

/**
 * Bold that spread into scripts: a bold base whose subscript or superscript letters are bold too
 * (\mathbf{x_1}, \mathbf{A}^{\mathbf{T}}). Returns the number of fixes; mutates the row.
 */
export function normalizeBold(row: Row): number {
  let fixed = 0;
  const visit = (n: MathNode) => {
    if (n.kind === "scripts" || n.kind === "prescripts") {
      if (isAllBold(n.base)) {
        for (const r of [n.sub, n.sup]) {
          // A transpose/inverse mark keeps its own form (see the transpose rule).
          if (!r || (r === n.sup && isTransposeMark(r))) continue;
          eachLetter(r, "all", (l) => {
            if (isBold(l.variant)) {
              delete l.variant;
              fixed++;
            }
          });
        }
      }
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === "meta") continue;
      const each = (x: unknown) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(each);
        const o = x as MathNode;
        if (o.kind === "row") o.children.forEach(visit);
        else if (o.kind) visit(o);
      };
      each(v);
    }
  };
  row.children.forEach(visit);
  return fixed;
}

/** Superscripts that are operation marks, not indices: T, H, −1, −T, *, ×, ⊤. */
export function isTransposeMark(r: Row): boolean {
  const text = r.children
    .map((c) => (c.kind === "ident" || c.kind === "number" || c.kind === "operator" ? c.text : "?"))
    .join("");
  return /^(T|H|−1|-1|−T|-T|\*|∗|×|⊤)$/.test(text);
}
