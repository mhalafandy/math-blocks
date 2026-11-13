import { openTemplate } from "./TemplateDialog";
import { convertMathTypeDocument, convertOpenDocument } from "../lib/convertMathType";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { REFERENCE_EQUATIONS } from "../../../fixtures/reference-equations";
import { recentEquations, searchEquations } from "../lib/library/search";
import type { Equation, Folder } from "../lib/library/types";
import { isDirty, useLibrary } from "../lib/library/useLibrary";
import { insertLinked } from "../lib/linking";
import { useApp } from "../lib/store";
import { openMenu, type MenuItem } from "./ContextMenu";
import { askConfirm, askText } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { BlocksPanel } from "./BlocksPanel";

const DRAG_EQ = "application/x-mathblocks-equation";
const DRAG_FOLDER = "application/x-mathblocks-folder";

/** Left panel: the personal equation library. */
export function Sidebar() {
  const [tab, setTabState] = useState<"library" | "blocks">(() => {
    try {
      return localStorage.getItem("mathblocks.sidebarTab") === "blocks" ? "blocks" : "library";
    } catch {
      return "library";
    }
  });
  const setTab = (t: "library" | "blocks") => {
    setTabState(t);
    try {
      localStorage.setItem("mathblocks.sidebarTab", t);
    } catch {
      // Not remembered.
    }
  };
  const setPrefs = useApp((s) => s.setPrefs);
  const createFolder = useLibrary((s) => s.createFolder);
  const setDialog = useLibrary((s) => s.setDialog);
  const connected = useApp((s) => s.connector.connected);
  return (
    <nav className="sidebar" aria-label="Library">
      <div className="panel-head">
        <div className="side-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "library"} className={tab === "library" ? "side-tab on" : "side-tab"} onClick={() => setTab("library")}>
            Library
          </button>
          <button role="tab" aria-selected={tab === "blocks"} className={tab === "blocks" ? "side-tab on" : "side-tab"} onClick={() => setTab("blocks")}>
            Blocks
          </button>
        </div>
        <div className="spacer" />
        {tab === "library" && (
          <>
        <button className="icon-btn" title="Save the current equation to the library (Ctrl+S)" onClick={() => setDialog({ mode: "new" })}>
          ＋
        </button>
        <button
          className="icon-btn"
          title="New folder"
          onClick={async () => {
            const name = await askText("New folder", "", "Folder name", "Create");
            if (name) await createFolder(name, null);
          }}
        >
          <FolderIcon />
        </button>
          </>
        )}
        <button className="icon-btn" title="Hide library (Ctrl+B)" onClick={() => setPrefs({ leftOpen: false })}>
          ⇤
        </button>
      </div>
      {tab === "blocks" ? <BlocksPanel /> : <LibraryPanel />}
      {tab === "library" && (
      <div className="panel-foot">
        {connected && (
          <button className="ghost" title="Convert the MathType equations of the document open in Word, in place (one Ctrl+Z in Word undoes it)" onClick={() => void convertOpenDocument()}>
            ⇄ Convert MathType in open document
          </button>
        )}
        <button className="ghost" title="Turn the MathType equations of a Word document into native, editable MathBlocks equations (saved as a new file)" onClick={() => void convertMathTypeDocument()}>
          ⇄ Convert MathType document file…
        </button>
      </div>
      )}
    </nav>
  );
}

function LibraryPanel() {
  const [query, setQuery] = useState("");
  const { equations, folders, ready } = useLibrary();
  const results = useMemo(() => (query.trim() ? searchEquations(equations, query) : []), [equations, query]);
  const favorites = equations.filter((q) => q.favorite);
  const recent = recentEquations(equations, 6);
  const unfiled = equations.filter((q) => !q.folderId || !folders.some((f) => f.id === q.folderId));

  return (
    <>
      <div className="panel-search">
        <input
          className="pal-search"
          type="search"
          placeholder="Search library: name, #tag, is:fav…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="panel-scroll lib">
        {!ready && <p className="empty">Opening library…</p>}
        {query.trim() ? (
          results.length ? (
            <ul className="eq-list">{results.map((q) => <EquationRow key={q.id} q={q} showFolder />)}</ul>
          ) : (
            <p className="empty">Nothing matches “{query}”.</p>
          )
        ) : (
          <>
            {ready && equations.length === 0 && folders.length === 0 && (
              <div className="lib-empty">
                <p>Your library is empty.</p>
                <p className="hint">Build an equation, then press <kbd>Ctrl S</kbd> to save it here. Organise with folders and tags; every save keeps a version.</p>
              </div>
            )}
            {favorites.length > 0 && (
              <Group id="fav" title="Favourites" count={favorites.length} defaultOpen>
                <ul className="eq-list">{favorites.map((q) => <EquationRow key={q.id} q={q} showFolder />)}</ul>
              </Group>
            )}
            {recent.length > 0 && (
              <Group id="recent" title="Recent" count={recent.length}>
                <ul className="eq-list">{recent.map((q) => <EquationRow key={q.id} q={q} showFolder />)}</ul>
              </Group>
            )}
            {(folders.length > 0 || equations.length > 0) && <FolderTree parent={null} depth={0} />}
            {unfiled.length > 0 && (
              <Group id="unfiled" title="Unfiled" count={unfiled.length} defaultOpen dropTarget={null}>
                <ul className="eq-list">{unfiled.map((q) => <EquationRow key={q.id} q={q} />)}</ul>
              </Group>
            )}
            <Examples />
          </>
        )}
      </div>
    </>
  );
}

