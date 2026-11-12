/**
 * MTEF record tree → LaTeX (in the MathBlocks dialect, then parsed into the AST by math-latex).
 *
 * MathType's own "TeX Input Language" annotation is not used: it is missing for many equations
 * and drops details (e.g. harpoon vectors). Unknown constructs never fail the conversion: they
 * are reported as warnings and converted as well as possible.
 */
import { latexCommands } from "@mathblocks/math-latex";
import { MT_PRIVATE_USE } from "./mtCodes";
import type { MtNode } from "./mtef";

type Char = Extract<MtNode, { t: "char" }>;
type Tmpl = Extract<MtNode, { t: "tmpl" }>;

// Typefaces (MTEF "typeface" byte − 128)
const FN_TEXT = 1, FN_FUNCTION = 2, FN_VARIABLE = 3, FN_LCGREEK = 4, FN_UCGREEK = 5, FN_SYMBOL = 6, FN_VECTOR = 7, FN_NUMBER = 8;
const FN_EXPAND = 22, FN_MARKER = 23, FN_SPACE = 24;

/** MathType space characters (MTCode 0xEF00–0xEF08). */
const SPACES: Record<number, string> = {
  0xef00: "", // zero-width
  0xef01: "", // 1 pt
  0xef02: "\\,", // thin
  0xef03: "\\,", // hair
  0xef04: "\\:", // medium
  0xef05: "\\;", // thick
  0xef06: "\\qquad ", // em quad (MathType's own TeX translation uses \qquad)
  0xef07: "\\,", // thin (Ctrl+Space)
  0xef08: "\\quad ", // 2 em
};

/** Characters MathType stores in its private range or that need a specific spelling. */
const CHAR_LATEX: Record<number, string> = {
  0x2212: "-",
  0x2032: "'",
  0x2033: "''",
  0x2034: "'''",
  0x2026: "\\ldots",
  0x22ef: "\\cdots",
  0x22ee: "\\vdots",
  0x22f1: "\\ddots",
  0x2202: "\\partial",
  0x221e: "\\infty",
  0x2207: "\\nabla",
  0x00b7: "\\cdot",
  0x2219: "\\cdot",
  0x22c5: "\\cdot",
  0x00d7: "\\times",
  0x00b1: "\\pm",
  0x2213: "\\mp",
  0x00f7: "\\div",
  0x2192: "\\to",
  0x2190: "\\leftarrow",
  0x21d2: "\\Rightarrow",
  0x2261: "\\equiv",
  0x2248: "\\approx",
  0x2245: "\\cong",
  0x221d: "\\propto",
  0x2208: "\\in",
  0x2209: "\\notin",
  0x2200: "\\forall",
  0x2203: "\\exists",
  0x2205: "\\emptyset",
  0x210f: "\\hbar",
  0x2113: "\\ell",
  0x03d5: "\\phi",
  0x03c6: "\\varphi",
  0x03b5: "\\varepsilon",
  0x03f5: "\\epsilon",
  0x03d1: "\\vartheta",
  0x007b: "\\{",
  0x007d: "\\}",
  0x0025: "\\%",
  0x0026: "\\&",
  0x0023: "\\#",
  0x005f: "\\_",
  0x00a0: "~",
  0xe2ef: "\\mathbb{R}", // MT Extra
  // Double-struck number sets: the commands every LaTeX reader knows.
  0x2124: "\\mathbb{Z}",
  0x211d: "\\mathbb{R}",
  0x2115: "\\mathbb{N}",
  0x211a: "\\mathbb{Q}",
  0x2102: "\\mathbb{C}",
};

const DELIM: Record<number, string> = {
  0x28: "(", 0x29: ")", 0x5b: "[", 0x5d: "]", 0x7b: "\\{", 0x7d: "\\}", 0x7c: "|", 0x2016: "\\|",
  0x2225: "\\|", 0x27e8: "\\langle", 0x27e9: "\\rangle", 0x2329: "\\langle", 0x232a: "\\rangle",
  0x230a: "\\lfloor", 0x230b: "\\rfloor", 0x2308: "\\lceil", 0x2309: "\\rceil", 0x2f: "/",
};

