import { useMemo, useState } from "react";
import { create } from "zustand";
import { KINDS } from "@mathblocks/math-core";
import { Modal } from "./Dialogs";
import { MathTile } from "./MathTile";
import { STRUCTURE_CELL, SYMBOL_CELL } from "../lib/tiles";
import { AUTOCORRECT, insertIntoVisual } from "./MathEditor";
import { EDITOR_SHORTCUTS } from "../lib/editorKeys";
import { CATEGORIES, ENTRIES, STRUCTURES, type PaletteEntry } from "../lib/palette";
import { kindSnippetPrefix, kindSnippets } from "../lib/snippets";
import { useApp } from "../lib/store";

/** Keyboard shortcuts (F1) and the LaTeX commands sheet (second tab). */
type Tab = "keys" | "latex";
export const useShortcuts = create<{ open: boolean; tab: Tab; set: (o: boolean, tab?: Tab) => void }>((set) => ({ open: false, tab: "keys", set: (open, tab = "keys") => set({ open, tab }) }));
export const openShortcuts = (tab: Tab = "keys") => useShortcuts.getState().set(true, tab);

interface SheetRow {
  latex: string;
  name: string;
  how?: string;
}

/** The commands sheet: palette entries grouped like the palette, then environments and kinds. */
function sheetSections(): { title: string; rows: SheetRow[] }[] {
  const row = (e: PaletteEntry): SheetRow => ({ latex: e.latex, name: e.name, how: e.shortcut ?? (e.snippet ? `${e.snippet} Tab` : undefined) });
  const seen = new Set<string>();
  const once = (rows: SheetRow[]) => rows.filter((r) => (seen.has(r.latex) ? false : (seen.add(r.latex), true)));
  const order = ["greek", "operators", "relations", "arrows", "styles", "delimiters", "sets-logic", "functions", "calculus", "linalg"] as const;
  const out: { title: string; rows: SheetRow[] }[] = [];
  for (const id of order) {
    const c = CATEGORIES.find((x) => x.id === id)!;
    out.push({ title: c.label, rows: once(ENTRIES.filter((e) => e.categories.includes(id) && e.kind !== "notation").map(row)) });
  }
  for (const st of STRUCTURES) out.push({ title: st.label, rows: once(ENTRIES.filter((e) => e.categories.includes(st.id)).map(row)) });
  out.push({
    title: "Environments",
    rows: once([
      { latex: "\\begin{aligned}#? &= #?\\\\ &= #?\\end{aligned}", name: "aligned (derivation; Enter adds a line, Ctrl+; sets the alignment)", how: "Enter" },
      { latex: "\\begin{multline}#? \\\\ #?\\end{multline}", name: "multline (long equation broken over lines)" },
      { latex: "\\begin{gathered}#?\\\\ #?\\end{gathered}", name: "gathered (centred lines)" },
      { latex: "\\begin{cases}#? & #?\\\\ #? & #?\\end{cases}", name: "cases", how: "cases Tab" },
      { latex: "\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}", name: "bmatrix (also pmatrix, vmatrix, matrix)", how: "mat2 Tab" },
    ]),
  });
  const prefix = kindSnippetPrefix();
  const snips = kindSnippets(prefix);
  out.push({
    title: "Notation kinds (and my own)",
    rows: KINDS.map((k, i) => ({ latex: snips[i]?.latex ?? `\\${k.macro}{#?}`, name: `${k.name} — \\${k.macro}`, how: `${snips[i]?.trigger ?? prefix + k.snippet} Tab` })),
  });
  return out.filter((s) => s.rows.length);
}