/** Collapsible section (open state remembered for the session). */
const openGroups = new Set(["fav", "unfiled"]);
function Group({ id, title, count, children, defaultOpen = false, dropTarget }: { id: string; title: string; count?: number; children: ReactNode; defaultOpen?: boolean; dropTarget?: string | null }) {
  const [open, setOpen] = useState(openGroups.has(id) || defaultOpen);
  const drop = useDrop(dropTarget);
  return (
    <section className="lib-group">
      <button
        className={drop.over ? "lib-group-head drop" : "lib-group-head"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (open) openGroups.delete(id);
          else openGroups.add(id);
        }}
        {...(dropTarget !== undefined ? drop.handlers : {})}
      >
        <span className={open ? "chev open" : "chev"}>›</span>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </button>
      {open && children}
    </section>
  );
}

function FolderTree({ parent, depth }: { parent: string | null; depth: number }) {
  const folders = useLibrary((s) => s.folders);
  const children = folders.filter((f) => f.parentId === parent);
  if (!children.length) return null;
  return (
    <ul className="folder-list" style={{ ["--depth" as string]: depth }}>
      {children.map((f) => (
        <FolderNode key={f.id} f={f} depth={depth} />
      ))}
    </ul>
  );
}

function FolderNode({ f, depth }: { f: Folder; depth: number }) {
  const lib = useLibrary();
  const open = lib.expanded.includes(f.id);
  const inside = lib.equations.filter((q) => q.folderId === f.id);
  const total = countDeep(f.id, lib.folders, lib.equations);
  const drop = useDrop(f.id);
  const menu: MenuItem[] = [
    { label: "Save current equation here", onSelect: () => lib.setDialog({ mode: "new", folderId: f.id }) },
    {
      label: "New sub-folder…",
      onSelect: async () => {
        const name = await askText("New sub-folder", "", "Folder name", "Create");
        if (name) await lib.createFolder(name, f.id);
      },
    },
    {
      label: "Rename…",
      onSelect: async () => {
        const name = await askText("Rename folder", f.name, "Folder name", "Rename");
        if (name) await lib.renameFolder(f.id, name);
      },
    },
    { label: "Move to top level", disabled: !f.parentId, onSelect: () => lib.moveFolder(f.id, null) },
    { separator: true, label: "" },
    {
      label: "Delete folder…",
      danger: true,
      onSelect: async () => {
        const ok = await askConfirm(`Delete “${f.name}”?`, total ? `The folder and its sub-folders are removed. The ${total} equation(s) inside are kept and moved to Unfiled.` : "The folder and its sub-folders are removed.");
        if (ok) await lib.deleteFolder(f.id);
      },
    },
  ];
  return (
    <li>
      <button
        className={drop.over ? "folder-row drop" : "folder-row"}
        style={{ paddingLeft: 6 + depth * 14 }}
        aria-expanded={open}
        onClick={() => lib.toggleExpanded(f.id)}
        onContextMenu={(e) => openMenu(e, menu)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_FOLDER, f.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        {...drop.handlers}
      >
        <span className={open ? "chev open" : "chev"}>›</span>
        <FolderIcon />
        <span className="name">{f.name}</span>
        <span className="count">{total || ""}</span>
      </button>
      {open && (
        <>
          <FolderTree parent={f.id} depth={depth + 1} />
          {inside.length > 0 && <ul className="eq-list" style={{ paddingLeft: depth * 14 + 14 }}>{inside.map((q) => <EquationRow key={q.id} q={q} />)}</ul>}
          {inside.length === 0 && !lib.folders.some((x) => x.parentId === f.id) && <p className="empty" style={{ paddingLeft: depth * 14 + 28 }}>Empty. Drag equations here.</p>}
        </>
      )}
    </li>
  );
}

function countDeep(id: string, folders: Folder[], equations: Equation[]): number {
  return equations.filter((q) => q.folderId === id).length + folders.filter((f) => f.parentId === id).reduce((n, f) => n + countDeep(f.id, folders, equations), 0);
}

/** Drop target for equations and folders (null = top level / unfiled). */
function useDrop(target: string | null | undefined) {
  const [over, setOver] = useState(false);
  const lib = useLibrary();
  const accepts = (e: DragEvent) => target !== undefined && (e.dataTransfer.types.includes(DRAG_EQ) || e.dataTransfer.types.includes(DRAG_FOLDER));
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        const eq = e.dataTransfer.getData(DRAG_EQ);
        const folder = e.dataTransfer.getData(DRAG_FOLDER);
        if (eq) void lib.moveEquation(eq, target ?? null);
        else if (folder && folder !== target) void lib.moveFolder(folder, target ?? null);
      },
    },
  };
}