/** Embellishment → wrapping accent command. Primes are handled separately. */
const EMBELL: Record<number, string> = {
  2: "dot", 3: "ddot", 4: "dddot", 8: "tilde", 9: "hat", 11: "vec", 12: "overleftarrow",
  13: "overrightarrow", 14: "overrightharpoon", 15: "overleftharpoon", 16: "bar", 17: "bar",
  19: "breve", 29: "underline", 30: "tilde", 33: "vec",
};
const PRIMES: Record<number, string> = { 5: "'", 6: "''", 7: "'", 18: "'''" };

export interface LatexResult {
  latex: string;
  warnings: string[];
}

export function mtefToLatex(items: MtNode[]): LatexResult {
  const ctx: Ctx = { warnings: [] };
  const latex = items.map((n) => node(n, ctx, true)).join("").trim();
  return { latex: tidy(latex), warnings: [...new Set(ctx.warnings)] };
}

interface Ctx {
  warnings: string[];
  /** Inside cases: tab stops are column separators. */
  markerAsAmp?: boolean;
}

function tidy(s: string) {
  return s.replace(/ +/g, " ").replace(/ ?(\\[,:;]) ?/g, "$1").trim();
}

function node(n: MtNode, ctx: Ctx, top = false): string {
  switch (n.t) {
    case "line":
      return n.isNull ? "" : line(n.items, ctx);
    case "pile":
      return pile(n, ctx, top);
    case "matrix":
      return matrixBody(n, ctx, "matrix");
    case "tmpl":
      return tmpl(n, ctx);
    case "char":
      return line([n], ctx);
  }
}

const isLetter = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);

/** A horizontal sequence: groups runs of text/function letters and digits. */
function line(items: MtNode[], ctx: Ctx): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const n = items[i]!;
    if (n.t !== "char") {
      out += node(n, ctx);
      continue;
    }
    // Runs of text or function-style letters: "sin", "d", "and".
    if ((n.typeface === FN_TEXT || n.typeface === FN_FUNCTION) && n.code !== null && (isLetter(n.code) || (n.typeface === FN_TEXT && n.code === 0x20))) {
      let j = i;
      let s = "";
      while (j < items.length) {
        const m = items[j]!;
        if (m.t !== "char" || m.typeface !== n.typeface || m.code === null || m.embells.length) break;
        if (!(isLetter(m.code) || (n.typeface === FN_TEXT && m.code === 0x20))) break;
        if (j > i && m.funcStart) break;
        s += String.fromCharCode(m.code);
        j++;
      }
      if (s) {
        out += word(s, n.typeface);
        // Embellished last letter of the run is handled on its own.
        i = j - 1;
        continue;
      }
    }
    out += char(n, ctx);
  }
  return out;
}

function word(s: string, typeface: number): string {
  if (typeface === FN_FUNCTION) {
    const t = s.trim();
    if (t in latexCommands.FUNCTIONS) return `\\${t} `;
    return `\\mathrm{${t}}`;
  }
  if (/^[A-Za-z]+$/.test(s) && s.length <= 2) return `\\mathrm{${s}}`;
  return `\\text{${s}}`;
}

function rawChar(code: number, typeface: number): string {
  if (typeface === FN_SPACE) return SPACES[code] ?? "\\,";
  const special = CHAR_LATEX[code];
  // A bare command (\cdot, \times) ends with a space, so a letter after it cannot join it (\cdotb).
  if (special !== undefined) return /^\\[A-Za-z]+$/.test(special) ? `${special} ` : special;
  // MathType's private-use characters (MT Extra): their Unicode equivalent, spelled as LaTeX. Unmapped
  // ones stay as they are and the conversion reports them (never passed on silently).
  const unicode = code >= 0xe000 && code <= 0xf8ff ? MT_PRIVATE_USE[code] : undefined;
  if (unicode !== undefined) {
    const cp = unicode.codePointAt(0)!;
    if ([...unicode].length === 1) return rawChar(cp, typeface);
    return unicode;
  }
  const ch = String.fromCodePoint(code);
  const cmd = latexCommands.CHAR_TO_COMMAND.get(ch);
  if (cmd) return `\\${cmd} `;
  if (code === 0x5c) return "\\backslash ";
  return ch;
}

