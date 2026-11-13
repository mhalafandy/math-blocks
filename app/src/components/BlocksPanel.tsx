import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { LARGE_CELL } from "../lib/tiles";
import { previewLatex, stripSlotWrappers, type Block, type BlockGroup } from "../lib/blocks/model";
import { blockByName, deleteBlock, deleteBlockGroup, reorderBlocks, saveBlock, saveBlockGroup, useBlocks } from "../lib/blocks/useBlocks";
import { kindSnippetPrefix } from "../lib/snippets";
import { useApp } from "../lib/store";
import { openMenu, type MenuItem } from "./ContextMenu";
import { askConfirm, askText } from "./Dialogs";
import { MathTile } from "./MathTile";
import { insertBlock } from "./MathEditor";
import { openEditBlock, openNewBlock } from "./SaveBlockDialog";

const DRAG_BLOCK = "application/x-mathblocks-block";

/** Blocks matching a search, best first: name start, name, trigger, tags and description; then the most used. */
export function searchBlocks(blocks: Block[], query: string): Block[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (b: Block) => {
    const n = b.name.toLowerCase();
    if (n.startsWith(q) || b.trigger.toLowerCase() === q) return 0;
    if (n.includes(q)) return 1;
    if (b.trigger.toLowerCase().startsWith(q) || b.tags.some((t) => t.toLowerCase().startsWith(q))) return 2;
    if (b.description.toLowerCase().includes(q)) return 3;
    return 9;
  };
  return blocks
    .map((b) => ({ b, s: score(b) }))
    .filter((x) => x.s < 9)
    .sort((x, y) => x.s - y.s || y.b.useCount - x.b.useCount || x.b.name.localeCompare(y.b.name))
    .map((x) => x.b);
}

/** One block as a tile: its look in the document style, its name under it. Click inserts it at the caret. */
export function BlockTile({ b, manage, onInsert }: { b: Block; manage: boolean; onInsert?: (b: Block) => void }) {
  const groups = useBlocks((s) => s.groups);
  const latex = useMemo(() => previewLatex(b, blockByName, "#?"), [b]);
  const menu: MenuItem[] = [
    { label: "Insert", onSelect: () => (onInsert ?? insertBlock)(b) },
    ...(manage
      ? ([
          { label: "Edit…", onSelect: () => openEditBlock(b) },
          {
            label: "Rename…",
            onSelect: async () => {
              const name = await askText("Rename block", b.name, "Name", "Rename");
              if (name?.trim()) await run(() => saveBlock({ ...b, name: name.trim() }));
            },
          },
          { label: "Duplicate", onSelect: () => void run(() => saveBlock({ ...b, id: "", name: `${b.name} (copy)`, trigger: "", useCount: 0, version: 0 })) },
          { label: "Copy LaTeX", onSelect: () => void navigator.clipboard.writeText(stripSlotWrappers(b.body)) },
          { separator: true, label: "" },
          ...(b.scope === "global"
            ? [{ label: "Move to: (no group)", disabled: !b.groupId, onSelect: () => void run(() => saveBlock({ ...b, groupId: null })) }, ...groups.filter((g) => g.id !== b.groupId).map((g) => ({ label: `Move to: ${g.name}`, onSelect: () => void run(() => saveBlock({ ...b, groupId: g.id })) }))]
            : []),
          { separator: true, label: "" },
          {
            label: "Delete…",
            danger: true,
            onSelect: async () => {
              const ok = await askConfirm(`Delete the block “${b.name}”?`, b.scope === "document" ? "It is removed from this document's blocks. Equations already written are not affected." : "It is removed from your blocks. Equations already written are not affected.");
              if (ok) await run(() => deleteBlock(b));
            },
          },
        ] as MenuItem[])
      : []),
  ];
  const tip = [b.name, b.trigger && `${kindSnippetPrefix()}${b.trigger} Tab`, b.description, b.tags.length ? `#${b.tags.join(" #")}` : "", b.slots.length ? `Slots: ${b.slots.map((s) => s.label || s.name).join(", ")}` : ""].filter(Boolean).join("\n");
  return (
    <button
      type="button"
      className="block-tile"
      title={tip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (onInsert ?? insertBlock)(b)}
      onContextMenu={(e) => openMenu(e, menu)}
      draggable={manage && b.scope === "global"}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_BLOCK, b.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => manage && e.dataTransfer.types.includes(DRAG_BLOCK) && e.preventDefault()}
      onDrop={(e) => manage && dropOn(e, b.groupId, b.id)}
    >
      <MathTile latex={latex} cell={LARGE_CELL} />
      <span className="block-name">{b.name}</span>
    </button>
  );
}

