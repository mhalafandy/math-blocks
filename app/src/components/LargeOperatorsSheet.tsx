import { useEffect, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg } from "@mathblocks/math-render";
import type { LargeOperatorFont } from "@mathblocks/math-core";
import { Modal } from "./Dialogs";
import { classicStyle, loadFonts } from "../lib/render";
import { activeStyle, saveDocumentStyle } from "../lib/docStyle";
import { useApp } from "../lib/store";

/**
 * Developer tools: the large operators (∫ ∬ ∮ ∑ ∏) inline and in display, in each bundled math font next to the
 * current one, to choose the document style's "large operators" font.
 */
export const useLargeOperatorsSheet = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openLargeOperatorsSheet = () => useLargeOperatorsSheet.getState().set(true);

const FONTS: { id: LargeOperatorFont; label: string }[] = [
  { id: "current", label: "Current (Symbol, as MathType)" },
  { id: "latin-modern", label: "Latin Modern Math" },
  { id: "stix-two", label: "STIX Two Math" },
  { id: "xits", label: "XITS Math" },
];

const INLINE = "\\int_0^1 f(x)\\,dx,\\ \\iint_D g\\,dA,\\ \\oint_C \\mathbf{F}\\cdot d\\mathbf{r},\\ \\sum_{k=1}^{n} a_k,\\ \\prod_{i=1}^{n} b_i";
const DISPLAY = [
  "\\int_0^T \\frac{x^2}{1+x}\\,dx",
  "\\iint_D f(x,y)\\,dx\\,dy",
  "\\oint_C \\mathbf{F}\\cdot d\\mathbf{r}",
  "\\sum_{k=1}^{n} k^2",
  "\\prod_{i=1}^{n} a_i",
];
const PX = 96 / 72;

export function LargeOperatorsSheet() {
  const open = useLargeOperatorsSheet((s) => s.open);
  const set = useLargeOperatorsSheet((s) => s.set);
  const [svgs, setSvgs] = useState<Record<string, { inline: string; display: string[] }> | null>(null);
  const [chosen, setChosen] = useState<LargeOperatorFont>("current");
  useEffect(() => {
    if (!open) return;
    setChosen(activeStyle().global.largeOperators ?? "current");
    void (async () => {
      const fonts = await loadFonts();
      const base = activeStyle();
      const sizePt = base.global.sizePt;
      const draw = (latex: string, display: boolean, id: LargeOperatorFont) => {
        try {
          const r = renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display, sizePt: sizePt * 1.5, mathStyle: { ...base, global: { ...base.global, largeOperators: id } } });
          return r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${(+w * PX).toFixed(1)}px" height="${(+h * PX).toFixed(1)}px"`);
        } catch (e) {
          return `<span class="error">${e instanceof Error ? e.message : String(e)}</span>`;
        }
      };
      const out: Record<string, { inline: string; display: string[] }> = {};
      for (const f of FONTS) out[f.id] = { inline: draw(INLINE, false, f.id), display: DISPLAY.map((l) => draw(l, true, f.id)) };
      setSvgs(out);
    })();
  }, [open]);
  if (!open) return null;
  const use = async (id: LargeOperatorFont) => {
    const s = activeStyle();
    await saveDocumentStyle({ ...s, global: { ...s.global, largeOperators: id } });
    setChosen(id);
    useApp.getState().notify(`Large operators: ${FONTS.find((f) => f.id === id)!.label} (document style). Apply style redraws the document's equations.`);
  };
  return (
    <Modal title="Large operators: compare the fonts" onClose={() => set(false)} width={980}>
      <p className="hint">∫ ∬ ∮ ∑ ∏ inline and in display, at 1.5 × the equation size. The choice is part of the document style (no LaTeX changes); Apply style redraws the equations already in the document.</p>
      {!svgs ? (
        <p>Drawing…</p>
      ) : (
        <table className="bigop-sheet">
          <tbody>
            {FONTS.map((f) => (
              <tr key={f.id} className={f.id === chosen ? "on" : undefined}>
                <th>
                  {f.label}
                  <br />
                  <button disabled={f.id === chosen} onClick={() => void use(f.id)}>
                    {f.id === chosen ? "In use" : "Use this"}
                  </button>
                </th>
                <td>
                  <div dangerouslySetInnerHTML={{ __html: svgs[f.id]!.inline }} />
                  <div className="bigop-display">
                    {svgs[f.id]!.display.map((svg, i) => (
                      <span key={i} dangerouslySetInnerHTML={{ __html: svg }} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
