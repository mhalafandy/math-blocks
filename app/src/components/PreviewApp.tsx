import { useEffect, useState } from "react";
import { registerCustomKinds } from "@mathblocks/math-core";
import { useApp } from "../lib/store";
import type { PreviewState } from "../lib/previewWindow";
import { PreviewView } from "./PreviewView";

/** The preview window (index.html?preview=1): shows what the main window or the floating editor sends it. */
export function PreviewApp() {
  const [st, setSt] = useState<PreviewState | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    void (async () => {
      const { listen, emit } = await import("@tauri-apps/api/event");
      off = await listen<PreviewState>("preview:state", (e) => {
        const p = e.payload;
        // Everything that changes the drawing comes with the equation (this window has no document of its own).
        registerCustomKinds(p.customKinds ?? []);
        useApp.setState({ docStyle: p.docStyle, accentRules: p.accentRules, notationProfile: p.notationProfile, customKinds: p.customKinds, textWidthPt: p.textWidthPt, theme: p.theme as never });
        setSt(p);
      });
      await emit("preview:ready");
      // Closing the window hides it: it opens again where it was, at the size it had.
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      await w.onCloseRequested((ev) => {
        ev.preventDefault();
        void w.hide();
      });
    })().catch(() => undefined);
    return () => off?.();
  }, []);
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  if (!st) return <div className="preview-view"><p className="muted" style={{ padding: 16 }}>Waiting for the editor…</p></div>;
  return <PreviewView latex={st.latex} display={st.display} numbered={st.numbered} sizePt={st.sizePt} textWidthPt={st.textWidthPt} onDock={() => void import("@tauri-apps/api/event").then((m) => m.emitTo("main", "preview:dock", {}))} />;
}
