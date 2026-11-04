import type { MathNode, MathVariant, Row } from "@mathblocks/math-core";
import {
  CHAR_TO_COMMAND,
  CLASS_CHAR_TO_COMMAND,
  SYMBOLS,
  DELIMITER_LATEX,
  FONT_COMMAND,
  FUNCTIONS,
  FUNCTION_DISPLAY,
  SPACE_COMMAND,
} from "./commands";

const DISPLAY_TO_FUNCTION: Record<string, string> = Object.fromEntries(
  Object.entries(FUNCTION_DISPLAY).map(([cmd, display]) => [display, cmd]),
);

const OPERATOR_LATEX: Record<string, string> = {
  "−": "-",
  "∗": "*",
  "{": "\\{",
  "}": "\\}",
  "‖": "\\|",
  "#": "\\#",
  $: "\\$",
  "%": "\\%",
  "&": "\\&",
  _: "\\_",
};

/**
 * Serialises the AST to normalised LaTeX.
 *
 * Guarantee (tested): parseLatex(serializeLatex(parseLatex(x).root)).root deep-equals
 * parseLatex(x).root, i.e. serialisation never changes the mathematical structure.
 */
export function serializeLatex(root: Row): string {
  return rowLatex(root);
}

/** Concatenates pieces, inserting a space only where TeX needs one (\alpha x, not \alphax). */
function join(pieces: string[]): string {
  let out = "";
  for (const p of pieces) {
    if (!p) continue;
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += " ";
    // x_n s rather than x_ns (same meaning in TeX, but much easier to read)
    else if (/[_^][A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9\\]/.test(p)) out += " ";
    out += p;
  }
  return out;
}

function rowLatex(r: Row): string {
  const pieces: string[] = [];
  const kids = r.children;
  let i = 0;
  while (i < kids.length) {
    const n = kids[i]!;
    // Group consecutive identifiers/numbers sharing an explicit variant: \mathrm{abc}
    if ((n.kind === "ident" || n.kind === "number") && n.variant) {
      const variant = n.variant;
      let text = "";
      while (i < kids.length) {
        const k = kids[i]!;
        if ((k.kind === "ident" || k.kind === "number") && k.variant === variant) {
          text += k.kind === "ident" ? identChar(k.text) : k.text;
          i++;
        } else break;
      }
      pieces.push(variantWrap(variant, text));
      continue;
    }
    pieces.push(nodeLatex(n));
    i++;
  }
  return join(pieces);
}

/** The command for an operator character: the preferred spelling when its class matches, else one of the right class (⊥ relation → \perp, ordinary → \bot). */
function operatorCommand(char: string, opClass: string): string | undefined {
  const preferred = CHAR_TO_COMMAND.get(char);
  if (preferred && (SYMBOLS[preferred]?.type ?? opClass) === opClass) return preferred;
  // No command of this class (a plain ":" relation is not \\colon): keep the character itself.
  return CLASS_CHAR_TO_COMMAND.get(`${char}|${opClass}`) ?? (preferred && SYMBOLS[preferred] ? undefined : preferred);
}

function identChar(text: string): string {
  const cmd = CHAR_TO_COMMAND.get(text);
  return cmd ? `\\${cmd} ` : text;
}

function variantWrap(v: MathVariant, text: string): string {
  return `\\${FONT_COMMAND[v]}{${text.trimEnd()}}`;
}

/** Argument in braces, omitted for a single plain character (x^2, \frac12 is NOT produced). */
function scriptArg(r: Row): string {
  if (r.children.length === 1) {
    const c = r.children[0]!;
    if ((c.kind === "ident" || c.kind === "number") && !c.variant && [...c.text].length === 1) {
      const s = c.kind === "ident" ? identChar(c.text).trim() : c.text;
      return s.startsWith("\\") ? `{${s}}` : s;
    }
  }
  return `{${rowLatex(r)}}`;
}

const braced = (r: Row) => `{${rowLatex(r)}}`;

/** A base for scripts: single atoms stay bare, anything else is grouped. */
function baseLatex(r: Row): string {
  if (r.children.length === 1) {
    const c = r.children[0]!;
    if (c.kind !== "scripts" && c.kind !== "row") return nodeLatex(c);
  }
  return braced(r);
}

function scriptsLatex(sub: Row | undefined, sup: Row | undefined): string {
  let s = "";
  if (sub) s += `_${scriptArg(sub)}`;
  if (sup) s += `^${scriptArg(sup)}`;
  return s;
}

