import { create } from "zustand";
import type { BoldScope } from "@mathblocks/math-core";
import { DEFAULT_ACCENTS, type AccentRules } from "@mathblocks/math-render";
import { DEFAULT_FAVORITES, setNotationRules, type Convention, type TransposeForm, type VectorStyle as SpacecraftVector } from "./palette";

export type Theme = "system" | "light" | "dark";
/** Tabs of the bottom panel under the equation canvas. */
export type BottomTab = "latex" | "details" | "symbols" | "structure" | "style" | "omml";
export type ProfileBase = "tuned" | "word-default";
export type VectorStyle = "arrow" | "harpoon" | "bold" | "bold-italic";

/** Where the latest LaTeX change came from; used to avoid sync loops between editors. */
export type ChangeSource = "visual" | "latex" | "external";

export interface ConnectorState {
  /** Running inside the desktop shell (Tauri). */
  available: boolean;
  connected: boolean;
  hostVersion?: string;
  /** Requests the loaded Word add-in understands (from its hello). */
  methods?: string[];
}

/** How new equation numbers look (see NumberFormat in connector-protocol). */
export interface NumberStyle {
  open: string;
  close: string;
  chapter: boolean;
}

interface Prefs {
  theme: Theme;
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  bottomHeight: number;
  bottomTab: BottomTab;
  /** Equation canvas zoom factor (1 = 100%). */
  zoom: number;
  profileBase: ProfileBase;
  mathFont: string;
  vectorStyle: VectorStyle;
  /** Where the symbol palette lives (user can switch). */
  paletteLocation: "right" | "top";
  /** Pinned palette items (keys from palette.ts). */
  favorites: string[];
  /** Recently inserted palette items, newest first. */
  recents: string[];
  /** Topic tab shown under the top palette; null = collapsed. */
  paletteTab: string | null;
  numberStyle: NumberStyle;
  /** How equations go into Word: MathBlocks Classic pictures, or native Word equations. */
  look: "classic" | "native";
  /** Size of Classic equations in points (MathType's default: 12). */
  equationSizePt: number;
  /** Spacecraft palette notation: textbook convention and how physical vectors are drawn. */
  spacecraftConvention: Convention;
  spacecraftVector: SpacecraftVector;
  /** Style rules (Word style → Style rules): accents, bold, transpose. */
  accentRules: AccentRules;
  boldScope: BoldScope;
  accentsFollowBold: boolean;
  transposeForm: TransposeForm;
}

export interface UpdateState {
  currentVersion?: string;
  newVersion?: string;
  status: "idle" | "downloading" | "ready" | "installing";
  /** Word add-in installation state reported by the Rust shell. */
  addin?: "unavailable" | "upToDate" | "installed" | "pendingWordClosed" | "failed";
}

/** An equation from Word being edited; "Send to Word" then updates it in place. */
export interface EditingTarget {
  tag: string;
  /** The equation was typed in Word and has just been wrapped by MathBlocks. */
  adopted: boolean;
  /** Set when the copy is linked to this library equation (block). */
  blockId?: string;
  /** The equation in Word has a number (its own paragraph with a number field). */
  numbered?: boolean;
}

/** A message bar above the editor with action buttons (e.g. "document out of date"). */
export interface Notice {
  text: string;
  actions: { label: string; run: () => void | Promise<void> }[];
}

interface AppState extends Prefs {
  latex: string;
  editing: EditingTarget | null;
  setEditing: (e: EditingTarget | null) => void;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  display: boolean;
  /** Display equation with a number (Word: numbered paragraph). */
  numbered: boolean;
  setNumbered: (n: boolean) => void;
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

const PREFS_KEY = "mathblocks.prefs.v3";

const DEFAULT_PREFS: Prefs = {
  theme: "system",
  leftWidth: 250,
  rightWidth: 360,
  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
  bottomHeight: 210,
  bottomTab: "latex",
  zoom: 1,
  profileBase: "tuned",
  mathFont: "Latin Modern Math",
  vectorStyle: "arrow",
  paletteLocation: "right",
  favorites: DEFAULT_FAVORITES,
  recents: [],
  paletteTab: "tab-spacecraft",
  numberStyle: { open: "(", close: ")", chapter: false },
  look: "classic",
  equationSizePt: 12,
  spacecraftConvention: "hughes",
  spacecraftVector: "harpoon",
  accentRules: DEFAULT_ACCENTS,
  boldScope: "base",
  accentsFollowBold: false,
  transposeForm: "upright",
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
    const keys = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];
    const p = Object.fromEntries(keys.map((k) => [k, s[k]])) as unknown as Prefs;
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
  numbered: false,
  setNumbered: (numbered) => set(numbered ? { numbered, display: true } : { numbered }),
  source: "external",
  paletteOpen: false,
  connector: { available: false, connected: false },
  toast: null,
  update: { status: "idle" },
  editing: null,
  setEditing: (editing) => set({ editing }),
  notice: null,
  setNotice: (notice) => set({ notice }),
  setUpdate: (u) => set({ update: { ...get().update, ...u } }),

  setLatex: (latex, source) => set({ latex, source }),
  setDisplay: (display) => set(display ? { display } : { display, numbered: false }),
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

// The palette's spacecraft entries follow the notation preference.
const syncNotation = (s: Prefs) => setNotationRules(s.spacecraftConvention, s.spacecraftVector, s.transposeForm);
syncNotation(useApp.getState());
useApp.subscribe(syncNotation);
