import { useEffect, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg } from "@mathblocks/math-render";
import { largeOperatorFont, type MathStyleGlobal } from "@mathblocks/math-core";
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

/** Each choice as the document style's settings (the last one mixes: STIX Two, contour integrals from XITS). */
type Choice = Pick<MathStyleGlobal, "largeOperators" | "largeOperatorGroups">;
const FONTS: { id: string; label: string; set: Choice }[] = [
  { id: "current", label: "Current (Symbol, as MathType)", set: { largeOperators: "current" } },
  { id: "latin-modern", label: "Latin Modern Math", set: { largeOperators: "latin-modern" } },
  { id: "stix-two", label: "STIX Two Math", set: { largeOperators: "stix-two" } },
  { id: "xits", label: "XITS Math", set: { largeOperators: "xits" } },
  { id: "stix-xits", label: "STIX Two + XITS contour (the default for new styles)", set: { largeOperators: "stix-two", largeOperatorGroups: { contour: "xits" } } },
];

/** Which row the style matches (every group's font the same as that row's). */
const matching = (g: MathStyleGlobal) => {
  const ops = ["∫", "∮", "∑", "⋃"];
  return FONTS.find((f) => ops.every((op) => largeOperatorFont({ global: g }, op) === largeOperatorFont({ global: f.set as MathStyleGlobal }, op)))?.id ?? "";
};

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
  const [chosen, setChosen] = useState<string>("current");
  useEffect(() => {
    if (!open) return;
    setChosen(matching(activeStyle().global));
    void (async () => {
      const fonts = await loadFonts();
      const base = activeStyle();
      const sizePt = base.global.sizePt;
      const draw = (latex: string, display: boolean, set: Choice) => {
        try {
          const global = { ...base.global, largeOperators: set.largeOperators, largeOperatorGroups: set.largeOperatorGroups };
          if (!set.largeOperatorGroups) delete global.largeOperatorGroups;
          const r = renderSvg(parseLatex(latex).root, { fonts, style: { ...classicStyle(), color: "#000000" }, display, sizePt: sizePt * 1.5, mathStyle: { ...base, global } });
          return r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${(+w * PX).toFixed(1)}px" height="${(+h * PX).toFixed(1)}px"`);
        } catch (e) {
          return `<span class="error">${e instanceof Error ? e.message : String(e)}</span>`;
        }
      };
      const out: Record<string, { inline: string; display: string[] }> = {};
      for (const f of FONTS) out[f.id] = { inline: draw(INLINE, false, f.set), display: DISPLAY.map((l) => draw(l, true, f.set)) };
      setSvgs(out);
    })();
  }, [open]);
  if (!open) return null;
  const use = async (id: string) => {
    const s = activeStyle();
    const f = FONTS.find((x) => x.id === id)!;
    const global = { ...s.global, largeOperators: f.set.largeOperators, largeOperatorGroups: f.set.largeOperatorGroups };
    if (!f.set.largeOperatorGroups) delete global.largeOperatorGroups;
    await saveDocumentStyle({ ...s, global });
    setChosen(id);
    useApp.getState().notify(`Large operators: ${FONTS.find((f) => f.id === id)!.label} (document style). Apply style redraws the document's equations.`);
  };
  return (
    <Modal title="Large operators: compare the fonts" onClose={() => set(false)} width={980}>
      <p className="hint">∫ ∬ ∮ ∑ ∏ inline and in display, at 1.5 × the equation size, on a white page as in Word. The choice is part of the document style (no LaTeX changes); each group (integrals, contour integrals, sums and products, others) can also be set on its own in Document style. Apply style redraws the equations already in the document.</p>
      {!svgs ? (
        <p>Drawing…</p>
      ) : (
        <table className="bigop-sheet eq-page">
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
