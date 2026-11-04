import { TUNED_PROFILE, WORD_DEFAULT_PROFILE } from "@mathblocks/math-omml";
import { formatTag, newInstanceId, parseRegistry, serializeRegistry, type Registry } from "@mathblocks/ooxml";
import type { DocumentInstances } from "@mathblocks/connector-protocol";
import { askConfirm } from "../components/Dialogs";
import { connector } from "./connector";
import { buildInsertion, currentProfile } from "./equation";
import { contentOfLatex, linkOf, planUpdate } from "./linkPlan";
import type { Equation } from "./library/types";
import { useLibrary } from "./library/useLibrary";
import { useApp } from "./store";

/**
 * Linked equations (M6): a library equation placed in Word as linked copies. Saving a new version
 * in the library updates every copy in every open document; documents opened later are checked.
 * The document registry keeps the last definition written into each document.
 */

const wordReady = () => useApp.getState().connector.connected;
const profilesFor = () => [currentProfile(), TUNED_PROFILE, WORD_DEFAULT_PROFILE];

export async function readRegistry(document?: string): Promise<Registry> {
  const r = await connector.request("getRegistry", document ? { document } : {});
  return parseRegistry(r.xml);
}

export async function writeRegistry(document: string | undefined, registry: Registry) {
  await connector.request("setRegistry", { ...(document ? { document } : {}), xml: serializeRegistry(registry) });
}

async function writeBlock(document: string, q: Equation, reg?: Registry) {
  const registry = reg ?? (await readRegistry(document));
  registry.blocks[q.id] = { id: q.id, name: q.name, version: q.currentVersion, latex: q.latex, display: q.display };
  await connector.request("setRegistry", { document, xml: serializeRegistry(registry) });
}

/** Inserts the library equation at Word's cursor as a linked copy. */
export async function insertLinked(q: Equation) {
  const { display: d, numbered } = useApp.getState();
  const display = d && !numbered;
  const { tag, flatOpc } = await buildInsertion(q.latex, display, currentProfile(), formatTag({ blockId: q.id, instanceId: newInstanceId() }));
  const r = await connector.request("insertEquation", { tag, flatOpc, display, undoLabel: `Insert linked “${q.name}”` });
  if (numbered) await import("./numbering").then((m) => m.numberInWord(tag, q.latex));
  const docs = await connector.request("listInstances", { blockId: q.id, light: true });
  const doc = docs.documents[0];
  if (doc) await writeBlock(doc.fullName, q);
  return r.found;
}

/**
 * Writes the new definition of `q` into all its linked copies in all open documents.
 * `previousLatex` is what the library held before (used when a document has no registry entry).
 * Returns the number of copies updated.
 */
export async function propagate(q: Equation, previousLatex: string | null, opts: { onlyDocument?: string } = {}): Promise<number> {
  if (!wordReady()) return 0;
  const notify = useApp.getState().notify;
  const listed = await connector.request("listInstances", opts.onlyDocument ? { document: opts.onlyDocument, blockId: q.id, includeContent: true, light: true } : { all: true, blockId: q.id, includeContent: true, light: true });
  let total = 0;
  let docsTouched = 0;
  for (const doc of listed.documents) {
    if (!doc.instances.length) continue;
    const reg = await readRegistry(doc.fullName);
    const prev = reg.blocks[q.id]?.latex ?? previousLatex;
    const plan = planUpdate(doc.instances.map((i) => ({ tag: i.tag, flatOpc: i.flatOpc ?? "" })), prev, q.latex, profilesFor());
    let targets = plan.update;
    if (plan.conflicts.length) {
      const overwrite = await askConfirm(
        `${plan.conflicts.length} linked cop${plan.conflicts.length > 1 ? "ies were" : "y was"} changed in Word`,
        `In “${doc.name}”, ${plan.conflicts.length > 1 ? "these copies of" : "a copy of"} “${q.name}” no longer match the last version MathBlocks wrote, so ${plan.conflicts.length > 1 ? "they were" : "it was"} edited directly in Word.\n\nReplace with the library version? Choose Cancel to keep the Word edits and unlink ${plan.conflicts.length > 1 ? "those copies" : "that copy"}.`,
        "Replace",
        false,
      );
      if (overwrite) targets = [...targets, ...plan.conflicts];
      else for (const c of plan.conflicts) await unlinkTag(doc.fullName, c.tag);
    }
    if (targets.length) {
      const profile = currentProfile();
      const items = await Promise.all(targets.map(async (t) => ({ tag: t.tag, flatOpc: (await buildInsertion(q.latex, t.numbered ? false : t.display, profile, t.tag, t.kind === "picture" ? "classic" : t.kind === "native" ? "native" : undefined, t.display)).flatOpc })));
      const r = await connector.request("replaceMany", { document: doc.fullName, items, undoLabel: `Update linked “${q.name}”` });
      total += r.replaced;
      docsTouched++;
    }
    await writeBlock(doc.fullName, q, reg);
  }
  if (total) notify(`Updated ${total} linked cop${total > 1 ? "ies" : "y"} of “${q.name}”${docsTouched > 1 ? ` in ${docsTouched} documents` : ""} (Ctrl+Z in Word undoes it)`);
  return total;
}

