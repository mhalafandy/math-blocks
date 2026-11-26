import { useMemo, useState } from "react";
import { create } from "zustand";
import { KINDS } from "@mathblocks/math-core";
import { Modal } from "./Dialogs";
import { MathTile } from "./MathTile";
import { STRUCTURE_CELL, SYMBOL_CELL } from "../lib/tiles";
import { AUTOCORRECT, insertBlock, insertIntoVisual } from "./MathEditor";
import { EDITOR_SHORTCUTS } from "../lib/editorKeys";
import { MODE_KEYS } from "../lib/modeKeys";
import { DEFAULT_WORD_KEYS, type WordKeyName } from "../lib/wordKeys";
import { CATEGORIES, ENTRIES, STRUCTURES, type PaletteEntry } from "../lib/palette";
import { kindSnippetPrefix, kindSnippets } from "../lib/snippets";
import { allBlocks, blockByName, useBlocks } from "../lib/blocks/useBlocks";
import { previewLatex, type Block } from "../lib/blocks/model";
import { useApp } from "../lib/store";

/** Keyboard shortcuts (F1) and the LaTeX commands sheet (second tab). */
type Tab = "keys" | "latex";
export const useShortcuts = create<{ open: boolean; tab: Tab; set: (o: boolean, tab?: Tab) => void }>((set) => ({ open: false, tab: "keys", set: (open, tab = "keys") => set({ open, tab }) }));
export const openShortcuts = (tab: Tab = "keys") => useShortcuts.getState().set(true, tab);

interface SheetRow {
  latex: string;
  name: string;
  how?: string;
  /** A block (inserted with its slots to fill, not as LaTeX). */
  block?: Block;
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
  // The user's blocks (and the open document's), with their triggers.
  out.push({
    title: "My blocks",
    rows: allBlocks().map((b) => ({ latex: previewLatex(b, blockByName, "#?"), name: b.name, how: b.trigger ? `${prefix}${b.trigger} Tab` : undefined, block: b })),
  });
  return out.filter((s) => s.rows.length);
}

function LatexSheet({ onInsert }: { onInsert: () => void }) {
  const [q, setQ] = useState("");
  const custom = useApp((s) => s.customKinds);
  const blocks = useBlocks((b) => b.blocks.length + b.docBlocks.length * 1000);
  const sections = useMemo(() => sheetSections(), [custom, blocks]);
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
                    requestAnimationFrame(() => (r.block ? insertBlock(r.block) : insertIntoVisual(r.latex)));
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

/** One short line each; the key column holds only keys (details go in the description). */
const APP: [string, string][] = [
  ["Ctrl+Enter", "Send to Word / update in Word"],
  ["Ctrl+K", "Search commands and symbols (also Space Space outside every structure)"],
  ["Ctrl+N", "New equation"],
  ["Ctrl+S", "Save to the library (a new version)"],
  ["Ctrl+Shift+S", "Save as a new library equation"],
  ["Ctrl+L", "LaTeX editor"],
  ["Ctrl+B", "Show / hide the Library and Blocks panel"],
  ["Ctrl+Alt+B", "Show / hide the symbols"],
  ["Ctrl+J", "Show / hide the bottom panel"],
  ["Ctrl+Alt+P", "Word preview window"],
  ["Ctrl+= / Ctrl+− / Ctrl+0", "Zoom in / out / 100 %"],
  ["F1", "This sheet"],
];

const TYPE: [string, string][] = [
  [MODE_KEYS.display, "Display equation (on its own line)"],
  [MODE_KEYS.inline, "Inline equation (in a line of text)"],
  [MODE_KEYS.numbered, "Numbered display equation"],
];

const EDITING: [string, string][] = [
  ["Space / Shift+Space", "Next / previous slot (in text, Space types a space)"],
  ["Backspace", "One character; a structure is selected first, deleted by the second press"],
];

const WORD_LABELS: Record<WordKeyName, string> = {
  inline: "New inline equation at the cursor",
  display: "New display equation at the cursor",
  latex: "Toggle LaTeX: equations at the cursor or selection ↔ LaTeX text",
  edit: "Edit the equation at the cursor (or start one there)",
  reference: "Insert a reference to an equation",
  number: "Number / un-number the equation at the cursor",
};

const WORD_MORE: [string, string][] = [
  ["Right-click an equation", "Floating editor next to it"],
  ["Double-click an equation", "Edit it in the MathBlocks window"],
  ["Enter / Esc", "Floating editor: apply / cancel (Ctrl+Enter for a display equation)"],
  ["Alt, K, then a letter", "Every other command (the MathBlocks tab's key tips)"],
];

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <table>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>
              <kbd>{k}</kbd>
            </td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ShortcutsDialog() {
  const open = useShortcuts((s) => s.open);
  const tab = useShortcuts((s) => s.tab);
  const set = useShortcuts((s) => s.set);
  const doubleSpace = useApp((s) => s.doubleSpace);
  const doubleSpaceMs = useApp((s) => s.doubleSpaceMs);
  const wordKeys = useApp((s) => s.wordKeys) as Partial<Record<WordKeyName, string>>;
  if (!open) return null;
  return (
    <Modal title={tab === "keys" ? "Keyboard shortcuts" : "LaTeX commands"} onClose={() => set(false)} width={1000}>
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
        <span className="hint">Space Space {doubleSpace ? `opens the command palette (within ${doubleSpaceMs} ms, outside every structure)` : "is off"}.</span>{" "}
        <button
          className="link-button"
          onClick={() => {
            set(false);
            void import("../lib/settingsStore").then((m) => m.openSettings("editor"));
          }}
        >
          Change in Settings → Editor
        </button>
      </div>
      <div className="shortcuts">
        <section>
          <h4>Equation type</h4>
          <Rows rows={TYPE} />
          <h4>Editing</h4>
          <Rows rows={[...EDITING, ...EDITOR_SHORTCUTS.map((x) => [x.keys, x.label] as [string, string])]} />
          <h4>App</h4>
          <Rows rows={APP} />
          <h4>In Word (change them in Settings → Word shortcuts)</h4>
          <Rows rows={[...(Object.keys(WORD_LABELS) as WordKeyName[]).map((k) => [wordKeys[k] ?? DEFAULT_WORD_KEYS[k], WORD_LABELS[k]] as [string, string]), ...WORD_MORE]} />
          <h4>Typing turns into symbols</h4>
          <div className="autocorrect">
            {Object.entries(AUTOCORRECT).map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd> <MathTile latex={v} cell={SYMBOL_CELL} />
              </span>
            ))}
            <span className="muted">and: alpha, beta… → α, β…; sqrt, sum, int, lim; ^ and _ for scripts; / for a fraction</span>
          </div>
        </section>
      </div>
      </>
      )}
    </Modal>
  );
}
