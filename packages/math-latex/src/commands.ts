import type { AccentKind, MathVariant, OperatorClass, SpaceWidth } from "@mathblocks/math-core";

/** Symbol commands that produce a single character. */
export interface SymbolDef {
  char: string;
  /** "ident" symbols are letters/ordinary symbols; others are operators. */
  type: "ident" | OperatorClass;
}

const ident = (char: string): SymbolDef => ({ char, type: "ident" });
const bin = (char: string): SymbolDef => ({ char, type: "binary" });
const rel = (char: string): SymbolDef => ({ char, type: "relation" });
const ord = (char: string): SymbolDef => ({ char, type: "ordinary" });
const punct = (char: string): SymbolDef => ({ char, type: "punctuation" });

export const SYMBOLS: Record<string, SymbolDef> = {
  // Greek lowercase
  alpha: ident("α"), beta: ident("β"), gamma: ident("γ"), delta: ident("δ"),
  epsilon: ident("ϵ"), varepsilon: ident("ε"), zeta: ident("ζ"), eta: ident("η"),
  theta: ident("θ"), vartheta: ident("ϑ"), iota: ident("ι"), kappa: ident("κ"),
  lambda: ident("λ"), mu: ident("μ"), nu: ident("ν"), xi: ident("ξ"), pi: ident("π"),
  varpi: ident("ϖ"), rho: ident("ρ"), varrho: ident("ϱ"), sigma: ident("σ"),
  varsigma: ident("ς"), tau: ident("τ"), upsilon: ident("υ"), phi: ident("ϕ"),
  varphi: ident("φ"), chi: ident("χ"), psi: ident("ψ"), omega: ident("ω"),
  // Greek uppercase
  Gamma: ident("Γ"), Delta: ident("Δ"), Theta: ident("Θ"), Lambda: ident("Λ"),
  Xi: ident("Ξ"), Pi: ident("Π"), Sigma: ident("Σ"), Upsilon: ident("Υ"),
  Phi: ident("Φ"), Psi: ident("Ψ"), Omega: ident("Ω"),
  // Delimiters outside \left…\right (MathType writes them on their own) and the backslash
  langle: ord("⟨"), rangle: ord("⟩"), lfloor: ord("⌊"), rfloor: ord("⌋"), lceil: ord("⌈"), rceil: ord("⌉"),
  backslash: ord("\\"),
  // Ordinary symbols
  infty: ident("∞"), partial: ident("∂"), nabla: ident("∇"), hbar: ident("ℏ"),
  ell: ident("ℓ"), Re: ident("ℜ"), Im: ident("ℑ"), aleph: ident("ℵ"), wp: ident("℘"),
  emptyset: ident("∅"), varnothing: ident("∅"), forall: ord("∀"), exists: ord("∃"),
  nexists: ord("∄"), neg: ord("¬"), lnot: ord("¬"), angle: ord("∠"), triangle: ord("△"),
  prime: ord("′"), degree: ord("°"), top: ord("⊤"), bot: ord("⊥"), varkappa: ident("ϰ"),
  complement: ord("∁"), mho: ord("℧"),
  cdots: ord("⋯"), ldots: ord("…"), dots: ord("…"), vdots: ord("⋮"), ddots: ord("⋱"),
  // Binary operators
  pm: bin("±"), mp: bin("∓"), times: bin("×"), div: bin("÷"), cdot: bin("⋅"),
  ast: bin("∗"), star: bin("⋆"), circ: bin("∘"), bullet: bin("∙"), cap: bin("∩"),
  cup: bin("∪"), wedge: bin("∧"), land: bin("∧"), vee: bin("∨"), lor: bin("∨"),
  oplus: bin("⊕"), ominus: bin("⊖"), otimes: bin("⊗"), odot: bin("⊙"), setminus: bin("∖"),
  dagger: bin("†"), ddagger: bin("‡"), uplus: bin("⊎"), sqcup: bin("⊔"), sqcap: bin("⊓"),
  circledast: bin("⊛"), diamond: bin("⋄"), amalg: bin("⨿"),
  // Relations and arrows
  leq: rel("≤"), le: rel("≤"), geq: rel("≥"), ge: rel("≥"), neq: rel("≠"), ne: rel("≠"),
  approx: rel("≈"), equiv: rel("≡"), sim: rel("∼"), simeq: rel("≃"), cong: rel("≅"),
  propto: rel("∝"), ll: rel("≪"), gg: rel("≫"), in: rel("∈"), notin: rel("∉"),
  ni: rel("∋"), subset: rel("⊂"), subseteq: rel("⊆"), supset: rel("⊃"), supseteq: rel("⊇"),
  parallel: rel("∥"), perp: rel("⊥"), mid: rel("∣"), coloneqq: rel("≔"), doteq: rel("≐"),
  to: rel("→"), rightarrow: rel("→"), leftarrow: rel("←"), gets: rel("←"),
  leftrightarrow: rel("↔"), Rightarrow: rel("⇒"), Leftarrow: rel("⇐"),
  Leftrightarrow: rel("⇔"), implies: rel("⟹"), impliedby: rel("⟸"), iff: rel("⟺"),
  mapsto: rel("↦"), longrightarrow: rel("⟶"), longleftarrow: rel("⟵"),
  Longrightarrow: rel("⟹"), Longleftarrow: rel("⟸"), uparrow: rel("↑"), downarrow: rel("↓"),
  rightleftharpoons: rel("⇌"),
  therefore: rel("∴"), because: rel("∵"), vdash: rel("⊢"), models: rel("⊨"),
  triangleq: rel("≜"), nmid: rel("∤"), nless: rel("≮"), ngtr: rel("≯"), nleq: rel("≰"),
  ngeq: rel("≱"), nsim: rel("≁"), ncong: rel("≇"), nparallel: rel("∦"), prec: rel("≺"),
  succ: rel("≻"), preceq: rel("⪯"), succeq: rel("⪰"), subsetneq: rel("⊊"), supsetneq: rel("⊋"),
  nsubseteq: rel("⊈"), nsupseteq: rel("⊉"), leqslant: rel("⩽"), geqslant: rel("⩾"),
  lesssim: rel("≲"), gtrsim: rel("≳"), asymp: rel("≍"), approxeq: rel("≊"),
  longleftrightarrow: rel("⟷"), Longleftrightarrow: rel("⟺"), hookrightarrow: rel("↪"),
  hookleftarrow: rel("↩"), longmapsto: rel("⟼"), rightharpoonup: rel("⇀"),
  rightharpoondown: rel("⇁"), leftharpoonup: rel("↼"), leftharpoondown: rel("↽"),
  updownarrow: rel("↕"), Uparrow: rel("⇑"), Downarrow: rel("⇓"), Updownarrow: rel("⇕"),
  nearrow: rel("↗"), searrow: rel("↘"), nwarrow: rel("↖"), swarrow: rel("↙"),
  leftrightharpoons: rel("⇋"),
  // Punctuation-like
  colon: punct(":"),
};

