import { useMemo, useState } from "react";
import { useLibrary } from "../lib/library/useLibrary";
import type { Folder } from "../lib/library/types";
import { useApp } from "../lib/store";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";

/** Folder options indented by depth ("Thesis › Chapter 2"). */
export function folderOptions(folders: Folder[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parent)) {
      out.push({ id: f.id, label: `${" ".repeat(depth)}${f.name}` });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * "Save to library" (new equation) and "Details" (edit the open equation's name, folder, tags,
 * description). The equation itself is the editor content.
 */
export function SaveDialog() {
  const dialog = useLibrary((s) => s.dialog);
  if (!dialog) return null;
  return <SaveDialogBody key={`${dialog.mode}-${dialog.folderId ?? ""}`} />;
}

function SaveDialogBody() {
  const dialog = useLibrary((s) => s.dialog)!;
  const setDialog = useLibrary((s) => s.setDialog);
  const folders = useLibrary((s) => s.folders);
  const open = useLibrary((s) => s.open);
  const equations = useLibrary((s) => s.equations);
  const saveWithDetails = useLibrary((s) => s.saveWithDetails);
  const latex = useApp((s) => s.latex);
  const existing = dialog.mode === "edit" && open ? equations.find((q) => q.id === open.id) : undefined;
  const allTags = useMemo(() => [...new Set(equations.flatMap((q) => q.tags))].sort((a, b) => a.localeCompare(b)), [equations]);

  const [name, setName] = useState(existing?.name ?? "");
  const [folderId, setFolderId] = useState<string>(existing?.folderId ?? dialog.folderId ?? "");
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await saveWithDetails({
      asNew: dialog.mode === "new",
      folderId: folderId || null,
      name,
      description,
      favorite,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setBusy(false);
  };

  return (
    <Modal title={dialog.mode === "new" ? "Save to library" : "Equation details"} onClose={() => setDialog(null)} width={500}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="save-preview">
          <MathPreview latex={latex || "\\square"} />
        </div>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First moment of mass (A.1)" autoFocus />
        </label>
        <label>
          Folder
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Unfiled</option>
            {folderOptions(folders).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tags <span className="hint-inline">comma-separated</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mass properties, appendix A" list="mb-tags" />
          <datalist id="mb-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          Description
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where it is used, what the symbols mean…" />
        </label>
        <label className="check">
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favourite
        </label>
        {dialog.mode === "edit" && <p className="hint">Saving also stores the current editor content as a new version if it changed.</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => setDialog(null)}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim() || busy}>
            {dialog.mode === "new" ? "Save" : "Save details"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
