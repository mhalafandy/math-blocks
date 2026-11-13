import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { parseLatex } from "@mathblocks/math-latex";
import { Modal } from "./Dialogs";
import { MathPreview } from "./MathPreview";
import { BlockCycleError, bodyWithSlots, expandNested, previewLatex, slotNameFor, syncSlots, type Block, type BlockSlot } from "../lib/blocks/model";
import { allBlocks, blockByName, newBlockId, saveBlock, useBlocks } from "../lib/blocks/useBlocks";
import { kindSnippetPrefix, kindSnippets, loadSnippets } from "../lib/snippets";
import { listSymbols } from "../lib/symbols";
import { useApp } from "../lib/store";

/**
 * Save as block (from the editor's selection or whole equation, from the floating editor, or from
 * scratch) and Edit block. Chosen symbols become named slots; every occurrence of a symbol is the same slot.
 */
interface Req {
  /** The equation (or selection) a new block is made from. */
  source?: string;
  /** The block being edited. */
  block?: Block;
}

export const useSaveBlock = create<{ req: Req | null; set: (r: Req | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));
export const openSaveBlock = (source: string) => useSaveBlock.getState().set({ source });
export const openEditBlock = (block: Block) => useSaveBlock.getState().set({ block });
export const openNewBlock = () => useSaveBlock.getState().set({ source: "" });

const BLOCK_TRIGGER_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/** Why a trigger cannot be used (empty is allowed: no trigger). */
export function triggerProblem(trigger: string, selfId: string, prefix = kindSnippetPrefix()): string | null {
  if (!trigger) return null;
  if (!BLOCK_TRIGGER_RE.test(trigger)) return "letters and digits, starting with a letter";
  const typed = prefix + trigger;
  if (kindSnippets(prefix).some((k) => k.trigger === typed)) return `${typed} is a notation kind`;
  if (loadSnippets().some((s) => s.trigger === typed)) return `${typed} is a snippet`;
  const other = allBlocks().find((b) => b.id !== selfId && b.trigger === trigger);
  if (other) return `${typed} is the block “${other.name}”`;
  return null;
}

