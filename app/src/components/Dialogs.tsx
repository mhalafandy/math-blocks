import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, createContext, useContext } from "react";
import { useSettings, type SettingsPage } from "../lib/settingsStore";
import { create } from "zustand";
import { restoreEditorFocus } from "../lib/editorFocus";

/** Generic modal frame: Escape or clicking outside cancels. */
/** True inside a settings page: a settings dialog's Modal draws its contents in place (no overlay). */
export const ModalInline = createContext(false);

export function Modal({ title, onClose, children, width = 440, page }: { title: string; onClose: () => void; children: ReactNode; width?: number; page?: SettingsPage }) {
  const inline = useContext(ModalInline);
  // A settings dialog lives in the settings window while it is open (its own pop-up stays hidden).
  const inSettings = useSettings((s) => s.open) && !!page;
  useEffect(() => {
    if (inline || inSettings) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, inline, inSettings]);
  // Closing a dialog returns the keyboard to the equation editor, caret where it was.
  useEffect(() => () => void (!inline && restoreEditorFocus()), [inline]);
  // Opening: the keyboard goes to the dialog's main field (its first text field, else its main button), unless
  // the dialog already put it somewhere (autoFocus).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inline || inSettings || page) return;
    const box = boxRef.current;
    if (!box || box.contains(document.activeElement)) return;
    const field = box.querySelector<HTMLElement>("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(:disabled), textarea:not(:disabled), select:not(:disabled)");
    (field ?? box.querySelector<HTMLElement>("button.primary:not(:disabled)"))?.focus();
  }, [inline, inSettings, page]);
  // Enter in a one-line field confirms: the dialog's main button (not in a text area, a list or a search box).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement) || ["checkbox", "radio", "search", "button", "submit"].includes(t.type)) return;
    const primary = boxRef.current?.querySelector<HTMLButtonElement>("button.primary:not(:disabled)");
    if (!primary) return;
    e.preventDefault();
    primary.click();
  };
  if (inline)
    return (
      <section className="settings-embedded" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </section>
    );
  if (inSettings) return null;
  // A settings page's dialog outside the settings window: never the old pop-up; the settings open at its page.
  if (page) return <RedirectToSettings page={page} />;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      {/* Never taller than the window: the title and the button row stay visible, the body scrolls. */}
      <div className="modal" ref={boxRef} role="dialog" aria-modal="true" aria-label={title} style={{ width }} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Opens the settings at a page instead of drawing the old dialog (once, on mount). */
function RedirectToSettings({ page }: { page: SettingsPage }) {
  useEffect(() => {
    // From the floating editor this asks the main window (the settings live there).
    void import("../lib/settingsStore").then((m) => m.openSettings(page));
  }, [page]);
  return null;
}

interface PromptRequest {
  title: string;
  label?: string;
  value?: string;
  confirm?: string;
  /** Confirmation only (no text field). */
  message?: string;
  danger?: boolean;
  resolve: (value: string | null) => void;
}

const usePrompt = create<{ req: PromptRequest | null; set: (r: PromptRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Asks for a single line of text; resolves null when cancelled. */
export const askText = (title: string, value = "", label?: string, confirm = "OK") =>
  new Promise<string | null>((resolve) => usePrompt.getState().set({ title, value, label, confirm, resolve }));

/** Asks for confirmation; resolves true when confirmed. */
export const askConfirm = (title: string, message: string, confirm = "Delete", danger = true) =>
  new Promise<boolean>((resolve) => usePrompt.getState().set({ title, message, confirm, danger, resolve: (v) => resolve(v !== null) }));

export function PromptHost() {
  const req = usePrompt((s) => s.req);
  const set = usePrompt((s) => s.set);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (req) {
      setValue(req.value ?? "");
      requestAnimationFrame(() => input.current?.select());
    }
  }, [req]);
  if (!req) return null;
  const done = (v: string | null) => {
    set(null);
    req.resolve(v);
  };
  return (
    <Modal title={req.title} onClose={() => done(null)}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (req.message !== undefined) done("ok");
          else if (value.trim()) done(value.trim());
        }}
      >
        {req.message !== undefined ? (
          <p className="modal-text">{req.message}</p>
        ) : (
          <label>
            {req.label ?? "Name"}
            <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className={req.danger ? "danger-btn" : "primary"} disabled={req.message === undefined && !value.trim()} autoFocus={req.message !== undefined}>
            {req.confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}
