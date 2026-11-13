import { create } from "zustand";
import type { CustomKind, NotationProfile } from "@mathblocks/math-core";
import type { AccentRules } from "@mathblocks/math-render";
import { isDesktop } from "./connector";
import { activeStyle } from "./docStyle";
import { useApp, type DocStyleState } from "./store";

/**
 * The Word preview window: its own resizable window on the desktop (label "preview", tauri.conf.json),
 * a pane in the browser preview. The main window and the floating editor send it what they edit (the
 * equation and everything that changes its drawing); it shows whichever changed last.
 */

export interface PreviewState {
  latex: string;
  display: boolean;
  numbered: boolean;
  sizePt: number;
  textWidthPt: number | null;
  docStyle: DocStyleState | null;
  accentRules: AccentRules;
  notationProfile: NotationProfile;
  customKinds: CustomKind[];
  theme: string;
}

/** Browser preview: the preview as a pane in the page. */
export const usePreviewPane = create<{ open: boolean; set: (o: boolean) => void }>((set) => ({ open: false, set: (open) => set({ open }) }));

export function previewState(): PreviewState {
  const s = useApp.getState();
  return {
    latex: s.latex,
    display: s.display,
    numbered: s.numbered,
    sizePt: activeStyle().global.sizePt,
    textWidthPt: s.textWidthPt,
    docStyle: s.docStyle,
    accentRules: s.accentRules,
    notationProfile: s.notationProfile,
    customKinds: s.customKinds,
    theme: s.theme,
  };
}

const inPanel = () => typeof document !== "undefined" && document.documentElement.classList.contains("panel-window");

/** Whether the preview shows now (docked tab, browser pane; the desktop window reports itself). */
export function previewShown(s = useApp.getState(), pane = usePreviewPane.getState().open): boolean {
  return s.previewDocked ? s.bottomOpen && s.bottomTab === "preview" : pane;
}

/**
 * Opens the preview (or closes it when it is open): docked in the bottom panel (the default), or in its own
 * window when popped out (the floating editor always uses the window: the main window is behind it).
 */
export async function togglePreview() {
  const s = useApp.getState();
  if (s.previewDocked && !inPanel()) {
    s.setPrefs(previewShown(s) ? { bottomOpen: false } : { bottomOpen: true, bottomTab: "preview" });
    return;
  }
  return toggleWindow();
}

/** Pops the docked preview out into its own window (remembered). */
export async function popOutPreview() {
  const s = useApp.getState();
  s.setPrefs({ previewDocked: false, ...(s.bottomTab === "preview" ? { bottomTab: "latex" as const } : {}) });
  await showWindow();
}

/** Docks the preview back in the bottom panel (remembered); its window closes. */
export async function dockPreview() {
  useApp.getState().setPrefs({ previewDocked: true, bottomOpen: true, bottomTab: "preview" });
  usePreviewPane.getState().set(false);
  if (!isDesktop()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const w = await WebviewWindow.getByLabel("preview");
  await w?.hide();
}

async function showWindow() {
  if (!isDesktop()) return usePreviewPane.getState().set(true);
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const w = await WebviewWindow.getByLabel("preview");
  if (!w) return;
  await w.show();
  await w.setFocus();
  sendPreview(true);
}

async function toggleWindow() {
  if (!isDesktop()) {
    const p = usePreviewPane.getState();
    p.set(!p.open);
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const w = await WebviewWindow.getByLabel("preview");
  if (!w) return;
  if (await w.isVisible()) {
    await w.hide();
    return;
  }
  await w.show();
  await w.setFocus();
  sendPreview(true);
}

let last = "";
let timer: ReturnType<typeof setTimeout> | undefined;

/** Sends the current state to the preview window (only when it changed, unless forced). */
export function sendPreview(force = false) {
  if (!isDesktop()) return;
  const st = previewState();
  const key = JSON.stringify(st);
  if (!force && key === last) return;
  last = key;
  void import("@tauri-apps/api/event").then((m) => m.emitTo("preview", "preview:state", st)).catch(() => undefined);
}

let synced = false;

/** Main window and floating editor: keep the preview up to date as you type (a short pause between sends). */
export function initPreviewSync() {
  if (synced || !isDesktop()) return;
  synced = true;
  useApp.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => sendPreview(), 90);
  });
  void import("@tauri-apps/api/event").then((m) => m.listen("preview:ready", () => sendPreview(true))).catch(() => undefined);
  // The preview window's Dock button.
  if (!inPanel()) void import("@tauri-apps/api/event").then((m) => m.listen("preview:dock", () => void dockPreview())).catch(() => undefined);
}