function char(n: Char, ctx: Ctx): string {
  if (n.code === null) return "";
  const { typeface, code } = n;
  // Tab stops inside piles: spacing (alignment comes from the pile's own alignment).
  if (typeface === FN_MARKER) return code === 9 || code === 0xef09 ? (ctx.markerAsAmp ? "&" : "\\quad ") : "";
  let s = rawChar(code, typeface);
  if (typeface === FN_TEXT && code !== 0x20 && !isLetter(code) && !/^\\/.test(s) && /[A-Za-z]/.test(s)) s = `\\text{${s}}`;
  if (typeface === FN_VECTOR) s = isLetter(code) || /^[0-9]$/.test(s) ? `\\mathbf{${s}}` : `\\boldsymbol{${s.trim()}}`;
  else if (typeface === FN_TEXT && isLetter(code)) s = `\\mathrm{${s}}`;
  else if (typeface === FN_FUNCTION && isLetter(code)) s = `\\mathrm{${s}}`;
  // Variables, Greek, symbols, numbers, other fonts: the character as is.
  let primes = "";
  for (const e of n.embells) {
    if (PRIMES[e]) primes += PRIMES[e];
    else if (EMBELL[e]) s = `\\${EMBELL[e]}{${s.trim()}}`;
    else ctx.warnings.push(`Unknown decoration ${e} on "${String.fromCodePoint(code)}" was dropped`);
  }
  return s + primes;
}

/** Converts a template slot; null slots are "". */
const slot = (n: MtNode | undefined, ctx: Ctx) => (n ? node(n, ctx).trim() : "");
const isEmpty = (n: MtNode | undefined) => !n || (n.t === "line" && (n.isNull || n.items.length === 0));
const charOf = (n: MtNode | undefined) => (n && n.t === "char" ? n.code : null);

function scripts(sub: string, sup: string) {
  return (sub ? `_{${sub}}` : "") + (sup ? `^{${sup}}` : "");
}

/** Wraps an n-ary operand in braces when it contains a top-level + / − / relation. */
function operand(s: string) {
  if (!s) return "{}";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && (c === "+" || c === "-" || c === "=" || c === "<" || c === ">")) return `{${s}}`;
  }
  return s;
}

/** The single matrix inside a fence, if the fence holds nothing else. */
function loneMatrix(main: MtNode | undefined): Extract<MtNode, { t: "matrix" }> | null {
  if (!main) return null;
  if (main.t === "matrix") return main;
  if (main.t === "line" && main.items.length === 1 && main.items[0]!.t === "matrix") return main.items[0] as Extract<MtNode, { t: "matrix" }>;
  return null;
}

