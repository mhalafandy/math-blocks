import { isRomanNumeral, isStyleLetter, isTransposeMark, letterRoles, type LetterRole, type MathNode, type MathStyle, type Row, type SymbolRule } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { peel } from "./notation";

/**
 * Document style, reading the document: what each single-letter index means (classification,
 * proposed from the document's own equations), and what deviates from the style ("Check style").
 * Pure functions over LaTeX; nothing here writes.
 */

// ------------------------------------------------------------------ walking

interface Ctx {
  /** In a subscript/superscript used as an index. */
  index: boolean;
  /** In the lower limit of ∑/∏/∫ or a range. */
  limit: boolean;
  /** In a notation kind's frame label. */
  frame: boolean;
}

type Visit = (n: MathNode, row: Row, i: number, ctx: Ctx) => void;

function walk(root: Row, f: Visit) {
  const visitRow = (r: Row | undefined, ctx: Ctx) => {
    if (!r) return;
    r.children.forEach((n, i) => {
      f(n, r, i, ctx);
      visitNode(n, ctx);
    });
  };
  const visitNode = (n: MathNode, ctx: Ctx) => {
    const idx = { index: true, limit: false, frame: false };
    switch (n.kind) {
      case "scripts":
      case "prescripts": {
        visitRow(n.base, ctx);
        const b = n.base.children;
        const exponential = n.kind === "scripts" && b.length === 1 && b[0]!.kind === "ident" && b[0]!.text === "e";
        visitRow(n.sub, idx);
        if (n.sup && !isTransposeMark(n.sup)) visitRow(n.sup, exponential ? ctx : idx);
        return;
      }
      case "nary":
        visitRow(n.sub, { index: true, limit: true, frame: false });
        visitRow(n.sup, idx);
        visitRow(n.body, ctx);
        return;
      case "function":
        visitRow(n.sub, { index: true, limit: true, frame: false });
        visitRow(n.sup, idx);
        visitRow(n.arg, ctx);
        return;
      case "notation":
        if (n.frames) visitRow(n.frames, { index: true, limit: false, frame: true });
        if (n.name === "dcm" || n.name === "frm") n.args.forEach((a) => visitRow(a, { index: true, limit: false, frame: true }));
        else n.args.forEach((a) => visitRow(a, ctx));
        return;
      default:
        for (const [k, v] of Object.entries(n)) {
          if (k === "meta") continue;
          const each = (x: unknown) => {
            if (!x || typeof x !== "object") return;
            if (Array.isArray(x)) return x.forEach(each);
            if ((x as MathNode).kind === "row") visitRow(x as Row, ctx);
          };
          each(v);
        }
    }
  };
  visitRow(root, { index: false, limit: false, frame: false });
}

type Letter = Extract<MathNode, { kind: "ident" }>;
const isLetter = (n: MathNode | undefined): n is Letter => !!n && n.kind === "ident" && isStyleLetter(n.text);
const isRel = (n: MathNode | undefined, ...ops: string[]) => !!n && n.kind === "operator" && ops.includes(n.text);

/** The run of adjacent letters around position i (index words such as "sf"). */
function runAt(r: Row, i: number): { start: number; end: number } {
  let start = i;
  let end = i;
  while (isLetter(r.children[start - 1])) start--;
  while (isLetter(r.children[end + 1])) end++;
  return { start, end };
}

// ------------------------------------------------------------------ classification

export interface LetterProposal {
  letter: string;
  /** Proposed meaning; null = undecided (the user chooses). */
  proposed: LetterRole | null;
  /** Why (shown next to the choice). */
  reasons: string[];
  /** How many times it is used as a single-letter index. */
  uses: number;
  /** A few equations where it is an index. */
  examples: string[];
}

/**
 * For every letter used alone as an index, a proposed meaning with the evidence: used as a
 * summation/product index or in a range → counter; also used on its own as a variable → variable;
 * a frame label of a notation kind → label. Conflicting or no evidence → undecided.
 */
