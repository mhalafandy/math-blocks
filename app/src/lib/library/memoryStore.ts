import type { Draft, Equation, EquationInput, Folder, ImportReport, LibraryExport, LibraryStore, Version } from "./types";

interface Data {
  folders: Folder[];
  equations: Equation[];
  versions: Record<string, Version[]>;
  draft: Draft | null;
}

const empty = (): Data => ({ folders: [], equations: [], versions: {}, draft: null });

const cleanName = (name: string) => {
  const n = name.trim();
  if (!n) throw new Error("A name is required");
  return n.slice(0, 200);
};

/** Case-insensitive de-duplication, first spelling wins, sorted. */
const cleanTags = (tags: string[]) => {
  const seen = new Map<string, string>();
  for (const t of tags.map((t) => t.trim()).filter(Boolean)) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
};

/**
 * In-memory library with the same behaviour as the SQLite store (versioning, tags, folder
 * deletion, import merge). Used by the browser preview (`pnpm dev`, persisted in localStorage)
 * and by unit tests. `persist` is called after every change.
 */
export function memoryStore(initial?: Data, persist?: (data: Data) => void): LibraryStore {
  const d: Data = initial ? structuredClone(initial) : empty();
  const now = () => Date.now();
  const changed = () => persist?.(d);
  const find = (id: string) => {
    const q = d.equations.find((x) => x.id === id);
    if (!q) throw new Error("Equation not found");
    return q;
  };
  const sortEq = () => d.equations.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const store: LibraryStore = {
    kind: "memory",
    async list() {
      return { folders: structuredClone(d.folders), equations: structuredClone(d.equations) };
    },
    async createFolder(id, name, parentId) {
      const position = Math.max(-1, ...d.folders.filter((f) => f.parentId === parentId).map((f) => f.position)) + 1;
      const f: Folder = { id, parentId, name: cleanName(name), position, createdAt: now() };
      d.folders.push(f);
      changed();
      return structuredClone(f);
    },
    async renameFolder(id, name) {
      const f = d.folders.find((x) => x.id === id);
      if (!f) throw new Error("Folder not found");
      f.name = cleanName(name);
      changed();
    },
    async moveFolder(id, parentId) {
      for (let cur = parentId; cur; cur = d.folders.find((f) => f.id === cur)?.parentId ?? null) {
        if (cur === id) throw new Error("A folder cannot be moved into itself");
      }
      const f = d.folders.find((x) => x.id === id);
      if (f) f.parentId = parentId;
      changed();
    },
    async deleteFolder(id) {
      const doomed = new Set([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const f of d.folders) if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) (doomed.add(f.id), (grew = true));
      }
      d.folders = d.folders.filter((f) => !doomed.has(f.id));
      for (const q of d.equations) if (q.folderId && doomed.has(q.folderId)) q.folderId = null;
      changed();
    },
    async save(newId, input: EquationInput) {
      const name = cleanName(input.name);
      const t = now();
      let q: Equation;
      if (input.id) {
        q = find(input.id);
        const contentChanged = q.latex !== input.latex || q.display !== input.display;
        if (contentChanged) {
          q.currentVersion += 1;
          (d.versions[q.id] ??= []).unshift({ version: q.currentVersion, latex: input.latex, display: input.display, note: input.note ?? "", createdAt: t });
        }
        Object.assign(q, { folderId: input.folderId, name, description: input.description, latex: input.latex, display: input.display, favorite: input.favorite, tags: cleanTags(input.tags), updatedAt: t });
      } else {
        q = { id: newId, folderId: input.folderId, name, description: input.description, latex: input.latex, display: input.display, favorite: input.favorite, currentVersion: 1, createdAt: t, updatedAt: t, lastUsedAt: null, tags: cleanTags(input.tags) };
        d.equations.push(q);
        d.versions[newId] = [{ version: 1, latex: input.latex, display: input.display, note: input.note || "Created", createdAt: t }];
      }
      sortEq();
      changed();
      return structuredClone(q);
    },
    async setFavorite(id, favorite) {
      find(id).favorite = favorite;
      changed();
    },
    async moveEquation(id, folderId) {
      Object.assign(find(id), { folderId, updatedAt: now() });
      changed();
    },
    async markUsed(id) {
      find(id).lastUsedAt = now();
      changed();
    },
    async delete(id) {
      d.equations = d.equations.filter((q) => q.id !== id);
      delete d.versions[id];
      changed();
    },
    async duplicate(id, newId) {
      const s = find(id);
      return store.save(newId, { folderId: s.folderId, name: `${s.name} (copy)`, description: s.description, latex: s.latex, display: s.display, favorite: false, tags: s.tags, note: `Copied from "${s.name}"` });
    },
    async versions(id) {
      return structuredClone(d.versions[id] ?? []);
    },
    async restoreVersion(id, version) {
      const v = (d.versions[id] ?? []).find((x) => x.version === version);
      if (!v) throw new Error("Version not found");
      const q = find(id);
      return store.save("", { id, folderId: q.folderId, name: q.name, description: q.description, latex: v.latex, display: v.display, favorite: q.favorite, tags: q.tags, note: `Restored version ${version}` });
    },
    async saveDraft(draft) {
      d.draft = { ...draft };
      changed();
    },
    async loadDraft() {
      return d.draft ? { ...d.draft } : null;
    },
    async exportTo() {
      const data: LibraryExport = {
        format: "mathblocks-library",
        formatVersion: 1,
        exportedAt: now(),
        folders: d.folders,
        equations: d.equations.map((q) => ({ ...q, versions: d.versions[q.id] ?? [] })),
      };
      return JSON.stringify(data, null, 2);
    },
    async importFrom(text) {
      let data: LibraryExport;
      try {
        data = JSON.parse(text) as LibraryExport;
      } catch {
        throw new Error("Not a valid library file");
      }
      if (data.format !== "mathblocks-library") throw new Error("This file is not a MathBlocks library");
      if (data.formatVersion > 1) throw new Error("This library was exported by a newer MathBlocks version; please update");
      const report: ImportReport = { foldersAdded: 0, equationsAdded: 0, equationsUpdated: 0, equationsSkipped: 0 };
      const has = (id: string | null) => !id || d.folders.some((f) => f.id === id);
      let pending = [...data.folders];
      while (pending.length) {
        const ready = pending.filter((f) => has(f.parentId));
        const batch = ready.length ? ready : pending.map((f) => ({ ...f, parentId: null }));
        for (const f of batch) if (!d.folders.some((x) => x.id === f.id)) (d.folders.push({ ...f }), report.foldersAdded++);
        const done = new Set(batch.map((f) => f.id));
        pending = pending.filter((f) => !done.has(f.id));
      }
      for (const x of data.equations) {
        const { versions, ...q } = x;
        const existing = d.equations.find((e) => e.id === q.id);
        const folderId = has(q.folderId) ? q.folderId : null;
        if (existing && existing.updatedAt >= q.updatedAt) {
          report.equationsSkipped++;
          continue;
        }
        if (existing) {
          Object.assign(existing, { ...q, folderId, currentVersion: Math.max(existing.currentVersion, q.currentVersion), tags: cleanTags(q.tags) });
          report.equationsUpdated++;
        } else {
          d.equations.push({ ...q, folderId, tags: cleanTags(q.tags) });
          report.equationsAdded++;
        }
        const list = (d.versions[q.id] ??= []);
        for (const v of versions) if (!list.some((y) => y.version === v.version)) list.push({ ...v });
        list.sort((a, b) => b.version - a.version);
      }
      sortEq();
      changed();
      return report;
    },
  };
  return store;
}

const LS_KEY = "mathblocks.library.v1";

/** Browser preview store, persisted in localStorage (desktop builds use SQLite instead). */
export function browserStore(): LibraryStore {
  let initial: Data | undefined;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) initial = JSON.parse(raw) as Data;
  } catch {
    // Unavailable storage: start empty.
  }
  return memoryStore(initial, (data) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the session still works.
    }
  });
}
