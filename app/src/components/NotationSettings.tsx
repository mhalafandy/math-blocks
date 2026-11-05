import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { isCustomKind, KIND_BY_ID, NEW_KIND_STYLE, PRESETS, presetStyle, type KindAccent, type KindStyle, type PresetId } from "@mathblocks/math-core";
import { parseLatex } from "@mathblocks/math-latex";
import { renderSvg, type FontSet } from "@mathblocks/math-render";
import { askConfirm, Modal } from "./Dialogs";
import { addKind, allKinds, deleteKind, isModified, kindSamples, kindStyle, resetKind, setKindStyle, suggestCopy, updateKindDef } from "../lib/kindStyles";
import { classicStyle, loadFonts } from "../lib/render";
import { useApp } from "../lib/store";

/**
 * Notation settings: every kind (built-in and the user's own) with its style and a live preview;
 * new kinds, duplicates, reset to the preset. Changes restyle the open equation and the library
 * at once; "Apply to the Word document…" redraws the document's equations (safety layer).
 */
export const useNotationSettings = create<{ open: boolean; kind: string | null; set: (open: boolean, kind?: string | null) => void }>((set) => ({
  open: false,
  kind: null,
  set: (open, kind = null) => set({ open, kind }),
}));
export const openNotationSettings = (kind: string | null = null) => useNotationSettings.getState().set(true, kind);

const OPTIONS: { key: keyof KindStyle; label: string; values: [string, string][] }[] = [
  { key: "weight", label: "Weight", values: [["regular", "Regular"], ["bold", "Bold"]] },
  { key: "shape", label: "Shape", values: [["italic", "Italic"], ["upright", "Upright"]] },
  { key: "letters", label: "Letter style", values: [["serif", "Serif (Times)"], ["sans", "Sans serif"], ["calligraphic", "Calligraphic"], ["blackboard", "Blackboard"], ["fraktur", "Fraktur"]] },
  { key: "greek", label: "Bold Greek", values: [["bold-italic", "Bold italic"], ["as-latin", "As Latin letters"]] },
  {
    key: "accent",
    label: "Accent",
    values: [
      ["none", "None"], ["harpoon", "Harpoon over"], ["arrow", "Arrow over"], ["hat", "Hat over"], ["bar", "Bar over"], ["double-bar", "Double bar over"],
      ["double-arrow", "Double arrow over"], ["tilde", "Tilde over"], ["under-bar", "Bar under"], ["double-under-bar", "Double bar under"], ["under-tilde", "Tilde under"],
    ],
  },
  { key: "accentWeight", label: "Accent weight", values: [["regular", "Regular"], ["follow", "Follows the letter"]] },
  { key: "wrap", label: "Brackets", values: [["none", "None"], ["brackets", "[ ]"], ["braces", "{ }"], ["bars", "| |"]] },
  { key: "boldScope", label: "Bold applies to", values: [["base", "The symbol only"], ["scripts", "Symbol and frame label"]] },
];
const FRAME_POS: [string, string][] = [["sub", "Subscript (r_P/O)"], ["sup", "Superscript"], ["pre-sup", "Before, up (ᴾ/ᴼr)"], ["pre-sub", "Before, down"], ["none", "Not shown"]];
const FRAME_SEP: [string, string][] = [["", "None (BN)"], ["/", "Slash (B/N)"], [",", "Comma (B,N)"]];

function useFonts() {
  const [fonts, setFonts] = useState<FontSet | null>(null);
  useEffect(() => void loadFonts().then(setFonts).catch(() => setFonts(null)), []);
  return fonts;
}

