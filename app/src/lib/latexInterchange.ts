/**
 * LaTeX interchange: a Word document whose math is LaTeX text (transcribed pages, written to the
 * convention in docs/LATEX-INTERCHANGE.md) becomes finished MathBlocks equations, equation numbers
 * and cross-references in one pass.
 *
 * This module is the pure part (no Word, no rendering): it reads the paragraphs the add-in scanned,
 * finds every inline equation, display equation, label, reference and numbering marker, normalises
 * what Word's autocorrect does to typed LaTeX, maps older MathType-style forms to notation kinds,
 * checks everything with the real parser, computes the equation numbers, and lists every problem with
 * a snippet of the text around it. The runner (latexInterchangeRun.ts) builds the equations and has
 * the add-in write them.
 */
import { parseLatex } from "@mathblocks/math-latex";
import { lookalikeWarnings } from "@mathblocks/mathtype";
import { KIND_RULES } from "./kindRules";

/** One paragraph as the add-in scanned it (only paragraphs that matter are sent). */
export interface ScanParagraph {
  /** Document position of the paragraph's first character. */
  start: number;
  /** Document position of the paragraph mark (the content is start…end). */
  end: number;
  /** The paragraph's text without its mark. */
  text: string;
  /** Paragraph style (localised name). */
  style: string;
  /** Holds a MathBlocks or MathType equation number field already (counted, not converted). */
  numbered?: boolean;
  /** Holds a numbering marker field already: the chapter it sets. */
  marker?: { chapter: number; appendix: boolean; section?: number };
  /** Holds fields, pictures or objects: text positions may not match document positions. */
  complex?: boolean;
  /** Its number as shown, e.g. "(A.1.3)", and that number's bookmark (MathBlocks or MathType). */
  number?: string;
  bookmark?: string;
}

export interface InterchangeScan {
  name: string;
  fullName: string;
  paragraphs: ScanParagraph[];
  /** Equation number bookmarks already in the document (_MBEq_…): labels converted before. */
  bookmarks: string[];
  /** MathType number fields still in the document. */
  mathTypeNumbers?: number;
}

export type IssueSeverity = "error" | "warning";
export interface Issue {
  severity: IssueSeverity;
  /** What is wrong, in plain words. */
  what: string;
  /** The text around it (to find it in Word). */
  snippet: string;
  /** Document position (to select it). */
  at: number;
}

export interface PlannedEquation {
  kind: "inline" | "display";
  /** Range replaced (display: the whole paragraph content). */
  start: number;
  end: number;
  /** The document text expected in that range (checked before writing). */
  expect: string;
  /** LaTeX as typed. */
  typed: string;
  /** LaTeX after normalisation and legacy mapping (what is converted). */
  latex: string;
  numbered: boolean;
  /** eq:KEY without the eq: prefix. */
  label?: string;
  /** Bookmark of the number (from the label; legacy numbers get one from the equation's ID). */
  bookmark?: string;
  /** Computed number, e.g. "(A.3)". */
  number?: string;
  /** Legacy: the number typed as text, e.g. "(A.3)". */
  typedNumber?: string;
  /** The chapter is a letter (appendix): the number field shows it as a letter. */
  appendix?: boolean;
  /** Paragraph style (display equations). */
  style?: string;
  /** Legacy forms mapped to kinds (for the report). */
  mapped: string[];
  /** Not converted (an error was found in it). */
  invalid?: boolean;
}

export interface PlannedReference {
  start: number;
  end: number;
  expect: string;
  label: string;
  form: "eqref" | "ref";
  /** The label exists (in this document or converted before): a field; otherwise highlighted text. */
  resolved: boolean;
  bookmark: string;
  /** The number it will show, e.g. "(A.3)" (eqref) or "A.3" (ref). */
  shows?: string;
}

