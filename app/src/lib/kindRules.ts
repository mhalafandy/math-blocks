/**
 * Notation kinds from older forms: MathType (and hand-written LaTeX) writes a physical vector as
 * \overrightharpoon{\mathbf{r}}, a frame as \vec{\mathbf{F}}, a unit vector as \hat{\mathbf{f}}_1…; MathBlocks
 * knows them as kinds (\pvec, \vectrix, \bvec…), so their look can be changed in one place and the
 * consistency checks understand them. Each rule rewrites one form; "auto" rules are unambiguous and run on
 * conversion; the others are offered in Review notation kinds, where the owner decides.
 */

export interface KindRule {
  id: string;
  /** What it does, for the review list. */
  label: string;
  /** Applied on conversion (Convert MathType) and ticked by default in the review. */
  auto: boolean;
  /** Ticked by default in the review (auto rules always are). */
  suggested: boolean;
  /** Why it may need a decision (shown in the review). */
  note?: string;
  apply: (latex: string) => string;
}

const LETTER = String.raw`[A-Za-z]|\\[A-Za-z]+`;

/** Applies f to the parts of the LaTeX outside sub/superscript groups (_{…} ^{…}), which keep their text. */
function outsideScripts(s: string, f: (part: string) => string): string {
  return splitScripts(s)
    .map((p) => (p.script ? p.text : f(p.text)))
    .join("");
}

/** Applies f to the contents of sub- and superscript groups (_{…} ^{…}). */
function insideScripts(s: string, f: (inner: string) => string): string {
  return splitScripts(s)
    .map((p) => (p.script ? `${p.script}{${f(p.text.slice(2, -1))}}` : p.text))
    .join("");
}

function splitScripts(s: string): { text: string; script?: "_" | "^" }[] {
  const out: { text: string; script?: "_" | "^" }[] = [];
  let i = 0;
  let plain = "";
  while (i < s.length) {
    const c = s[i]!;
    if ((c === "_" || c === "^") && s[i + 1] === "{" && s[i - 1] !== "\\") {
      let depth = 0;
      let j = i + 1;
      for (; j < s.length; j++) {
        if (s[j] === "\\") {
          j++;
          continue;
        }
        if (s[j] === "{") depth++;
        else if (s[j] === "}" && --depth === 0) break;
      }
      if (plain) out.push({ text: plain });
      plain = "";
      out.push({ text: s.slice(i, j + 1), script: c });
      i = j + 1;
      continue;
    }
    plain += c;
    i++;
  }
  if (plain) out.push({ text: plain });
  return out;
}

const re = (src: string, flags = "g") => new RegExp(src, flags);

