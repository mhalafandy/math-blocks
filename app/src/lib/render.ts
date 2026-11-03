import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, loadFont, renderEmf, renderSvg, type FontSet, type RenderResult } from "@mathblocks/math-render";
import stixUrl from "@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff?url";
import { isDesktop } from "./connector";

/**
 * Classic pictures: equations typeset by the MathBlocks engine with MathType's fonts
 * (Times New Roman, Symbol from Windows) and placed in Word as SVG with a PNG fallback.
 */

let fontsPromise: Promise<FontSet> | null = null;

async function systemFont(name: string): Promise<ArrayBuffer | null> {
  if (!isDesktop()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<ArrayBuffer>("system_font", { name });
  } catch {
    return null;
  }
}

/** Loads the Classic fonts once. Missing system fonts fall back to STIX (browser preview). */
export function loadFonts(): Promise<FontSet> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    const stix = loadFont(await (await fetch(stixUrl)).arrayBuffer());
    const [r, i, b, bi, sym] = await Promise.all(["times.ttf", "timesi.ttf", "timesbd.ttf", "timesbi.ttf", "symbol.ttf"].map(systemFont));
    const f = (x: ArrayBuffer | null) => (x ? loadFont(x) : stix);
    return { regular: f(r ?? null), italic: f(i ?? null), bold: f(b ?? null), boldItalic: f(bi ?? null), math: stix, symbol: sym ? loadFont(sym) : undefined };
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

export async function renderPicture(latex: string, display: boolean, sizePt: number, mode: PictureMode = display ? "display" : "inline", withPng = false): Promise<Picture> {
  const fonts = await loadFonts();
  const r = renderSvg(parseLatex(latex).root, { fonts, style: CLASSIC, display, sizePt });
  const source: PictureSource = { latex, mode, style: CLASSIC.id, sizePt };
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
export const altText = (latex: string, mode: "display" | "inline" | "numbered") => `MathBlocks ${mode}: ${latex}`;
