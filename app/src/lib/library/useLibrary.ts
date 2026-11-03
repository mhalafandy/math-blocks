import { create } from "zustand";
import { newBlockId } from "@mathblocks/ooxml";
import { isDesktop } from "../connector";
import { useApp } from "../store";
import { browserStore, memoryStore } from "./memoryStore";
import { tauriStore } from "./tauriStore";
import type { Equation, EquationInput, Folder, LibraryStore, Version } from "./types";

/** The library equation currently open in the editor, with its saved content (for "unsaved"). */
export interface OpenEquation {
  id: string;
  latex: string;
  display: boolean;
}

interface LibraryState {
  store: LibraryStore | null;
  ready: boolean;
  folders: Folder[];
  equations: Equation[];
  open: OpenEquation | null;
  /** Folder ids expanded in the tree. */
  expanded: string[];
  /** Save dialog: "new" (save as) or "edit" (details of the open equation). */
  dialog: { mode: "new" | "edit"; folderId?: string | null } | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  openEquation: (q: Equation) => void;
  closeEquation: () => void;
  /** Saves the editor content: new version of the open equation, or opens the Save dialog. */
  saveCurrent: () => Promise<void>;
  saveWithDetails: (input: Omit<EquationInput, "latex" | "display"> & { asNew: boolean }) => Promise<Equation | null>;
  setDialog: (d: LibraryState["dialog"]) => void;
  toggleExpanded: (folderId: string) => void;
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  renameEquation: (id: string, name: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  moveEquation: (id: string, folderId: string | null) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  versions: (id: string) => Promise<Version[]>;
  restoreVersion: (id: string, version: number) => Promise<void>;
  markUsed: (id: string) => Promise<void>;
}

/** After the content of a library equation changed: update its linked copies in Word. */
function afterContentSaved(saved: Equation, previousLatex: string | null) {
  if (!useApp.getState().connector.connected) return;
  void import("../linking").then((m) => m.propagate(saved, previousLatex)).catch(notifyError);
}

const notifyError = (e: unknown) => useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");

/** Wraps an action: refresh the lists afterwards, report failures as a toast. */
async function act<T>(fn: (s: LibraryStore) => Promise<T>): Promise<T | undefined> {
  const st = useLibrary.getState();
  if (!st.store) return undefined;
  try {
    const r = await fn(st.store);
    await st.refresh();
    return r;
  } catch (e) {
    notifyError(e);
    return undefined;
  }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  store: null,
  ready: false,
  folders: [],
  equations: [],
  open: null,
  expanded: [],
  dialog: null,

  async init() {
    if (get().store) return;
    let store: LibraryStore;
    if (isDesktop()) {
      const { invoke } = await import("@tauri-apps/api/core");
      store = tauriStore(invoke);
    } else {
      store = typeof localStorage === "undefined" ? memoryStore() : browserStore();
    }
    set({ store });
    try {
      await get().refresh();
      await restoreDraft(store);
    } catch (e) {
      notifyError(e);
    }
    set({ ready: true });
    startAutosave();
  },

  async refresh() {
    const store = get().store;
    if (!store) return;
    const { folders, equations } = await store.list();
    set({ folders, equations });
  },

  openEquation(q) {
    const app = useApp.getState();
    app.setEditing(null);
    app.setLatex(q.latex, "external");
    app.setDisplay(q.display);
    set({ open: { id: q.id, latex: q.latex, display: q.display } });
    void get().markUsed(q.id);
  },

  closeEquation() {
    set({ open: null });
  },

  async saveCurrent() {
    const { open, equations } = get();
    const q = open ? equations.find((x) => x.id === open.id) : undefined;
    if (!q) {
      set({ dialog: { mode: "new" } });
      return;
    }
    const { latex, display } = useApp.getState();
    if (latex === open!.latex && display === open!.display) {
      useApp.getState().notify("No changes to save");
      return;
    }
    const saved = await act((s) => s.save("", { id: q.id, folderId: q.folderId, name: q.name, description: q.description, latex, display, favorite: q.favorite, tags: q.tags }));
    if (saved) {
      set({ open: { id: saved.id, latex: saved.latex, display: saved.display } });
      useApp.getState().notify(`Saved "${saved.name}" (version ${saved.currentVersion})`);
      afterContentSaved(saved, q.latex);
    }
  },

  async saveWithDetails({ asNew, ...meta }) {
    const { latex, display } = useApp.getState();
    const { open } = get();
    const id = asNew ? null : (open?.id ?? null);
    const before = id ? get().equations.find((x) => x.id === id) : undefined;
    const saved = await act((s) => s.save(newBlockId(), { ...meta, id, latex, display }));
    if (saved && before && before.latex !== saved.latex) afterContentSaved(saved, before.latex);
    if (saved) {
      set({ open: { id: saved.id, latex: saved.latex, display: saved.display }, dialog: null });
      if (saved.folderId && !get().expanded.includes(saved.folderId)) set({ expanded: [...get().expanded, saved.folderId] });
      useApp.getState().notify(`Saved "${saved.name}" to the library`);
    }
    return saved ?? null;
  },

  setDialog(dialog) {
    set({ dialog });
  },

  toggleExpanded(folderId) {
    const ex = get().expanded;
    set({ expanded: ex.includes(folderId) ? ex.filter((x) => x !== folderId) : [...ex, folderId] });
  },

  async createFolder(name, parentId) {
    const id = newBlockId();
    await act((s) => s.createFolder(id, name, parentId));
    set({ expanded: [...new Set([...get().expanded, id, ...(parentId ? [parentId] : [])])] });
  },
  renameFolder: async (id, name) => void (await act((s) => s.renameFolder(id, name))),
  deleteFolder: async (id) => void (await act((s) => s.deleteFolder(id))),
  moveFolder: async (id, parentId) => void (await act((s) => s.moveFolder(id, parentId))),

  async renameEquation(id, name) {
    const q = get().equations.find((x) => x.id === id);
    if (!q) return;
    await act((s) => s.save("", { ...q, id, name }));
  },
  async toggleFavorite(id) {
    const q = get().equations.find((x) => x.id === id);
    if (q) await act((s) => s.setFavorite(id, !q.favorite));
  },
  moveEquation: async (id, folderId) => void (await act((s) => s.moveEquation(id, folderId))),
  async duplicate(id) {
    await act((s) => s.duplicate(id, newBlockId()));
  },
  async remove(id) {
    await act((s) => s.delete(id));
    if (get().open?.id === id) set({ open: null });
  },
  versions: async (id) => (await get().store?.versions(id)) ?? [],
  async restoreVersion(id, version) {
    const before = get().equations.find((x) => x.id === id);
    const q = await act((s) => s.restoreVersion(id, version));
    if (q) {
      afterContentSaved(q, before?.latex ?? null);
      get().openEquation(q);
      useApp.getState().notify(`Restored version ${version} as version ${q.currentVersion}`);
    }
  },
  async markUsed(id) {
    try {
      await get().store?.markUsed(id);
      await get().refresh();
    } catch {
      // Non-essential bookkeeping.
    }
  },
}));

