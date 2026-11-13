import { create } from "zustand";
import { isDesktop } from "../connector";
import { syncSlots, type Block, type BlockGroup } from "./model";

/**
 * The blocks: global ones in the library database (Tauri commands; localStorage in the browser preview),
 * the open document's own ones in the document (Custom XML Part urn:mathblocks:blocks:v1, via the add-in).
 */

export const BLOCKS_NS = "urn:mathblocks:blocks:v1";
const LOCAL_KEY = "mathblocks.blocks.v1";

interface State {
  loaded: boolean;
  groups: BlockGroup[];
  blocks: Block[];
  /** The open Word document's blocks (scope "document"). */
  docBlocks: Block[];
  docName: string;
  set: (s: Partial<State>) => void;
}

export const useBlocks = create<State>((set) => ({ loaded: false, groups: [], blocks: [], docBlocks: [], docName: "", set: (s) => set(s) }));

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const newBlockId = newId;

type Row = Omit<Block, "scope">;

function local(): { groups: BlockGroup[]; blocks: Row[] } {
  try {
    const s = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") as { groups: BlockGroup[]; blocks: Row[] } | null;
    if (s && Array.isArray(s.blocks)) return s;
  } catch {
    // Nothing saved.
  }
  return { groups: [], blocks: [] };
}
function saveLocal(groups: BlockGroup[], blocks: Row[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ groups, blocks }));
  } catch {
    // Not saved.
  }
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const asBlock = (r: Row, scope: Block["scope"] = "global"): Block => ({ ...r, scope, slots: Array.isArray(r.slots) ? r.slots : [], tags: r.tags ?? [] });

/** Loads the global blocks (and the open document's, when Word is there). */
export async function loadBlocks() {
  if (isDesktop()) {
    try {
      const [groups, blocks] = await invoke<[BlockGroup[], Row[]]>("blocks_list");
      useBlocks.getState().set({ groups, blocks: blocks.map((b) => asBlock(b)), loaded: true });
    } catch {
      useBlocks.getState().set({ loaded: true });
    }
  } else {
    const s = local();
    useBlocks.getState().set({ groups: s.groups, blocks: s.blocks.map((b) => asBlock(b)), loaded: true });
  }
  await loadDocumentBlocks().catch(() => undefined);
}

/** Every block the editor can use now: the document's first, then the global ones. */
export const allBlocks = () => [...useBlocks.getState().docBlocks, ...useBlocks.getState().blocks];
export const blockByName = (name: string) => allBlocks().find((b) => b.name.toLowerCase() === name.toLowerCase());

/** Saves a block (new or edited) in its scope. */
export async function saveBlock(b: Block): Promise<Block> {
  const block: Block = { ...b, slots: syncSlots(b.body, b.slots), id: b.id || newId() };
  if (block.scope === "document") {
    const list = useBlocks.getState().docBlocks;
    const i = list.findIndex((x) => x.id === block.id);
    const next = i >= 0 ? list.map((x) => (x.id === block.id ? { ...block, version: x.version + 1, updatedAt: Date.now() } : x)) : [...list, { ...block, version: 1, createdAt: Date.now(), updatedAt: Date.now(), position: list.length }];
    await saveDocumentBlocks(next);
    return next.find((x) => x.id === block.id)!;
  }
  // A block moving from the document to the global set leaves the document.
  if (useBlocks.getState().docBlocks.some((x) => x.id === block.id)) await saveDocumentBlocks(useBlocks.getState().docBlocks.filter((x) => x.id !== block.id));
  if (isDesktop()) {
    const { scope: _s, ...row } = block;
    const saved = asBlock(await invoke<Row>("blocks_save", { block: row }));
    const list = useBlocks.getState().blocks;
    useBlocks.getState().set({ blocks: list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved] });
    return saved;
  }
  const list = useBlocks.getState().blocks;
  const old = list.find((x) => x.id === block.id);
  const saved: Block = { ...block, version: (old?.version ?? 0) + 1, useCount: old?.useCount ?? 0, createdAt: old?.createdAt ?? Date.now(), updatedAt: Date.now(), position: old?.position ?? list.length };
  const next = old ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved];
  useBlocks.getState().set({ blocks: next });
  saveLocal(useBlocks.getState().groups, next);
  return saved;
}

export async function deleteBlock(b: Block) {
  if (b.scope === "document") return saveDocumentBlocks(useBlocks.getState().docBlocks.filter((x) => x.id !== b.id));
  if (isDesktop()) await invoke("blocks_delete", { id: b.id });
  const next = useBlocks.getState().blocks.filter((x) => x.id !== b.id);
  useBlocks.getState().set({ blocks: next });
  if (!isDesktop()) saveLocal(useBlocks.getState().groups, next);
}

export async function markBlockUsed(b: Block) {
  if (b.scope === "document") return;
  if (isDesktop()) await invoke("blocks_mark_used", { id: b.id }).catch(() => undefined);
  const next = useBlocks.getState().blocks.map((x) => (x.id === b.id ? { ...x, useCount: x.useCount + 1 } : x));
  useBlocks.getState().set({ blocks: next });
  if (!isDesktop()) saveLocal(useBlocks.getState().groups, next);
}