function nodeLatex(n: MathNode): string {
  switch (n.kind) {
    case "row":
      return braced(n);
    case "ident":
      return n.variant ? variantWrap(n.variant, identChar(n.text)) : identChar(n.text).trimEnd();
    case "number":
      return n.variant ? variantWrap(n.variant, n.text) : n.text;
    case "operator": {
      const mapped = OPERATOR_LATEX[n.text];
      if (mapped) return mapped;
      const cmd = operatorCommand(n.text, n.opClass);
      return cmd ? `\\${cmd}` : n.text;
    }
    case "text":
      return `\\text{${n.text.replace(/([{}])/g, "\\$1")}}`;
    case "space":
      return SPACE_COMMAND[n.width];
    case "fraction": {
      if (!n.bar) return `\\genfrac{}{}{0pt}{}${braced(n.num)}${braced(n.den)}`;
      const cmd = n.size === "display" ? "dfrac" : n.size === "text" ? "tfrac" : "frac";
      return `\\${cmd}${braced(n.num)}${braced(n.den)}`;
    }
    case "scripts": {
      const primeOnly = n.sup && n.sup.children.length > 0 && n.sup.children.every((c) => c.kind === "operator" && c.text === "′");
      if (primeOnly) return `${baseLatex(n.base)}${"'".repeat(n.sup!.children.length)}${n.sub ? `_${scriptArg(n.sub)}` : ""}`;
      return `${baseLatex(n.base)}${scriptsLatex(n.sub, n.sup)}`;
    }
    case "prescripts":
      return `{}${scriptsLatex(n.sub, n.sup)}${baseLatex(n.base)}`;
    case "radical":
      return n.index ? `\\sqrt[${rowLatex(n.index)}]${braced(n.body)}` : `\\sqrt${braced(n.body)}`;
    case "nary": {
      const cmd = CHAR_TO_COMMAND.get(n.op) ?? "sum";
      const lim = n.limits === "auto" ? "" : `\\${n.limits}`;
      const body = rowLatex(n.body);
      return join([`\\${cmd}${lim}${scriptsLatex(n.sub, n.sup)}`, body ? ` ${body}` : ""]);
    }
    case "delimited": {
      if (
        n.open === "(" && n.close === ")" && n.parts.length === 1 && n.parts[0]!.children.length === 1 &&
        n.parts[0]!.children[0]!.kind === "fraction" && !n.parts[0]!.children[0]!.bar
      ) {
        const f = n.parts[0]!.children[0]!;
        return `\\binom${braced(f.num)}${braced(f.den)}`;
      }
      const d = (c: string) => DELIMITER_LATEX[c] ?? c;
      const sep = ` \\middle${d(n.separator ?? "|")} `;
      return `\\left${d(n.open)} ${n.parts.map(rowLatex).join(sep)} \\right${d(n.close)}`;
    }
    case "function": {
      const cmdName = DISPLAY_TO_FUNCTION[n.name] ?? n.name;
      const known = cmdName in FUNCTIONS && FUNCTIONS[cmdName] === n.limits;
      const head = known ? `\\${cmdName}` : `\\operatorname${n.limits ? "*" : ""}{${n.name}}`;
      const arg = rowLatex(n.arg);
      return join([`${head}${scriptsLatex(n.sub, n.sup)}`, arg ? ` ${arg}` : ""]);
    }
    case "accent":
      return `\\${n.accent}${braced(n.body)}`;
    case "stack":
      if (n.brace) {
        const cmd = n.position === "over" ? "overbrace" : "underbrace";
        const ann = n.annotation ? `${n.position === "over" ? "^" : "_"}${braced(n.annotation)}` : "";
        return `\\${cmd}${braced(n.body)}${ann}`;
      }
      return `\\${n.position === "over" ? "overset" : "underset"}${braced(n.annotation ?? { kind: "row", children: [] })}${braced(n.body)}`;
    case "boxed":
      return `\\boxed${braced(n.body)}`;
    case "matrix":
      return env(n.matrixKind, n.rows);
    case "cases":
      return env("cases", n.rows);
    case "aligned":
      return env(n.env === "align" ? "aligned" : n.env, n.rows);
    case "raw":
      return n.latex;
  }
}

function env(name: string, rows: Row[][]): string {
  const body = rows
    .map((cells, i) => {
      const text = cells.map(rowLatex).join(" & ");
      // An empty last row would read as a trailing \\\\ and be dropped: mark it with {}.
      return i > 0 && i === rows.length - 1 && !text.trim() ? "{}" : text;
    })
    .join(" \\\\ ");
  return `\\begin{${name}} ${body} \\end{${name}}`;
}
