import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
export type EditMode = "split" | "visual" | "latex";
export type InspectorTab = "structure" | "omml" | "style";
export type ProfileBase = "tuned" | "word-default";
export type VectorStyle = "arrow" | "bold" | "bold-italic";

/** Where the latest LaTeX change came from; used to avoid sync loops between editors. */
export type ChangeSource = "visual" | "latex" | "external";

export interface ConnectorState {
  /** Running inside the desktop shell (Tauri). */
  available: boolean;
  connected: boolean;
  hostVersion?: string;
}

interface Prefs {
  theme: Theme;
  mode: EditMode;
  leftWidth: number;
  rightWidth: number;
  inspectorTab: InspectorTab;
  profileBase: ProfileBase;
  mathFont: string;
  vectorStyle: VectorStyle;
}

interface AppState extends Prefs {
  latex: string;
  display: boolean;
  source: ChangeSource;
  paletteOpen: boolean;
  connector: ConnectorState;
  toast: { text: string; kind: "info" | "error" } | null;

  setLatex: (latex: string, source: ChangeSource) => void;
  setDisplay: (display: boolean) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setPaletteOpen: (open: boolean) => void;
  setConnector: (c: Partial<ConnectorState>) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}

const PREFS_KEY = "mathblocks.prefs.v1";

const DEFAULT_PREFS: Prefs = {
  theme: "system",
  mode: "split",
  leftWidth: 260,
  rightWidth: 340,
  inspectorTab: "structure",
  profileBase: "tuned",
  mathFont: "Cambria Math",
  vectorStyle: "arrow",
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(s: Prefs) {
  try {
    const p: Prefs = {
      theme: s.theme, mode: s.mode, leftWidth: s.leftWidth, rightWidth: s.rightWidth,
      inspectorTab: s.inspectorTab, profileBase: s.profileBase, mathFont: s.mathFont, vectorStyle: s.vectorStyle,
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: preferences simply do not persist.
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  ...loadPrefs(),
  latex: "\\vec{F} = m\\vec{a}",
  display: true,
  source: "external",
  paletteOpen: false,
  connector: { available: false, connected: false },
  toast: null,

  setLatex: (latex, source) => set({ latex, source }),
  setDisplay: (display) => set({ display }),
  setPrefs: (p) => {
    set(p);
    savePrefs(get());
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setConnector: (c) => set({ connector: { ...get().connector, ...c } }),
  notify: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === "error" ? 6000 : 3000);
  },
}));
