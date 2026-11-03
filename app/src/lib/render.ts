import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, loadFont, renderSvg, type FontSet, type RenderResult } from "@mathblocks/math-render";
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
}

const PX_PER_PT = 4 * (96 / 72);

/** Rasterises an SVG for Word 2016, which cannot show SVG pictures. */
async function rasterise(svg: string, widthPt: number, heightPt: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not draw the equation"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(widthPt * PX_PER_PT));
    canvas.height = Math.max(1, Math.ceil(heightPt * PX_PER_PT));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG failed"))), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderPicture(latex: string, display: boolean, sizePt: number): Promise<Picture> {
  const fonts = await loadFonts();
  const r = renderSvg(parseLatex(latex).root, { fonts, style: CLASSIC, display, sizePt });
  const png = await rasterise(r.svg, r.widthPt, r.heightPt);
  return { ...r, png };
}

export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Alt text that carries the equation's source, so it can be edited again. */
export const altText = (latex: string, mode: "display" | "inline" | "numbered") => `MathBlocks ${mode}: ${latex}`;