export interface PlannedMarker {
  /** \mbnumbering{3} / {A} (chapter or appendix) or \mbnumbering{3.2} / {A.1} (section). */
  level: "chapter" | "section";
  /** Section number (section markers; chapter markers set 0 until the first section marker). */
  section: number;
  start: number;
  end: number;
  expect: string;
  /** Chapter number (1 = A for appendices). */
  chapter: number;
  appendix: boolean;
  /** As typed: "3" or "A". */
  value: string;
}

export interface InterchangePlan {
  equations: PlannedEquation[];
  references: PlannedReference[];
  markers: PlannedMarker[];
  issues: Issue[];
  counts: { inline: number; display: number; numbered: number; references: number; markers: number; legacyNumbers: number; mapped: number };
  /** Markers are used (new or existing): numbers come from the markers. */
  usesMarkers: boolean;
  /** Section markers are used: numbers are (chapter.section.n), the counter restarts per section. */
  usesSections: boolean;
  /** The document still uses MathType's numbering: new numbers would not continue it (convert it first). */
  needsNumberingConversion: boolean;
}

export const DISPLAY_STYLE = "MTDisplayEquation";
/** eq: then letters, digits, dots and hyphens — e.g. eq:3.2.5, eq:A.1.3, eq:energy-balance. */
const LABEL_RE = /^eq:[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/;
/** A label that is an equation number (3.2.5, A.1.3): checked against the computed number. */
const NUMBER_LABEL_RE = /^(?:[0-9]+|[A-Z])(?:\.[0-9]+)+$/;
/** Bookmarks hold at most 40 characters; the number-only twin (_MBEqN_) is one longer. */
const BOOKMARK_MAX = 39;
export const BOOKMARK_PREFIX = "_MBEq_";

// ------------------------------------------------------------------ Word artefacts

/**
 * What Word does to typed LaTeX, undone before parsing: smart quotes, en/em dashes and the minus
 * sign, non-breaking and other spaces, manual line breaks, soft hyphens, zero-width characters, and
 * autocorrect symbols.
 */
const WORD_ARTEFACTS: [RegExp, string][] = [
  [new RegExp("[\\u2018\\u2019\\u201A\\u2032]", "g"), "'"],
  [new RegExp("[\\u201C\\u201D\\u201E\\u2033]", "g"), '"'],
  [new RegExp("[\\u2013\\u2014\\u2212\\u2010\\u2011]", "g"), "-"],
  [new RegExp("[\\u00A0\\u2002\\u2003\\u2009\\u202F\\u2007\\u2008\\u200A]", "g"), " "],
  [new RegExp("[\\u000B\\u2028]", "g"), " "],
  [new RegExp("[\\u00AD\\u200B\\u200C\\u200D\\uFEFF]", "g"), ""],
  [new RegExp("\\u2026", "g"), "\\ldots "],
  [new RegExp("\\u2192", "g"), "\\rightarrow "],
  [new RegExp("\\u2190", "g"), "\\leftarrow "],
  [new RegExp("\\u21D2", "g"), "\\Rightarrow "],
  [new RegExp("\\u21D0", "g"), "\\Leftarrow "],
  [new RegExp("\\u00A9", "g"), "(c)"],
  [new RegExp("\\u00AE", "g"), "(r)"],
  [new RegExp("\\u2122", "g"), "(tm)"],
];

export function normalizeWordText(s: string): string {
  let out = s;
  for (const [re, to] of WORD_ARTEFACTS) out = out.replace(re, to);
  return out;
}

// ------------------------------------------------------------------ legacy forms → kinds

/** Capital letters written as \vec{\mathbf{X}} that are dyadics rather than frames (vectrices). */
export const DYADIC_LETTERS = new Set(["I", "J"]);

/** Older MathType-style forms mapped to notation kinds (and array matrices to matrix environments). */
export function mapLegacyForms(latex: string): { latex: string; mapped: string[] } {
  const mapped: string[] = [];
  let s = latex;
  const note = (what: string) => {
    if (!mapped.includes(what)) mapped.push(what);
  };
  // \mathbf{\overset{\scriptscriptstyle\rightharpoonup}{c}} and \overset{\scriptscriptstyle\rightharpoonup}{\mathbf{c}} → \pvec{c}
  s = s.replace(/\\mathbf\s*\{\s*\\overset\s*\{\s*(?:\\scriptscriptstyle\s*)?\\rightharpoonup\s*\}\s*\{\s*([A-Za-z]|\\[A-Za-z]+)\s*\}\s*\}/g, (_m, c: string) => {
    note("harpoon vector → \\pvec");
    return `\\pvec{${c}}`;
  });
  s = s.replace(/\\overset\s*\{\s*(?:\\scriptscriptstyle\s*)?\\rightharpoonup\s*\}\s*\{\s*\\mathbf\s*\{\s*([A-Za-z]|\\[A-Za-z]+)\s*\}\s*\}/g, (_m, c: string) => {
    note("harpoon vector → \\pvec");
    return `\\pvec{${c}}`;
  });
  // \vec{\mathbf{S}} (capital) → \vectrix{S}; \vec{\mathbf{I}} → \dyadic{I}
  s = s.replace(/\\vec\s*\{\s*\\mathbf\s*\{\s*([A-Z])\s*\}\s*\}/g, (_m, c: string) => {
    if (DYADIC_LETTERS.has(c)) {
      note("\\vec{\\mathbf{I}} → \\dyadic");
      return `\\dyadic{${c}}`;
    }
    note("\\vec{\\mathbf{S}} → \\vectrix");
    return `\\vectrix{${c}}`;
  });
  // Unit vectors of a frame: \hat{s}_1, \hat{\mathbf{s}}_1, \mathbf{\hat{s}}_1 → \bvec{s}_1 (a lowercase
  // letter with an index; a hat without an index — an estimate — is left alone).
  s = s.replace(/\\mathbf\s*\{\s*\\hat\s*\{\s*([a-z])\s*\}\s*\}(?=\s*_)/g, (_m, c: string) => {
    note("\\hat{s}_i → \\bvec");
    return `\\bvec{${c}}`;
  });
  s = s.replace(/\\hat\s*\{\s*(?:\\mathbf\s*\{\s*([a-z])\s*\}|([a-z]))\s*\}(?=\s*_)/g, (_m, a: string | undefined, b: string | undefined) => {
    note("\\hat{s}_i → \\bvec");
    return `\\bvec{${a ?? b}}`;
  });
  // \left[\begin{array}{ccc} … \end{array}\right] → bmatrix (and ( | ‖ { forms)
  const fences: [string, string, string][] = [
    ["\\[", "\\]", "bmatrix"],
    ["\\(", "\\)", "pmatrix"],
    ["\\|", "\\|", "vmatrix"],
    ["\\\\\\|", "\\\\\\|", "Vmatrix"],
    ["\\\\\\{", "\\\\\\}", "Bmatrix"],
  ];
  for (const [open, close, env] of fences) {
    const re = new RegExp(`\\\\left\\s*${open}\\s*\\\\begin\\s*\\{array\\}\\s*\\{[^}]*\\}([\\s\\S]*?)\\\\end\\s*\\{array\\}\\s*\\\\right\\s*${close}`, "g");
    s = s.replace(re, (_m, body: string) => {
      note("\\left…\\begin{array} → " + env);
      return `\\begin{${env}}${body}\\end{${env}}`;
    });
  }
  // Double-struck number sets typed as characters: the LaTeX commands.
  const BB: Record<string, string> = { "ℤ": "Z", "ℝ": "R", "ℕ": "N", "ℚ": "Q", "ℂ": "C" };
  if (/[ℤℝℕℚℂ]/.test(s)) {
    s = s.replace(/[ℤℝℕℚℂ]/g, (c) => `\\mathbb{${BB[c]}}`);
    note("ℤ ℝ ℕ ℚ ℂ → \\mathbb{…}");
  }
  // Indices are written plainly: a forced look (\mathrm{sf}, \mathbf{n}, \mathit{i}) is dropped, the
  // document style draws index labels (italic or upright).
  const plain = KIND_RULES.find((r) => r.id === "plain-indices")!.apply(s);
  if (plain !== s) {
    note("\\mathrm{…} in an index → plain (the document style draws it)");
    s = plain;
  }
  return { latex: s, mapped };
}

// ------------------------------------------------------------------ labels and bookmarks

/** The number bookmark of a label (eq:energy-balance → _MBEq_energy_balance), at most 39 characters. */
export function labelBookmark(key: string): string {
  // Word allows letters, digits and underscores: dots and hyphens become underscores.
  const body = key.replace(/[.-]/g, "_");
  const name = BOOKMARK_PREFIX + body;
  if (name.length <= BOOKMARK_MAX) return name;
  // Too long: shortened, with a hash of the whole key so different labels stay different.
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const hash = h.toString(36);
  return BOOKMARK_PREFIX + body.slice(0, BOOKMARK_MAX - BOOKMARK_PREFIX.length - hash.length - 1) + "_" + hash;
}

/** Chapter letters: A = 1, B = 2, … */
const chapterOf = (value: string) => (/^[0-9]+$/.test(value) ? { chapter: Number(value), appendix: false } : { chapter: value.charCodeAt(0) - 64, appendix: true });
const chapterLabel = (c: { chapter: number; appendix: boolean }) => (c.appendix ? String.fromCharCode(64 + c.chapter) : String(c.chapter));

// ------------------------------------------------------------------ the plan

const snippetOf = (text: string, from: number, to: number) => {
  const a = Math.max(0, from - 30);
  const b = Math.min(text.length, to + 30);
  return (a > 0 ? "…" : "") + text.slice(a, b).replace(/\t/g, " ⇥ ").replace(/\s+/g, " ").trim() + (b < text.length ? "…" : "");
};

/** Notation the convention rules out (warnings): a frame never takes a subscript. */
function notationWarnings(latex: string): string[] {
  const out: string[] = [...lookalikeWarnings(latex)];
  for (const m of latex.matchAll(/\\vectrix\s*\{\s*([^}]*)\}\s*_/g)) {
    out.push(`\\vectrix{${m[1]}} has a subscript: frames never do (only I and J are dyadics, \\dyadic{J}_{c})`);
  }
  return out;
}

