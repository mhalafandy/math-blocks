/** Library data model (mirror of app/src-tauri/src/library.rs, camelCase JSON). */
export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: number;
}

export interface Equation {
  id: string;
  folderId: string | null;
  name: string;
  description: string;
  latex: string;
  display: boolean;
  favorite: boolean;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  tags: string[];
}

export interface Version {
  version: number;
  latex: string;
  display: boolean;
  note: string;
  createdAt: number;
}

export interface EquationInput {
  id?: string | null;
  folderId: string | null;
  name: string;
  description: string;
  latex: string;
  display: boolean;
  favorite: boolean;
  tags: string[];
  note?: string;
}

export interface Draft {
  latex: string;
  display: boolean;
  equationId: string | null;
  updatedAt: number;
}

export interface ImportReport {
  foldersAdded: number;
  equationsAdded: number;
  equationsUpdated: number;
  equationsSkipped: number;
}

export interface LibraryExport {
  format: "mathblocks-library";
  formatVersion: 1;
  exportedAt: number;
  folders: Folder[];
  equations: (Equation & { versions: Version[] })[];
}

/** Storage backend. Implemented by SQLite (desktop) and by an in-memory store (browser, tests). */
export interface LibraryStore {
  readonly kind: "sqlite" | "memory";
  list(): Promise<{ folders: Folder[]; equations: Equation[] }>;
  createFolder(id: string, name: string, parentId: string | null): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, parentId: string | null): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  save(newId: string, input: EquationInput): Promise<Equation>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
  moveEquation(id: string, folderId: string | null): Promise<void>;
  markUsed(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string, newId: string): Promise<Equation>;
  versions(id: string): Promise<Version[]>;
  restoreVersion(id: string, version: number): Promise<Equation>;
  saveDraft(draft: Draft): Promise<void>;
  loadDraft(): Promise<Draft | null>;
  /** Desktop: path chosen in a file dialog. Memory: the JSON text itself. */
  exportTo(target: string): Promise<number | string>;
  importFrom(source: string): Promise<ImportReport>;
}