export const KIND_RULES: KindRule[] = [
  {
    id: "primes",
    label: "Primes written as separate superscripts (x^{'}^{'}) → x''",
    auto: true,
    suggested: true,
    apply: (s) =>
      s
        .replace(/\^\{'\}\^\{'\}\^\{'\}/g, "'''")
        .replace(/\^\{'\}\^\{'\}/g, "''")
        .replace(/\^\{'\}/g, "'"),
  },
  {
    id: "bold-punctuation",
    label: "Bold signs and brackets (bold =, (, ), /) → ordinary",
    auto: true,
    suggested: true,
    apply: (s) => s.replace(/\\(?:boldsymbol|mathbf|bm)\{([=+\-(),/[\]|:;<>.])\}/g, "$1"),
  },
  {
    id: "bold-index-digits",
    label: "Bold digits (𝐧_𝟏, 𝐂^{−𝟏}) → ordinary digits",
    auto: true,
    suggested: true,
    apply: (s) => s.replace(/_\\(?:mathbf|boldsymbol)\{([0-9]+)\}/g, "_{$1}").replace(/\\(?:mathbf|boldsymbol)\{([0-9]+)\}/g, "$1"),
  },
  {
    id: "pvec",
    label: "Bold letter with a harpoon (r⃑, ω⃑) → physical vector \\pvec; frames in the index (_{A/B}) → \\pvec[A/B]",
    auto: true,
    suggested: true,
    apply: (s) => {
      let t = s
        .replace(re(String.raw`\\overrightharpoon\s*\{\s*\\(?:mathbf|boldsymbol|bm)\s*\{\s*(${LETTER})\s*\}\s*\}`), "\\pvec{$1}")
        .replace(re(String.raw`\\mathbf\s*\{\s*\\overset\s*\{\s*(?:\\scriptscriptstyle\s*)?\\rightharpoonup\s*\}\s*\{\s*(${LETTER})\s*\}\s*\}`), "\\pvec{$1}")
        .replace(re(String.raw`\\overset\s*\{\s*(?:\\scriptscriptstyle\s*)?\\rightharpoonup\s*\}\s*\{\s*\\mathbf\s*\{\s*(${LETTER})\s*\}\s*\}`), "\\pvec{$1}");
      // \pvec{ω}_{E/N} (frame letters, possibly bold) → \pvec[E/N]{ω}
      const label = String.raw`(?:\\(?:mathbf|mathrm|boldsymbol)\{[A-Za-z]+\}|[A-Za-z])+'*`;
      t = t.replace(re(String.raw`\\pvec\{([^{}]+)\}_\{\s*(${label})\s*/\s*(${label})\s*\}`), (_m, v: string, a: string, b: string) => `\\pvec[${plainLabel(a)}/${plainLabel(b)}]{${v}}`);
      return t;
    },
  },
  {
    id: "plain-arrow",
    label: "Plain lowercase letter with an arrow (r⃗) → physical vector \\pvec",
    auto: true,
    suggested: true,
    note: "Physical vectors are written with \\pvec everywhere else.",
    apply: (s) => s.replace(/\\vec\s*\{\s*([a-z])\s*\}/g, "\\pvec{$1}"),
  },
  {
    id: "vectrix",
    label: "Bold capital with an arrow (F⃗) → frame \\vectrix; I and J → dyadic \\dyadic",
    auto: true,
    suggested: true,
    apply: (s) =>
      s
        .replace(/\\vec\s*\{\s*\\vec\s*\{\s*\\mathbf\s*\{\s*([A-Z])\s*\}\s*\}\s*\}/g, "\\dyadic{$1}")
        .replace(/\\vec\s*\{\s*\\mathbf\s*\{\s*([A-Z])\s*\}\s*\}/g, (_m, c: string) => (c === "I" || c === "J" ? `\\dyadic{${c}}` : `\\vectrix{${c}}`)),
  },
  {
    id: "bvec",
    label: "Bold lowercase letter with a hat (f̂₁) → unit vector \\bvec",
    auto: true,
    suggested: true,
    apply: (s) =>
      s
        .replace(/\\hat\s*\{\s*\\mathbf\s*\{\s*([a-z])\s*\}\s*\}/g, "\\bvec{$1}")
        .replace(/\\mathbf\s*\{\s*\\hat\s*\{\s*([a-z])\s*\}\s*\}/g, "\\bvec{$1}")
        .replace(/\\hat\s*\{\s*([a-z])\s*\}(?=\s*_)/g, "\\bvec{$1}"),
  },
  {
    id: "transpose",
    label: "Transpose written as bold or italic T → \\T",
    auto: true,
    suggested: true,
    apply: (s) => s.replace(/\^\{\s*\\(?:mathbf|mathrm|boldsymbol)\{T\}\s*\}/g, "^{\\T}").replace(/\^\{\s*T\s*\}/g, "^{\\T}").replace(/\^T(?![A-Za-z])/g, "^{\\T}"),
  },
  {
    id: "dcm",
    label: "Bracketed pair of bold frame letters ([𝐀𝐁]) → rotation matrix \\dcm{A}{B}",
    auto: false,
    suggested: false,
    note: "Drawn with the rotation-matrix kind's style: set it to brackets in Notation settings to keep the [AB] look.",
    apply: (s) => s.replace(/\\left\s*\[\s*\\mathbf\s*\{\s*([A-Z])\s*\}\s*\\mathbf\s*\{\s*([A-Z])\s*\}\s*\\right\s*\]/g, "\\dcm{$1}{$2}"),
  },
  {
    id: "plain-indices",
    label: "Hand-styled letters in indices (bold, \\mathrm, \\mathit: frame labels, 𝐫_𝐧, v_{\\mathrm{max}}) → plain letters, drawn by the document style",
    auto: true,
    suggested: true,
    note: "The look of index labels (italic or upright) is a document style setting: Word style → Document style.",
    apply: (s) =>
      insideScripts(s, (inner) =>
        // Only letters (styled or plain), digits, primes, slashes or commas (frame labels: G, GH, G'/H, II, max).
        /^(?:\s*(?:\\(?:mathbf|boldsymbol|mathrm|mathit)\{[A-Za-z0-9]+\}|[A-Za-z0-9/,'])\s*)+$/.test(inner) && /\\(?:mathbf|boldsymbol|mathrm|mathit)\{/.test(inner)
          ? inner.replace(/\\(?:mathbf|boldsymbol|mathrm|mathit)\{([A-Za-z0-9]+)\}/g, "$1").replace(/\s+/g, "")
          : inner,
      ),
  },
  {
    id: "plain-symbols",
    label: "Single letters forced upright or italic outside indices (\\mathrm{d}, \\mathrm{e}, \\mathit{x}) → plain letters",
    auto: false,
    suggested: false,
    note: "An upright d, e or i may be on purpose: the document style can draw d, e, i and π upright everywhere instead.",
    apply: (s) => outsideScripts(s, (p) => p.replace(/\\(?:mathrm|mathit)\s*\{\s*([A-Za-z])\s*\}/g, "$1")),
  },
  {
    id: "units",
    label: "A unit written upright or as text after a number (3\\,\\mathrm{m/s}, 5\\text{ kg}) → \\unit{m/s}",
    auto: false,
    suggested: true,
    note: "Units are a kind of their own (drawn upright, a thin space after the number); check that each example is a unit.",
    apply: (s) =>
      outsideScripts(s, (p) =>
        p.replace(/([0-9])\s*(?:\\[,;: ]\s*|~\s*)?\\(?:mathrm|text|textrm)\s*\{\s*([A-Za-z][A-Za-z0-9/^{}\-\\, ]*?)\s*\}/g, (all, digit: string, unit: string) => (/^(?:if|and|or|for|where|with)$/i.test(unit.trim()) ? all : `${digit}\\unit{${unit.trim().replace(/\s+/g, "\\,")}}`)),
      ),
  },
  {
    id: "body-plain",
    label: "Bold B with an index (𝐁₁, a body) → plain B₁",
    auto: false,
    suggested: true,
    note: "Bodies are plain letters; a bold B without an index is left alone.",
    apply: (s) => s.replace(/\\mathbf\s*\{\s*B\s*\}(?=\s*_)/g, "B"),
  },
  {
    id: "bvec-no-hat",
    label: "Bold lowercase letter with a number index and no hat (𝐞₁) → unit vector \\bvec (adds the hat)",
    auto: false,
    suggested: false,
    note: "Could also be a column of components: check the examples.",
    apply: (s) => s.replace(/\\mathbf\s*\{\s*([a-z])\s*\}(?=\s*_\{?\s*[0-9])/g, "\\bvec{$1}"),
  },
  {
    id: "cmat",
    label: "Bold lowercase letter (𝐫) → column matrix \\cmat",
    auto: false,
    suggested: true,
    apply: (s) => outsideScripts(s, (p) => p.replace(/\\mathbf\s*\{\s*([a-z])\s*\}/g, "\\cmat{$1}")),
  },
  {
    id: "cmat-greek",
    label: "Bold Greek letter (𝛚, 𝚯) → column matrix \\cmat",
    auto: false,
    suggested: true,
    apply: (s) => outsideScripts(s, (p) => p.replace(/\\(?:boldsymbol|bm)\s*\{\s*(\\[A-Za-z]+)\s*\}/g, "\\cmat{$1}")),
  },
  {
    id: "mat",
    label: "Bold capital letter (𝐂, 𝐑) → matrix \\mat",
    auto: false,
    suggested: true,
    apply: (s) => outsideScripts(s, (p) => p.replace(/\\mathbf\s*\{\s*([A-Z])\s*\}/g, "\\mat{$1}")),
  },
];

function plainLabel(s: string): string {
  return s.replace(/\\(?:mathbf|mathrm|boldsymbol)\{([A-Za-z]+)\}/g, "$1");
}

export const AUTO_KIND_RULES = new Set(KIND_RULES.filter((r) => r.auto).map((r) => r.id));
export const SUGGESTED_KIND_RULES = new Set(KIND_RULES.filter((r) => r.auto || r.suggested).map((r) => r.id));

/** Applies the chosen rules in order; lists the rules that changed something. */
export function applyKindRules(latex: string, enabled: Set<string>): { latex: string; applied: string[] } {
  let s = latex;
  const applied: string[] = [];
  for (const r of KIND_RULES) {
    if (!enabled.has(r.id)) continue;
    const next = r.apply(s);
    if (next !== s) {
      applied.push(r.id);
      s = next;
    }
  }
  return { latex: s, applied };
}

export interface KindReviewItem {
  rule: KindRule;
  /** Equations this rule changes (with the rules before it applied). */
  count: number;
  examples: { before: string; after: string }[];
}

/** What each rule would change in these equations (rules applied in order, as chosen). */
export function reviewKinds(latexes: string[], enabled: Set<string> = SUGGESTED_KIND_RULES, all = true): KindReviewItem[] {
  const items = new Map(KIND_RULES.map((r) => [r.id, { rule: r, count: 0, examples: [] as { before: string; after: string }[] }]));
  for (const l of latexes) {
    let s = l;
    for (const r of KIND_RULES) {
      const on = enabled.has(r.id);
      if (!on && !all) continue;
      const next = r.apply(s);
      if (next === s) continue;
      const item = items.get(r.id)!;
      item.count++;
      if (item.examples.length < 3) item.examples.push({ before: s, after: next });
      if (on) s = next;
    }
  }
  return [...items.values()];
}

/** Conversion (Convert MathType): the unambiguous rules only; the rest is offered in Review notation kinds. */
export const kindTransform = (latex: string) => applyKindRules(latex, AUTO_KIND_RULES).latex;