async function run(f: () => Promise<unknown>) {
  try {
    await f();
  } catch (e) {
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** A dragged block dropped on a tile (placed before it) or on a group heading (placed last). */
function dropOn(e: DragEvent, groupId: string | null, beforeId?: string) {
  const id = e.dataTransfer.getData(DRAG_BLOCK);
  if (!id) return;
  e.preventDefault();
  e.stopPropagation();
  const list = useBlocks
    .getState()
    .blocks.filter((b) => b.groupId === groupId && b.id !== id)
    .sort((a, b) => a.position - b.position)
    .map((b) => b.id);
  const at = beforeId ? list.indexOf(beforeId) : -1;
  list.splice(at < 0 ? list.length : at, 0, id);
  void run(() => reorderBlocks(groupId, list));
}

const openSections = new Set(["doc", "none"]);
function Section({ id, title, count, children, groupId, manage, group }: { id: string; title: string; count: number; children: ReactNode; groupId?: string | null; manage: boolean; group?: BlockGroup }) {
  const [open, setOpen] = useState(openSections.has(id) || count <= 12);
  const [over, setOver] = useState(false);
  const droppable = manage && groupId !== undefined;
  const menu: MenuItem[] = group
    ? [
        {
          label: "Rename group…",
          onSelect: async () => {
            const name = await askText("Rename group", group.name, "Name", "Rename");
            if (name?.trim()) await run(() => saveBlockGroup({ ...group, name: name.trim() }));
          },
        },
        {
          label: "New subgroup…",
          disabled: !!group.parentId,
          onSelect: async () => {
            const name = await askText("New subgroup", "", "Name", "Create");
            if (name?.trim()) await run(() => saveBlockGroup({ name: name.trim(), parentId: group.id, position: useBlocks.getState().groups.length }));
          },
        },
        {
          label: "Delete group…",
          danger: true,
          onSelect: async () => {
            const ok = await askConfirm(`Delete the group “${group.name}”?`, "Its blocks are kept (they move to no group).");
            if (ok) await run(() => deleteBlockGroup(group.id));
          },
        },
      ]
    : [];
  return (
    <section className="lib-group">
      <button
        className={over ? "lib-group-head drop" : "lib-group-head"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (open) openSections.delete(id);
          else openSections.add(id);
        }}
        onContextMenu={(e) => menu.length && manage && openMenu(e, menu)}
        onDragOver={(e) => {
          if (droppable && e.dataTransfer.types.includes(DRAG_BLOCK)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          if (droppable) dropOn(e, groupId ?? null);
        }}
      >
        <span className={open ? "chev open" : "chev"}>›</span>
        {title}
        <span className="count">{count}</span>
      </button>
      {open && <div className="block-grid">{children}</div>}
    </section>
  );
}

/**
 * The blocks: search, the open document's blocks, the groups (one level of subgroups) and the rest.
 * `manage`: editing, drag and the context menu (the main window); the floating editor only inserts.
 */
export function BlocksPanel({ manage = true, onInsert }: { manage?: boolean; onInsert?: (b: Block) => void }) {
  const { loaded, blocks, docBlocks, groups, docName } = useBlocks();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchBlocks([...docBlocks, ...blocks], query), [docBlocks, blocks, query]);
  const sorted = useMemo(() => [...blocks].sort((a, b) => a.position - b.position), [blocks]);
  const tile = (b: Block) => <BlockTile key={b.id} b={b} manage={manage} onInsert={onInsert} />;
  const top = groups.filter((g) => !g.parentId).sort((a, b) => a.position - b.position);
  const sub = (id: string) => groups.filter((g) => g.parentId === id).sort((a, b) => a.position - b.position);
  const inGroup = (id: string | null) => sorted.filter((b) => (id ? b.groupId === id : !b.groupId || !groups.some((g) => g.id === b.groupId)));
  return (
    <>
      <div className="panel-search">
        <input className="pal-search" type="search" placeholder="Search blocks: name, trigger, tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="panel-scroll lib blocks">
        {!loaded && <p className="empty">Opening blocks…</p>}
        {query.trim() ? (
          results.length ? <div className="block-grid">{results.map(tile)}</div> : <p className="empty">No block matches “{query}”.</p>
        ) : (
          <>
            {loaded && blocks.length === 0 && docBlocks.length === 0 && (
              <div className="lib-empty">
                <p>No blocks yet.</p>
                <p className="hint">A block is an expression you write often, with slots to fill. Select part of an equation (or none for all of it) and choose Save as block; insert it here, from the palette search, or with its trigger and Tab.</p>
              </div>
            )}
            {docBlocks.length > 0 && (
              <Section id="doc" title={`This document${docName ? ` · ${docName}` : ""}`} count={docBlocks.length} manage={manage}>
                {docBlocks.map(tile)}
              </Section>
            )}
            {top.map((g) => (
              <div key={g.id}>
                <Section id={g.id} title={g.name} count={inGroup(g.id).length} groupId={g.id} group={g} manage={manage}>
                  {inGroup(g.id).map(tile)}
                </Section>
                {sub(g.id).map((s) => (
                  <div key={s.id} className="block-subgroup">
                    <Section id={s.id} title={s.name} count={inGroup(s.id).length} groupId={s.id} group={s} manage={manage}>
                      {inGroup(s.id).map(tile)}
                    </Section>
                  </div>
                ))}
              </div>
            ))}
            {inGroup(null).length > 0 && (
              <Section id="none" title={top.length ? "Other blocks" : "My blocks"} count={inGroup(null).length} groupId={null} manage={manage}>
                {inGroup(null).map(tile)}
              </Section>
            )}
          </>
        )}
      </div>
      {manage && (
        <div className="panel-foot block-foot">
          <button className="ghost" title="Save the selection (or the whole equation) as a block" onClick={() => void saveSelectionAsBlock()}>
            ＋ Save as block
          </button>
          <button className="ghost" title="A new block from scratch" onClick={() => openNewBlock()}>
            New
          </button>
          <button
            className="ghost"
            title="New group"
            onClick={async () => {
              const name = await askText("New group", "", "Group name", "Create");
              if (name?.trim()) await run(() => saveBlockGroup({ name: name.trim(), parentId: null, position: groups.length }));
            }}
          >
            Group
          </button>
          <button className="ghost" title="Export blocks to a file to share or back up" onClick={() => void import("../lib/blocks/blockFiles").then((m) => m.exportBlocksFile())}>
            Export…
          </button>
          <button className="ghost" title="Import blocks from a file" onClick={() => void import("../lib/blocks/blockFiles").then((m) => m.importBlocksFile())}>
            Import…
          </button>
        </div>
      )}
    </>
  );
}

/** Save as block from the editor: its selection, or the whole equation when nothing is selected. */
export async function saveSelectionAsBlock() {
  const { editorSelectionLatex } = await import("./MathEditor");
  const source = editorSelectionLatex() ?? useApp.getState().latex;
  // From the floating editor: the dialog opens in the main window (where blocks are managed).
  if (document.documentElement.classList.contains("panel-window")) {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", "panel:saveBlock", { source });
    return;
  }
  const { openSaveBlock } = await import("./SaveBlockDialog");
  openSaveBlock(source);
}
