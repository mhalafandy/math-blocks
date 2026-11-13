import { create } from "zustand";
import { DEFAULT_PROFILE, registerCustomKinds, type BoldScope, type CustomKind, type KindStyle, type MathStyle, type NotationProfile, type StylePreset } from "@mathblocks/math-core";
import { DEFAULT_ACCENTS, type AccentRules } from "@mathblocks/math-render";
import { DEFAULT_FAVORITES, setNotationRules, syncMyNotation, type Convention, type TransposeForm, type VectorStyle as SpacecraftVector } from "./palette";

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
  /** Kept for older add-ins (= parts !== "eq"). */
  chapter: boolean;
  /** (1), (1.1) chapter.equation, (1.2.3) chapter.section.equation. */
  parts?: "eq" | "chapter" | "section";
  separator?: "." | "-";
  restart?: "chapter" | "section";
  /** Chapter/section numbers from Word's heading numbering or from MathBlocks' hidden markers. */
  source?: "headings" | "markers";
  /** References: "(1.2)" with brackets, or "1.2" (for "Eq. 1.2"). */
  references?: "brackets" | "number";
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
  /** Recently inserted palette items, newest first (at most 16, one per LaTeX). */
  recents: string[];
  /** How often each LaTeX was inserted from a palette (search ranks frequent items first). */
  paletteUse: Record<string, number>;
  /** LaTeX of items whose one-time "faster: type …" hint was shown. */
  paletteHints: string[];
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
  /** Notation kinds: preset and the user's style changes (docs/NOTATION-KINDS.md). */
  notationProfile: NotationProfile;
  /** The user's own kinds (Notation settings → New kind). */
  customKinds: CustomKind[];
  /** Two Spaces in quick succession in the visual editor open the command palette. */
  doubleSpace: boolean;
  /** Longest time between the two Spaces, ms. */
  doubleSpaceMs: number;
  /** Ask (a small dialog over Word) before document-wide commands started from Word. */
  confirmWordCommands: boolean;
  /** Document style a new document starts with (null: made from the settings above). */
  defaultStyle: MathStyle | null;
  /** The user's own style presets (saved, imported). */
  stylePresets: StylePreset[];
}

/** The style of the Word document MathBlocks is working on (read from the document). */
export interface DocStyleState {
  document: string;
  name: string;
  style: MathStyle;
  /** False: the document has no style stored yet (it is drawn in the user's default). */
  stored: boolean;
  /** Recent earlier styles of the document (newest first): Ctrl+Z / Ctrl+Y of a restyle returns to one. */
  history?: { hash: string; style: MathStyle }[];
  /** An equation redrawn by the last restyle: the style its drawing carries tells which style is in the document. */
  probe?: string;
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
  /** Fingerprint of Word's equation when it was opened: every write sends it, the add-in refuses on a mismatch. */
  fingerprint?: string;
  /** The LaTeX it had when opened (shown in the editing bar, so the target is always visible). */
  opened?: string;
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
  /** Text width (pt) of the paragraph in Word holding the equation or the cursor; null = not known. */
  textWidthPt: number | null;
  setTextWidth: (pt: number | null) => void;
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
  /** Style of the current Word document; null until one is read (then the user's default applies). */
  docStyle: DocStyleState | null;

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
  paletteUse: {},
  paletteHints: [],
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
  notationProfile: DEFAULT_PROFILE,
  customKinds: [],
  doubleSpace: true,
  doubleSpaceMs: 300,
  confirmWordCommands: true,
  defaultStyle: null,
  stylePresets: [],
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

/** The physical vector's style for each "Physical vectors" choice. */
const PVEC_STYLE: Record<SpacecraftVector, Partial<KindStyle>> = {
  harpoon: { weight: "bold", shape: "upright", accent: "harpoon" },
  arrow: { weight: "bold", shape: "upright", accent: "arrow" },
  plainArrow: { weight: "regular", shape: "italic", accent: "arrow" },
  bold: { weight: "bold", shape: "upright", accent: "none" },
};

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
  docStyle: null,
  editing: null,
  setEditing: (editing) => set({ editing }),
  textWidthPt: null,
  setTextWidth: (textWidthPt) => set({ textWidthPt }),
  notice: null,
  setNotice: (notice) => set({ notice }),
  setUpdate: (u) => set({ update: { ...get().update, ...u } }),

