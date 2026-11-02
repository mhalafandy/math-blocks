import {
  asRow,
  row,
  type Cases,
  type Delimited,
  type FunctionApp,
  type MathNode,
  type MathVariant,
  type Matrix,
  type MatrixKind,
  type NAry,
  type Operator,
  type OperatorClass,
  type Row,
  type Scripts,
} from "@mathblocks/math-core";
import {
  ACCENTS,
  ALIGNED_ENVS,
  DELIMITERS,
  FONTS,
  FUNCTIONS,
  FUNCTION_DISPLAY,
  IGNORED,
  MATRIX_ENVS,
  NARY,
  SPACES,
  SYMBOLS,
  type SymbolDef,
} from "./commands";
import { tokenize, type Token } from "./tokenizer";

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  /** Source offsets, usable for editor squiggles. */
  start: number;
  end: number;
}

export interface ParseResult {
  root: Row;
  diagnostics: Diagnostic[];
}

interface RowContext {
  /** Inside {…}: stop at the closing brace. */
  inGroup?: boolean;
  /** Inside \begin…\end: stop at &, \\ and \end. */
  inEnv?: boolean;
  /** Inside \left…\right: stop at \middle and \right. */
  inLeft?: boolean;
  /** Stop at this character (used for the optional [n] of \sqrt). */
  stopChar?: string;
}

/** Unicode characters typed directly, classified using the symbol table. */
const CHAR_CLASS: Map<string, SymbolDef> = (() => {
  const m = new Map<string, SymbolDef>();
  for (const def of Object.values(SYMBOLS)) if (!m.has(def.char)) m.set(def.char, def);
  return m;
})();

const NARY_CHARS = new Set(Object.values(NARY));
const BODY_STOP_BINARY = new Set(["+", "−", "±", "∓"]);
const TEXT_COMMANDS = new Set(["text", "textrm", "textit", "textbf", "textnormal", "mbox", "mathnormal"]);

const ENV_NORMALISE: Record<string, "aligned" | "gathered" | "split"> = {
  aligned: "aligned",
  align: "aligned",
  "align*": "aligned",
  alignat: "aligned",
  "alignat*": "aligned",
  gathered: "gathered",
  gather: "gathered",
  "gather*": "gathered",
  split: "split",
};

/**
 * Parses LaTeX math (the content between $…$, without the dollars) into the AST.
 *
 * The parser is tolerant: it always returns a tree, and reports problems as
 * diagnostics with source positions. Anything it cannot interpret is kept as a
 * `raw` node so that no user input is ever silently discarded.
 */
export function parseLatex(src: string): ParseResult {
  const p = new Parser(src);
  const root = p.parseRow({});
  return { root, diagnostics: p.diagnostics };
}

class Parser {
  readonly diagnostics: Diagnostic[] = [];
  private readonly tokens: Token[];
  private pos = 0;
  /** Nodes whose body/argument must still be captured from the following siblings. */
  private readonly pending = new WeakSet<MathNode>();

  constructor(private readonly src: string) {
    this.tokens = tokenize(src);
  }

  // ---------------------------------------------------------------- tokens

