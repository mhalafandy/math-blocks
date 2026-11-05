import { BUILTIN_KINDS, customKindProblem, expandNotation, isCustomKind, KIND_BY_ID, KINDS, presetStyle, styleOf, type CustomKind, type KindDef, type KindStyle, type NotationProfile } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { kindMacroRe } from "./kinds";
import { useApp } from "./store";

/**
 * Notation settings: the style of every kind (built-in or the user's own), new kinds,
 * "Make → kind" on a selection and "Convert to plain".
 */

/** Samples shown in the live preview: a, r, ω, F, H, with and without a frame label. */
export function kindSamples(k: KindDef): { label: string; latex: string }[] {
  const m = `\\${k.macro}`;
  if (k.id === "T") return [{ label: "cᵀ", latex: "\\cmat{c}^{\\T}" }, { label: "Aᵀ", latex: "\\mat{A}^{\\T}" }];
  if (k.id === "diff") return ["m", "t", "A"].map((v) => ({ label: `d${v}`, latex: `${m}{${v}}` }));
  if (k.id === "dcm") return [{ label: "ba", latex: `${m}{b}{a}` }, { label: "BN", latex: `${m}{B}{N}` }, { label: "21", latex: `${m}{2}{1}` }];
  if (k.id === "frm") return [{ label: "a", latex: `${m}{a}` }, { label: "B", latex: `${m}{B}` }, { label: "N", latex: `${m}{N}` }];
  const bases = ["a", "r", "\\omega", "F", "H"];
  return [...bases.map((b) => ({ label: b, latex: `${m}{${b}}` })), { label: "r P/O", latex: `${m}[P/O]{r}` }, { label: "ω B/N", latex: `${m}[B/N]{\\omega}` }];
}

/** The kinds as listed on the settings page: built-in first, then the user's own. */
export const allKinds = (): KindDef[] => [...KINDS];
export const builtinKinds = (): readonly KindDef[] => BUILTIN_KINDS;

/** Only what differs from the preset (so a later preset change still applies to the rest). */
function diff(base: KindStyle, next: KindStyle): Partial<KindStyle> {
  const out: Partial<KindStyle> = {};
  for (const key of Object.keys(next) as (keyof KindStyle)[]) {
    if (JSON.stringify(base[key]) !== JSON.stringify(next[key])) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}

/** Sets a kind's style: an override of the preset for a built-in kind, the kind itself for the user's own. */
export function setKindStyle(id: string, style: KindStyle) {
  const app = useApp.getState();
  if (isCustomKind(id)) {
    app.setPrefs({ customKinds: app.customKinds.map((c) => (c.id === id ? { ...c, style } : c)) });
    return;
  }
  const p = app.notationProfile;
  const over = diff(presetStyle(p.preset, id), style);
  const overrides = { ...p.overrides };
  if (Object.keys(over).length) overrides[id] = over;
  else delete overrides[id];
  app.setPrefs({ notationProfile: { ...p, overrides } });
}

/** Back to the preset's style (built-in kinds). */
export function resetKind(id: string) {
  const app = useApp.getState();
  const overrides = { ...app.notationProfile.overrides };
  delete overrides[id];
  app.setPrefs({ notationProfile: { ...app.notationProfile, overrides } });
}

export const kindStyle = (id: string, profile: NotationProfile = useApp.getState().notationProfile) => styleOf(profile, id);
export const isModified = (id: string, profile: NotationProfile) => !isCustomKind(id) && !!profile.overrides[id] && Object.keys(profile.overrides[id]!).length > 0;

/** A free macro and trigger for a copy ("pvec" → "pvecb", "pv" → "pv2"). */
export function suggestCopy(k: KindDef): { macro: string; snippet: string } {
  const used = new Set(KINDS.map((x) => x.macro));
  const triggers = new Set(KINDS.map((x) => x.snippet));
  let macro = `${k.macro}b`;
  for (let i = 0; used.has(macro) && i < 26; i++) macro = `${k.macro}${String.fromCharCode(98 + i)}`;
  let snippet = `${k.snippet}2`;
  for (let i = 2; triggers.has(snippet) && i < 99; i++) snippet = `${k.snippet}${i}`;
  return { macro, snippet };
}

/** Adds the user's kind; returns the problem when it cannot be added. */
export function addKind(def: Omit<CustomKind, "id">): { id?: string; error?: string } {
  const id = `u_${def.macro}`;
  const problem = customKindProblem({ ...def, id });
  if (problem) return { error: problem };
  const app = useApp.getState();
  app.setPrefs({ customKinds: [...app.customKinds, { ...def, id, style: { ...def.style, symbol: undefined } }] });
  return { id };
}

export function updateKindDef(id: string, change: Partial<Pick<CustomKind, "name" | "macro" | "snippet">>): string | null {
  const app = useApp.getState();
  const cur = app.customKinds.find((c) => c.id === id);
  if (!cur) return "not your own kind";
  const next = { ...cur, ...change };
  const problem = customKindProblem(next);
  if (problem) return problem;
  app.setPrefs({ customKinds: app.customKinds.map((c) => (c.id === id ? next : c)) });
  return null;
}

export function deleteKind(id: string) {
  const app = useApp.getState();
  app.setPrefs({ customKinds: app.customKinds.filter((c) => c.id !== id) });
}

// ------------------------------------------------------------------ Make → kind, Convert to plain

const STYLE_CMD = /^\\(mathbf|boldsymbol|bm|mathrm|mathit|mathsf|mathcal|mathbb|mathfrak|pmb)$/;

/**
 * A selection as the argument of a kind: styles and accents dropped (the kind draws them), a
 * subscript kept as the frame label. "\vec{\mathbf{r}}_{P/O}" → \pvec[P/O]{r}.
 */
export function makeKindLatex(selection: string, kindId: string): string | null {
  const k = KIND_BY_ID.get(kindId);
  if (!k || k.args !== 1) return null;
  let s = selection.trim();
  if (!s) return `\\${k.macro}{}`;
  // Peel scripts: a trailing _{…} becomes the frame label.
  let label = "";
  const sub = /^(.*)_\{([^{}]*)\}$/.exec(s) ?? /^(.*)_([A-Za-z0-9])$/.exec(s);
  if (sub && k.id !== "diff") {
    s = sub[1]!;
    label = sub[2]!;
  }
  // Peel accents and letter styles (repeatedly: \vec{\mathbf{r}}).
  for (let i = 0; i < 6; i++) {
    const m = /^\\([A-Za-z]+)\{([\s\S]*)\}$/.exec(s);
    if (!m || !(STYLE_CMD.test(`\\${m[1]}`) || /^(vec|hat|bar|tilde|overrightarrow|overrightharpoon|overleftharpoon|widehat|overline|underline|dot|ddot)$/.test(m[1]!))) break;
    s = m[2]!;
  }
  const arg = serializeLatex(parseLatex(s).root);
  return label && k.id !== "frm" ? `\\${k.macro}[${label}]{${arg}}` : `\\${k.macro}{${arg}}`;
}

/** A kind object as plain, hand-styled LaTeX in the current style (it no longer follows the kind). */
export function plainLatex(kindLatex: string, profile: NotationProfile = useApp.getState().notationProfile): string {
  return serializeLatex(expandNotation(parseLatex(kindLatex).root, profile));
}

/** Equations in a list that use any kind (drawn again when a kind's style changes). */
export const usesKinds = (latex: string) => kindMacroRe().test(latex);