export function classifyIndices(latexes: string[]): LetterProposal[] {
  const ev = new Map<string, { uses: number; counter: string[]; variable: number; label: number; examples: string[] }>();
  const get = (l: string) => {
    let e = ev.get(l);
    if (!e) ev.set(l, (e = { uses: 0, counter: [], variable: 0, label: 0, examples: [] }));
    return e;
  };
  const standalone = new Map<string, number>();
  for (const latex of latexes) {
    const root = parseLatex(latex).root;
    walk(root, (n, r, i, ctx) => {
      if (!isLetter(n) || n.variant === "bold" || n.variant === "bold-italic") return;
      const run = runAt(r, i);
      const single = run.start === run.end;
      const next = r.children[i + 1];
      const prev = r.children[i - 1];
      // ∑_{i=1}, ∏_{k∈K}; i = 1, …, n; 1 ≤ i ≤ n: a counter.
      const ellipsis = r.children.some((c) => (c.kind === "operator" || c.kind === "ident") && /[…⋯]/.test(c.text));
      const range =
        single &&
        ((ctx.limit && isRel(next, "=", "∈")) ||
          (isRel(next, "=") && r.children[i + 2]?.kind === "number" && ellipsis) ||
          (isRel(prev, "≤", "<") && isRel(next, "≤", "<")));
      if (ctx.index && single) {
        // A Roman numeral (S_I, s_1^{V}) is a label by the document style, not a letter to classify.
        if (isRomanNumeral(n.text)) return;
        const e = get(n.text);
        if (!ctx.limit) {
          e.uses++;
          if (e.examples.length < 3 && !e.examples.includes(latex)) e.examples.push(latex);
        }
        if (ctx.frame) e.label++;
        if (range) e.counter.push(ctx.limit ? "a summation or product index" : "used in a range");
        else if (ctx.limit && /[∑∏]/.test(latex)) e.counter.push("a summation or product index");
        return;
      }
      if (!ctx.index) {
        if (range) {
          get(n.text).counter.push("used in a range");
          return;
        }
        if (single) standalone.set(n.text, (standalone.get(n.text) ?? 0) + 1);
      }
    });
  }
  const out: LetterProposal[] = [];
  for (const [letter, e] of ev) {
    if (!e.uses) continue;
    const reasons: string[] = [];
    const counter = e.counter.length > 0;
    const variable = (standalone.get(letter) ?? 0) > 0;
    const label = e.label > 0;
    if (counter) reasons.push(`counter: ${[...new Set(e.counter)].join(", ")}`);
    if (variable) reasons.push(`variable: also used on its own in ${standalone.get(letter)} place(s)`);
    if (label) reasons.push("label: a frame label of a notation kind");
    const kinds = [counter, variable, label].filter(Boolean).length;
    const proposed: LetterRole | null = kinds !== 1 ? null : counter ? "counter" : variable ? "variable" : "label";
    if (!kinds) reasons.push("only used as an index, nothing shows what it means");
    else if (kinds > 1) reasons.push("conflicting uses: choose");
    out.push({ letter, proposed, reasons, uses: e.uses, examples: e.examples });
  }
  return out.sort((a, b) => (a.proposed === null ? 0 : 1) - (b.proposed === null ? 0 : 1) || b.uses - a.uses || a.letter.localeCompare(b.letter));
}

// ------------------------------------------------------------------ Check style

export type StyleIssueKind = "forced" | "mixed" | "forms" | "outdated" | "rule";

export interface StyleIssue {
  /** Stable key (kept as an exception in the style). */
  key: string;
  kind: StyleIssueKind;
  message: string;
  /** Equations concerned (positions in the list given). */
  equations: number[];
  /** LaTeX of the first equation concerned. */
  snippet: string;
  /** Conform to the style: the equation's new LaTeX (none: nothing to rewrite, or only a redraw). */
  fix?: (latex: string) => string;
  /** Conforming means drawing again in the current style (no LaTeX change). */
  redraw?: boolean;
  /** A proposed symbol rule (docs/KINDS-MODEL.md §6): accepting it adds the rule to the style and redraws. */
  rule?: SymbolRule;
}

export interface CheckedEquation {
  latex: string;
  /** Identifies the equation in keys (its ID in Word). */
  id: string;
  /** Style fingerprint it was drawn in (Classic pictures). */
  styleHash?: string;
}

const STYLED = new Set(["normal", "italic"]);
const cmd = (v: string | undefined) => (v === "normal" ? "\\mathrm" : v === "italic" ? "\\mathit" : v === "bold" ? "\\mathbf" : "\\boldsymbol");

/** Removes the forced styles a token carries in an equation (letters of that text, in that context). */
function stripForced(latex: string, token: string, inIndex: boolean): string {
  const root = parseLatex(latex).root;
  let changed = false;
  walk(root, (n, r, i, ctx) => {
    if (!isLetter(n) || ctx.index !== inIndex || !n.variant) return;
    if (!STYLED.has(n.variant) && !(ctx.index && (n.variant === "bold" || n.variant === "bold-italic"))) return;
    const run = runAt(r, i);
    const text = r.children.slice(run.start, run.end + 1).map((c) => (c as Letter).text).join("");
    if (text !== token && n.text !== token) return;
    delete n.variant;
    changed = true;
  });
  return changed ? serializeLatex(root) : latex;
}