  private peek(): Token {
    while (this.tokens[this.pos]!.type === "ws") this.pos++;
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.type !== "eof") this.pos++;
    return t;
  }

  private error(message: string, t: Token, severity: Diagnostic["severity"] = "error") {
    this.diagnostics.push({ severity, message, start: t.start, end: t.end });
  }

  // ---------------------------------------------------------------- rows

  parseRow(ctx: RowContext): Row {
    const items: MathNode[] = [];
    for (;;) {
      const t = this.peek();
      if (t.type === "eof") {
        if (ctx.inGroup) this.error("Missing closing brace '}'", t);
        break;
      }
      if (t.type === "rbrace") {
        if (ctx.inGroup) break;
        this.error("Unmatched closing brace '}'", t);
        this.next();
        continue;
      }
      if (ctx.stopChar && t.type === "char" && t.value === ctx.stopChar) break;
      if (t.type === "amp" || t.type === "newline") {
        if (ctx.inEnv) break;
        this.error(
          t.type === "amp"
            ? "'&' is only allowed inside an environment such as aligned or matrix"
            : "'\\\\' (new line) is only allowed inside an environment such as aligned",
          t,
          "warning",
        );
        this.next();
        continue;
      }
      if (t.type === "command" && (t.value === "right" || t.value === "middle")) {
        if (ctx.inLeft) break;
        this.error(`\\${t.value} without a matching \\left`, t);
        this.next();
        this.readDelimiter();
        continue;
      }
      if (t.type === "command" && t.value === "end") {
        if (ctx.inEnv) break;
        this.error("\\end without a matching \\begin", t);
        this.next();
        this.readRawGroup();
        continue;
      }
      if (t.type === "sup" || t.type === "sub") {
        this.next();
        const arg = this.parseScriptArg(t);
        this.attachScript(items, t.type, arg, t);
        continue;
      }
      if (t.type === "prime") {
        const primes: MathNode[] = [];
        while (this.peek().type === "prime") {
          this.next();
          primes.push({ kind: "operator", text: "′", opClass: "ordinary" });
        }
        this.attachPrimes(items, primes);
        continue;
      }
      if (t.type === "command" && (t.value === "limits" || t.value === "nolimits")) {
        this.next();
        const last = items[items.length - 1];
        if (last?.kind === "nary") last.limits = t.value;
        else if (last?.kind === "function") last.limits = t.value === "limits";
        else this.error(`\\${t.value} must follow a large operator`, t, "warning");
        continue;
      }
      const node = this.parseAtom(t);
      if (node) items.push(node);
    }
    return row(...this.postprocess(items));
  }

  /** Argument of ^ or _: a group or exactly one token (x^23 means x² 3, as in TeX). */
  private parseScriptArg(op: Token): Row {
    const t = this.peek();
    if (t.type === "eof" || t.type === "rbrace" || t.type === "amp" || t.type === "newline") {
      this.error(`Missing argument after '${op.value}'`, op);
      return row();
    }
    if (t.type === "sup" || t.type === "sub") {
      this.error(`Double script: '${op.value}' followed by '${t.value}'`, t);
      return row();
    }
    const node = this.parseAtom(t, true);
    return node ? asRow(node) : row();
  }

  private attachScript(items: MathNode[], type: "sup" | "sub", arg: Row, t: Token) {
    const which = type === "sup" ? "sup" : "sub";
    const last = items[items.length - 1];
    if (last && (last.kind === "nary" || last.kind === "function")) {
      if (last[which]) this.error(`Double ${which === "sup" ? "superscript" : "subscript"}`, t);
      last[which] = arg;
      return;
    }
    if (last && last.kind === "stack" && last.brace && !last.annotation) {
      const matches = (last.position === "over") === (which === "sup");
      if (matches) {
        last.annotation = arg;
        return;
      }
    }
    if (last && last.kind === "scripts" && !last[which]) {
      last[which] = arg;
      return;
    }
    if (last && last.kind === "scripts" && last[which]) {
      this.error(`Double ${which === "sup" ? "superscript" : "subscript"}; use braces to group`, t);
    }
    const base = last ? asRow(items.pop()!) : row();
    const node: Scripts = { kind: "scripts", base };
    node[which] = arg;
    items.push(node);
  }

  private attachPrimes(items: MathNode[], primes: MathNode[]) {
    const last = items[items.length - 1];
    if (last && last.kind === "scripts" && !last.sup) {
      last.sup = row(...primes);
      return;
    }
    if (last && last.kind === "scripts" && last.sup && last.sup.children.every(isPrime)) {
      last.sup.children.push(...primes);
      return;
    }
    const base = last ? asRow(items.pop()!) : row();
    items.push({ kind: "scripts", base, sup: row(...primes) });
  }

  // ---------------------------------------------------------------- atoms

  /** Parses one atom. Returns undefined for tokens that produce no node (\displaystyle…). */
  private parseAtom(t: Token, singleChar = false): MathNode | undefined {
    switch (t.type) {
      case "lbrace": {
        this.next();
        const inner = this.parseRow({ inGroup: true });
        this.expect("rbrace", "Missing closing brace '}'");
        // A single-node group is just that node, except scripts (keep {x_a}^b distinct).
        if (inner.children.length === 1 && inner.children[0]!.kind !== "scripts") return inner.children[0];
        return inner;
      }
      case "char":
        return this.parseChar(singleChar);
      case "tilde":
        this.next();
        return { kind: "space", width: "nbsp" };
      case "command":
        return this.parseCommand();
      default:
        // Structural token in an unexpected place
        this.next();
        this.error(`Unexpected '${t.value}'`, t);
        return undefined;
    }
  }

  private parseChar(singleChar: boolean): MathNode {
    const t = this.next();
    const c = t.value;
    if (/[0-9]/.test(c)) {
      let text = c;
      if (!singleChar) {
        for (;;) {
          const n = this.tokens[this.pos]!;
          const n2 = this.tokens[this.pos + 1];
          if (n.type === "char" && /[0-9]/.test(n.value)) {
            text += n.value;
            this.pos++;
          } else if (n.type === "char" && n.value === "." && n2?.type === "char" && /[0-9]/.test(n2.value)) {
            text += ".";
            this.pos++;
          } else break;
        }
      }
      return { kind: "number", text };
    }
    if (/[A-Za-z]/.test(c)) return { kind: "ident", text: c };
    switch (c) {
      case "+":
        return op("+", "binary");
      case "-":
        return op("−", "binary");
      case "*":
        return op("∗", "binary");
      case "=":
      case "<":
      case ">":
      case ":":
        return op(c, "relation");
      case ",":
      case ";":
        return op(c, "punctuation");
      default:
        break;
    }
    if (NARY_CHARS.has(c)) return this.makeNary(c);
    const def = CHAR_CLASS.get(c);
    if (def) return def.type === "ident" ? { kind: "ident", text: c } : op(c, def.type);
    if (/\p{L}/u.test(c)) return { kind: "ident", text: c };
    return op(c, "ordinary");
  }

  private parseCommand(): MathNode | undefined {
    const t = this.next();
    const name = t.value;

    const sym = SYMBOLS[name];
    if (sym) return sym.type === "ident" ? { kind: "ident", text: sym.char } : op(sym.char, sym.type);

    const nary = NARY[name];
    if (nary) return this.makeNary(nary);

    if (name in FUNCTIONS) {
      return this.makeFunction(FUNCTION_DISPLAY[name] ?? name, FUNCTIONS[name]!);
    }

    const accent = ACCENTS[name];
    if (accent) return { kind: "accent", accent, body: this.parseArg(t) };

    const font = FONTS[name];
    if (font) {
      const body = this.parseArg(t);
      applyVariant(body, font);
      return body.children.length === 1 ? body.children[0] : body;
    }

    const space = SPACES[name];
    if (space) return { kind: "space", width: space };

    if (TEXT_COMMANDS.has(name)) {
      const text = this.readRawGroup();
      return { kind: "text", text: text ?? "" };
    }

    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "cfrac": {
        const num = this.parseArg(t);
        const den = this.parseArg(t);
        const size = name === "dfrac" || name === "cfrac" ? "display" : name === "tfrac" ? "text" : undefined;
        return size ? { kind: "fraction", num, den, bar: true, size } : { kind: "fraction", num, den, bar: true };
      }
      case "binom":
      case "dbinom":
      case "tbinom": {
        const num = this.parseArg(t);
        const den = this.parseArg(t);
        return delimited("(", ")", row({ kind: "fraction", num, den, bar: false }));
      }
      case "genfrac": {
        const left = this.readRawGroup() ?? "";
        const right = this.readRawGroup() ?? "";
        const thickness = (this.readRawGroup() ?? "").trim();
        this.readRawGroup(); // style
        const num = this.parseArg(t);
        const den = this.parseArg(t);
        const frac: MathNode = { kind: "fraction", num, den, bar: !/^0(\.0*)?\s*[a-z]*$/.test(thickness) };
        if (!left && !right) return frac;
        return delimited(DELIMITERS[left] ?? left, DELIMITERS[right] ?? right, row(frac));
      }
      case "sqrt": {
        let index: Row | undefined;
        const n = this.peek();
        if (n.type === "char" && n.value === "[") {
          this.next();
          index = this.parseRow({ stopChar: "]" });
          const close = this.peek();
          if (close.type === "char" && close.value === "]") this.next();
          else this.error("Missing ']' after root index", close);
        }
        const body = this.parseArg(t);
        return index ? { kind: "radical", index, body } : { kind: "radical", body };
      }
      case "operatorname": {
        let limits = false;
        const star = this.peek();
        if (star.type === "char" && star.value === "*") {
          this.next();
          limits = true;
        }
        return this.makeFunction((this.readRawGroup() ?? "").trim(), limits);
      }
      case "overset":
      case "stackrel":
      case "underset": {
        const annotation = this.parseArg(t);
        const body = this.parseArg(t);
        return { kind: "stack", position: name === "underset" ? "under" : "over", body, annotation, brace: false };
      }
      case "overbrace":
      case "underbrace":
        return { kind: "stack", position: name === "overbrace" ? "over" : "under", body: this.parseArg(t), brace: true };
      case "boxed":
      case "fbox":
        return { kind: "boxed", body: this.parseArg(t) };
      case "left":
        return this.parseLeftRight();
      case "begin":
        return this.parseEnvironment(t);
      case "{":
      case "}":
      case "#":
      case "$":
      case "%":
      case "&":
      case "_":
        return op(name, "ordinary");
      case "|":
        return op("‖", "ordinary");
      case "big": case "Big": case "bigg": case "Bigg":
      case "bigl": case "bigr": case "Bigl": case "Bigr":
      case "biggl": case "biggr": case "Biggl": case "Biggr": {
        const d = this.readDelimiter();
        return d ? op(d, "ordinary") : undefined;
      }
      default:
        break;
    }

    if (IGNORED.has(name)) return undefined;

    this.error(`Unknown command \\${name}`, t, "warning");
    return { kind: "raw", latex: `\\${name}`, message: `Unknown command \\${name}` };
  }

  private makeNary(opChar: string): NAry {
    const node: NAry = { kind: "nary", op: opChar, limits: "auto", body: row() };
    this.pending.add(node);
    return node;
  }

  private makeFunction(name: string, limits: boolean): FunctionApp {
    const node: FunctionApp = { kind: "function", name, limits, arg: row() };
    this.pending.add(node);
    return node;
  }

  /** A mandatory argument: a {group} or a single atom. */
  private parseArg(cmd: Token): Row {
    const t = this.peek();
    if (t.type === "eof" || t.type === "rbrace" || t.type === "amp" || t.type === "newline") {
      this.error(`Missing argument for \\${cmd.value}`, cmd);
      return row();
    }
    if (t.type === "lbrace") {
      this.next();
      const r = this.parseRow({ inGroup: true });
      this.expect("rbrace", "Missing closing brace '}'");
      return r;
    }
    const node = this.parseAtom(t, true);
    return node ? asRow(node) : row();
  }

  private expect(type: Token["type"], message: string): boolean {
    const t = this.peek();
    if (t.type === type) {
      this.next();
      return true;
    }
    this.error(message, t);
    return false;
  }

  /** Reads {raw text} verbatim (used for \text, environment names, \operatorname). */
  private readRawGroup(): string | undefined {
    const open = this.peek();
    if (open.type !== "lbrace") {
      this.error("Expected '{'", open);
      return undefined;
    }
    this.next();
    let depth = 1;
    const startOffset = open.end;
    for (;;) {
      const t = this.tokens[this.pos]!;
      if (t.type === "eof") {
        this.error("Missing closing brace '}'", t);
        return this.src.slice(startOffset);
      }
      this.pos++;
      if (t.type === "lbrace") depth++;
      else if (t.type === "rbrace" && --depth === 0) return this.src.slice(startOffset, t.start);
    }
  }

  private readDelimiter(): string {
    const t = this.next();
    const key = t.type === "command" ? `\\${t.value}` : t.value;
    const d = DELIMITERS[key];
    if (d === undefined) {
      this.error(`'${key || t.type}' is not a valid delimiter`, t);
      return "";
    }
    return d;
  }

  private parseLeftRight(): Delimited {
    const open = this.readDelimiter();
    const parts: Row[] = [];
    let separator: string | undefined;
    let close = "";
    for (;;) {
      parts.push(this.parseRow({ inLeft: true }));
      const t = this.peek();
      if (t.type === "command" && t.value === "middle") {
        this.next();
        const sep = this.readDelimiter();
        if (separator !== undefined && sep !== separator) {
          this.error("Different \\middle delimiters in one group are not supported; using the first", t, "warning");
        }
        separator ??= sep;
        continue;
      }
      if (t.type === "command" && t.value === "right") {
        this.next();
        close = this.readDelimiter();
      } else {
        this.error("Missing \\right", t);
      }
      break;
    }
    const node: Delimited = { kind: "delimited", open, close, parts };
    if (separator !== undefined) node.separator = separator;
    return node;
  }

  private parseEnvironment(begin: Token): MathNode {
    const name = (this.readRawGroup() ?? "").trim();
    if (name === "array" || name === "alignat" || name === "alignat*") this.readRawGroup(); // column spec / count

    const rows: Row[][] = [[]];
    for (;;) {
      const cell = this.parseRow({ inEnv: true });
      rows[rows.length - 1]!.push(cell);
      const t = this.peek();
      if (t.type === "amp") {
        this.next();
        continue;
      }
      if (t.type === "newline") {
        this.next();
        // Optional vertical space: \\[4pt]
        const n = this.peek();
        if (n.type === "char" && n.value === "[") {
          while (this.peek().type !== "eof" && !(this.peek().type === "char" && this.peek().value === "]")) this.next();
          this.next();
        }
        rows.push([]);
        continue;
      }
      if (t.type === "command" && t.value === "end") {
        this.next();
        const endName = (this.readRawGroup() ?? "").trim();
        if (endName !== name) this.error(`\\begin{${name}} closed by \\end{${endName}}`, t);
      } else {
        this.error(`Missing \\end{${name}}`, t);
      }
      break;
    }
    // A trailing \\ produces an empty last row: drop it.
    const last = rows[rows.length - 1]!;
    if (rows.length > 1 && last.length === 1 && last[0]!.children.length === 0) rows.pop();

    if (MATRIX_ENVS.has(name)) return { kind: "matrix", matrixKind: name as MatrixKind, rows } satisfies Matrix;
    if (name === "array") return { kind: "matrix", matrixKind: "matrix", rows } satisfies Matrix;
    if (name === "cases" || name === "dcases") return { kind: "cases", rows } satisfies Cases;
    if (ALIGNED_ENVS.has(name)) return { kind: "aligned", env: ENV_NORMALISE[name] ?? "aligned", rows };

    this.error(`Unknown environment '${name}', treated as a matrix`, begin, "warning");
    return { kind: "matrix", matrixKind: "matrix", rows };
  }

  // ---------------------------------------------------------------- post-processing

  /**
   * Structural fix-ups that need to see siblings:
   *  1. {}^{a}_{b}X  → prescripts on X (tensor notation)
   *  2. large operators capture their operand (body) up to the next relation or +/−
   *  3. functions capture their argument
   */
  private postprocess(items: MathNode[]): MathNode[] {
    const out: MathNode[] = [];
    let i = 0;
    while (i < items.length) {
      const node = items[i]!;
      i++;

      if (node.kind === "scripts" && node.base.children.length === 0 && i < items.length) {
        const next = items[i]!;
        if (next.kind !== "operator" && next.kind !== "space") {
          i++;
          const pre: MathNode = { kind: "prescripts", base: asRow(next) };
          if (node.sub) pre.sub = node.sub;
          if (node.sup) pre.sup = node.sup;
          out.push(pre);
          continue;
        }
      }

      if ((node.kind === "nary" || (node.kind === "function" && node.limits)) && this.pending.has(node)) {
        this.pending.delete(node);
        const captured: MathNode[] = [];
        while (i < items.length && !(captured.length > 0 && stopsBody(items[i]!))) {
          if (captured.length === 0 && isRelationOrPunct(items[i]!)) break;
          captured.push(items[i]!);
          i++;
        }
        const body = row(...this.postprocess(captured));
        if (node.kind === "nary") node.body = body;
        else node.arg = body;
        out.push(node);
        continue;
      }

      if (node.kind === "function" && this.pending.has(node)) {
        this.pending.delete(node);
        const captured: MathNode[] = [];
        const next = items[i];
        if (next && next.kind === "operator" && next.text === "(") {
          let depth = 0;
          while (i < items.length) {
            const n = items[i]!;
            captured.push(n);
            i++;
            if (n.kind === "operator" && n.text === "(") depth++;
            if (n.kind === "operator" && n.text === ")" && --depth === 0) break;
          }
        } else if (next && next.kind !== "operator" && next.kind !== "space") {
          captured.push(next);
          i++;
        }
        node.arg = row(...this.postprocess(captured));
        out.push(node);
        continue;
      }

      out.push(node);
    }
    return out;
  }
}

function op(text: string, opClass: OperatorClass): Operator {
  return { kind: "operator", text, opClass };
}

function delimited(open: string, close: string, part: Row): Delimited {
  return { kind: "delimited", open, close, parts: [part] };
}

function isPrime(n: MathNode): boolean {
  return n.kind === "operator" && n.text === "′";
}

function isRelationOrPunct(n: MathNode): boolean {
  return n.kind === "operator" && (n.opClass === "relation" || n.opClass === "punctuation");
}

function stopsBody(n: MathNode): boolean {
  if (n.kind !== "operator") return false;
  return n.opClass === "relation" || n.opClass === "punctuation" || (n.opClass === "binary" && BODY_STOP_BINARY.has(n.text));
}

/** Applies a font variant to identifiers and numbers (recursively through groups). */
function applyVariant(r: Row, variant: MathVariant) {
  for (const c of r.children) {
    if (c.kind === "ident" || c.kind === "number") c.variant = variant;
    else if (c.kind === "row") applyVariant(c, variant);
    else if (c.kind === "scripts") applyVariant(c.base, variant);
  }
}