function EquationRow({ q, showFolder = false }: { q: Equation; showFolder?: boolean }) {
  const lib = useLibrary();
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const active = lib.open?.id === q.id;
  const dirty = active && isDirty(lib.open, latex, display);
  const folder = showFolder && q.folderId ? lib.folders.find((f) => f.id === q.folderId)?.name : undefined;
  const menu: MenuItem[] = [
    { label: "Open in editor", onSelect: () => lib.openEquation(q) },
    {
      label: "Insert linked copy into Word",
      disabled: !useApp.getState().connector.connected,
      onSelect: async () => {
        try {
          lib.openEquation(q);
          const found = await insertLinked(q);
          useApp.getState().notify(found === 1 ? `Inserted a linked copy of “${q.name}”` : `Inserted, but found ${found} copies of its tag`);
        } catch (e) {
          useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
        }
      },
    },
    { label: "Use with other symbols…", onSelect: () => openTemplate(q.latex, q.display, q.name) },
    { label: "Save as block…", onSelect: () => void import("./SaveBlockDialog").then((m) => m.openSaveBlock(q.latex)) },
    { separator: true, label: "" },
    { label: q.favorite ? "Remove from favourites" : "Add to favourites", onSelect: () => lib.toggleFavorite(q.id) },
    {
      label: "Rename…",
      onSelect: async () => {
        const name = await askText("Rename equation", q.name, "Name", "Rename");
        if (name) await lib.renameEquation(q.id, name);
      },
    },
    { label: "Duplicate", onSelect: () => lib.duplicate(q.id) },
    { label: "Move to Unfiled", disabled: !q.folderId, onSelect: () => lib.moveEquation(q.id, null) },
    {
      label: "Version history",
      onSelect: () => {
        lib.openEquation(q);
        useApp.getState().setPrefs({ bottomOpen: true, bottomTab: "details" });
      },
    },
    { separator: true, label: "" },
    {
      label: "Delete…",
      danger: true,
      onSelect: async () => {
        const ok = await askConfirm(`Delete “${q.name}”?`, `The equation and its ${q.currentVersion} version(s) are removed from the library. Equations already in Word documents are not affected.`);
        if (ok) await lib.remove(q.id);
      },
    },
  ];
  return (
    <li>
      <button
        className={active ? "eq-row active" : "eq-row"}
        title={`${q.name}${q.tags.length ? `\n#${q.tags.join(" #")}` : ""}${q.description ? `\n${q.description}` : ""}\nClick to open · drag to a folder · right-click for more`}
        onClick={() => lib.openEquation(q)}
        onContextMenu={(e) => openMenu(e, menu)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_EQ, q.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <span className="eq-thumb">
          <MathPreview latex={q.latex} />
        </span>
        <span className="eq-meta">
          <span className="eq-name">
            {q.favorite && <span className="star" aria-label="favourite">★</span>}
            {q.name}
            {dirty && <span className="dirty" title="Unsaved changes">●</span>}
          </span>
          {(folder || q.tags.length > 0) && (
            <span className="eq-sub">
              {folder && <span>{folder}</span>}
              {q.tags.slice(0, 3).map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Built-in reference equations (read-only); can be opened and saved into the library. */
function Examples() {
  const setLatex = useApp((s) => s.setLatex);
  const setDisplay = useApp((s) => s.setDisplay);
  const closeEquation = useLibrary((s) => s.closeEquation);
  const groups = useMemo(() => {
    const map = new Map<string, typeof REFERENCE_EQUATIONS>();
    for (const eq of REFERENCE_EQUATIONS) map.set(eq.category, [...(map.get(eq.category) ?? []), eq]);
    return [...map.entries()];
  }, []);
  return (
    <Group id="examples" title="Examples" count={REFERENCE_EQUATIONS.length}>
      {groups.map(([category, items]) => (
        <div key={category} className="ex-group">
          <h3>{category}</h3>
          <ul>
            {items.map((eq) => (
              <li key={eq.id}>
                <button
                  className="item"
                  title={eq.latex}
                  onClick={() => {
                    closeEquation();
                    useApp.getState().setEditing(null);
                    setLatex(eq.latex, "external");
                    setDisplay(eq.display);
                  }}
                >
                  {eq.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Group>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="folder-icon">
      <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" />
    </svg>
  );
}