  // Clearing the editor starts a new equation: the Word target (if any) ends.
  setLatex: (latex, source) => set(source === "visual" && !latex.trim() && get().editing ? { latex, source, editing: null } : { latex, source }),
  setDisplay: (display) => set(display ? { display } : { display, numbered: false }),
  setPrefs: (p) => {
    // The Word style tab's "Spacecraft notation" and "Physical vectors" also set how the kinds are
    // drawn (preset; the physical vector's style), so the open equation restyles at once.
    if (p.spacecraftConvention || p.spacecraftVector) {
      const cur = p.notationProfile ?? get().notationProfile;
      const next: NotationProfile = { preset: p.spacecraftConvention ?? cur.preset, overrides: { ...cur.overrides } };
      if (p.spacecraftVector) next.overrides.pvec = { ...(next.overrides.pvec ?? {}), ...PVEC_STYLE[p.spacecraftVector] };
      p = { ...p, notationProfile: next };
    }
    if (p.customKinds) {
      registerCustomKinds(p.customKinds);
      // A new profile object: everything drawn in the notation (editor, previews) redraws.
      p = { ...p, notationProfile: { ...(p.notationProfile ?? get().notationProfile) } };
    }
    set(p);
    savePrefs(get());
    // The other window (main / floating editor) follows at once (storage events are not guaranteed between WebView2 windows).
    if (p.notationProfile || p.customKinds || p.accentRules) broadcastNotation(get());
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setConnector: (c) => set({ connector: { ...get().connector, ...c } }),
  notify: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === "error" ? 6000 : 3000);
  },
}));

// The user's kinds are known to the parser before any equation is read, and in the palette.
registerCustomKinds(useApp.getState().customKinds ?? []);
syncMyNotation(useApp.getState().customKinds ?? []);
useApp.subscribe((s, prev) => s.customKinds !== prev.customKinds && syncMyNotation(s.customKinds));

export function broadcastNotation(s: Prefs = useApp.getState()) {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/event")
    .then((m) => m.emit("prefs:notation", { notationProfile: s.notationProfile, customKinds: s.customKinds, accentRules: s.accentRules, docStyle: useApp.getState().docStyle, from: window.location.search }))
    .catch(() => undefined);
}

/** A notation change made in the other window (explicit event; the storage event is the fallback). */
function adoptNotation(p: Partial<Prefs> & { docStyle?: DocStyleState | null }) {
  const cur = useApp.getState();
  const change: Partial<Prefs> & { docStyle?: DocStyleState | null } = {};
  if (p.docStyle !== undefined && JSON.stringify(p.docStyle) !== JSON.stringify(cur.docStyle)) change.docStyle = p.docStyle;
  if (p.customKinds && JSON.stringify(p.customKinds) !== JSON.stringify(cur.customKinds)) {
    registerCustomKinds(p.customKinds);
    change.customKinds = p.customKinds;
  }
  if (p.notationProfile && (change.customKinds || JSON.stringify(p.notationProfile) !== JSON.stringify(cur.notationProfile))) change.notationProfile = { ...p.notationProfile };
  if (p.accentRules && JSON.stringify(p.accentRules) !== JSON.stringify(cur.accentRules)) change.accentRules = p.accentRules;
  if (Object.keys(change).length) useApp.setState(change);
}

if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  void import("@tauri-apps/api/event")
    .then((m) =>
      m.listen<Partial<Prefs> & { from?: string; docStyle?: DocStyleState | null }>("prefs:notation", (e) => {
        if (e.payload.from !== window.location.search) adoptNotation(e.payload);
      }),
    )
    .catch(() => undefined);
}

// The main window and the floating editor share the notation: a change in one reaches the other.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== PREFS_KEY || !e.newValue) return;
    try {
      const p = JSON.parse(e.newValue) as Partial<Prefs>;
      const cur = useApp.getState();
      const change: Partial<Prefs> = {};
      if (p.customKinds && JSON.stringify(p.customKinds) !== JSON.stringify(cur.customKinds)) {
        registerCustomKinds(p.customKinds);
        change.customKinds = p.customKinds;
      }
      if (p.notationProfile && (change.customKinds || JSON.stringify(p.notationProfile) !== JSON.stringify(cur.notationProfile))) change.notationProfile = { ...p.notationProfile };
      if (p.accentRules && JSON.stringify(p.accentRules) !== JSON.stringify(cur.accentRules)) change.accentRules = p.accentRules;
      if (Object.keys(change).length) useApp.setState(change);
    } catch {
      // Ignore a malformed value.
    }
  });
}

// The palette's spacecraft entries follow the notation preference.
const syncNotation = (s: Prefs) => setNotationRules(s.spacecraftConvention, s.spacecraftVector, s.transposeForm);
syncNotation(useApp.getState());
useApp.subscribe(syncNotation);
