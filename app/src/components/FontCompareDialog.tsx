import { useEffect, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { CLASSIC, glyphSource, renderSvg, type FontSet, type RenderStyle } from "@mathblocks/math-render";
import { Modal } from "./Dialogs";
import { loadFonts } from "../lib/render";
import { ENTRIES } from "../lib/palette";

/**
 * Symbol-font comparison on this PC: every symbol Times New Roman and Symbol lack, drawn the three
 * candidate ways — STIX at 94 %, STIX at 94 % thinned, and MT Extra (if installed here) — inside a
 * line of Times text at 100 %, to choose the Classic fallback.
 */
export const useFontCompare = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openFontCompare = () => useFontCompare.getState().set(true);

const PX = 96 / 72;

function inline(latex: string, fonts: FontSet, style: RenderStyle): string {
  const r = renderSvg(parseLatex(latex).root, { fonts, style, display: false, sizePt: 12 });
  const svg = r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${(+w * PX).toFixed(2)}px" height="${(+h * PX).toFixed(2)}px"`);
  return `<span style="display:inline-block;vertical-align:-${(r.depthPt * PX).toFixed(2)}px">${svg}</span>`;
}

/** Symbols the Classic style takes from a fallback font, with one palette entry using each. */
function fallbackSymbols(fonts: FontSet): { ch: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const e of ENTRIES) {
    const visit = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) return v.forEach(visit);
      const n = v as { kind?: string; text?: string; variant?: string };
      if ((n.kind === "operator" || n.kind === "ident") && n.text && !n.variant)
        for (const ch of n.text) {
          const src = glyphSource(ch, n.kind as "operator", fonts, { ...CLASSIC, useExtraFont: true });
          if ((src === "math" || src === "extra") && !seen.has(ch)) seen.set(ch, e.name);
        }
      for (const [k, x] of Object.entries(n)) if (k !== "meta" && typeof x === "object") visit(x);
    };
    visit(parseLatex(e.item.latex.replace(/#0|#\?/g, "x")).root);
  }
  return [...seen].map(([ch, name]) => ({ ch, name }));
}

export function FontCompareDialog() {
  const open = useFontCompare((s) => s.open);
  const set = useFontCompare((s) => s.set);
  const [html, setHtml] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!open) return;
    setHtml(null);
    void (async () => {
      const fonts = await loadFonts();
      const realTimes = fonts.regular !== fonts.math;
      setNote(`${realTimes ? "Times New Roman" : "STIX (Times New Roman not found)"} · ${fonts.symbol ? "Symbol" : "no Symbol font"} · ${fonts.extra ? "MT Extra found" : "MT Extra not installed on this PC"}`);
      const variants: { label: string; style: RenderStyle; ok: boolean }[] = [
        { label: "1 · STIX 94 %", style: { ...CLASSIC, useExtraFont: false, fallbackScale: 0.94, fallbackThin: 0 }, ok: true },
        { label: "2 · STIX 94 % thinned", style: { ...CLASSIC, useExtraFont: false, fallbackScale: 0.94, fallbackThin: 0.01 }, ok: true },
        { label: "3 · MT Extra", style: { ...CLASSIC, useExtraFont: true, fallbackScale: 0.94, fallbackThin: 0 }, ok: !!fonts.extra },
      ];
      const rows = fallbackSymbols(fonts)
        .map(({ ch, name }) => {
          const cells = variants
            .map((v) => {
              if (!v.ok) return `<td class="na">not installed</td>`;
              const inExtra = v.label.startsWith("3") && glyphSource(ch, "operator", fonts, v.style) !== "extra";
              return `<td><span class="times">the vectors satisfy ${inline(`a${ch}b`, fonts, v.style)} in the frame</span>${inExtra ? ` <span class="na">(not in MT Extra: STIX)</span>` : ""}</td>`;
            })
            .join("");
          return `<tr><th>${ch} <small>${name}</small></th>${cells}</tr>`;
        })
        .join("");
      setHtml(`<table class="fontcmp"><thead><tr><th>Symbol</th>${variants.map((v) => `<th>${v.label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`);
    })();
  }, [open]);
  if (!open) return null;
  return (
    <Modal title="Symbol fonts on this PC" onClose={() => set(false)} width={1100}>
      <div className="form">
        <p className="hint">
          Symbols Times and Symbol lack, drawn three ways inside a line of Times text at 100 % (12 pt). Fonts found: {note}. Tell me which column you prefer.
        </p>
        {html ? <div className="fontcmp-wrap" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="empty">Drawing…</p>}
      </div>
    </Modal>
  );
}