async function unlinkTag(document: string, tag: string) {
  const link = linkOf(tag);
  if (!link) return;
  await connector.request("retag", { document, tag, newTag: `mb1|-|${link.instanceId}` });
}

/** Makes the copy being edited an ordinary equation (it no longer follows the library). */
export async function unlinkEditing() {
  const app = useApp.getState();
  const tag = app.editing?.tag;
  const link = tag ? linkOf(tag) : null;
  if (!tag || !link) return;
  try {
    await unlinkTag("", tag);
    app.setEditing({ tag: `mb1|-|${link.instanceId}`, adopted: false });
    useLibrary.getState().closeEquation();
    app.notify("This copy is now an ordinary equation; the library equation and its other copies are unchanged.");
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** All linked copies of a block in the open documents (for the Library tab). */
export async function listCopies(blockId: string): Promise<DocumentInstances[]> {
  if (!wordReady()) return [];
  const r = await connector.request("listInstances", { all: true, blockId });
  return r.documents.filter((d) => d.instances.length);
}

export async function goToCopy(document: string, tag: string) {
  try {
    await connector.request("selectInstance", { document, tag });
  } catch (e) {
    useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/**
 * Checks a document's linked copies against the library: offers to update outdated ones and to
 * add blocks the library does not know (document from another PC).
 */
const lastChecked = new Map<string, number>();

export async function checkDocument(fullName: string, opts: { auto?: boolean } = {}) {
  if (!wordReady()) return;
  // Opening a document and connecting both ask for a check: do it once.
  const now = Date.now();
  if (opts.auto && now - (lastChecked.get(fullName) ?? 0) < 10_000) return;
  lastChecked.set(fullName, now);
  const listed = await connector.request("listInstances", { document: fullName, light: true });
  const doc = listed.documents[0];
  if (!doc) return;
  const blockIds = [...new Set(doc.instances.map((i) => linkOf(i.tag)?.blockId).filter((b): b is string => !!b))];
  if (!blockIds.length) return;
  const reg = await readRegistry(fullName);
  const lib = useLibrary.getState();
  const profile = currentProfile();
  const outdated: Equation[] = [];
  const unknown: string[] = [];
  for (const id of blockIds) {
    const q = lib.equations.find((x) => x.id === id);
    const known = reg.blocks[id];
    if (!q) {
      if (known) unknown.push(id);
      continue;
    }
    if (!known || contentOfLatex(known.latex, profile) !== contentOfLatex(q.latex, profile)) outdated.push(q);
  }
  const app = useApp.getState();
  if (outdated.length) {
    const copies = doc.instances.filter((i) => outdated.some((q) => linkOf(i.tag)?.blockId === q.id)).length;
    app.setNotice({
      text: `“${doc.name}”: ${copies} linked equation${copies > 1 ? "s are" : " is"} older than your library (${outdated.map((q) => q.name).join(", ")}).`,
      actions: [
        {
          label: "Update now",
          run: async () => {
            app.setNotice(null);
            for (const q of outdated) await propagate(q, reg.blocks[q.id]?.latex ?? null, { onlyDocument: fullName });
          },
        },
        { label: "Not now", run: () => app.setNotice(null) },
      ],
    });
  } else if (unknown.length) {
    app.setNotice({
      text: `“${doc.name}” uses ${unknown.length} linked equation${unknown.length > 1 ? "s" : ""} that ${unknown.length > 1 ? "are" : "is"} not in your library (made on another computer?).`,
      actions: [
        {
          label: "Add to library",
          run: async () => {
            app.setNotice(null);
            for (const id of unknown) await importBlock(id, reg);
            app.notify(`Added ${unknown.length} equation(s) to the library`);
          },
        },
        { label: "Not now", run: () => app.setNotice(null) },
      ],
    });
  }
}

/** Adds a block known only from a document registry to the library, keeping its id. */
export async function importBlock(id: string, reg: Registry): Promise<Equation | null> {
  const b = reg.blocks[id];
  const lib = useLibrary.getState();
  if (!b || !lib.store) return null;
  const q = await lib.store.save(id, { folderId: null, name: b.name || "Imported equation", description: "Added from a Word document", latex: b.latex, display: b.display, favorite: false, tags: [], note: "Imported from a document" });
  await lib.refresh();
  return q;
}

/** Called when an equation is double-clicked in Word: opens linked copies as their library equation. */
export async function openLinkedForEditing(tag: string): Promise<boolean> {
  const link = linkOf(tag);
  if (!link) return false;
  const lib = useLibrary.getState();
  let q = lib.equations.find((x) => x.id === link.blockId);
  if (!q) {
    const reg = await readRegistry("");
    q = (await importBlock(link.blockId, reg)) ?? undefined;
  }
  if (!q) return false;
  lib.openEquation(q);
  useApp.getState().setEditing({ tag, adopted: false, blockId: q.id });
  return true;
}

/** On connect, checks every open document that holds linked equations. */
export async function checkOpenDocuments() {
  if (!wordReady()) return;
  try {
    const all = await connector.request("listInstances", { all: true, light: true });
    for (const d of all.documents) if (d.instances.some((i) => linkOf(i.tag))) await checkDocument(d.fullName, { auto: true });
  } catch {
    // Word busy or no document: nothing to check.
  }
}
