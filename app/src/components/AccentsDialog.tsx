import { useEffect, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { DEFAULT_ACCENTS, MATHTYPE_ACCENTS, renderSvg, type AccentRules } from "@mathblocks/math-render";
import { Modal } from "./Dialogs";
import { openSettings } from "../lib/settingsStore";
import { useApp } from "../lib/store";

/**
 * Accents: how harpoons, arrows and the other accents are drawn over letters in Classic equations —
 * size and stroke (× MathType's, measured), the gap above the letter, the barb angle, fixed or adaptive
 * length — with a live preview on this PC's fonts at 12 pt and 10 pt.
 */
export const useAccents = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openAccents = () => {
  if (openSettings("accents")) return;
  useAccents.getState().set(true);
};

/** Letters that are hard for accents: thin, wide, with ascenders, italic overhang, bold, Greek. */
export const ACCENT_SAMPLES = "\\overrightharpoon{r}\\ \\overrightharpoon{\\omega}\\ \\vec{F}\\ \\vec{\\ell}\\ \\vec{W}\\ \\hat{\\imath}\\ \\hat{x}\\ \\bar{x}\\ \\dot{x}\\ \\ddot{x}\\ \\pvec{r}\\ \\bvec{f}_1\\ \\vectrix{F}";

const PX = 96 / 72;

export function AccentsDialog() {
  const { open, set } = useAccents();
  const saved = useApp((s) => s.accentRules);
  const [rules, setRules] = useState<AccentRules>(saved);
  const [svg, setSvg] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setRules(useApp.getState().accentRules);
      setNote("");
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void (async () => {
      const { loadFonts, classicStyle } = await import("../lib/render");
      const { activeStyle } = await import("../lib/docStyle");
      const fonts = await loadFonts();
      const style = { ...classicStyle(), accents: rules };
      const out = [12, 10].map((pt) => {
        const r = renderSvg(parseLatex(ACCENT_SAMPLES).root, { fonts, style, display: false, sizePt: pt * 2, mathStyle: activeStyle() });
        return r.svg.replace(/width="([\d.]+)pt" height="([\d.]+)pt"/, (_, w: string, h: string) => `width="${(+w * PX).toFixed(1)}px" height="${(+h * PX).toFixed(1)}px"`);
      });
      if (live) setSvg(out);
    })();
    return () => {
      live = false;
    };
  }, [open, rules]);
  if (!open) return null;
  const up = (p: Partial<AccentRules>) => setRules({ ...rules, ...p });
  const save = async (redraw: boolean) => {
    useApp.getState().setPrefs({ accentRules: rules });
    if (!redraw) return setNote("Saved: new equations use these accents.");
    setBusy(true);
    try {
      const { applyStyleToDocument } = await import("../lib/styleRun");
      const r = await applyStyleToDocument();
      setNote(`Saved and redrew ${r.equations} equation(s); one Ctrl+Z in Word undoes the redraw.${r.note}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const slider = (label: string, key: "size" | "stroke" | "gap" | "barbAngle" | "minGap", min: number, max: number, step: number, unit: string) => (
    <label style={{ display: "grid", gridTemplateColumns: "220px 1fr 70px", alignItems: "center", gap: 8 }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={rules[key]} onChange={(e) => up({ [key]: Number(e.target.value) } as Partial<AccentRules>)} />
      <span>
        {rules[key]}
        {unit}
      </span>
    </label>
  );
  return (
    <Modal title="Accents" onClose={() => set(false)} width={900} page="accents">
      <div className="form">
        <p className="hint">How harpoons, arrows and the other accents sit over letters in Classic equations. Sizes are relative to MathType's (measured on its pictures).</p>
        {slider("Harpoon / arrow size (× MathType)", "size", 0.7, 1.5, 0.05, "×")}
        {slider("Stroke weight (× MathType)", "stroke", 0.8, 2.5, 0.1, "×")}
        {slider("Gap above the letter", "gap", 0.05, 0.25, 0.005, " em")}
        {slider("Barb angle", "barbAngle", 20, 45, 1, "°")}
        {slider("Smallest gap for any accent", "minGap", 0, 0.15, 0.005, " em")}
        <label>
          Harpoon / arrow length over one letter{" "}
          <select value={rules.length ?? "fixed"} onChange={(e) => up({ length: e.target.value as AccentRules["length"] })}>
            <option value="adaptive">adaptive (the letter's width)</option>
            <option value="fixed">fixed (MathType's 0.41 em)</option>
          </select>
        </label>
        <div style={{ display: "grid", gap: 6, background: "#fff", padding: 8, borderRadius: 6 }}>
          <div className="hint">12 pt (shown ×2)</div>
          <div dangerouslySetInnerHTML={{ __html: svg[0] ?? "" }} />
          <div className="hint">10 pt (shown ×2)</div>
          <div dangerouslySetInnerHTML={{ __html: svg[1] ?? "" }} />
        </div>
        {note && <p>{note}</p>}
        <div className="modal-actions">
          <button onClick={() => setRules(DEFAULT_ACCENTS)} disabled={busy}>
            MathBlocks default
          </button>
          <button onClick={() => setRules(MATHTYPE_ACCENTS)} disabled={busy}>
            MathType-like
          </button>
          <div className="spacer" />
          <button onClick={() => set(false)} disabled={busy}>
            Close
          </button>
          <button onClick={() => void save(false)} disabled={busy}>
            Save
          </button>
          <button className="primary" onClick={() => void save(true)} disabled={busy || !useApp.getState().connector.connected}>
            {busy ? "Redrawing…" : "Save and redraw the document"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