/** Large (n-ary) operators. */
export const NARY: Record<string, string> = {
  sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮",
  oiint: "∯", oiiint: "∰", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁", bigotimes: "⨂",
  bigodot: "⨀", bigvee: "⋁", bigwedge: "⋀", biguplus: "⨄",
};

/** Integral-like operators default to side limits. */
export const INTEGRALS = new Set(["∫", "∬", "∭", "∮", "∯", "∰"]);

/** Named functions; the boolean marks "limits" functions (subscript placed underneath). */
export const FUNCTIONS: Record<string, boolean> = {
  sin: false, cos: false, tan: false, cot: false, sec: false, csc: false,
  arcsin: false, arccos: false, arctan: false, sinh: false, cosh: false, tanh: false,
  coth: false, log: false, ln: false, lg: false, exp: false, deg: false, dim: false,
  ker: false, hom: false, arg: false, det: true, gcd: true, Pr: true,
  lim: true, liminf: true, limsup: true, max: true, min: true, sup: true, inf: true,
};

/** Display names that differ from the command name. */
export const FUNCTION_DISPLAY: Record<string, string> = {
  liminf: "lim inf",
  limsup: "lim sup",
};

export const ACCENTS: Record<string, AccentKind> = {
  hat: "hat", widehat: "widehat", bar: "bar", vec: "vec", overrightarrow: "overrightarrow",
  overleftarrow: "overleftarrow", overrightharpoon: "overrightharpoon", overleftharpoon: "overleftharpoon", dot: "dot", ddot: "ddot", dddot: "dddot", ddddot: "ddddot", acute: "acute", grave: "grave", mathring: "mathring", tilde: "tilde",
  widetilde: "widetilde", check: "check", breve: "breve", overline: "overline",
  underline: "underline",
};