function tmpl(n: Tmpl, ctx: Ctx): string {
  const [a, b, c, d] = n.items;
  const v = n.variation;
  switch (n.selector) {
    case 0: // angle brackets
    case 1: // parentheses
    case 2: // braces
    case 3: // brackets
    case 4: // bars
    case 5: // double bars
    case 6: // floor
    case 7: // ceiling
    case 8: // left bracket/right bracket mixes
    case 9: {
      // interval: same slot layout [main, left fence, right fence]
      const defaults: Record<number, [string, string]> = {
        0: ["\\langle", "\\rangle"], 1: ["(", ")"], 2: ["\\{", "\\}"], 3: ["[", "]"], 4: ["|", "|"],
        5: ["\\|", "\\|"], 6: ["\\lfloor", "\\rfloor"], 7: ["\\lceil", "\\rceil"], 8: ["[", "]"], 9: ["[", "]"],
      };
      const hasLeft = n.selector >= 8 ? true : !!(v & 1) || v === 0;
      const hasRight = n.selector >= 8 ? true : !!(v & 2) || v === 0;
      const lc = charOf(b);
      const rc = charOf(c);
      const left = hasLeft ? ((lc !== null && DELIM[lc]) || defaults[n.selector]![0]) : ".";
      const right = hasRight ? ((rc !== null && DELIM[rc]) || defaults[n.selector]![1]) : ".";
      const m = loneMatrix(a);
      if (m) {
        const env = left === "[" && right === "]" ? "bmatrix" : left === "(" && right === ")" ? "pmatrix" : left === "|" && right === "|" ? "vmatrix" : left === "\\|" && right === "\\|" ? "Vmatrix" : left === "\\{" && right === "\\}" ? "Bmatrix" : null;
        if (env) return matrixBody(m, ctx, env);
      }
      // Brace on the left only, holding a pile: piecewise definition.
      if (left === "\\{" && right === "." && a && a.t === "line" && a.items.length === 1 && a.items[0]!.t === "pile") {
        const p = a.items[0] as Extract<MtNode, { t: "pile" }>;
        // Tab stops separate value and condition.
        const rows = p.lines.map((l) => slot(l, { ...ctx, markerAsAmp: true }));
        return `\\begin{cases}${rows.join("\\\\")}\\end{cases}`;
      }
      return `\\left${left}${slot(a, ctx)}\\right${right}`;
    }
    case 10: {
      // radical [radicand, index]
      const idx = slot(b, ctx);
      return idx ? `\\sqrt[${idx}]{${slot(a, ctx)}}` : `\\sqrt{${slot(a, ctx)}}`;
    }
    case 11: {
      // fraction [num, den]; variation 1 = small, 2 = slash
      if (v & 2) return `${group(slot(a, ctx))}/${group(slot(b, ctx))}`;
      return `\\${v & 1 ? "tfrac" : "frac"}{${slot(a, ctx)}}{${slot(b, ctx)}}`;
    }
    case 12:
      return `\\underline{${slot(a, ctx)}}`;
    case 13:
      return `\\overline{${slot(a, ctx)}}`;
    case 14: {
      // arrow with text [top, bottom]
      const top = slot(a, ctx);
      const bottom = slot(b, ctx);
      const arrow = v & 1 ? "\\leftarrow" : v & 4 ? "\\leftrightarrow" : "\\rightarrow";
      let s = arrow;
      if (top) s = `\\overset{${top}}{${s}}`;
      if (bottom) s = `\\underset{${bottom}}{${s}}`;
      return s;
    }
    case 15: {
      // integral [main, lower, upper, operator]
      const op = charOf(d);
      const count = v & 3;
      const loop = !!(v & 4);
      let cmd = loop ? (count === 3 ? "oiiint" : count === 2 ? "oiint" : "oint") : count === 3 ? "iiint" : count === 2 ? "iint" : "int";
      if (op === 0x222c) cmd = "iint";
      else if (op === 0x222d) cmd = "iiint";
      else if (op === 0x222e) cmd = "oint";
      // 0x40: limits above/below instead of at the side.
      return `\\${cmd}${v & 0x40 ? "\\limits" : ""}${scripts(slot(b, ctx), slot(c, ctx))}${operand(slot(a, ctx))}`;
    }
    case 16:
    case 17:
    case 18:
    case 19:
    case 20: {
      // sum/product/coproduct/union/intersection [main, lower, upper, operator]
      const cmd = ({ 16: "sum", 17: "prod", 18: "coprod", 19: "bigcup", 20: "bigcap" } as Record<number, string>)[n.selector]!;
      return `\\${cmd}${scripts(slot(b, ctx), slot(c, ctx))}${operand(slot(a, ctx))}`;
    }
    case 21:
    case 22: {
      // integral-style / sum-style big operator without operand [lower, upper, operator]
      const op = charOf(c);
      const ch = op !== null ? String.fromCodePoint(op) : n.selector === 21 ? "∫" : "∑";
      const name = Object.entries(latexCommands.NARY).find(([, x]) => x === ch)?.[0] ?? (n.selector === 21 ? "int" : "sum");
      return `\\${name}${scripts(slot(a, ctx), slot(b, ctx))}`;
    }
    case 23: {
      // limit [main, lower, upper]: lim, max, min…
      const main = slot(a, ctx);
      return `${main}${scripts(slot(b, ctx), slot(c, ctx))}`;
    }
    case 24:
    case 25: {
      // horizontal brace / bracket [main, label]; variation 1 = above
      const label = slot(b, ctx);
      return v & 1 ? `\\overbrace{${slot(a, ctx)}}${label ? `^{${label}}` : ""}` : `\\underbrace{${slot(a, ctx)}}${label ? `_{${label}}` : ""}`;
    }
    case 27:
    case 28:
    case 29: {
      // subscript / superscript / both [sub, sup]; variation 1 = before the base (prescripts)
      const s = scripts(slot(a, ctx), slot(b, ctx));
      return v & 1 ? `{}${s}` : s || "";
    }
    case 30: {
      // Dirac bra-ket [left, right]
      const l = slot(a, ctx);
      const r = slot(b, ctx);
      return `\\left\\langle ${l}${r || isEmpty(b) ? "" : ""}${!isEmpty(b) ? `\\middle|${r}` : ""}\\right\\rangle`;
    }
    case 31: {
      // vector arrow over/under [main, arrow char]; variation 1 left, 2 right, 4 under, 8 harpoon
      const main = slot(a, ctx);
      const harpoon = !!(v & 8);
      const single = a && a.t === "line" && a.items.length === 1 && a.items[0]!.t === "char";
      if (v & 4) return `\\underline{${main}}`;
      if ((v & 3) === 1) return `\\${harpoon ? "overleftharpoon" : "overleftarrow"}{${main}}`;
      if (harpoon) return `\\overrightharpoon{${main}}`;
      return single ? `\\vec{${main}}` : `\\overrightarrow{${main}}`;
    }
    case 32:
      return `\\widetilde{${slot(a, ctx)}}`;
    case 33:
      return `\\widehat{${slot(a, ctx)}}`;
    case 37:
      return `\\boxed{${slot(a, ctx)}}`;
    case 40: // over/under script ("limit" style)
      return `\\overset{${slot(c, ctx)}}{\\underset{${slot(b, ctx)}}{${slot(a, ctx)}}}`;
    default:
      ctx.warnings.push(`Unsupported MathType template ${n.selector} (contents kept without it)`);
      return n.items.map((x) => slot(x, ctx)).join("");
  }
}

