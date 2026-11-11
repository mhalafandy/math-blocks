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
  marker?: { chapter: number; appendix: boolean };
  /** Holds fields, pictures or objects: text positions may not match document positions. */
  complex?: boolean;
}

export interface InterchangeScan {
  name: string;
  fullName: string;
  paragraphs: ScanParagraph[];
  /** Equation number bookmarks already in the document (_MBEq_…): labels converted before. */
  bookmarks: string[];
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
  /** Markers are used (new or existing): numbers are "(chapter.n)" from the markers. */
  usesMarkers: boolean;
}

export const DISPLAY_STYLE = "MTDisplayEquation";
const LABEL_RE = /^eq:[a-z0-9]+(?:-[a-z0-9]+)*$/;
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
  return { latex: s, mapped };
}

// ------------------------------------------------------------------ labels and bookmarks

/** The number bookmark of a label (eq:a-first-moment → _MBEq_a_first_moment), at most 39 characters. */
export function labelBookmark(key: string): string {
  const body = key.replace(/-/g, "_");
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

/** Problems the parser finds: errors, and unknown commands (they would show as red raw text). */
function parseProblems(latex: string): string[] {
  const r = parseLatex(latex);
  return r.diagnostics.filter((d) => d.severity === "error" || /^Unknown command/.test(d.message)).map((d) => d.message);
}

const MARKER_RE = /^\s*\\mbnumbering\s*\{\s*([^}]*?)\s*\}\s*$/;
/** A display paragraph: blanks/tabs, $$…$$ (or \[…\]), then nothing, a label, or a typed number. */
const DISPLAY_RE = /^([\t ]*)(\$\$|\\\[)([\s\S]*?)(\$\$|\\\])([\t ]*)([\s\S]*?)\s*$/;
const TYPED_NUMBER_RE = /^\(\s*([A-Z]|[0-9]+)\s*[.\-]\s*([0-9]+)\s*\)$|^\(\s*([0-9]+)\s*\)$/;
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
      const value = marker[1]!;
      if (!/^(?:[0-9]+|[A-Z])$/.test(value)) {
        issue("error", `\\mbnumbering needs a chapter number or one capital letter, not “${value}”`, p, 0, text.length);
        continue;
      }
      markers.push({ start: p.start, end: p.end, expect: text, value, ...chapterOf(value) });
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
            issue("error", `Label “${key}” must be eq: followed by lowercase letters, digits and hyphens (e.g. eq:a-first-moment)`, p, text.indexOf(tail), text.length);
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

  // Numbers, in document order (existing numbers and markers count too).
  const usesMarkers = scan.paragraphs.some((p) => p.marker) || markers.length > 0;
  let chapter: { chapter: number; appendix: boolean } | null = null;
  let n = 0;
  const byStart = new Map(equations.filter((e) => e.kind === "display").map((e) => [e.start, e]));
  const markerAt = new Map(markers.map((m) => [m.start, m]));
  let warnedBeforeMarker = false;
  for (const p of scan.paragraphs) {
    const mk = markerAt.get(p.start) ?? p.marker;
    if (mk) {
      chapter = { chapter: mk.chapter, appendix: mk.appendix };
      n = 0;
      continue;
    }
    if (p.numbered) {
      n++;
      continue;
    }
    const eq = byStart.get(p.start);
    if (!eq || !eq.numbered) continue;
    n++;
    if (usesMarkers && !chapter && !warnedBeforeMarker) {
      issue("warning", "Numbered equation before the first \\mbnumbering: put \\mbnumbering{…} right after the chapter heading", p, 0, p.text.length);
      warnedBeforeMarker = true;
    }
    eq.number = `(${chapter ? `${chapterLabel(chapter)}.` : ""}${n})`;
    eq.appendix = !!chapter?.appendix;
    if (eq.typedNumber && eq.typedNumber !== eq.number) {
      issue("warning", `Typed number ${eq.typedNumber} becomes ${eq.number} (computed from its position)`, p, 0, p.text.length);
    }
  }

  // References: to a label in this document or converted before; otherwise left as highlighted text.
  for (const r of rawRefs) {
    const key = r.label.replace(/^eq:/, "");
    const bm = labelBookmark(key);
    const eq = defined.get(key);
    const resolved = !!eq || known.has(bm);
    if (!LABEL_RE.test(r.label)) issue("error", `Reference to “${r.label}”: labels are eq: followed by lowercase letters, digits and hyphens`, r.p, r.from, r.to);
    else if (!resolved) issue("error", `Unresolved reference \\${r.form}{${r.label}}: no equation has this label (left as highlighted text)`, r.p, r.from, r.to);
    const shows = eq?.number ? (r.form === "eqref" ? eq.number : eq.number.slice(1, -1)) : undefined;
    references.push({ start: r.p.start + r.from, end: r.p.start + r.to, expect: r.p.text.slice(r.from, r.to), label: key, form: r.form, resolved: resolved && LABEL_RE.test(r.label), bookmark: bm, ...(shows ? { shows } : {}) });
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
