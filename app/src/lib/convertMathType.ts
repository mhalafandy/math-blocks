import { create } from "zustand";
import type { ConvertResult } from "@mathblocks/mathtype";
import { isDesktop } from "./connector";
import { currentProfile } from "./equation";
import { useApp } from "./store";

/** Result shown in the conversion report dialog. */
export interface ConversionReport {
  source: string;
  output: string | null;
  result: Omit<ConvertResult, "docx">;
  /** Browser builds: the converted file to download. */
  download?: Blob;
}

export const useConversion = create<{ busy: boolean; report: ConversionReport | null; set: (s: Partial<{ busy: boolean; report: ConversionReport | null }>) => void }>((set) => ({
  busy: false,
  report: null,
  set: (s) => set(s),
}));

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** "C:\\thesis\\ch1.docx" → "C:\\thesis\\ch1 (MathBlocks).docx" */
export function outputPathFor(path: string) {
  return path.replace(/(\.docx|\.docm)?$/i, (ext) => ` (MathBlocks)${ext || ".docx"}`);
}

/**
 * Converts the MathType equations of a Word document into native MathBlocks equations.
 * The original file is never changed: the result is saved as a new document.
 */
export async function convertMathTypeDocument() {
  const notify = useApp.getState().notify;
  const ui = useConversion.getState();
  if (ui.busy) return;
  try {
    let source: string;
    let bytes: Uint8Array;
    if (isDesktop()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ title: "Convert MathType equations: choose a Word document", multiple: false, filters: [{ name: "Word document", extensions: ["docx", "docm"] }] });
      if (!picked || Array.isArray(picked)) return;
      source = picked;
      const { invoke } = await import("@tauri-apps/api/core");
      bytes = new Uint8Array(await invoke<ArrayBuffer>("document_read", { path: source }));
    } else {
      const f = await pickFile();
      if (!f) return;
      source = f.name;
      bytes = new Uint8Array(await f.arrayBuffer());
    }

    ui.set({ busy: true });
    // Let the "Converting…" state paint before the (synchronous) conversion runs.
    await new Promise((r) => setTimeout(r, 30));
    const { convertDocx } = await import("@mathblocks/mathtype");
    const { docx, ...result } = convertDocx(bytes, { profile: currentProfile() });
    if (result.equations.length === 0) {
      ui.set({ busy: false });
      notify(`No MathType equations found in ${baseName(source)}`);
      return;
    }

    let output: string | null = null;
    let download: Blob | undefined;
    if (result.converted > 0) {
      if (isDesktop()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        output = await save({ title: "Save the converted document as", defaultPath: outputPathFor(source), filters: [{ name: "Word document", extensions: ["docx"] }] });
        if (output && output.toLowerCase() === source.toLowerCase()) {
          ui.set({ busy: false });
          notify("Please save the converted document under a new name: the original stays as a backup.", "error");
          return;
        }
        if (output) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("document_write", docx, { headers: { "x-path": encodeURIComponent(output) } });
        }
      } else {
        output = baseName(outputPathFor(source));
        download = new Blob([docx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      }
      if (!output) {
        ui.set({ busy: false });
        return;
      }
    }
    ui.set({ busy: false, report: { source, output, result, download } });
  } catch (e) {
    ui.set({ busy: false });
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

export async function openConvertedDocument(path: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("document_open", { path });
  } catch (e) {
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx,.docm";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
