import { useEffect, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { boldGreek, glyphStem, renderSvg, symbolGlyph, thinOutline, type FontSet, type OutlineCmd } from "@mathblocks/math-render";
import { Modal } from "./Dialogs";
import { classicStyle, loadFonts } from "../lib/render";
import { activeStyle } from "../lib/docStyle";

/**
 * Bold Greek comparison sheet (on this PC's fonts): Greek bold upright and bold italic next to bold
 * Latin at 12 pt and 10 pt, the three meanings of one letter, and the stroke weights measured.
 */
export const useBoldGreekSheet = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openBoldGreekSheet = () => useBoldGreekSheet.getState().set(true);

const LETTERS = ["\\alpha", "\\beta", "\\gamma", "\\omega", "\\sigma", "\\tau", "\\theta", "\\phi", "\\Gamma", "\\Omega"];
const PX = 96 / 72;
/** Shown at twice the size, so strokes can be compared on screen. */
const ZOOM = 2;

function svgOf(latex: string, sizePt: number, fonts: FontSet): string {
  const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display: false, sizePt: sizePt * ZOOM, mathStyle: activeStyle() });
  return r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${(+w * PX).toFixed(1)}px" height="${(+h * PX).toFixed(1)}px"`);
}

/** Stem widths (em): Times Regular, Times Bold, Symbol, Symbol emboldened. */
export function boldGreekStems(fonts: FontSet) {
  const bg = boldGreek(fonts);
  let emboldened = 0;
  let emboldenedItalic = 0;
  if (fonts.symbol) {
    const g = symbolGlyph(fonts.symbol, "Ι");
    if (g) {
      const cmds = g.glyph.getPath(0, 0, 1).commands as OutlineCmd[];
      emboldened = glyphStem(thinOutline(cmds as never, -bg.upright) as OutlineCmd[], g.h) ?? 0;
      emboldenedItalic = glyphStem(thinOutline(cmds as never, -bg.italic) as OutlineCmd[], g.h) ?? 0;
    }
  }
  return { ...bg.stems, emboldened, emboldenedItalic, offsetUpright: bg.upright, offsetItalic: bg.italic, measured: bg.measured };
}

export function BoldGreekSheet() {
  const open = useBoldGreekSheet((s) => s.open);
  const set = useBoldGreekSheet((s) => s.set);
  const [html, setHtml] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setHtml(null);
    void (async () => {
      const fonts = await loadFonts();
      const st = boldGreekStems(fonts);
      const em = (x: number) => (x ? `${(x * 1000).toFixed(0)}/1000 em` : "—");
      setNote(
        fonts.symbol
          ? `Stems measured on this PC — Times Regular ${em(st.timesRegular)}, Times Bold ${em(st.timesBold)}, Times Bold Italic ${em(st.timesBoldItalic)}; Symbol ${em(st.symbol)}, emboldened ${em(st.emboldened)} (upright) / ${em(st.emboldenedItalic)} (italic); outward offset ${em(st.offsetUpright)} / ${em(st.offsetItalic)}.`
          : "No Symbol font here: bold Greek is drawn from Times New Roman Bold (or STIX's bold Greek), not emboldened.",
      );
      const rows = LETTERS.map((l) => {
        const cells = [12, 10]
          .map((pt) => `<td>${svgOf(`\\mathbf{${l}}\\ \\boldsymbol{${l}}\\ ${l}\\quad\\mathbf{a}\\,\\mathbf{r}\\ \\boldsymbol{a}\\,\\boldsymbol{r}`, pt, fonts)}</td>`)
          .join("");
        return `<tr><th>${l.replace("\\", "")}</th>${cells}</tr>`;
      }).join("");
      const meanings = [12, 10].map((pt) => `<td>${svgOf("\\pvec{\\omega},\\ \\cmat{\\omega},\\ \\omega\\qquad\\pvec{r},\\ \\cmat{r},\\ r", pt, fonts)}</td>`).join("");
      setHtml(
        `<table class="fontcmp"><thead><tr><th></th><th>12 pt (shown ×2): bold upright, bold italic, plain · bold Latin a r, bold italic a r</th><th>10 pt (shown ×2)</th></tr></thead><tbody>${rows}` +
          `<tr><th>three meanings</th>${meanings}</tr></tbody></table>`,
      );
    })();
  }, [open]);
  if (!open) return null;
  return (
    <Modal title="Bold Greek on this PC" onClose={() => set(false)} width={1100}>
      <div className="form">
        <p className="hint">{note} The strokes of bold Greek should look as heavy as the bold Latin letters next to them.</p>
        {html ? <div className="fontcmp-wrap" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="empty">Drawing…</p>}
      </div>
    </Modal>
  );
}
