import { autocompletion, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { linter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { latexCommands, parseLatex } from "@mathblocks/math-latex";

/**
 * LaTeX (math mode) support for CodeMirror 6: tokenizer, colours, completion and diagnostics.
 * Completions come from the same command tables the converter uses, so everything suggested
 * converts cleanly to Word.
 */

interface TokState {
  /** The previous token was \begin or \end: the next {…} is an environment name. */
  envName: boolean;
}

const latexMath = StreamLanguage.define<TokState>({
  name: "latex-math",
  startState: () => ({ envName: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (state.envName) {
      state.envName = false;
      if (stream.match(/^\{[A-Za-z*]+\}/)) return "string";
    }
    if (stream.match(/^%.*/)) return "comment";
    if (stream.match(/^\\(begin|end)(?![A-Za-z])/)) {
      state.envName = true;
      return "keyword";
    }
    if (stream.match(/^\\(left|right|middle)(?![A-Za-z])/)) return "keyword";
    if (stream.match(/^\\[A-Za-z]+\*?/)) return "atom";
    if (stream.match(/^\\\\/)) return "operator"; // new line in environments
    if (stream.match(/^\\./)) return "atom"; // \, \{ \| …
    if (stream.match(/^[{}]/)) return "brace";
    if (stream.match(/^[[\]()|]/)) return "bracket";
    if (stream.match(/^[\^_&]/)) return "operator";
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return "number";
    if (stream.match(/^[A-Za-z]/)) return "variableName";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["{", "["] },
  },
});

const highlight = HighlightStyle.define([
  { tag: t.atom, color: "var(--cm-command)" },
  { tag: t.keyword, color: "var(--cm-keyword)", fontWeight: "600" },
  { tag: t.string, color: "var(--cm-env)" },
  { tag: t.brace, color: "var(--cm-brace)" },
  { tag: t.bracket, color: "var(--cm-brace)" },
  { tag: t.operator, color: "var(--cm-operator)", fontWeight: "600" },
  { tag: t.number, color: "var(--cm-number)" },
  { tag: t.variableName, color: "var(--text)" },
  { tag: t.comment, color: "var(--text-3)", fontStyle: "italic" },
]);

// ------------------------------------------------------------------ completions

const C = latexCommands;
const cmd = (name: string, detail: string, type: string, boost = 0): Completion => ({ label: `\\${name}`, detail, type, boost });
const snip = (template: string, label: string, detail: string, boost = 0): Completion =>
  snippetCompletion(template, { label, detail, type: "function", boost });

function buildCompletions(): Completion[] {
  const out: Completion[] = [];
  for (const [name, def] of Object.entries(C.SYMBOLS)) out.push(cmd(name, def.char, def.type === "ident" ? "constant" : "keyword"));
  for (const [name, ch] of Object.entries(C.NARY)) out.push(snip(`\\${name}_{\${}}^{\${}} \${}`, `\\${name}`, `${ch} with limits`, 2));
  for (const name of Object.keys(C.FUNCTIONS)) out.push(cmd(name, "function", "function"));
  for (const name of Object.keys(C.ACCENTS)) out.push(snip(`\\${name}{\${}}`, `\\${name}`, "accent", 1));
  for (const name of Object.keys(C.FONTS)) out.push(snip(`\\${name}{\${}}`, `\\${name}`, "font", 1));
  for (const name of ["quad", "qquad", "thinspace", "medspace", "thickspace"]) out.push(cmd(name, "space", "text"));
  out.push(
    snip("\\frac{${num}}{${den}}", "\\frac", "fraction", 3),
    snip("\\dfrac{${num}}{${den}}", "\\dfrac", "display fraction"),
    snip("\\tfrac{${num}}{${den}}", "\\tfrac", "small fraction"),
    snip("\\sqrt{${}}", "\\sqrt", "square root", 2),
    snip("\\sqrt[${n}]{${}}", "\\sqrt[n]", "nth root"),
    snip("\\binom{${n}}{${k}}", "\\binom", "binomial"),
    snip("\\left( ${} \\right)", "\\left(", "stretchy ( )", 2),
    snip("\\left[ ${} \\right]", "\\left[", "stretchy [ ]"),
    // Snippet templates unescape "\\{" to "{", so a literal \{ needs a doubled backslash.
    snip("\\left\\\\{ ${} \\right\\\\}", "\\left\\{", "stretchy { }"),
    snip("\\left| ${} \\right|", "\\left|", "stretchy | |"),
    snip("\\left\\| ${} \\right\\|", "\\left\\|", "norm ‖ ‖"),
    snip("\\left\\langle ${} \\right\\rangle", "\\left\\langle", "angle brackets"),
    snip("\\overset{${above}}{${}}", "\\overset", "text above"),
    snip("\\underset{${below}}{${}}", "\\underset", "text below"),
    snip("\\overbrace{${}}^{${label}}", "\\overbrace", "brace above"),
    snip("\\underbrace{${}}_{${label}}", "\\underbrace", "brace below"),
    snip("\\boxed{${}}", "\\boxed", "box"),
    snip("\\text{${}}", "\\text", "upright text", 1),
    snip("\\operatorname{${name}}", "\\operatorname", "named operator"),
    snip("\\mathrm{d}${x}", "\\mathrm{d}", "differential d", 2),
    snip("\\vec{\\mathbf{${}}}", "\\vec{\\mathbf", "bold vector with arrow (vectrix)", 2),
    cmd("left", "stretchy delimiter", "keyword"),
    cmd("right", "stretchy delimiter", "keyword"),
    cmd("middle", "stretchy separator", "keyword"),
  );
  const envBody: Record<string, string> = {
    matrix: "${} & ${} \\\\ ${} & ${}",
    smallmatrix: "${} & ${} \\\\ ${} & ${}",
    cases: "${value} & ${condition} \\\\ ${} & ${}",
    aligned: "${} &= ${} \\\\ &= ${}",
    gathered: "${} \\\\ ${}",
    split: "${} &= ${} \\\\ &= ${}",
  };
  for (const env of [...C.MATRIX_ENVS, "cases", "aligned", "gathered", "split"]) {
    const body = envBody[env] ?? envBody.matrix!;
    out.push(snip(`\\begin{${env}} ${body} \\end{${env}}`, `\\begin{${env}}`, "environment", 1));
  }
  // Unique by label, first wins.
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
}

const ALL = buildCompletions();

function latexCompletions(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/\\[A-Za-z]*\{?[A-Za-z]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  return { from: word.from, options: ALL, validFor: /^\\[A-Za-z]*\{?[A-Za-z]*$/ };
}

// ------------------------------------------------------------------ diagnostics

const latexLinter = linter(
  (view): CmDiagnostic[] => {
    const text = view.state.doc.toString();
    return parseLatex(text).diagnostics.map((d) => {
      let from = Math.min(d.start, text.length);
      let to = Math.min(Math.max(d.end, d.start + 1), text.length);
      // Problems reported at the very end ("missing }") would be invisible: underline the last character.
      if (from === to && from > 0) from -= 1;
      return { from, to, severity: d.severity, message: d.message };
    });
  },
  { delay: 250 },
);


// ------------------------------------------------------------------ theme

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "transparent", color: "var(--text)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 14px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-matchingBracket": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent)", borderRadius: "2px" },
  ".cm-nonmatchingBracket": { backgroundColor: "color-mix(in srgb, var(--bad) 25%, transparent)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-2) 60%, transparent)" },
  ".cm-gutters": { display: "none" },
  ".cm-tooltip": { backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "var(--shadow)", color: "var(--text)" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  ".cm-completionDetail": { fontFamily: "var(--font-math)", fontStyle: "normal", color: "var(--text-2)", marginLeft: "1em" },
  ".cm-completionIcon": { display: "none" },
  ".cm-diagnostic": { fontFamily: "var(--font-ui)", padding: "4px 8px" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--bad)", textUnderlineOffset: "3px" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warn)", textUnderlineOffset: "3px" },
  ".cm-snippetField": { backgroundColor: "var(--accent-soft)", borderRadius: "2px" },
});

export const latexExtensions = [
  latexMath,
  syntaxHighlighting(highlight),
  autocompletion({ override: [latexCompletions], icons: false, activateOnTyping: true }),
  latexLinter,
  theme,
  EditorView.lineWrapping,
];
