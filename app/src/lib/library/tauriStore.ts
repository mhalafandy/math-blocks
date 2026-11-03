import type { Draft, Equation, EquationInput, Folder, ImportReport, LibraryStore, Version } from "./types";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** SQLite library in the desktop app (commands in app/src-tauri/src/library.rs). */
export function tauriStore(invoke: Invoke): LibraryStore {
  return {
    kind: "sqlite",
    async list() {
      const [folders, equations] = await invoke<[Folder[], Equation[]]>("library_list");
      return { folders, equations };
    },
    createFolder: (id, name, parentId) => invoke<Folder>("library_create_folder", { id, name, parentId }),
    renameFolder: (id, name) => invoke("library_rename_folder", { id, name }),
    moveFolder: (id, parentId) => invoke("library_move_folder", { id, parentId }),
    deleteFolder: (id) => invoke("library_delete_folder", { id }),
    save: (newId, input: EquationInput) => invoke<Equation>("library_save", { newId, input: { ...input, note: input.note ?? "" } }),
    setFavorite: (id, favorite) => invoke("library_set_favorite", { id, favorite }),
    moveEquation: (id, folderId) => invoke("library_move_equation", { id, folderId }),
    markUsed: (id) => invoke("library_mark_used", { id }),
    delete: (id) => invoke("library_delete", { id }),
    duplicate: (id, newId) => invoke<Equation>("library_duplicate", { id, newId }),
    versions: (id) => invoke<Version[]>("library_versions", { id }),
    restoreVersion: (id, version) => invoke<Equation>("library_restore_version", { id, version }),
    saveDraft: (draft: Draft) => invoke("library_save_draft", { draft }),
    loadDraft: () => invoke<Draft | null>("library_load_draft"),
    exportTo: (path) => invoke<number>("library_export", { path }),
    importFrom: (path) => invoke<ImportReport>("library_import", { path }),
  };
}