/** Puts global blocks in this order inside a group (drag to reorder or to another group). */
export async function reorderBlocks(groupId: string | null, ids: string[]) {
  if (isDesktop()) await invoke("blocks_reorder", { groupId, ids });
  const pos = new Map(ids.map((id, i) => [id, i]));
  const next = useBlocks.getState().blocks.map((b) => (pos.has(b.id) ? { ...b, groupId, position: pos.get(b.id)! } : b)).sort((a, b) => a.position - b.position);
  useBlocks.getState().set({ blocks: next });
  if (!isDesktop()) saveLocal(useBlocks.getState().groups, next);
}

export async function saveBlockGroup(g: Omit<BlockGroup, "id"> & { id?: string }): Promise<BlockGroup> {
  const group: BlockGroup = { ...g, id: g.id || `g${newId()}` };
  if (isDesktop()) await invoke("blocks_group_save", { group });
  const list = useBlocks.getState().groups;
  const next = list.some((x) => x.id === group.id) ? list.map((x) => (x.id === group.id ? group : x)) : [...list, group];
  useBlocks.getState().set({ groups: next });
  if (!isDesktop()) saveLocal(next, useBlocks.getState().blocks);
  return group;
}

export async function deleteBlockGroup(id: string) {
  if (isDesktop()) await invoke("blocks_group_delete", { id });
  const groups = useBlocks.getState().groups.filter((g) => g.id !== id && g.parentId !== id);
  const blocks = useBlocks.getState().blocks.map((b) => (b.groupId === id ? { ...b, groupId: null } : b));
  useBlocks.getState().set({ groups, blocks });
  if (!isDesktop()) saveLocal(groups, blocks);
}

// ------------------------------------------------------------------ the document's blocks

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** The document part's XML: the blocks as JSON in one element (like the document style). */
export function documentBlocksXml(blocks: Block[]): string {
  const rows = blocks.map(({ scope: _s, ...b }) => b);
  return `<blocks xmlns="${BLOCKS_NS}">${xmlEscape(JSON.stringify(rows))}</blocks>`;
}

export function parseDocumentBlocksXml(xml: string): Block[] {
  const m = /<blocks[^>]*>([\s\S]*)<\/blocks>/.exec(xml);
  if (!m) return [];
  try {
    const text = m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const rows = JSON.parse(text) as Row[];
    return Array.isArray(rows) ? rows.map((r) => asBlock(r, "document")) : [];
  } catch {
    return [];
  }
}

export async function loadDocumentBlocks() {
  const { addinSupports, connector } = await import("../connector");
  const { useApp } = await import("../store");
  if (!useApp.getState().connector.connected || !addinSupports("getDocumentBlocks")) return useBlocks.getState().set({ docBlocks: [], docName: "" });
  const r = await connector.request("getDocumentBlocks", {});
  useBlocks.getState().set({ docBlocks: r.xml ? parseDocumentBlocksXml(r.xml) : [], docName: r.name });
}

async function saveDocumentBlocks(list: Block[]) {
  const { addinSupports, connector } = await import("../connector");
  if (!addinSupports("setDocumentBlocks")) throw new Error("The Word add-in cannot store blocks in this document (update the add-in, or save the block in the global set)");
  await connector.request("setDocumentBlocks", { xml: documentBlocksXml(list) });
  useBlocks.getState().set({ docBlocks: list.map((b) => ({ ...b, scope: "document" })) });
}

// ------------------------------------------------------------------ windows

let synced = false;

/**
 * Main window: loads the blocks, reloads the document's blocks when Word connects or the app regains
 * focus (another document may be active), and sends every change to the floating editor.
 * Floating editor: takes the main window's blocks (and loads the global ones itself until they come).
 */
export async function initBlocks(role: "main" | "panel") {
  if (synced) return;
  synced = true;
  const { emitTo, listen } = await import("@tauri-apps/api/event").catch(() => ({ emitTo: null, listen: null }));
  if (role === "panel") {
    if (!isDesktop()) return loadBlocks();
    await listen?.<Pick<State, "groups" | "blocks" | "docBlocks" | "docName">>("blocks:state", (e) => useBlocks.getState().set({ ...e.payload, loaded: true }));
    if (!useBlocks.getState().loaded) await loadBlocks().catch(() => undefined);
    if (emitTo) await emitTo("main", "blocks:want", {}).catch(() => undefined);
    return;
  }
  await loadBlocks();
  const send = () => {
    const { groups, blocks, docBlocks, docName } = useBlocks.getState();
    if (emitTo && isDesktop()) void emitTo("panel", "blocks:state", { groups, blocks, docBlocks, docName }).catch(() => undefined);
  };
  useBlocks.subscribe(send);
  await listen?.("blocks:want", send);
  const { useApp } = await import("../store");
  let wasConnected = useApp.getState().connector.connected;
  useApp.subscribe((s) => {
    if (s.connector.connected !== wasConnected) {
      wasConnected = s.connector.connected;
      void loadDocumentBlocks().catch(() => undefined);
    }
  });
  let lastFocus = 0;
  window.addEventListener("focus", () => {
    if (Date.now() - lastFocus < 3000) return;
    lastFocus = Date.now();
    void loadDocumentBlocks().catch(() => undefined);
  });
}