const group = (s: string) => (s.length === 1 || /^\\[A-Za-z]+\s*$/.test(s) ? s : `{${s}}`);

const RELATION = /^(=|<|>|\\leq|\\geq|\\neq|\\approx|\\equiv|\\to|\\Rightarrow|\\propto|\\sim|\\cong)/;

function pile(n: Extract<MtNode, { t: "pile" }>, ctx: Ctx, top: boolean): string {
  const rows = n.lines.map((l) => slot(l, ctx));
  void top;
  if (rows.length === 1) return rows[0]!;
  // halign: 1 left, 2 center, 3 right, 4 at relation, 5 at decimal point
  if (n.halign === 2) return `\\begin{gathered}${rows.join("\\\\")}\\end{gathered}`;
  const aligned = n.halign === 4 ? rows.map(alignAtRelation) : n.halign === 3 ? rows.map((r) => `${r}&`) : rows.map((r) => `&${r}`);
  return `\\begin{aligned}${aligned.join("\\\\")}\\end{aligned}`;
}

/** Inserts the alignment point before the first top-level relation of a row. */
function alignAtRelation(row: string): string {
  let depth = 0;
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && RELATION.test(row.slice(i)) && (c !== "\\" || row[i - 1] !== "\\")) return `${row.slice(0, i)}&${row.slice(i)}`;
  }
  return row;
}

function matrixBody(m: Extract<MtNode, { t: "matrix" }>, ctx: Ctx, env: string): string {
  const rows: string[] = [];
  for (let r = 0; r < m.rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < m.cols; c++) cells.push(slot(m.cells[r * m.cols + c], ctx));
    rows.push(cells.join("&"));
  }
  return `\\begin{${env}}${rows.join("\\\\")}\\end{${env}}`;
}