function Sample({ latex, sizePt, fonts }: { latex: string; sizePt: number; fonts: FontSet }) {
  const profile = useApp((s) => s.notationProfile);
  const svg = useMemo(() => {
    try {
      return renderSvg(parseLatex(latex).root, { fonts, style: classicStyle(), display: false, sizePt, notation: profile }).svg;
    } catch {
      return "";
    }
  }, [latex, sizePt, fonts, profile]);
  return <span className="kind-sample" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function NotationSettings() {
  const { open, kind: wanted, set } = useNotationSettings();
  const profile = useApp((s) => s.notationProfile);
  const custom = useApp((s) => s.customKinds);
  const fonts = useFonts();
  const [sel, setSel] = useState<string>("pvec");
  const [creating, setCreating] = useState<{ name: string; macro: string; snippet: string; from: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setSel(wanted && KIND_BY_ID.has(wanted) ? wanted : "pvec");
      setCreating(wanted === "__new" ? { name: "", macro: "", snippet: "", from: "pvec" } : null);
      setError(null);
    }
  }, [open, wanted]);
  const kinds = useMemo(() => allKinds(), [custom, open]);
  if (!open) return null;
  const close = () => set(false);
  const k = KIND_BY_ID.get(sel) ?? kinds[0]!;
  const own = isCustomKind(k.id);
  const st = kindStyle(k.id, profile);
  const change = (patch: Partial<KindStyle>) => setKindStyle(k.id, { ...st, ...patch, frames: { ...st.frames, ...(patch.frames ?? {}) } });
  const symbolKind = k.id === "dcm" || k.id === "frm";
  const noStyle = k.id === "T" || k.id === "diff";

  const startNew = (from = "pvec", copyName?: string) => {
    const base = KIND_BY_ID.get(from)!;
    const s = suggestCopy(base);
    setCreating({ name: copyName ?? "", macro: copyName ? s.macro : "", snippet: copyName ? s.snippet : "", from });
    setError(null);
  };
  const create = () => {
    if (!creating) return;
    const from = KIND_BY_ID.get(creating.from);
    const style = from && from.args === 1 && from.id !== "diff" ? kindStyle(from.id, profile) : NEW_KIND_STYLE;
    const r = addKind({ name: creating.name.trim(), macro: creating.macro.trim(), snippet: creating.snippet.trim(), style });
    if (r.error) return setError(r.error);
    setCreating(null);
    setSel(r.id!);
    useApp.getState().notify(`New kind “${creating.name.trim()}”: \\${creating.macro.trim()}{…}, snippet ;${creating.snippet.trim()} (also in the palette under My notation).`);
  };
  const applyToWord = async () => {
    const { restyleDocument } = await import("../lib/kindRestyle");
    await restyleDocument();
  };

  return (
    <Modal title="Notation: kinds and their styles" onClose={close} width={1040}>
      <div className="notation-settings">
        <div className="ns-top">
          <label>
            Preset{" "}
            <select value={profile.preset} onChange={(e) => useApp.getState().setPrefs({ notationProfile: { ...profile, preset: e.target.value as PresetId } })}>
              {(Object.keys(PRESETS) as PresetId[]).map((p) => (
                <option key={p} value={p}>
                  {PRESETS[p].name}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Changes apply at once to the open equation and the library. The Word document is redrawn when you choose “Apply to the Word document”.</span>
        </div>
        <div className="ns-body">
          <ul className="ns-list" role="listbox" aria-label="Kinds">
            {kinds.map((x, i) => (
              <li key={x.id}>
                {i > 0 && isCustomKind(x.id) && !isCustomKind(kinds[i - 1]!.id) && <div className="ns-group">My notation</div>}
                <button className={x.id === sel && !creating ? "on" : undefined} role="option" aria-selected={x.id === sel} onClick={() => (setSel(x.id), setCreating(null))}>
                  <span className="ns-name">
                    {x.name}
                    {isModified(x.id, profile) && <span className="ns-dot" title="Changed from the preset"> •</span>}
                  </span>
                  <code>\{x.macro}</code>
                  {fonts && <Sample latex={kindSamples(x)[1]?.latex ?? kindSamples(x)[0]!.latex} sizePt={12} fonts={fonts} />}
                </button>
              </li>
            ))}
            {!kinds.some((x) => isCustomKind(x.id)) && <div className="ns-group">My notation</div>}
            <li>
              <button className={creating ? "on ns-new" : "ns-new"} onClick={() => startNew()}>
                + New kind…
              </button>
            </li>
          </ul>

          {creating ? (
            <div className="ns-edit form">
              <h3>New kind</h3>
              <label>
                Name
                <input autoFocus value={creating.name} placeholder="e.g. Angular velocity" onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
              </label>
              <label>
                Macro (without \)
                <input value={creating.macro} placeholder="e.g. angvel" onChange={(e) => setCreating({ ...creating, macro: e.target.value })} />
              </label>
              <label>
                Snippet trigger
                <input value={creating.snippet} placeholder="e.g. av" onChange={(e) => setCreating({ ...creating, snippet: e.target.value })} />
              </label>
              <label>
                Start from the style of
                <select value={creating.from} onChange={(e) => setCreating({ ...creating, from: e.target.value })}>
                  {kinds.filter((x) => x.args === 1 && x.id !== "diff" && x.id !== "frm").map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className="bad">{error}</p>}
              <p className="hint">The kind takes one symbol and an optional frame label: \{creating.macro || "macro"}[P/O]{"{r}"}. Its style can be changed after it is created.</p>
              <div className="modal-actions">
                <button onClick={() => setCreating(null)}>Cancel</button>
                <button className="primary" onClick={create}>
                  Create kind
                </button>
              </div>
            </div>
          ) : (
            <div className="ns-edit form">
              <h3>
                {k.name} <code>\{k.macro}</code> <span className="muted">snippet ;{k.snippet}</span>
              </h3>
              {own && <OwnKindFields id={k.id} />}
              <div className="ns-preview" aria-label="Preview">
                {fonts ? (
                  [12, 10].map((size) => (
                    <div key={size} className="ns-preview-row">
                      <span className="muted">{size} pt</span>
                      {kindSamples(k).map((s) => (
                        <Sample key={s.latex} latex={s.latex} sizePt={size} fonts={fonts} />
                      ))}
                    </div>
                  ))
                ) : (
                  <span className="muted">Preparing preview…</span>
                )}
              </div>
              {noStyle ? (
                <label>
                  Shape
                  <select value={st.shape} onChange={(e) => change({ shape: e.target.value as KindStyle["shape"] })}>
                    <option value="upright">Upright</option>
                    <option value="italic">Italic</option>
                  </select>
                </label>
              ) : (
                <div className="ns-grid">
                  {OPTIONS.map((o) => (
                    <label key={o.key}>
                      {o.label}
                      <select value={String(st[o.key] ?? "")} onChange={(e) => change({ [o.key]: e.target.value } as Partial<KindStyle>)}>
                        {o.values.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label>
                    Frame label position
                    <select value={st.frames.position} onChange={(e) => change({ frames: { ...st.frames, position: e.target.value as KindStyle["frames"]["position"] } })}>
                      {FRAME_POS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Between two frames
                    <select value={st.frames.separator} onChange={(e) => change({ frames: { ...st.frames, separator: e.target.value as KindStyle["frames"]["separator"] } })}>
                      {FRAME_SEP.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {symbolKind && (
                    <label>
                      Symbol (empty: the frames alone, [BN])
                      <input value={st.symbol ?? ""} maxLength={2} onChange={(e) => change({ symbol: e.target.value })} />
                    </label>
                  )}
                </div>
              )}
              <div className="ns-actions">
                {!own && (
                  <button disabled={!isModified(k.id, profile)} onClick={() => resetKind(k.id)} title={`Back to ${PRESETS[profile.preset].name}: ${describe(presetStyle(profile.preset, k.id))}`}>
                    Reset to preset
                  </button>
                )}
                {k.args === 1 && k.id !== "diff" && k.id !== "frm" && <button onClick={() => startNew(k.id, `${k.name} (copy)`)}>Duplicate…</button>}
                {own && (
                  <button
                    className="danger"
                    onClick={async () => {
                      if (await askConfirm("Delete kind", `Delete “${k.name}”? Equations that use \\${k.macro} keep the macro but are no longer drawn as this kind.`)) {
                        deleteKind(k.id);
                        setSel("pvec");
                      }
                    }}
                  >
                    Delete kind
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={() => void applyToWord()} disabled={!useApp.getState().connector.connected} title="Redraw every equation of the open Word document that uses a kind (backup, progress, one undo step)">
            Apply to the Word document…
          </button>
          <button className="primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OwnKindFields({ id }: { id: string }) {
  const def = useApp((s) => s.customKinds.find((c) => c.id === id));
  const [draft, setDraft] = useState(def ? { name: def.name, macro: def.macro, snippet: def.snippet } : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(def ? { name: def.name, macro: def.macro, snippet: def.snippet } : null), [id]);
  if (!def || !draft) return null;
  const dirty = draft.name !== def.name || draft.macro !== def.macro || draft.snippet !== def.snippet;
  return (
    <div className="ns-own">
      <label>
        Name <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <label>
        Macro <input value={draft.macro} onChange={(e) => setDraft({ ...draft, macro: e.target.value })} />
      </label>
      <label>
        Snippet <input value={draft.snippet} onChange={(e) => setDraft({ ...draft, snippet: e.target.value })} />
      </label>
      {dirty && (
        <button
          onClick={() => {
            const problem = updateKindDef(id, draft);
            setError(problem);
          }}
        >
          Save name / macro
        </button>
      )}
      {error && <p className="bad">{error}</p>}
    </div>
  );
}

function describe(s: KindStyle): string {
  const accent = (a: KindAccent) => (a === "none" ? "" : `, ${a.replace(/-/g, " ")}`);
  return `${s.weight} ${s.shape}${accent(s.accent)}${s.wrap !== "none" ? `, ${s.wrap}` : ""}`;
}