export const FONTS: Record<string, MathVariant> = {
  mathrm: "normal", mathit: "italic", mathbf: "bold", boldsymbol: "bold-italic",
  bm: "bold-italic", mathbb: "double-struck", mathcal: "script", mathscr: "script",
  mathfrak: "fraktur", mathsf: "sans-serif", mathtt: "monospace",
};

/** Preferred command when serialising a variant back to LaTeX. */
export const FONT_COMMAND: Record<MathVariant, string> = {
  normal: "mathrm", italic: "mathit", bold: "mathbf", "bold-italic": "boldsymbol",
  "double-struck": "mathbb", script: "mathcal", fraktur: "mathfrak",
  "sans-serif": "mathsf", monospace: "mathtt",
};

export const SPACES: Record<string, SpaceWidth> = {
  ",": "thin", thinspace: "thin", ":": "medium", ">": "medium", medspace: "medium",
  ";": "thick", thickspace: "thick", quad: "quad", qquad: "qquad", "!": "negthin",
  " ": "nbsp",
};

export const SPACE_COMMAND: Record<SpaceWidth, string> = {
  thin: "\\,", medium: "\\:", thick: "\\;", quad: "\\quad", qquad: "\\qquad",
  negthin: "\\!", nbsp: "~",
};

/** Delimiters accepted after \left, \right, \middle, \big… */
export const DELIMITERS: Record<string, string> = {
  "(": "(", ")": ")", "[": "[", "]": "]", "\\{": "{", "\\}": "}", "\\lbrace": "{",
  "\\rbrace": "}", "|": "|", "\\|": "‖", "\\vert": "|", "\\Vert": "‖", "\\lvert": "|",
  "\\rvert": "|", "\\lVert": "‖", "\\rVert": "‖", "\\langle": "⟨", "\\rangle": "⟩",
  "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉", "/": "/",
  "\\lbrack": "[", "\\rbrack": "]", ".": "",
};

/** Inverse: Unicode delimiter → LaTeX token (for \left/\right serialisation). */
export const DELIMITER_LATEX: Record<string, string> = {
  "(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}", "|": "|", "‖": "\\|",
  "⟨": "\\langle", "⟩": "\\rangle", "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil",
  "⌉": "\\rceil", "/": "/", "": ".",
};

/** Commands that only adjust size or style and are dropped (with no information loss we track). */
export const IGNORED = new Set([
  "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle", "limits", "nolimits",
  "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "Biggl",
  "Biggr", "left", "right", "nonumber", "notag",
]);

export const MATRIX_ENVS = new Set(["matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix"]);
export const ALIGNED_ENVS = new Set(["aligned", "align", "align*", "gathered", "gather", "gather*", "split", "alignat", "alignat*", "multline", "multline*"]);

/**
 * Reverse lookup for operators by character and class: ⊥ as a relation is \perp, as an ordinary
 * symbol \bot (the class decides the spacing, so it must survive a round trip).
 */
export const CLASS_CHAR_TO_COMMAND: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [cmd, def] of Object.entries(SYMBOLS)) {
    const k = `${def.char}|${def.type}`;
    if (!m.has(k)) m.set(k, cmd);
  }
  return m;
})();

/** Reverse lookup Unicode char → command, built once. First definition wins. */
export const CHAR_TO_COMMAND: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [cmd, def] of Object.entries(SYMBOLS)) if (!m.has(def.char)) m.set(def.char, cmd);
  for (const [cmd, ch] of Object.entries(NARY)) if (!m.has(ch)) m.set(ch, cmd);
  // Preferred spellings
  m.set("≤", "leq");
  m.set("≥", "geq");
  m.set("≠", "neq");
  m.set("→", "to");
  m.set("∅", "emptyset");
  m.set("⊥", "perp");
  m.set("∧", "wedge");
  m.set("∨", "vee");
  m.set("⟹", "implies");
  m.set("⟸", "impliedby");
  return m;
})();
