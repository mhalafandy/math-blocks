import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_STYLE, STYLE_PRESET_BY_ID } from "@mathblocks/math-core";
import { CLASSIC, loadFont, type FontSet } from "@mathblocks/math-render";
import { ALL_ITEMS, GROUPS } from "./palette";
import { ICON_CELL, LARGE_CELL, renderTile, STRUCTURE_CELL, SYMBOL_CELL, TILE_FONT_PX, type TileCell } from "./tiles";

const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const require = createRequire(import.meta.url);
let STIX = "";
try {
  STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff", { paths: [fileURLToPath(new URL("../../../packages/math-render/", import.meta.url))] });
} catch {
  STIX = "";
}
const available = existsSync(L + "Regular.ttf") && !!STIX && existsSync(STIX);

describe.skipIf(!available)("palette tiles are drawn by math-render in the document style", () => {
  const fonts: FontSet = {
    regular: loadFont(readFileSync(L + "Regular.ttf")),
    italic: loadFont(readFileSync(L + "Italic.ttf")),
    bold: loadFont(readFileSync(L + "Bold.ttf")),
    boldItalic: loadFont(readFileSync(L + "BoldItalic.ttf")),
    math: loadFont(readFileSync(STIX)),
  };
  const draw = (latex: string, cell: TileCell, mathStyle = DEFAULT_STYLE) => renderTile(latex, cell, { fonts, style: CLASSIC, mathStyle });

  it("every palette entry draws, at its cell's size, in currentColor, never enlarged", () => {
    const cells = [SYMBOL_CELL, STRUCTURE_CELL, LARGE_CELL];
    for (const x of ALL_ITEMS) {
      const cell = x.item.glyph ? SYMBOL_CELL : x.group.row === "tabs" ? LARGE_CELL : STRUCTURE_CELL;
      const t = draw(x.item.latex, cell);
      expect(t.svg, x.key).toContain(`viewBox="0 0 ${cell.w} ${cell.h}"`);
      expect(t.scale, x.key).toBeLessThanOrEqual(1);
      expect(t.svg, x.key).not.toMatch(/fill="#|stroke="#/);
    }
    // One font size for every tile.
    for (const c of cells) expect(c.fontPx).toBe(TILE_FONT_PX);
    // Group buttons' previews draw too.
    for (const g of GROUPS) expect(draw(g.iconTex ? g.icon : g.icon.split(/\s+/).join("\\,"), ICON_CELL).svg).toContain("<svg");
  });

  it("centred on the math axis: an equals sign and a fraction bar sit on the cell's middle line", () => {
    for (const [latex, cell] of [["=", SYMBOL_CELL], ["=", STRUCTURE_CELL]] as const) {
      const t = draw(latex, cell);
      const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(t.svg)!;
      const ty = Number(m[2]);
      const s = Number(m[3]);
      // Each glyph path carries its own translate(x y); its points are relative to that.
      const ys = [...t.svg.matchAll(/<path transform="translate\([-\d.]+ ([-\d.]+)\)" d="([^"]+)"/g)].flatMap((p) =>
        [...p[2]!.matchAll(/[MLQC][^MLQCZ]*/g)].flatMap((seg) => {
          const nums = seg[0].slice(1).trim().split(/[ ,]+/).map(Number);
          return nums.filter((_, i) => i % 2 === 1).map((y) => ty + (Number(p[1]) + y) * s);
        }),
      );
      expect(ys.length).toBeGreaterThan(1);
      const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
      expect(Math.abs(mid - cell.h / 2)).toBeLessThan(1.5);
    }
  });

  it("one placeholder look, and the document style changes the drawing (so tiles show what Word gets)", () => {
    const a = draw("\\vec{#0}", STRUCTURE_CELL).svg;
    const b = draw("\\hat{#?}", STRUCTURE_CELL).svg;
    expect(a).not.toContain("#0");
    expect(b).not.toContain("#?");
    // ISO style draws d upright: the tile of d/dt changes with the style.
    const iso = applyPreset(DEFAULT_STYLE, STYLE_PRESET_BY_ID.get("iso")!);
    expect(draw("\\frac{d}{dt}", STRUCTURE_CELL, iso).svg).not.toBe(draw("\\frac{d}{dt}", STRUCTURE_CELL).svg);
  });
});

describe("one rendering path for tiles", () => {
  it("no palette component draws tiles with MathLive or plain text", () => {
    const dir = fileURLToPath(new URL("../components/", import.meta.url));
    const palettes = ["SymbolPalette.tsx", "Panel.tsx", "QuickStyleBar.tsx", "ShortcutsDialog.tsx"];
    for (const f of palettes) {
      const src = readFileSync(dir + f, "utf8");
      expect(src, f).not.toMatch(/mathlive\/ssr|convertLatexToMarkup/);
      expect(src, f).not.toMatch(/className="glyph"|className="tex"/);
    }
    // Every pal-item button shows a MathTile.
    const sp = readFileSync(dir + "SymbolPalette.tsx", "utf8");
    expect(sp).toMatch(/<MathTile latex=\{x\.item\.latex\} cell=\{CELL\[size\]\} \/>/);
    // MathLive's markup is used only for equation previews in dialogs, never for a palette.
    const users = readdirSync(dir).filter((f) => /convertLatexToMarkup/.test(readFileSync(dir + f, "utf8")));
    expect(users.sort()).toEqual(["DocumentStyleDialog.tsx", "MathPreview.tsx"]);
  });
});
