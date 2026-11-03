import { create } from "zustand";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { AUTOCORRECT } from "./MathEditor";
import { EDITOR_SHORTCUTS } from "../lib/editorKeys";

/** Keyboard shortcuts sheet (F1). */
export const useShortcuts = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openShortcuts = () => useShortcuts.getState().set(true);

const APP: [string, string][] = [
  ["Ctrl+Enter", "Send to Word / Update in Word"],
  ["Ctrl+K", "Search commands and symbols"],
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
  ["Enter / Esc (floating editor)", "Apply / cancel"],
];

export function ShortcutsDialog() {
  const open = useShortcuts((s) => s.open);
  const set = useShortcuts((s) => s.set);
  if (!open) return null;
  return (
    <Modal title="Keyboard shortcuts" onClose={() => set(false)} width={820}>
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
                <kbd>{k}</kbd> <MathPreview latex={v} />
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
    </Modal>
  );
}
