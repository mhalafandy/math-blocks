import { useEffect, useState } from "react";
import type { Version } from "../lib/library/types";
import { isDirty, useLibrary } from "../lib/library/useLibrary";
import { useApp } from "../lib/store";
import type { DocumentInstances } from "@mathblocks/connector-protocol";
import { goToCopy, listCopies } from "../lib/linking";
import { askConfirm } from "./Dialogs";
import { MathPreview } from "./MathPreview";

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Bottom-panel tab: library details and version history of the open equation. */
export function DetailsPanel() {
  const lib = useLibrary();
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const q = lib.open ? lib.equations.find((x) => x.id === lib.open!.id) : undefined;
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    let alive = true;
    if (q) void lib.versions(q.id).then((v) => alive && setVersions(v));
    else setVersions([]);
    return () => {
      alive = false;
    };
    // Reload when another version is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, q?.currentVersion]);

  if (!q) {
    return (
      <div className="details-empty">
        <p>This equation is not in your library yet.</p>
        <button className="primary" onClick={() => lib.setDialog({ mode: "new" })}>
          Save to library <kbd>Ctrl S</kbd>
        </button>
      </div>
    );
  }
  const folder = q.folderId ? lib.folders.find((f) => f.id === q.folderId)?.name : "Unfiled";
  const dirty = isDirty(lib.open, latex, display);
  return (
    <div className="details">
      <div className="details-meta">
        <h3>
          {q.favorite && <span className="star">★</span>} {q.name}
        </h3>
        <dl>
          <dt>Folder</dt>
          <dd>{folder}</dd>
          <dt>Tags</dt>
          <dd>{q.tags.length ? q.tags.map((t) => <span key={t} className="tag">#{t}</span>) : <span className="muted">none</span>}</dd>
          {q.description && (
            <>
              <dt>Notes</dt>
              <dd>{q.description}</dd>
            </>
          )}
          <dt>Changed</dt>
          <dd>{fmt(q.updatedAt)}</dd>
        </dl>
        <LinkedCopies blockId={q.id} version={q.currentVersion} />
        <div className="details-actions">
          <button className="primary" disabled={!dirty} onClick={() => void lib.saveCurrent()} title="Save the editor content as a new version (Ctrl+S)">
            {dirty ? "Save new version" : "Saved"}
          </button>
          <button onClick={() => lib.setDialog({ mode: "edit" })}>Edit details…</button>
          <button onClick={() => lib.setDialog({ mode: "new", folderId: q.folderId })}>Save as new…</button>
        </div>
      </div>
      <div className="details-history">
        <h4>Version history</h4>
        <ul>
          {versions.map((v) => (
            <li key={v.version} className={v.version === q.currentVersion ? "current" : undefined}>
              <span className="v-num">v{v.version}</span>
              <span className="v-preview">
                <MathPreview latex={v.latex} />
              </span>
              <span className="v-info">
                <span>{fmt(v.createdAt)}</span>
                {v.note && <span className="muted">{v.note}</span>}
              </span>
              {v.version === q.currentVersion ? (
                <span className="muted v-cur">current</span>
              ) : (
                <span className="v-actions">
                  <button
                    title="Show this version in the editor without changing the library"
                    onClick={() => {
                      useApp.getState().setLatex(v.latex, "external");
                      useApp.getState().setDisplay(v.display);
                    }}
                  >
                    View
                  </button>
                  <button
                    title="Make this the current version (kept as a new version; nothing is lost)"
                    onClick={async () => {
                      if (dirty && !(await askConfirm("Restore an old version?", "Your unsaved changes in the editor will be replaced.", "Restore", false))) return;
                      await lib.restoreVersion(q.id, v.version);
                    }}
                  >
                    Restore
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Linked copies of this equation in the documents open in Word. */
function LinkedCopies({ blockId, version }: { blockId: string; version: number }) {
  const connected = useApp((s) => s.connector.connected);
  const [docs, setDocs] = useState<DocumentInstances[] | null>(null);
  const load = () => {
    if (!connected) return setDocs(null);
    void listCopies(blockId).then(setDocs, () => setDocs([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [blockId, version, connected]);
  if (!connected) return <p className="hint linked-hint">Start Word to see where this equation is used.</p>;
  if (!docs) return null;
  const n = docs.reduce((k, d) => k + d.instances.length, 0);
  return (
    <div className="linked-copies">
      <div className="linked-head">
        <span>{n ? `Linked copies in open documents: ${n}` : "No linked copies in the open documents."}</span>
        <button className="icon-btn" title="Refresh" onClick={load}>
          ↻
        </button>
      </div>
      {docs.map((d) => (
        <div key={d.fullName}>
          {docs.length > 1 && <div className="linked-doc">{d.name}</div>}
          <ul>
            {d.instances.map((i) => (
              <li key={i.tag}>
                <button title="Show this copy in Word" onClick={() => void goToCopy(d.fullName, i.tag)}>
                  <span className="page">{i.page ? `p. ${i.page}` : ""}</span>
                  {i.number && <span className="eq-number" title="Its equation number in the document">{i.number}</span>}
                  <span className="ctx">{i.context || "(equation on its own line)"}</span>
                  <span className="go">Go to</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