export function SaveBlockDialog() {
  const req = useSaveBlock((s) => s.req);
  const set = useSaveBlock((s) => s.set);
  const groups = useBlocks((s) => s.groups);
  const docName = useBlocks((s) => s.docName);
  const connected = useApp((s) => s.connector.connected);
  const [source, setSource] = useState("");
  const [picked, setPicked] = useState<{ latex: string; name: string }[]>([]);
  const [body, setBody] = useState("");
  const [bodyEdited, setBodyEdited] = useState(false);
  const [slots, setSlots] = useState<BlockSlot[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [scope, setScope] = useState<Block["scope"]>("global");
  const [display, setDisplay] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!req) return;
    const b = req.block;
    setSource(b ? "" : (req.source ?? ""));
    setPicked([]);
    setBody(b ? b.body : (req.source ?? ""));
    setBodyEdited(!!b);
    setSlots(b ? b.slots : []);
    setName(b?.name ?? "");
    setDescription(b?.description ?? "");
    setTrigger(b?.trigger ?? "");
    setGroupId(b?.groupId ?? null);
    setTags((b?.tags ?? []).join(", "));
    setScope(b?.scope ?? "global");
    setDisplay(b?.display ?? useApp.getState().display);
  }, [req]);

  // The symbols of the source, to choose the slots from.
  const symbols = useMemo(() => {
    if (!source.trim()) return [];
    try {
      return listSymbols(parseLatex(source).root);
    } catch {
      return [];
    }
  }, [source]);

  // Picking symbols rewrites the body (until the body is edited by hand).
  useEffect(() => {
    if (!bodyEdited && source) setBody(bodyWithSlots(source, picked));
  }, [picked, source, bodyEdited]);
  useEffect(() => setSlots((old) => syncSlots(body, old)), [body]);

  if (!req) return null;
  const selfId = req.block?.id ?? "";
  const close = () => set(null);
  const toggle = (latex: string) =>
    setPicked((cur) =>
      cur.some((p) => p.latex === latex)
        ? cur.filter((p) => p.latex !== latex)
        : [...cur, { latex, name: slotNameFor(latex, cur.map((p) => p.name)) }],
    );
  const updateSlot = (i: number, patch: Partial<BlockSlot>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSlots(next);
  };
  const nameClash = allBlocks().find((b) => b.id !== selfId && b.name.toLowerCase() === name.trim().toLowerCase());
  const tProblem = triggerProblem(trigger.trim(), selfId);
  // Nested blocks: this block, as edited, must not contain itself (directly or through another block).
  const self = { body, slots, name: name.trim() } as Block;
  const lookup = (n: string) => (n.toLowerCase() === name.trim().toLowerCase() ? self : blockByName(n));
  let cycle = "";
  try {
    expandNested(body, lookup, [name.trim()]);
  } catch (e) {
    cycle = e instanceof BlockCycleError ? e.message : "";
  }
  const preview = cycle ? "" : previewLatex({ body, slots }, lookup);
  const problems = [!name.trim() && "a name", nameClash && `another name (“${nameClash.name}” exists)`, tProblem && `a different trigger (${tProblem})`, !body.trim() && "a body", cycle].filter(Boolean) as string[];

  const save = async () => {
    if (problems.length) return;
    setBusy(true);
    try {
      const old = req.block;
      const b: Block = {
        id: old?.id ?? newBlockId(),
        name: name.trim(),
        description: description.trim(),
        body,
        slots,
        trigger: trigger.trim(),
        groupId: scope === "document" ? null : groupId,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        display,
        scope,
        position: old?.position ?? allBlocks().length,
        createdAt: old?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        useCount: old?.useCount ?? 0,
        version: old?.version ?? 0,
      };
      // A block moving from the global set to the document leaves the global set.
      if (old && old.scope === "global" && scope === "document") {
        const { deleteBlock } = await import("../lib/blocks/useBlocks");
        await deleteBlock(old);
      }
      await saveBlock(b);
      useApp.getState().notify(`Block “${b.name}” saved${b.trigger ? ` — type ${kindSnippetPrefix()}${b.trigger} Tab` : ""}`);
      close();
    } catch (e) {
      useApp.getState().notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={req.block ? `Edit block “${req.block.name}”` : "Save as block"} onClose={close} width={760}>
      <div className="form save-block">
        {source && symbols.length > 0 && (
          <fieldset>
            <legend>Slots: the parts you fill in each time</legend>
            <div className="block-symbols">
              {symbols.map((s) => {
                const on = picked.some((p) => p.latex === s.key);
                return (
                  <button key={s.key} type="button" className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => toggle(s.key)} disabled={bodyEdited} title={on ? "A slot (click to keep it fixed)" : "Fixed (click to make it a slot)"}>
                    <MathPreview latex={s.key} />
                    {s.count > 1 && <span className="muted">×{s.count}</span>}
                  </button>
                );
              })}
            </div>
            {bodyEdited && <p className="hint">The body was edited by hand: change slots there (#name).</p>}
          </fieldset>
        )}
        <label>
          Body (LaTeX; <code>#name</code> is a slot, <code>\block&#123;Name&#125;</code> another block)
          <textarea
            value={body}
            rows={2}
            spellCheck={false}
            onChange={(e) => {
              setBody(e.target.value);
              setBodyEdited(true);
            }}
          />
        </label>
        <div className="block-preview">{preview ? <MathPreview latex={preview} /> : <span className="muted">Preview</span>}</div>
        {slots.length > 0 && (
          <table className="block-slots">
            <thead>
              <tr>
                <th>Order</th>
                <th>Slot</th>
                <th>Label (hint while filling)</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={s.name}>
                  <td>
                    <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Earlier">
                      ↑
                    </button>
                    <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Later">
                      ↓
                    </button>
                  </td>
                  <td>
                    <code>#{s.name}</code>
                  </td>
                  <td>
                    <input value={s.label ?? ""} placeholder={s.name} onChange={(e) => updateSlot(i, { label: e.target.value || undefined })} />
                  </td>
                  <td>
                    <input value={s.default ?? ""} placeholder="(empty)" spellCheck={false} onChange={(e) => updateSlot(i, { default: e.target.value || undefined })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row2">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            Trigger (type {kindSnippetPrefix()}trigger Tab)
            <input value={trigger} onChange={(e) => setTrigger(e.target.value.trim())} spellCheck={false} placeholder="optional" />
          </label>
        </div>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
        </label>
        <div className="row2">
          <label>
            Group
            <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value || null)} disabled={scope === "document"}>
              <option value="">(no group)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.parentId ? `  ${g.name}` : g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags (comma-separated)
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="optional" />
          </label>
        </div>
        <div className="radio-row">
          <label>
            <input type="radio" checked={scope === "global"} onChange={() => setScope("global")} /> All my documents
          </label>
          <label title={connected ? "" : "Connect Word to store blocks in a document"}>
            <input type="radio" checked={scope === "document"} onChange={() => setScope("document")} disabled={!connected} /> This document only{docName ? ` (${docName})` : ""}
          </label>
          <label>
            <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} /> Display equation
          </label>
        </div>
        {problems.length > 0 && <p className="conv-msg">Needs {problems.join(", ")}.</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void save()} disabled={busy || problems.length > 0}>
            {req.block ? "Save block" : "Save as block"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
