import type { ScreenRect } from "@mathblocks/connector-protocol";
import { connector } from "./connector";
import { runWordUpdate } from "./actions";
import { useApp } from "./store";

/**
 * The floating editor (step 3): a small always-on-top window that opens next to an equation
 * right-clicked in Word. The main window keeps the Word connection and does the update; the
 * panel only edits and sends the result back (events between the two windows).
 */

export interface PanelOpen {
  latex: string;
  display: boolean;
  numbered: boolean;
  look: "classic" | "native";
  sizePt: number;
  /** Library name when the equation is a linked copy. */
  linked: string | null;
  number: string | null;
  theme?: "system" | "light" | "dark";
}

export interface PanelResult {
  latex: string;
  display: boolean;
  numbered: boolean;
  /** The notation the floating editor drew with: the main window inserts with exactly this. */
  notationProfile?: import("@mathblocks/math-core").NotationProfile;
  customKinds?: import("@mathblocks/math-core").CustomKind[];
  accentRules?: import("@mathblocks/math-render").AccentRules;
}

/** The equation the floating editor was opened for (its target ends when it closes). */
let panelTarget: string | null = null;

async function panelWindow() {
  const { Window } = await import("@tauri-apps/api/window");
  return Window.getByLabel("panel");
}

/** Opens the panel below the equation (above it near the bottom of the screen). */
export async function openPanel(rect: ScreenRect) {
  const w = await panelWindow();
  if (!w) return;
  const st = useApp.getState();
  panelTarget = st.editing?.tag ?? null;
  const { useLibrary } = await import("./library/useLibrary");
  const lib = useLibrary.getState();
  const q = st.editing?.blockId ? lib.equations.find((x) => x.id === st.editing!.blockId) : undefined;
  const state: PanelOpen = {
    latex: st.latex,
    display: st.display,
    numbered: st.numbered,
    look: st.look,
    sizePt: st.equationSizePt,
    linked: q?.name ?? null,
    number: null,
    theme: st.theme,
  };
  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
  const { loadGeometry, placePanel, PANEL_DEFAULT, PANEL_MIN, screenKey } = await import("./panelPlacement");
  const win = await import("@tauri-apps/api/window");
  const monitor = (await win.monitorFromPoint(rect.left, rect.top).catch(() => null)) ?? (await win.primaryMonitor().catch(() => null));
  const scale = monitor?.scaleFactor ?? (await w.scaleFactor());
  // Size and position remembered on this screen (the user resized or moved it there); else the default size.
  const saved = monitor ? loadGeometry(screenKey(monitor)) : null;
  const screen = monitor ? { x: monitor.position.x, y: monitor.position.y, w: monitor.size.width, h: monitor.size.height } : { x: 0, y: 0, w: 1e5, h: 1e5 };
  const size = {
    w: Math.min(screen.w, Math.max(PANEL_MIN.w * scale, saved?.w ?? PANEL_DEFAULT.w * scale)),
    h: Math.min(screen.h, Math.max(PANEL_MIN.h * scale, saved?.h ?? PANEL_DEFAULT.h * scale)),
  };
  await w.setSize(new PhysicalSize(Math.round(size.w), Math.round(size.h)));
  // Never over the equation when there is room elsewhere; the card sits 14 px (logical) inside the window.
  const eq = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  const at = placePanel(eq, size, screen, { saved: saved ? { x: saved.x, y: saved.y } : undefined, inset: 14 * scale });
  await w.setPosition(new PhysicalPosition(at.x, at.y));
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("panel", "panel:open", state);
  await w.show();
  await w.setFocus();
}

let bridged = false;

/** Main window: reacts to what the panel asks for. */
export async function initPanelBridge() {
  if (bridged) return;
  bridged = true;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("panel:closed", () => {
    // Applied (the update already ended it) or cancelled: the floating editor's target is over.
    const app = useApp.getState();
    if (app.editing && panelTarget === app.editing.tag) app.setEditing(null);
    panelTarget = null;
  });
  await listen<PanelResult>("panel:apply", async (e) => {
    const app = useApp.getState();
    // What Word gets is what the floating editor showed: its notation first, then the equation.
    const { notationProfile, customKinds, accentRules } = e.payload;
    if (customKinds && JSON.stringify(customKinds) !== JSON.stringify(app.customKinds)) app.setPrefs({ customKinds });
    if (notationProfile && JSON.stringify(notationProfile) !== JSON.stringify(useApp.getState().notationProfile)) app.setPrefs({ notationProfile });
    if (accentRules && JSON.stringify(accentRules) !== JSON.stringify(app.accentRules)) app.setPrefs({ accentRules });
    app.setLatex(e.payload.latex, "external");
    app.setDisplay(e.payload.display);
    app.setNumbered(e.payload.numbered);
    await runWordUpdate();
  });
  await listen("panel:openApp", async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const main = getCurrentWindow();
    await main.unminimize();
    await main.show();
    await main.setFocus();
  });
  await listen<{ source: string }>("panel:saveBlock", async (e) => {
    // Save as block from the floating editor: the dialog in the main window, brought to the front.
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const main = getCurrentWindow();
    await main.unminimize();
    await main.show();
    await main.setFocus();
    const { openSaveBlock } = await import("../components/SaveBlockDialog");
    openSaveBlock(e.payload.source);
  });
  await listen<import("../components/SymbolList").DefineReqPayload>("panel:defineSymbol", async (e) => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const main = getCurrentWindow();
    await main.unminimize();
    await main.show();
    await main.setFocus();
    const { useDefineSymbol } = await import("../components/SymbolList");
    // The equation the floating editor is editing: the definition goes after its paragraph.
    useDefineSymbol.getState().set({ ...e.payload, equationTag: e.payload.equationTag ?? panelTarget ?? undefined });
  });
  await listen("panel:wordMenu", () => {
    // For an equation object: the MathBlocks equation menu (cut, copy, paste, delete, number, copy LaTeX).
    const tag = panelTarget ?? useApp.getState().editing?.tag ?? "";
    void connector.request("showWordMenu", { tag }).catch(() => undefined);
  });
}
