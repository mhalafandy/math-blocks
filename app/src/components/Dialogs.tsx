import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

/** Generic modal frame: Escape or clicking outside cancels. */
export function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
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
