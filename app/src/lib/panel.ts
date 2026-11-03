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
}

export interface PanelResult {
  latex: string;
  display: boolean;
  numbered: boolean;
}

async function panelWindow() {
  const { Window } = await import("@tauri-apps/api/window");
  return Window.getByLabel("panel");
}

/** Opens the panel below the equation (above it near the bottom of the screen). */
export async function openPanel(rect: ScreenRect) {
  const w = await panelWindow();
  if (!w) return;
  const st = useApp.getState();
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
  };
  const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
  const size = await w.outerSize();
  const win = await import("@tauri-apps/api/window");
  const monitor = (await win.monitorFromPoint(rect.left, rect.top).catch(() => null)) ?? (await win.primaryMonitor().catch(() => null));
  const gap = 10;
  let x = rect.left;
  let y = rect.top + rect.height + gap;
  if (monitor) {
    const right = monitor.position.x + monitor.size.width;
    const bottom = monitor.position.y + monitor.size.height;
    x = Math.max(monitor.position.x, Math.min(x, right - size.width));
    if (y + size.height > bottom) y = Math.max(monitor.position.y, rect.top - size.height - gap);
  }
  await w.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
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
  await listen<PanelResult>("panel:apply", async (e) => {
    const app = useApp.getState();
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
  await listen("panel:wordMenu", () => {
    void connector.request("showWordMenu", {}).catch(() => undefined);
  });
}