function LatexSheet({ onInsert }: { onInsert: () => void }) {
  const [q, setQ] = useState("");
  const custom = useApp((s) => s.customKinds);
  const sections = useMemo(() => sheetSections(), [custom]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (r: SheetRow) => words.every((w) => `${r.name} ${r.latex} ${r.how ?? ""}`.toLowerCase().includes(w));
  return (
    <div className="latex-sheet">
      <input className="latex-sheet-search" autoFocus placeholder="Search: frac, arrow, \\vec, matrix, vector…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="hint">Click a command to insert it at the cursor.</p>
      {sections.map((sec) => {
        const rows = sec.rows.filter(match);
        if (!rows.length) return null;
        return (
          <section key={sec.title}>
            <h4>{sec.title}</h4>
            <div className="latex-sheet-grid">
              {rows.map((r) => (
                <button
                  key={r.latex}
                  className="latex-sheet-row"
                  title={r.name}
                  onClick={() => {
                    onInsert();
                    requestAnimationFrame(() => insertIntoVisual(r.latex));
                  }}
                >
                  <MathTile latex={r.latex} cell={r.latex.includes("#") || r.latex.length > 12 ? STRUCTURE_CELL : SYMBOL_CELL} />
                  <code>{r.latex.replace(/#0|#\?/g, "□")}</code>
                  {r.how && <kbd>{r.how}</kbd>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const APP: [string, string][] = [
  ["Ctrl+Enter", "Send to Word / Update in Word"],
  ["Ctrl+K, or Space Space in the editor", "Search commands and symbols"],
  ["Ctrl+N", "New equation"],
  ["Ctrl+S", "Save to library (new version)"],
  ["Ctrl+Shift+S", "Save as new library equation"],
  ["Ctrl+L", "LaTeX editor (when the equation editor is not focused)"],
  ["Ctrl+B / Ctrl+Alt+B / Ctrl+J", "Library / symbols / bottom panel"],
  ["Ctrl+ + / − / 0", "Zoom"],
  ["F1", "This sheet"],
];

const WORD: [string, string][] = [
  ["Right-click an equation", "Floating editor next to it"],
  ["Double-click an equation", "Edit in the MathBlocks window"],
  ["Ctrl+Alt+M", "Edit the equation at the cursor (or start a new one there)"],
  ["Ctrl+Alt+L", "Equation ↔ LaTeX text at the cursor"],
  ["Ctrl+Alt+N", "Number / un-number the equation at the cursor"],
  ["Ctrl+Alt+R", "Insert a reference to an equation"],
  ["Alt, Q, then a letter", "MathBlocks ribbon buttons"],
  ["Enter / Esc (floating editor)", "Apply / cancel (Ctrl+Enter applies a display equation)"],
];

export function ShortcutsDialog() {
  const open = useShortcuts((s) => s.open);
  const tab = useShortcuts((s) => s.tab);
  const set = useShortcuts((s) => s.set);
  const doubleSpace = useApp((s) => s.doubleSpace);
  const doubleSpaceMs = useApp((s) => s.doubleSpaceMs);
  if (!open) return null;
  return (
    <Modal title={tab === "keys" ? "Keyboard shortcuts" : "LaTeX commands"} onClose={() => set(false)} width={880}>
      <div className="sheet-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "keys"} className={tab === "keys" ? "on" : undefined} onClick={() => set(true, "keys")}>
          Keyboard shortcuts
        </button>
        <button role="tab" aria-selected={tab === "latex"} className={tab === "latex" ? "on" : undefined} onClick={() => set(true, "latex")}>
          LaTeX commands
        </button>
      </div>
      {tab === "latex" ? (
        <LatexSheet onInsert={() => set(false)} />
      ) : (
      <>
      <div className="sheet-setting">
        <label>
          <input type="checkbox" checked={doubleSpace} onChange={(e) => useApp.getState().setPrefs({ doubleSpace: e.target.checked })} /> Space Space in the equation editor opens the
          command palette
        </label>
        <label>
          within{" "}
          <input type="number" min={150} max={800} step={25} value={doubleSpaceMs} disabled={!doubleSpace} onChange={(e) => useApp.getState().setPrefs({ doubleSpaceMs: Math.max(150, Math.min(800, Number(e.target.value) || 300)) })} />{" "}
          ms
        </label>
      </div>
      <div className="shortcuts">
        <section>
          <h4>In the equation editor (like MathType)</h4>
          <table>
            <tbody>
              {EDITOR_SHORTCUTS.map((s) => (
                <tr key={s.keys}>
                  <td>
                    <kbd>{s.keys}</kbd>
                  </td>
                  <td>{s.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h4>Typing turns into symbols</h4>
          <div className="autocorrect">
            {Object.entries(AUTOCORRECT).map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd> <MathTile latex={v} cell={SYMBOL_CELL} />
              </span>
            ))}
            <span className="muted">and: alpha, beta… → α, β…; sqrt, sum, int, lim; ^ and _ for scripts; / for a fraction</span>
          </div>
          <h4>In Word</h4>
          <table>
            <tbody>
              {WORD.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>In the app</h4>
          <table>
            <tbody>
              {APP.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      </>
      )}
    </Modal>
  );
}
