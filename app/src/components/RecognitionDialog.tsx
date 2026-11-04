import { useState } from "react";
import { create } from "zustand";
import { Modal } from "./Dialogs";
import { insertIntoVisual } from "./MathEditor";
import { getApiKey, isCleanLatex, recognizeEquation, RecognitionError, setApiKey } from "../lib/recognize";
import { useApp } from "../lib/store";

/** Settings for equation recognition (the user's Anthropic API key). */
export const useRecognition = create<{ open: boolean; busy: boolean; set: (s: Partial<{ open: boolean; busy: boolean }>) => void }>((set) => ({
  open: false,
  busy: false,
  set: (s) => set(s),
}));
export const openRecognitionSettings = () => useRecognition.getState().set({ open: true });

export function RecognitionDialog() {
  const open = useRecognition((s) => s.open);
  const set = useRecognition((s) => s.set);
  const [key, setKey] = useState("");
  if (!open) return null;
  const saved = getApiKey();
  const close = () => {
    setKey("");
    set({ open: false });
  };
  return (
    <Modal title="Equation recognition" onClose={close} width={520}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) {
            setApiKey(key);
            useApp.getState().notify("API key saved. Paste a picture of an equation (Ctrl+V) to try it.");
          }
          close();
        }}
      >
        <p className="modal-text">
          Paste a screenshot, scan or photo of an equation (<kbd>Ctrl V</kbd>) into the equation editor and MathBlocks turns it into an editable equation. Recognition uses Claude (Anthropic) with your own
          API key; only the pictures you paste are sent, nothing else.
        </p>
        <label>
          Anthropic API key {saved && <span className="hint-inline">saved (…{saved.slice(-4)})</span>}
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={saved ? "Enter a new key to replace it" : "sk-ant-…"} autoFocus spellCheck={false} />
        </label>
        <p className="hint">Create a key at console.anthropic.com → API keys. It is stored on this PC only.</p>
        <div className="modal-actions">
          {saved && (
            <button
              type="button"
              className="danger-btn"
              onClick={() => {
                setApiKey(null);
                useApp.getState().notify("API key removed");
                close();
              }}
            >
              Remove key
            </button>
          )}
          <div className="spacer" />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!key.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Recognises an equation image and puts it into the editor (empty editor: replaces; else at the cursor). */
export async function recognizeIntoEditor(image: Blob) {
  const app = useApp.getState();
  if (!getApiKey()) {
    openRecognitionSettings();
    return;
  }
  const ui = useRecognition.getState();
  if (ui.busy) return;
  ui.set({ busy: true });
  app.notify("Recognising the equation…");
  try {
    const latex = await recognizeEquation(image);
    if (!useApp.getState().latex.trim()) useApp.getState().setLatex(latex, "external");
    else insertIntoVisual(latex);
    app.notify(isCleanLatex(latex) ? "Equation recognised. Check it, then send it to Word." : "Equation recognised, but parts may be wrong (see the LaTeX tab).", isCleanLatex(latex) ? "info" : "error");
  } catch (e) {
    app.notify(e instanceof RecognitionError || e instanceof Error ? e.message : String(e), "error");
  } finally {
    ui.set({ busy: false });
  }
}

/** Pasting a picture anywhere except a text field recognises it. */
export function onPasteImage(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.closest?.(".cm-editor"))) return;
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return;
  e.preventDefault();
  e.stopPropagation();
  void recognizeIntoEditor(file);
}

/** Picks an image file and recognises it. */
export function recognizeFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/webp";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void recognizeIntoEditor(f);
  };
  input.click();
}