/** Problems the parser finds: errors, and unknown commands (they would show as red raw text). */
function parseProblems(latex: string): string[] {
  const r = parseLatex(latex);
  return r.diagnostics.filter((d) => d.severity === "error" || /^Unknown command/.test(d.message)).map((d) => d.message);
}

const MARKER_RE = /^\s*\\mbnumbering\s*\{\s*([^}]*?)\s*\}\s*$/;
/** A display paragraph: blanks/tabs, $$…$$ (or \[…\]), then nothing, a label, or a typed number. */
const DISPLAY_RE = /^([\t ]*)(\$\$|\\\[)([\s\S]*?)(\$\$|\\\])([\t ]*)([\s\S]*?)\s*$/;
const TYPED_NUMBER_RE = /^\(\s*(?:[A-Z]|[0-9]+)(?:\s*[.\-]\s*[0-9]+)*\s*\)$/;
const REF_RE = /\\(eqref|ref)\s*\{([^}]*)\}/g;

export function planInterchange(scan: InterchangeScan): InterchangePlan {
  const issues: Issue[] = [];
  const equations: PlannedEquation[] = [];
  const references: PlannedReference[] = [];
  const markers: PlannedMarker[] = [];
  const issue = (severity: IssueSeverity, what: string, p: ScanParagraph, from: number, to: number) =>
    issues.push({ severity, what, snippet: snippetOf(p.text, from, to), at: p.start + from });

  const prepare = (typed: string) => {
    const normal = normalizeWordText(typed);
    const legacy = mapLegacyForms(normal);
    return { latex: legacy.latex.trim(), mapped: legacy.mapped };
  };

  // Pass 1: what each paragraph holds.
  const rawRefs: { p: ScanParagraph; from: number; to: number; form: "eqref" | "ref"; label: string }[] = [];
  for (const p of scan.paragraphs) {
    const text = p.text;
    if (!text.trim()) continue;
    const marker = MARKER_RE.exec(normalizeWordText(text));
    if (marker) {
      const value = marker[1]!.replace(/\s+/g, "");
      const m2 = /^([0-9]+|[A-Z])(?:\.([0-9]+))?$/.exec(value);
      if (!m2) {
        issue("error", `\\mbnumbering needs a chapter (3 or A) or a section (3.2 or A.1), not “${value}”`, p, 0, text.length);
        continue;
      }
      markers.push({ start: p.start, end: p.end, expect: text, value, level: m2[2] ? "section" : "chapter", section: m2[2] ? Number(m2[2]) : 0, ...chapterOf(m2[1]!) });
      continue;
    }
    if (/\\mbnumbering/.test(text)) {
      issue("error", "\\mbnumbering must be alone in its paragraph (right after the chapter heading)", p, text.indexOf("\\mbnumbering"), text.indexOf("\\mbnumbering") + 12);
      continue;
    }

    // Display equation paragraph.
    if (/\$\$|\\\[/.test(text)) {
      const m = DISPLAY_RE.exec(text);
      const tail = m ? normalizeWordText(m[6]!).trim() : "";
      const closingOk = m && ((m[2] === "$$" && m[4] === "$$") || (m[2] === "\\[" && m[4] === "\\]"));
      if (!m || !closingOk || /\$\$|\\\[/.test(m[3]!) || /\$\$|\\\[|\\\]/.test(m[6]!)) {
        issue("error", "Malformed display paragraph: it must be TAB, $$…$$, then optionally TAB and \\label{eq:KEY} — nothing else", p, 0, text.length);
        continue;
      }
      const { latex, mapped } = prepare(m[3]!);
      const eq: PlannedEquation = { kind: "display", start: p.start, end: p.end, expect: text, typed: m[3]!, latex, numbered: false, style: p.style, mapped };
      if (tail) {
        const label = /^\\label\s*\{([^}]*)\}$/.exec(tail);
        const typedNumber = TYPED_NUMBER_RE.exec(tail);
        if (label) {
          const key = label[1]!.trim();
          if (!LABEL_RE.test(key)) {
            issue("error", `Label “${key}” must be eq: followed by letters, digits, dots and hyphens (e.g. eq:3.2.5)`, p, text.indexOf(tail), text.length);
            eq.invalid = true;
          }
          eq.numbered = true;
          eq.label = key.replace(/^eq:/, "");
        } else if (typedNumber) {
          eq.numbered = true;
          eq.typedNumber = tail.replace(/\s+/g, "");
        } else {
          issue("error", `Unexpected text after the display equation: “${tail}” (only \\label{eq:KEY} may follow)`, p, text.indexOf(m[6]!.trim()), text.length);
          eq.invalid = true;
        }
      }
      if (p.style !== DISPLAY_STYLE) issue("warning", `Display equation in style “${p.style || "(none)"}”; the convention uses ${DISPLAY_STYLE} (it is converted in its own style)`, p, 0, text.length);
      if (!latex) {
        issue("error", "Empty display equation", p, 0, text.length);
        eq.invalid = true;
      }
      for (const problem of latex ? parseProblems(latex) : []) {
        issue("error", problem, p, text.indexOf(m[3]!), text.indexOf(m[3]!) + m[3]!.length);
        eq.invalid = true;
      }
      for (const w of notationWarnings(latex)) issue("warning", w, p, text.indexOf(m[3]!), text.indexOf(m[3]!) + m[3]!.length);
      equations.push(eq);
      continue;
    }

    // Inline equations and references in running text.
    let i = 0;
    const math: [number, number][] = [];
    while (i < text.length) {
      const c = text[i]!;
      if (c === "\\" && text[i + 1] === "$") {
        i += 2;
        continue;
      }
      const open = c === "$" ? "$" : c === "\\" && text[i + 1] === "(" ? "\\(" : null;
      if (!open) {
        i++;
        continue;
      }
      const close = open === "$" ? "$" : "\\)";
      let j = i + open.length;
      let found = -1;
      while (j < text.length) {
        if (text[j] === "\\" && text[j + 1] === "$") {
          j += 2;
          continue;
        }
        if (text.startsWith(close, j)) {
          found = j;
          break;
        }
        j++;
      }
      if (found < 0) {
        issue("error", `Unmatched ${open}: the inline equation has no closing ${close}`, p, i, Math.min(text.length, i + 20));
        break;
      }
      const end = found + close.length;
      const typed = text.slice(i + open.length, found);
      const { latex, mapped } = prepare(typed);
      const eq: PlannedEquation = { kind: "inline", start: p.start + i, end: p.start + end, expect: text.slice(i, end), typed, latex, numbered: false, mapped };
      if (!latex) {
        issue("error", "Empty inline equation", p, i, end);
        eq.invalid = true;
      }
      for (const problem of latex ? parseProblems(latex) : []) {
        issue("error", problem, p, i, end);
        eq.invalid = true;
      }
      for (const w of notationWarnings(latex)) issue("warning", w, p, i, end);
      if (/\\label\s*\{/.test(typed)) {
        issue("error", "\\label belongs after a display equation ($$…$$ TAB \\label{eq:KEY}), not inside an inline one", p, i, end);
        eq.invalid = true;
      }
      equations.push(eq);
      math.push([i, end]);
      i = end;
    }
    const outside = (at: number) => !math.some(([a, b]) => at >= a && at < b);
    for (const m of text.matchAll(REF_RE)) {
      const at = m.index!;
      if (!outside(at)) continue;
      rawRefs.push({ p, from: at, to: at + m[0].length, form: m[1] as "eqref" | "ref", label: normalizeWordText(m[2]!).trim() });
    }
    for (const m of text.matchAll(/\\label\s*\{[^}]*\}/g)) {
      if (outside(m.index!)) issue("error", "\\label outside a display paragraph (it must follow $$…$$ after a TAB)", p, m.index!, m.index! + m[0].length);
    }
  }

  // Labels: valid, unique (also against labels converted before).
  const known = new Set(scan.bookmarks);
  const defined = new Map<string, PlannedEquation>();
  for (const eq of equations) {
    if (!eq.label || eq.invalid) continue;
    const bm = labelBookmark(eq.label);
    const p = scan.paragraphs.find((x) => x.start === eq.start)!;
    const clash = [...defined.values()].find((d) => d.bookmark === bm && d.label !== eq.label);
    if (clash) {
      issue("error", `Labels eq:${clash.label} and eq:${eq.label} give the same bookmark ${bm}: rename one`, p, 0, p.text.length);
      eq.invalid = true;
      continue;
    }
    if (defined.has(eq.label)) {
      issue("error", `Duplicate label eq:${eq.label} (defined earlier in the document)`, p, 0, p.text.length);
      eq.invalid = true;
      continue;
    }
    if (known.has(bm)) {
      issue("error", `Duplicate label eq:${eq.label}: an equation converted before already has it`, p, 0, p.text.length);
      eq.invalid = true;
      continue;
    }
    eq.bookmark = bm;
    defined.set(eq.label, eq);
  }

  // Equations already numbered in the document, by the number they show: a reference by number
  // (\eqref{eq:A.1.3}) to an equation converted before resolves to its bookmark.
  const existing = new Map<string, string>();
  for (const p of scan.paragraphs) if (p.number && p.bookmark) existing.set(p.number.replace(/\s+/g, ""), p.bookmark);
  for (const eq of equations) {
    if (!eq.label || eq.invalid || !NUMBER_LABEL_RE.test(eq.label) || !existing.has(`(${eq.label})`)) continue;
    const p = scan.paragraphs.find((x) => x.start === eq.start)!;
    issue("error", `Label eq:${eq.label}: an equation already in the document has the number (${eq.label})`, p, 0, p.text.length);
    eq.invalid = true;
    defined.delete(eq.label);
  }

  // One numbering scheme: with MathType's numbers still there, new MathBlocks numbers would not continue them.
  const needsNumberingConversion = (scan.mathTypeNumbers ?? 0) > 0 && (markers.length > 0 || equations.some((e) => e.numbered && !e.invalid));
  if (needsNumberingConversion) {
    const first = scan.paragraphs.find((p) => markers.some((m) => m.start === p.start) || equations.some((e) => e.numbered && e.start === p.start))!;
    issue("error", `This document still uses MathType's equation numbering (${scan.mathTypeNumbers} number(s)): run “Convert numbering” first, or the new numbers would not continue MathType's. Numbered equations and \\mbnumbering markers are left until then.`, first, 0, first.text.length);
    for (const e of equations) if (e.numbered) e.invalid = true;
    markers.length = 0;
    defined.clear();
  }

  // Numbers, in document order (existing numbers and markers count too).
  const usesMarkers = scan.paragraphs.some((p) => p.marker) || markers.length > 0;
  const usesSections = scan.paragraphs.some((p) => (p.marker?.section ?? 0) > 0) || markers.some((m) => m.level === "section");
  let chapter: { chapter: number; appendix: boolean } | null = null;
  let section = 0;
  let n = 0;
  const byStart = new Map(equations.filter((e) => e.kind === "display").map((e) => [e.start, e]));
  const markerAt = new Map(markers.map((m) => [m.start, m]));
  let warnedBeforeMarker = false;
  for (const p of scan.paragraphs) {
    const planned = markerAt.get(p.start);
    const mk = planned ?? p.marker;
    if (mk) {
      const next = { chapter: mk.chapter, appendix: mk.appendix };
      const sec = planned ? planned.section : (p.marker?.section ?? 0);
      if (planned?.level === "section" && chapter && (chapter.chapter !== next.chapter || chapter.appendix !== next.appendix)) {
        issue("warning", `Section marker ${planned.value} follows ${chapter.appendix ? "appendix" : "chapter"} ${chapterLabel(chapter)}: is the chapter part right?`, p, 0, p.text.length);
      }
      chapter = next;
      section = sec;
      n = 0;
      continue;
    }
    if (p.numbered) {
      n++;
      continue;
    }
    const eq = byStart.get(p.start);
    // Equations with an error stay text: they get no number field and do not count.
    if (!eq || !eq.numbered || eq.invalid) continue;
    // With section numbering, a numbered equation needs its section marker first: (4.0.1) is no number.
    if (usesSections && chapter && section === 0) {
      issue("error", `Missing section marker: this numbered equation comes before the first \\mbnumbering{${chapterLabel(chapter)}.n} of ${chapter.appendix ? "appendix" : "chapter"} ${chapterLabel(chapter)} — not converted (put the section marker after the section heading)`, p, 0, p.text.length);
      eq.invalid = true;
      delete eq.bookmark;
      if (eq.label) defined.delete(eq.label);
      continue;
    }
    n++;
    if (usesMarkers && !chapter && !warnedBeforeMarker) {
      issue("warning", "Numbered equation before the first \\mbnumbering: put \\mbnumbering{…} right after the chapter heading", p, 0, p.text.length);
      warnedBeforeMarker = true;
    }
    const prefix = chapter ? `${chapterLabel(chapter)}.${usesSections ? `${section}.` : ""}` : "";
    eq.number = `(${prefix}${n})`;
    eq.appendix = !!chapter?.appendix;
    if (eq.typedNumber && eq.typedNumber !== eq.number) {
      issue("warning", `Typed number ${eq.typedNumber} becomes ${eq.number} (computed from its position)`, p, 0, p.text.length);
    }
    // A label that is a number (eq:3.2.5): it should be the number the equation gets.
    if (eq.label && NUMBER_LABEL_RE.test(eq.label) && `(${eq.label})` !== eq.number) {
      const where = eq.label.split(".").slice(0, -1).join(".");
      const here = prefix.replace(/\.$/, "");
      issue("warning", where !== here ? `Label eq:${eq.label} does not fit the markers: the equation is in ${here || "no section"} and is numbered ${eq.number}` : `Label eq:${eq.label} is numbered ${eq.number} here (references follow the equation, not the label)`, p, 0, p.text.length);
    }
  }

  // References: to a label in this document or converted before; otherwise left as highlighted text.
  for (const r of rawRefs) {
    const key = r.label.replace(/^eq:/, "");
    const bm = labelBookmark(key);
    const eq = defined.get(key);
    // Not a label here: an equation already in the document showing that number (converted from MathType).
    const byNumber = !eq && !known.has(bm) && NUMBER_LABEL_RE.test(key) ? existing.get(`(${key})`) : undefined;
    const resolved = !!eq || known.has(bm) || !!byNumber;
    if (!LABEL_RE.test(r.label)) issue("error", `Reference to “${r.label}”: labels are eq: followed by letters, digits, dots and hyphens`, r.p, r.from, r.to);
    else if (!resolved) issue("error", `Unresolved reference \\${r.form}{${r.label}}: no equation has this label (left as highlighted text)`, r.p, r.from, r.to);
    const number = eq?.number ?? (byNumber ? `(${key})` : undefined);
    const shows = number ? (r.form === "eqref" ? number : number.slice(1, -1)) : undefined;
    references.push({ start: r.p.start + r.from, end: r.p.start + r.to, expect: r.p.text.slice(r.from, r.to), label: key, form: r.form, resolved: resolved && LABEL_RE.test(r.label), bookmark: byNumber ?? bm, ...(shows ? { shows } : {}) });
  }

  // In document order (easier to work through in Word).
  issues.sort((a, b) => a.at - b.at);
  const valid = equations.filter((e) => !e.invalid);
  return {
    equations,
    references,
    markers,
    issues,
    usesMarkers,
    usesSections,
    needsNumberingConversion,
    counts: {
      inline: valid.filter((e) => e.kind === "inline").length,
      display: valid.filter((e) => e.kind === "display" && !e.numbered).length,
      numbered: valid.filter((e) => e.kind === "display" && e.numbered).length,
      references: references.filter((r) => r.resolved).length,
      markers: markers.length,
      legacyNumbers: valid.filter((e) => e.typedNumber).length,
      mapped: valid.filter((e) => e.mapped.length).length,
    },
  };
}

/** The report as plain text (copied to the clipboard, saved with the self-test). */
export function describePlan(plan: InterchangePlan, name: string): string {
  const c = plan.counts;
  const errors = plan.issues.filter((i) => i.severity === "error");
  const warnings = plan.issues.filter((i) => i.severity === "warning");
  const lines = [
    `Convert LaTeX — “${name}”`,
    `${c.inline} inline, ${c.display} display, ${c.numbered} numbered (${c.legacyNumbers} with a typed number), ${c.references} references, ${c.markers} numbering markers; ${c.mapped} with older forms mapped to notation kinds.`,
    `${errors.length} error(s) (not converted), ${warnings.length} warning(s).`,
  ];
  for (const i of plan.issues) lines.push(`${i.severity === "error" ? "ERROR  " : "WARNING"}  ${i.what} — “${i.snippet}”`);
  return lines.join("\n");
}
