import { isDesktop } from "../connector";
import { useApp } from "../store";
import { exportBlockSet, parseBlockSet, planImport, type Block, type BlockGroup, type ClashChoice } from "./model";
import { newBlockId, saveBlock, saveBlockGroup, useBlocks } from "./useBlocks";

/** Exports every block (yours and this document's) with their groups to a JSON file to share or back up. */
export async function exportBlocksFile() {
  const notify = useApp.getState().notify;
  const { blocks, docBlocks, groups } = useBlocks.getState();
  const all = [...blocks, ...docBlocks];
  if (!all.length) return notify("There are no blocks to export");
  try {
    const { saveFile } = await import("../export");
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await saveFile(`MathBlocks blocks ${stamp}`, "json", JSON.stringify(exportBlockSet(all, groups), null, 1), "application/json");
    if (path) notify(`Exported ${all.length} block(s)`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}

async function readText(): Promise<string | null> {
  if (isDesktop()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ title: "Import MathBlocks blocks", multiple: false, filters: [{ name: "MathBlocks blocks", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    return new TextDecoder().decode(new Uint8Array(await invoke<ArrayBuffer>("document_read", { path })));
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      void f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

/**
 * Imports a block-set file into your blocks. When names or triggers clash, one choice for all of them:
 * replace yours, keep both (the imported ones renamed), or skip them.
 */
export async function importBlocksFile() {
  const notify = useApp.getState().notify;
  try {
    const text = await readText();
    if (text === null) return;
    const file = parseBlockSet(text);
    const existing = useBlocks.getState().blocks;
    const clashes = planImport(existing, file, () => "skip").skipped;
    let choice: ClashChoice = "keep-both";
    if (clashes.length) {
      const { askConfirm } = await import("../../components/Dialogs");
      const list = clashes.slice(0, 6).join(", ") + (clashes.length > 6 ? "…" : "");
      if (await askConfirm(`${clashes.length} block(s) already exist`, `${list}. Replace yours with the imported ones?`, "Replace", true)) choice = "replace";
      else choice = (await askConfirm("Keep both?", "Keep yours and add the imported ones under new names (and triggers)? Otherwise they are skipped.", "Keep both", false)) ? "keep-both" : "skip";
    }
    const plan = planImport(existing, file, () => choice);
    // Groups: matched by name; new ones created (subgroups under their imported parent).
    const groupIds = new Map<string, string>();
    const ensure = async (g: BlockGroup): Promise<string> => {
      const known = groupIds.get(g.id);
      if (known) return known;
      const parent = g.parentId ? file.groups.find((x) => x.id === g.parentId) : undefined;
      const parentId = parent ? await ensure(parent) : null;
      const same = useBlocks.getState().groups.find((x) => x.name.toLowerCase() === g.name.toLowerCase() && x.parentId === parentId);
      const id = same?.id ?? (await saveBlockGroup({ name: g.name, parentId, position: useBlocks.getState().groups.length })).id;
      groupIds.set(g.id, id);
      return id;
    };
    const groupOf = async (b: { groupId: string | null }) => {
      const g = b.groupId ? file.groups.find((x) => x.id === b.groupId) : undefined;
      return g ? ensure(g) : null;
    };
    for (const b of plan.add) await saveBlock({ ...b, id: newBlockId(), groupId: await groupOf(b), scope: "global", useCount: 0, version: 0 } as Block);
    for (const r of plan.replace) {
      const old = existing.find((x) => x.id === r.id)!;
      await saveBlock({ ...old, ...r.with, id: old.id, groupId: await groupOf(r.with), scope: "global", useCount: old.useCount } as Block);
    }
    notify(`Imported blocks: ${plan.add.length} added, ${plan.replace.length} replaced${plan.skipped.length ? `, ${plan.skipped.length} skipped` : ""}`);
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}
