import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, loadFont, renderEmf, renderSvg, mathTypePadding, type FontSet, type RenderResult, type RenderStyle } from "@mathblocks/math-render";
import { useApp } from "./store";
import stixUrl from "@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff?url";
import { isDesktop } from "./connector";
import { activeNotation, activeStyle } from "./docStyle";
import { styleHash } from "@mathblocks/math-core";

/**
 * Classic pictures: equations typeset by the MathBlocks engine with MathType's fonts
 * (Times New Roman, Symbol from Windows) and placed in Word as SVG with a PNG fallback.
 */

let fontsPromise: Promise<FontSet> | null = null;

async function systemFont(name: string): Promise<ArrayBuffer | null> {
  if (!isDesktop()) return previewFont(name);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<ArrayBuffer>("system_font", { name });
  } catch {
    return null;
  }
}

/**
 * Browser preview only (no Windows fonts): when the screenshot tool sets mathblocks.previewFonts, the
 * Times files are fetched from /__preview-fonts/, which the tool serves (Liberation Serif, metric-compatible
 * with Times New Roman). Otherwise the preview falls back to STIX. Never used in the desktop app.
 */
async function previewFont(name: string): Promise<ArrayBuffer | null> {
  try {
    if (localStorage.getItem("mathblocks.previewFonts") !== "1") return null;
    const r = await fetch(`/__preview-fonts/${name}`);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Loads the Classic fonts once. Missing system fonts fall back to STIX (browser preview). */
export function loadFonts(): Promise<FontSet> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    const stix = loadFont(await (await fetch(stixUrl)).arrayBuffer());
    const [r, i, b, bi, sym, extra] = await Promise.all(["times.ttf", "timesi.ttf", "timesbd.ttf", "timesbi.ttf", "symbol.ttf", "mtextra.ttf"].map(systemFont));
    const f = (x: ArrayBuffer | null) => (x ? loadFont(x) : stix);
    return {
      regular: f(r ?? null), italic: f(i ?? null), bold: f(b ?? null), boldItalic: f(bi ?? null), math: stix,
      symbol: sym ? loadFont(sym) : undefined,
      extra: extra ? loadFont(extra) : undefined,
    };
  })();
  fontsPromise.catch(() => (fontsPromise = null));
  return fontsPromise;
}

/** True when the real MathType fonts were found (Windows). */
export async function hasClassicFonts() {
  const f = await loadFonts();
  return f.regular !== f.math && !!f.symbol;
}

export interface Picture extends RenderResult {
  png: Uint8Array;
  /** Vector picture for Word, with the equation's source inside. */
  emf: Uint8Array;
}

export type PictureMode = "display" | "inline" | "numbered";

/** What the picture carries (read back when the equation is edited). */
export interface PictureSource {
  latex: string;
  mode: PictureMode;
  style: string;
  sizePt: number;
  /** Font used for symbols Times/Symbol lack: MathType's MT Extra or the STIX fallback (consistency check). */
  fallback?: "mtextra" | "stix" | "both";
  /** Library block of a linked copy: a pasted picture that lost its wrapper stays linked. */
  block?: string;
  /** The equation's ID (mb1|block|instance): identifies it when its picture title is edited or lost. */
  tag?: string;
  /** Depth below the baseline (pt): Repair restores the picture's lowering from it. */
  depthPt?: number;
  /** Fingerprint of the document style it was drawn in (Check style lists drawings in an older style). */
  styleHash?: string;
}

/** Which fallback font a drawing used. */
function fallbackOf(sources: string[]): PictureSource["fallback"] {
  const extra = sources.includes("extra");
  const stix = sources.includes("math");
  return extra && stix ? "both" : extra ? "mtextra" : stix ? "stix" : undefined;
}

let warnedNoExtra = false;
/** Once: symbols are drawn from STIX because MT Extra is not installed (equations may differ from older ones). */
function warnNoExtra() {
  if (warnedNoExtra) return;
  warnedNoExtra = true;
  try {
    if (localStorage.getItem("mathblocks.warned.mtextra")) return;
    localStorage.setItem("mathblocks.warned.mtextra", "1");
  } catch {
    // Warn this session only.
  }
  useApp.getState().notify(
    "MT Extra (installed with MathType) was not found, so a few symbols are drawn from STIX Two instead. Equations made on a PC with MT Extra may look slightly different; the consistency check lists them.",
  );
}

const PX_PER_PT = 4 * (96 / 72);

/**
 * PNG copy for Word 2016, which cannot show SVG pictures. Painted directly from the engine's
 * drawing operations (no image decoding, so no dependency on the page's image policy).
 */
async function rasterise(r: RenderResult): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(r.widthPt * PX_PER_PT));
  canvas.height = Math.max(1, Math.ceil(r.heightPt * PX_PER_PT));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the equation (no canvas)");
  const k = canvas.width / r.viewW;
  for (const op of r.ops) {
    ctx.fillStyle = op.color;
    if (op.kind === "rect") {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      const [a, b, c, d, e, f] = op.m;
      ctx.setTransform(k * a, k * b, k * c, k * d, k * e, k * f);
      ctx.fill(new Path2D(op.d));
    }
  }
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error("Could not draw the equation (PNG)"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Classic style with the user's accent rules (Word style → Accents). */
export function classicStyle(): RenderStyle {
  return { ...CLASSIC, accents: useApp.getState().accentRules ?? CLASSIC.accents };
}

/** Notation profile of the current document (its style's, else the user's). */
export const notationProfile = () => activeNotation();

export async function renderPicture(latex: string, display: boolean, sizePt: number, mode: PictureMode = display ? "display" : "inline", withPng = false, extra: { block?: string | null; tag?: string | null } = {}): Promise<Picture> {
  const fonts = await loadFonts();
  // Picture padding like MathType's (2 pt around the ink at 12 pt, whole-point depth: exact baseline).
  const ms = activeStyle();
  const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display, sizePt, mathStyle: ms, padding: mathTypePadding(sizePt) });
  const fallback = fallbackOf(r.sources);
  if (fallback === "stix" && !fonts.extra && fonts.symbol) warnNoExtra();
  const source: PictureSource = { latex, mode, style: CLASSIC.id, sizePt, ...(fallback ? { fallback } : {}), ...(extra.block ? { block: extra.block } : {}), ...(extra.tag ? { tag: extra.tag } : {}), depthPt: Math.round(r.depthPt * 1000) / 1000, styleHash: styleHash(ms) };
  const emf = renderEmf(r, { comment: JSON.stringify(source) });
  const png = withPng ? await rasterise(r) : new Uint8Array();
  return { ...r, png, emf };
}

export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Alt text that carries the equation's source, so it can be edited again. */
/**
 * Alt text of a Classic picture: "MathBlocks display (mb1|-|id): LaTeX". The ID is kept here because
 * Word cannot store a title on VML pictures; screen readers still get the LaTeX.
 */
export const altText = (latex: string, mode: "display" | "inline" | "numbered", tag?: string) => `MathBlocks ${mode}${tag ? ` (${tag})` : ""}: ${latex}`;
