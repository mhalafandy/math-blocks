import { isDesktop } from "../connector";
import { useApp } from "../store";
import { useLibrary } from "./useLibrary";

/** Exports the whole library to a JSON file (desktop: save dialog; browser: download). */
export async function exportLibrary() {
  const { store, refresh } = useLibrary.getState();
  const notify = useApp.getState().notify;
  if (!store) return;
  try {
    if (isDesktop()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await save({ title: "Export MathBlocks library", defaultPath: `MathBlocks library ${stamp}.json`, filters: [{ name: "MathBlocks library", extensions: ["json"] }] });
      if (!path) return;
      const n = await store.exportTo(path);
      notify(`Exported ${n} equation(s)`);
    } else {
      const json = (await store.exportTo("")) as string;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      a.download = "MathBlocks library.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    await refresh();
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** Imports (merges) a library file. Existing equations are kept unless the file has a newer version. */
export async function importLibrary() {
  const { store, refresh } = useLibrary.getState();
  const notify = useApp.getState().notify;
  if (!store) return;
  try {
    let report;
    if (isDesktop()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ title: "Import MathBlocks library", multiple: false, filters: [{ name: "MathBlocks library", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      report = await store.importFrom(path);
    } else {
      const text = await pickFileText();
      if (text === null) return;
      report = await store.importFrom(text);
    }
    await refresh();
    notify(`Imported: ${report.equationsAdded} new, ${report.equationsUpdated} updated, ${report.equationsSkipped} unchanged, ${report.foldersAdded} folder(s)`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

function pickFileText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
