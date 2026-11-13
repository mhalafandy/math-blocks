import { create } from "zustand";

/**
 * The settings window: one place for every app setting, pages in a sidebar. The settings dialogs that
 * existed before (document style, kinds, accents, snippets, recognition) are its pages; opening one of them
 * from anywhere opens this window at its page. The floating editor asks the main window to open it.
 */

export type SettingsPage = "word" | "docstyle" | "kinds" | "accents" | "numbering" | "snippets" | "palette" | "editor" | "connection" | "backups" | "updates" | "recognition" | "benchmark" | "symbollist";

export const useSettings = create<{ open: boolean; page: SettingsPage; set: (s: Partial<{ open: boolean; page: SettingsPage }>) => void }>((set) => ({
  open: false,
  page: "word",
  set: (s) => set(s),
}));

const inPanel = () => typeof document !== "undefined" && document.documentElement.classList.contains("panel-window");

/**
 * Opens the settings at a page — the only way a settings page is shown (the dialogs that became pages never
 * open on their own). Always returns true: the caller opens nothing itself (from the floating editor, the main
 * window is asked to open it).
 */
export function openSettings(page?: SettingsPage): boolean {
  if (inPanel()) {
    void import("@tauri-apps/api/event").then((m) => m.emitTo("main", "panel:openSettings", { page: page ?? null })).catch(() => undefined);
    return true;
  }
  const s = useSettings.getState();
  s.set({ open: true, page: page ?? s.page });
  return true;
}
