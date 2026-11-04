import type { MathNode, MathVariant, Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { SPACE_CHARS, toOmml } from "@mathblocks/math-omml";
import { CLASSIC, glyphSource, renderSvg, SYMBOL_CODES, type FontSet } from "@mathblocks/math-render";
import { conventionLatex, plainLatex, VECTOR_STYLES, type Convention, type PaletteEntry, type Support, type VectorStyle } from "./palette";

/**
 * How well a palette entry works on each path: the MathLive editor, MathBlocks Classic (are all
 * characters drawn from Times/Symbol, or from the STIX fallback?), native Word (OMML), and the
 * LaTeX round trip. Computed by a test (palette.support.test.ts) into palette-support.json, never
 * by hand; tools/palette-audit.ts uses the same code with the real Windows fonts.
 */

export interface SupportResult {
  mathlive: Support;
  classic: Support;
  omml: Support;
  roundtrip: Support;
  notes: string[];
}

export interface SupportDeps {
  /** MathLive's validateLatex. */
  validate: (latex: string) => { code: string; arg?: string }[];
  fonts: FontSet;
}

const RANK: Record<Support, number> = { full: 3, converted: 2, workaround: 1, unsupported: 0 };
export const worse = (a: Support, b: Support): Support => (RANK[a] <= RANK[b] ? a : b);
export const isRegression = (now: Support, before: Support) => RANK[now] < RANK[before];

/** Every LaTeX an entry can insert (spacecraft entries: each convention and vector style). */
export function entryVariants(e: PaletteEntry): string[] {
  if (!e.item.conventions) return [e.item.latex];
  const out = new Set<string>();
  for (const c of Object.keys(e.item.conventions) as Convention[]) for (const v of Object.keys(VECTOR_STYLES) as VectorStyle[]) out.add(conventionLatex(e.item, c, v));
  return [...out];
}

type CharKind = "ident" | "number" | "operator" | "text";
const STIX_VARIANTS = /double-struck|script|fraktur|sans-serif|monospace/;
const GREEK = /[Α-Ωα-ωϑϕϖϰϱϵς]/;

function chars(root: Row): { ch: string; variant?: MathVariant; kind: CharKind }[] {
  const out: { ch: string; variant?: MathVariant; kind: CharKind }[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode & Record<string, unknown>;
    if ((n.kind === "ident" || n.kind === "number" || n.kind === "operator" || n.kind === "text") && typeof n.text === "string")
      for (const ch of n.text) out.push({ ch, variant: (n as { variant?: MathVariant }).variant, kind: n.kind });
    if (n.kind === "nary") for (const ch of n.op) out.push({ ch, kind: "operator" });
    for (const k of ["open", "close", "middle"]) if (typeof n[k] === "string") for (const ch of n[k] as string) out.push({ ch, kind: "operator" });
    for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
  };
  visit(root);
  return out.filter((c) => c.ch.trim());
}

function nodes(root: Row): MathNode[] {
  const out: MathNode[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const n = v as MathNode;
    if (n.kind) out.push(n);
    for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
  };
  visit(root);
  return out;
}

/** Tree without positions, keys sorted. */
const shape = (x: unknown): string =>
  JSON.stringify(x, (k, v) => (k === "meta" ? undefined : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/** Support of one LaTeX template (MathLive slots #0 / #?). */
export function supportOf(latex: string, deps: SupportDeps): SupportResult {
  const notes: string[] = [];
  const ml = deps.validate(latex.replace(/#0/g, "x").replace(/#\?/g, "\\placeholder{}"));
  const mathlive: Support = ml.length ? "unsupported" : "full";
  if (ml.length) notes.push(`MathLive: ${ml.map((e) => `${e.code}${e.arg ? ` ${e.arg}` : ""}`).join(", ")}`);

  const { root, diagnostics } = parseLatex(plainLatex(latex));
  const all = nodes(root);
  let omml: Support = "full";
  if (diagnostics.length || all.some((n) => n.kind === "raw")) {
    omml = "unsupported";
    notes.push(`LaTeX: ${diagnostics.map((d) => d.message).join("; ") || "unparsed part"}`);
  } else {
    toOmml(root, { display: true });
    const dropped = all.filter((n) => n.kind === "space" && !SPACE_CHARS[n.width]);
    if (dropped.length) {
      omml = "workaround";
      notes.push("Word: negative space is dropped");
    }
  }

  let classic: Support = "full";
  const stix: string[] = [];
  const none: string[] = [];
  for (const { ch, variant, kind } of chars(root)) {
    // Without the Symbol font file (Linux CI) its repertoire is the renderer's own table.
    if (!deps.fonts.symbol && SYMBOL_CODES[ch] !== undefined && !variant && (GREEK.test(ch) || kind === "operator")) continue;
    const src = glyphSource(ch, kind, deps.fonts, CLASSIC, variant);
    if (src === "math") stix.push(variant && STIX_VARIANTS.test(variant) ? `${ch} (${variant})` : ch);
    else if (src === "none") none.push(ch);
  }
  if (none.length) {
    classic = "unsupported";
    notes.push(`Classic: no glyph for ${[...new Set(none)].join(" ")}`);
  } else if (stix.length) {
    classic = "converted";
    notes.push(`Classic: from STIX Two (not Times/Symbol): ${[...new Set(stix)].join(" ")}`);
  }
  try {
    const r = renderSvg(root, { fonts: deps.fonts, display: true, style: CLASSIC });
    if (!Number.isFinite(r.widthPt) || r.svg.includes("NaN")) {
      classic = "unsupported";
      notes.push("Classic: the drawing failed");
    }
  } catch (e) {
    classic = "unsupported";
    notes.push(`Classic: ${String(e)}`);
  }

  let roundtrip: Support = "full";
  const out = serializeLatex(root);
  if (shape(parseLatex(out).root) !== shape(root)) {
    roundtrip = "unsupported";
    notes.push(`Round trip changes it: ${out}`);
  }
  return { mathlive, classic, omml, roundtrip, notes };
}

/** Support of an entry: the worst over all the LaTeX it can insert. */
export function entrySupport(e: PaletteEntry, deps: SupportDeps): SupportResult {
  const rs = entryVariants(e).map((l) => supportOf(l, deps));
  return rs.reduce((a, b) => ({
    mathlive: worse(a.mathlive, b.mathlive),
    classic: worse(a.classic, b.classic),
    omml: worse(a.omml, b.omml),
    roundtrip: worse(a.roundtrip, b.roundtrip),
    notes: [...new Set([...a.notes, ...b.notes])],
  }));
}