/** True when the editor content differs from the saved library equation. */
export function isDirty(open: OpenEquation | null, latex: string, display: boolean) {
  return !!open && (open.latex !== latex || open.display !== display);
}

// ------------------------------------------------------------------ autosave & crash recovery

const AUTOSAVE_MS = 1500;
let autosaveStarted = false;

/** Saves the editor content as a draft shortly after every change (survives crashes). */
function startAutosave() {
  if (autosaveStarted) return;
  autosaveStarted = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  useApp.subscribe((s) => {
    const key = `${s.display ? 1 : 0}${s.latex}`;
    if (key === last) return;
    last = key;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const store = useLibrary.getState().store;
      const open = useLibrary.getState().open;
      void store?.saveDraft({ latex: s.latex, display: s.display, equationId: open?.id ?? null, updatedAt: Date.now() }).catch(() => undefined);
    }, AUTOSAVE_MS);
  });
}

/** On start-up, brings back what was in the editor last time (even after a crash). */
async function restoreDraft(store: LibraryStore) {
  const draft = await store.loadDraft();
  if (!draft || !draft.latex.trim()) return;
  const app = useApp.getState();
  app.setLatex(draft.latex, "external");
  app.setDisplay(draft.display);
  const q = draft.equationId ? useLibrary.getState().equations.find((x) => x.id === draft.equationId) : undefined;
  if (q) useLibrary.setState({ open: { id: q.id, latex: q.latex, display: q.display } });
}
