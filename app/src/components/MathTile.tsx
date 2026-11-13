import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { styleHash } from "@mathblocks/math-core";
import type { FontSet } from "@mathblocks/math-render";
import { useApp } from "../lib/store";
import { classicStyle, loadFonts } from "../lib/render";
import { activeStyle } from "../lib/docStyle";
import { renderTile, type TileCell } from "../lib/tiles";

/**
 * Every palette tile in the app (right panel, top palette, floating editor, Quick access, Recent,
 * search results, My notation) is this component: drawn by math-render in the current document style
 * through lib/tiles.ts, the same size and centred on the math axis, in currentColor. Tiles are cached
 * per style and drawn again when the document style, the accents or the notation change.
 */

let fonts: FontSet | null = null;
let fontsWaiting: Promise<FontSet> | null = null;
const cache = new Map<string, string>();
const CACHE_MAX = 4000;
let cacheStyle = "";

/** Drawing errors, for the self-check (a tile that cannot be drawn shows the placeholder instead). */
export const tileErrors: string[] = [];

function useFonts(): FontSet | null {
  const [f, setF] = useState(fonts);
  useEffect(() => {
    if (f) return;
    fontsWaiting ??= loadFonts();
    let live = true;
    void fontsWaiting.then((x) => {
      fonts = x;
      if (live) setF(x);
    });
    return () => {
      live = false;
    };
  }, [f]);
  return f;
}

/** A key that changes whenever tiles must be drawn again (the style of the document or the user's). */
export function useTileStyleKey(): string {
  const deps = useApp(useShallow((s) => [s.docStyle, s.defaultStyle, s.notationProfile, s.equationSizePt, s.boldScope, s.accentsFollowBold, s.transposeForm, s.accentRules, s.customKinds] as const));
  return `${styleHash(activeStyle())}|${JSON.stringify(deps[7])}|${(deps[8] ?? []).length}`;
}

/** The SVG of one tile (cached). Exported for the self-check and the contact sheets. */
export function tileSvg(latex: string, cell: TileCell, f: FontSet, styleKey: string): string {
  if (styleKey !== cacheStyle || cache.size > CACHE_MAX) {
    cache.clear();
    cacheStyle = styleKey;
  }
  const key = `${cell.id}|${latex}`;
  let svg = cache.get(key);
  if (svg === undefined) {
    try {
      svg = renderTile(latex, cell, { fonts: f, style: classicStyle(), mathStyle: activeStyle() }).svg;
    } catch (e) {
      tileErrors.push(`${latex}: ${e instanceof Error ? e.message : String(e)}`);
      svg = renderTile("#0", cell, { fonts: f, style: classicStyle() }).svg;
    }
    cache.set(key, svg);
  }
  return svg;
}

export const MathTile = memo(function MathTile({ latex, cell }: { latex: string; cell: TileCell }) {
  const f = useFonts();
  const styleKey = useTileStyleKey();
  return (
    <span
      className="math-tile"
      style={{ width: cell.w, height: cell.h }}
      // While the fonts load (the first moment after start) the cell stays empty at its final size.
      dangerouslySetInnerHTML={f ? { __html: tileSvg(latex, cell, f, styleKey) } : undefined}
    />
  );
});
