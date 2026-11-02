import { create } from "zustand";
import { DEFAULT_FAVORITES } from "./palette";

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
  /** Where the symbol palette lives (user can switch). */
  paletteLocation: "top" | "side";
  /** Pinned palette items (keys from palette.ts). */
  favorites: string[];
  /** Recently inserted palette items, newest first. */
  recents: string[];
  /** Topic tab shown under the top palette; null = collapsed. */
  paletteTab: string | null;
}

export interface UpdateState {
  currentVersion?: string;
  newVersion?: string;
  status: "idle" | "downloading" | "ready" | "installing";
  /** Word add-in installation state reported by the Rust shell. */
  addin?: "unavailable" | "upToDate" | "installed" | "pendingWordClosed" | "failed";
}

interface AppState extends Prefs {
  latex: string;
  display: boolean;
  source: ChangeSource;
  paletteOpen: boolean;
  connector: ConnectorState;
  toast: { text: string; kind: "info" | "error" } | null;
  update: UpdateState;
  setUpdate: (u: Partial<UpdateState>) => void;

  setLatex: (latex: string, source: ChangeSource) => void;
  setDisplay: (display: boolean) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setPaletteOpen: (open: boolean) => void;
  setConnector: (c: Partial<ConnectorState>) => void;
  notify: (text: string, kind?: "info" | "error") => void;
}

const PREFS_KEY = "mathblocks.prefs.v2";

const DEFAULT_PREFS: Prefs = {
  theme: "system",
  mode: "split",
  leftWidth: 260,
  rightWidth: 340,
  inspectorTab: "structure",
  profileBase: "tuned",
  mathFont: "Latin Modern Math",
  vectorStyle: "arrow",
  paletteLocation: "top",
  favorites: DEFAULT_FAVORITES,
  recents: [],
  paletteTab: "tab-derivs",
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
      paletteLocation: s.paletteLocation, favorites: s.favorites, recents: s.recents, paletteTab: s.paletteTab,
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
  update: { status: "idle" },
  setUpdate: (u) => set({ update: { ...get().update, ...u } }),

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