/** Forced looks found in one equation: [token, variant, in index]. */
function forcedIn(latex: string): { token: string; variant: string; index: boolean }[] {
  const out: { token: string; variant: string; index: boolean }[] = [];
  const seen = new Set<string>();
  walk(parseLatex(latex).root, (n, r, i, ctx) => {
    if (!isLetter(n) || !n.variant) return;
    const bold = n.variant === "bold" || n.variant === "bold-italic";
    // Bold base letters are meaning (vectors, matrices); bold in an index is a look.
    if (bold && !ctx.index) return;
    if (!bold && !STYLED.has(n.variant)) return;
    const run = runAt(r, i);
    if (run.start !== i) return;
    const letters = r.children.slice(run.start, run.end + 1) as Letter[];
    // Words and units outside indices (\mathrm{kg}, \mathrm{rad}) are text, not symbols.
    if (!ctx.index && letters.length > 1) return;
    const token = letters.map((l) => l.text).join("");
    const k = `${token}|${n.variant}|${ctx.index}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ token, variant: n.variant, index: ctx.index });
  });
  return out;
}

/** Index tokens written plainly (no forced look) in an equation. */
function plainIndexTokens(latex: string): Set<string> {
  const out = new Set<string>();
  walk(parseLatex(latex).root, (n, r, i, ctx) => {
    if (!ctx.index || ctx.limit || !isLetter(n) || n.variant) return;
    const run = runAt(r, i);
    if (run.start !== i) return;
    out.add((r.children.slice(run.start, run.end + 1) as Letter[]).map((l) => l.text).join(""));
  });
  return out;
}

/** Forms each letter is written in: notation kinds and hand decorations (accents, bold). */
function formsIn(latex: string): { letter: string; form: string }[] {
  const out: { letter: string; form: string }[] = [];
  walk(parseLatex(latex).root, (n, _r, _i, ctx) => {
    if (ctx.index) return;
    if (n.kind === "notation" && n.args[0]?.children.length === 1) {
      const a = n.args[0].children[0]!;
      if ((a.kind === "ident" || a.kind === "number") && n.name !== "dcm" && n.name !== "frm" && n.name !== "T" && n.name !== "diff") out.push({ letter: a.text, form: `\\${n.name}` });
      return;
    }
    if (n.kind === "accent" || n.kind === "stack") {
      const p = peel(n);
      if (p) out.push({ letter: p.core.text, form: p.key.replace(/\|?(bold|bold-italic)$/, (m) => (m ? " bold" : "")) });
    }
  });
  return out;
}

/**
 * What deviates from the document's style: forced \mathrm/\mathit on symbols and bold in indices,
 * an index written forced in some equations and plain in others, a letter written in several forms
 * (kinds and hand decorations), and pictures drawn in an older style. Exceptions are left out.
 */
export function checkStyle(eqs: CheckedEquation[], style: MathStyle, currentHash?: string): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const except = new Set(style.exceptions);
  const forcedByToken = new Map<string, { eqs: Set<number>; variant: string }>();
  const plainByToken = new Map<string, Set<number>>();
  const forms = new Map<string, Map<string, Set<number>>>();
  eqs.forEach((eq, k) => {
    for (const f of forcedIn(eq.latex)) {
      const where = f.index ? "index" : "symbol";
      const key = `forced:${where}:${f.token}:${f.variant}:${eq.id}`;
      if (f.index) {
        const e = forcedByToken.get(f.token) ?? { eqs: new Set<number>(), variant: f.variant };
        e.eqs.add(k);
        forcedByToken.set(f.token, e);
      }
      if (except.has(key)) continue;
      issues.push({
        key,
        kind: "forced",
        message: `${f.index ? "Index" : "Symbol"} “${f.token}” is forced ${f.variant === "normal" ? "upright" : f.variant === "italic" ? "italic" : "bold"} (${cmd(f.variant)}{${f.token}}); the document style would draw it.`,
        equations: [k],
        snippet: eq.latex,
        fix: (l) => stripForced(l, f.token, f.index),
      });
    }
    for (const t of plainIndexTokens(eq.latex)) {
      const s = plainByToken.get(t) ?? new Set<number>();
      s.add(k);
      plainByToken.set(t, s);
    }
    for (const f of formsIn(eq.latex)) {
      const m = forms.get(f.letter) ?? new Map<string, Set<number>>();
      const s = m.get(f.form) ?? new Set<number>();
      s.add(k);
      m.set(f.form, s);
      forms.set(f.letter, m);
    }
    if (currentHash && eq.styleHash && eq.styleHash !== currentHash) {
      const key = `outdated:${eq.id}:${currentHash}`;
      if (!except.has(key)) issues.push({ key, kind: "outdated", message: "Drawn in an earlier version of the document style.", equations: [k], snippet: eq.latex, redraw: true });
    }
  });
  for (const [token, f] of forcedByToken) {
    const plain = plainByToken.get(token);
    if (!plain?.size) continue;
    const key = `mixed:${token}`;
    if (except.has(key)) continue;
    const all = [...new Set([...f.eqs, ...plain])].sort((a, b) => a - b);
    issues.push({
      key,
      kind: "mixed",
      message: `Index “${token}” is written ${f.variant === "normal" ? "upright" : f.variant === "italic" ? "italic" : "bold"} in ${f.eqs.size} equation(s) and plainly in ${plain.size}.`,
      equations: all,
      snippet: eqs[all[0]!]!.latex,
      fix: (l) => stripForced(l, token, true),
    });
  }
  issues.push(...proposeRules(eqs, style, except));
  for (const [letter, m] of forms) {
    if (m.size < 2) continue;
    const key = `forms:${letter}`;
    if (except.has(key)) continue;
    const all = [...new Set([...m.values()].flatMap((s) => [...s]))].sort((a, b) => a - b);
    const list = [...m.entries()].map(([form, s]) => `${form} (${s.size})`).join(", ");
    issues.push({ key, kind: "forms", message: `“${letter}” is written in ${m.size} forms: ${list}. Review notation kinds turns older forms into kinds.`, equations: all, snippet: eqs[all[0]!]!.latex });
  }
  return issues;
}

const GREEK_LATEX: Record<string, string> = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", θ: "theta", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ρ: "rho", σ: "sigma", τ: "tau", φ: "phi", χ: "chi", ψ: "psi", ω: "omega", Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Φ: "Phi", Ψ: "Psi", Ω: "Omega" };
const letterLatex = (t: string) => (GREEK_LATEX[t] ? `\\${GREEK_LATEX[t]}` : t);

/**
 * Proposed symbol rules from the whole document (docs/KINDS-MODEL.md §6): a letter always written bold → "a vector
 * (or, for a capital, a matrix) when bold"; e only as the base of a power → "e is a constant". Only what no rule
 * or classification says yet; a rejected proposal (kept as an exception) is not proposed again.
 */
function proposeRules(eqs: CheckedEquation[], style: MathStyle, except: Set<string>): StyleIssue[] {
  const out: StyleIssue[] = [];
  const bold = new Map<string, Set<number>>();
  const plain = new Map<string, Set<number>>();
  const ePower = new Set<number>();
  const eOther = new Set<number>();
  eqs.forEach((eq, k) => {
    let root;
    try {
      root = parseLatex(eq.latex).root;
    } catch {
      return;
    }
    const powerBases = new WeakSet<MathNode>();
    walk(root, (n, _r, _i, ctx) => {
      if (ctx.index) return;
      if (n.kind === "scripts" && n.sup && !isTransposeMark(n.sup) && n.base.children.length === 1 && n.base.children[0]!.kind === "ident" && n.base.children[0]!.text === "e") powerBases.add(n.base.children[0]!);
      if (!isLetter(n)) return;
      const add = (m: Map<string, Set<number>>) => m.set(n.text, (m.get(n.text) ?? new Set<number>()).add(k));
      if (n.variant === "bold" || n.variant === "bold-italic") add(bold);
      else if (!n.variant) {
        add(plain);
        if (n.text === "e") (powerBases.has(n) ? ePower : eOther).add(k);
      }
    });
  });
  const ruled = (text: string) => style.symbols.some((r) => r.text === text && !r.sub);
  for (const [text, s] of bold) {
    if (s.size < 2 || plain.has(text) || ruled(text)) continue;
    const capital = text !== text.toLowerCase();
    const kind = capital ? "mat" : "pvec";
    const key = `rule:${text}:bold:${kind}`;
    if (except.has(key)) continue;
    const symbol = `\\boldsymbol{${letterLatex(text)}}`;
    const all = [...s].sort((a, b) => a - b);
    out.push({ key, kind: "rule", message: `“${text}” is always written bold (${s.size} equations): make it a ${capital ? "matrix" : "physical vector"} when bold? It is then drawn in that kind's style and listed as one symbol.`, equations: all, snippet: eqs[all[0]!]!.latex, rule: { symbol, text, when: { bold: true }, kind } });
  }
  if (ePower.size && !eOther.size && !ruled("e") && letterRoles(style).e === undefined && !except.has("rule:e:constant")) {
    const all = [...ePower].sort((a, b) => a - b);
    out.push({ key: "rule:e:constant", kind: "rule", message: `e is only used as the base of a power (${ePower.size} equations): make it a constant in this document?`, equations: all, snippet: eqs[all[0]!]!.latex, rule: { symbol: "e", text: "e", kind: "constant" } });
  }
  return out;
}
