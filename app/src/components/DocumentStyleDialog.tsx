import { useMemo, useRef } from "react";
import { create } from "zustand";
import { convertLatexToMarkup } from "mathlive/ssr";
import { applyPreset, expandNotation, PRESETS, presetFrom, STYLE_PRESETS, styleAst, styleLabel, styleNotation, type LetterRole, type MathStyle, type PresetId, type Shape, type StylePreset } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { Modal, askConfirm, askText } from "./Dialogs";
import type { LetterProposal } from "../lib/styleCheck";
import { useApp } from "../lib/store";

/**
 * Document style… — how this document's equations look, one setting per category with a live
 * preview. The equations' LaTeX never changes: saving stores the style in the document and redraws
 * its equations (one Ctrl+Z). Also: the classification of single-letter indices, presets (built-in,
 * saved, exported, imported), the user's default and copying another document's style.
 */
interface State {
  open: boolean;
  busy: boolean;
  document: string;
  stored: boolean;
  draft: MathStyle | null;
  proposals: LetterProposal[];
  /** Per letter: the choice shown (stored, else proposed; null = undecided). */
  roles: Record<string, LetterRole | null>;
  others: { name: string; fullName: string; hasStyle: boolean }[];
  message?: string;
  /** New style… form (null: closed). */
  newForm: { name: string; description: string; from: string } | null;
  set: (s: Partial<Omit<State, "set">>) => void;
}

export const useDocumentStyle = create<State>((set) => ({ open: false, busy: false, document: "", stored: false, draft: null, proposals: [], roles: {}, others: [], newForm: null, set: (s) => set(s) }));

export async function openDocumentStyle() {
  const app = useApp.getState();
  const ui = useDocumentStyle.getState();
  ui.set({ open: true, busy: true, draft: null, proposals: [], roles: {}, message: undefined });
  try {
    const { loadDocumentStyle, activeStyle, openDocuments } = await import("../lib/docStyle");
    let document = "";
    let stored = false;
    let proposals: LetterProposal[] = [];
    let others: State["others"] = [];
    if (app.connector.connected) {
      const d = await loadDocumentStyle();
      document = d?.name ?? "";
      stored = !!d?.stored;
      const { proposeClassification } = await import("../lib/styleRun");
      proposals = (await proposeClassification()).proposals;
      others = (await openDocuments().catch(() => [])).filter((x) => !x.active);
    }
    const draft = activeStyle();
    const roles: Record<string, LetterRole | null> = {};
    for (const p of proposals) roles[p.letter] = draft.letters[p.letter] ?? p.proposed;
    ui.set({ busy: false, document, stored, draft, proposals, roles, others });
  } catch (e) {
    ui.set({ open: false, busy: false });
    app.notify(e instanceof Error ? e.message : String(e), "error");
  }
}

/** How a style draws a sample (MathLive, with the style's choices written out). */
function StylePreview({ latex, style }: { latex: string; style: MathStyle }) {
  const html = useMemo(() => {
    try {
      return convertLatexToMarkup(serializeLatex(expandNotation(styleAst(parseLatex(latex).root, style), styleNotation(style))));
    } catch {
      return "";
    }
  }, [latex, style]);
  return <span className="math-preview" style={{ fontSize: 15 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ShapeChoice({ value, onChange, disabled }: { value: Shape; onChange: (s: Shape) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Shape)} disabled={disabled}>
      <option value="italic">italic</option>
      <option value="upright">upright</option>
    </select>
  );
}

const ROLE_LABEL: Record<LetterRole, string> = { label: "label (upright if labels are)", counter: "index variable", variable: "variable", constant: "constant" };

export function DocumentStyleDialog() {
  const s = useDocumentStyle();
  const mine = useApp((st) => st.stylePresets);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!s.open) return null;
  const close = () => s.set({ open: false, draft: null });
  const d = s.draft;
  const up = (change: Partial<MathStyle>) => d && s.set({ draft: { ...d, ...change } });
  const withRoles = (): MathStyle | null => {
    if (!d) return null;
    const letters = { ...d.letters };
    for (const [l, r] of Object.entries(s.roles)) {
      if (r) letters[l] = r;
      else delete letters[l];
    }
    return { ...d, letters };
  };
  // Samples shown with sample classifications so every setting is visible.
  const sample = d ? { ...d, letters: { ...d.letters, i: "counter" as const, j: "counter" as const } } : null;
  const run = async (what: () => Promise<string | void>) => {
    s.set({ busy: true, message: undefined });
    try {
      const msg = await what();
      s.set({ busy: false, ...(msg ? { message: msg } : {}) });
    } catch (e) {
      s.set({ busy: false, message: e instanceof Error ? e.message : String(e) });
    }
  };
  const save = () =>
    run(async () => {
      const style = withRoles();
      if (!style) return;
      if (!useApp.getState().connector.connected) {
        useApp.getState().setPrefs({ defaultStyle: style });
        return "Word is not connected: saved as your default for new documents.";
      }
      const { restyleDocument } = await import("../lib/styleRun");
      const r = await restyleDocument(style);
      s.set({ stored: true });
      return `Saved in the document. ${r.equations ? `Redrew ${r.equations} equation(s); one Ctrl+Z in Word undoes the redraw.` : "No equation to redraw."}${r.note}`;
    });
  const saveDefault = () =>
    run(async () => {
      const style = withRoles();
      if (!style) return;
      useApp.getState().setPrefs({ defaultStyle: { ...style, letters: {}, exceptions: [] } });
      return "Saved as your default for documents without a style of their own.";
    });
  /** Save style: into one of my styles; a built-in one is read-only, so it asks for a new name. */
  const saveStyle = () =>
    run(async () => {
      if (!d) return;
      const sp = await import("../lib/stylePresets");
      if (!sp.isBuiltIn(d.preset) && sp.myStyles().some((p) => p.id === d.preset)) {
        const p = sp.updateStyle(d.preset, d);
        s.set({ draft: applyPreset(d, p) });
        return `Style “${p.name}” saved.`;
      }
      const name = await askText("Save as a new style", `${d.presetName ?? "My style"} (mine)`, "Built-in styles are read-only. Name of the new style");
      if (!name) return;
      const p = sp.createStyle(name, "", "blank");
      const saved = sp.updateStyle(p.id, d);
      s.set({ draft: applyPreset(d, saved) });
      return `Style “${saved.name}” saved in My styles.`;
    });
  const createNew = () =>
    run(async () => {
      if (!d || !s.newForm) return;
      const sp = await import("../lib/stylePresets");
      const p = sp.createStyle(s.newForm.name, s.newForm.description, s.newForm.from);
      s.set({ draft: applyPreset(d, p), newForm: null });
      return `Style “${p.name}” created and opened here: change it, then Save style (and Save and redraw for this document).`;
    });
  const manage = (what: "apply" | "rename" | "duplicate" | "delete" | "default" | "export", p: StylePreset) =>
    run(async () => {
      if (!d) return;
      const sp = await import("../lib/stylePresets");
      if (what === "apply") {
        s.set({ draft: applyPreset(d, p) });
        return `“${p.name}” applied here (Save and redraw to keep it in the document; Save style after changes).`;
      }
      if (what === "rename") {
        const name = await askText("Rename style", p.name, "New name");
        if (!name || name === p.name) return;
        const description = await askText("Description", p.description, "Description (optional)");
        const r = sp.renameStyle(p.id, name, description ?? p.description);
        if (d.preset === p.id) s.set({ draft: { ...d, presetName: r.name, presetDescription: r.description } });
        return `Renamed to “${r.name}”.`;
      }
      if (what === "duplicate") return `Copy made: “${sp.duplicateStyle(p.id).name}”.`;
      if (what === "delete") {
        if (!(await askConfirm("Delete style", `Delete “${p.name}” from My styles? Documents that use it keep their look.`, "Delete", true))) return;
        sp.deleteStyle(p.id);
        return `“${p.name}” deleted.`;
      }
      if (what === "default") {
        sp.setDefaultStyle(p.id);
        return `“${p.name}” is now your default for documents without a style of their own.`;
      }
      const { presetToJson } = await import("../lib/docStyle");
      const { saveFile } = await import("../lib/export");
      const path = await saveFile(p.name.replace(/[\\/:*?"<>|]/g, "_"), "json", presetToJson(p), "application/json");
      return path ? `Style exported: ${path}` : undefined;
    });
  const exportPreset = () =>
    run(async () => {
      if (!d) return;
      const { presetToJson } = await import("../lib/docStyle");
      const { saveFile } = await import("../lib/export");
      const name = styleLabel(d, [...STYLE_PRESETS, ...useApp.getState().stylePresets]);
      const path = await saveFile(name.replace(/[\\/:*?"<>|]/g, "_"), "json", presetToJson(presetFrom(d, d.preset, name, d.presetDescription ?? "")), "application/json");
      return path ? `Style exported: ${path}` : undefined;
    });
  const importPreset = (file: File) =>
    run(async () => {
      if (!d) return;
      const { presetFromJson } = await import("../lib/docStyle");
      const { addImportedStyle } = await import("../lib/stylePresets");
      const p = addImportedStyle(presetFromJson(await file.text()));
      s.set({ draft: applyPreset(d, p) });
      return `Style “${p.name}” imported into My styles and applied here (Save and redraw to keep it in the document).`;
    });
  const copyFrom = (fullName: string) =>
    run(async () => {
      if (!d || !fullName) return;
      const { readDocumentStyle } = await import("../lib/docStyle");
      const other = await readDocumentStyle(fullName);
      if (!other) return "That document has no style of its own.";
      // Its look and notation; this document keeps its own classification and exceptions.
      s.set({ draft: { ...other, letters: d.letters, exceptions: d.exceptions } });
      return "Style copied (Save to keep it in this document).";
    });
  return (
    <Modal title={s.document ? `Document style — “${s.document}”` : "Document style"} onClose={close} width={860}>
      <div className="form">
        {!d ? (
          <p className="hint">{s.busy ? "Reading the document…" : ""}</p>
        ) : (
          <>
            <p className="hint">
              How this document's equations look. Their LaTeX never changes: saving stores the style in the document and redraws them.
              {s.document && !s.stored ? " This document has no style of its own yet: it is drawn in your default." : ""}
            </p>
            <div style={{ maxHeight: 520, overflow: "auto", display: "grid", gap: 10 }}>
              <div>
                <strong>Style: {styleLabel(d, [...STYLE_PRESETS, ...mine])}</strong>
                {d.presetDescription ? <span className="hint"> — {d.presetDescription}</span> : null}
              </div>
              <label>
                Start from{" "}
                <PresetSelect value={d.preset} onPick={(p) => s.set({ draft: applyPreset(d, p) })} />
              </label>
              {s.newForm ? (
                <div style={{ border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: 8, display: "grid", gap: 6 }}>
                  <strong>New style</strong>
                  <label>
                    Name <input value={s.newForm.name} onChange={(e) => s.set({ newForm: { ...s.newForm!, name: e.target.value } })} autoFocus />
                  </label>
                  <label>
                    Description (optional) <input style={{ width: "60%" }} value={s.newForm.description} onChange={(e) => s.set({ newForm: { ...s.newForm!, description: e.target.value } })} />
                  </label>
                  <label>
                    Start from{" "}
                    <select value={s.newForm.from} onChange={(e) => s.set({ newForm: { ...s.newForm!, from: e.target.value } })}>
                      <option value="blank">Blank — neutral starting values (LaTeX's defaults: italic letters; upright digits, Greek capitals, functions, text)</option>
                      {[...STYLE_PRESETS, ...mine].map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="primary" onClick={() => void createNew()} disabled={s.busy || !s.newForm.name.trim()}>
                      Create
                    </button>
                    <button onClick={() => s.set({ newForm: null })}>Cancel</button>
                  </div>
                </div>
              ) : null}
              <div>
                <strong>My styles</strong>{" "}
                <button className="link-button" onClick={() => s.set({ newForm: { name: "", description: "", from: "blank" } })} disabled={s.busy}>
                  New style…
                </button>
                {mine.length === 0 && <p className="hint">None yet: New style…, or change a style here and Save style.</p>}
                {mine.map((p) => (
                  <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid var(--border, #ddd)", padding: "3px 0" }}>
                    <span style={{ flex: 1 }}>
                      {p.name}
                      {p.id === d.preset ? " (in use here)" : ""}
                      {p.description ? <span className="hint"> — {p.description}</span> : null}
                    </span>
                    {(["apply", "rename", "duplicate", "default", "export", "delete"] as const).map((w) => (
                      <button key={w} className="link-button" onClick={() => void manage(w, p)} disabled={s.busy}>
                        {w === "apply" ? "Edit / apply" : w === "default" ? "Set as my default" : w[0]!.toUpperCase() + w.slice(1)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <Row label="Index labels (descriptive: b, sf, max…)" sample={<StylePreview latex="\sigma_{sf}+v_{max}+E_{b}" style={sample!} />}>
                <ShapeChoice value={d.labels} onChange={(v) => up({ labels: v })} />
              </Row>
              <Row label="Index variables (i, j, k, n…) and numbers" sample={<StylePreview latex="x_i+A_{ij}+a_{2}+3.5" style={sample!} />}>
                <ShapeChoice value={d.counters} onChange={(v) => up({ counters: v })} /> numbers <ShapeChoice value={d.numbers} onChange={(v) => up({ numbers: v })} />
              </Row>
              <Row label="Roman numerals in indices (I, II, III, IV…)" sample={<StylePreview latex="\\vectrix{F}_{I}+\\vectrix{F}_{II}+\\bvec{f}_1^{IV}" style={d} />}>
                <ShapeChoice value={d.romans} onChange={(v) => up({ romans: v })} />{" "}
                <label className="check">
                  <input type="checkbox" checked={d.frameSubscriptWarning} onChange={(e) => up({ frameSubscriptWarning: e.target.checked })} /> warn when a frame has a subscript (Convert LaTeX)
                </label>
              </Row>
              <Row label="Latin variables (lowercase, capitals)" sample={<StylePreview latex="x+y=A+B" style={d} />}>
                <ShapeChoice value={d.latinLower} onChange={(v) => up({ latinLower: v })} /> <ShapeChoice value={d.latinUpper} onChange={(v) => up({ latinUpper: v })} />
              </Row>
              <Row label="Greek variables (lowercase, capitals)" sample={<StylePreview latex="\alpha+\omega=\Gamma+\Omega" style={d} />}>
                <ShapeChoice value={d.greekLower} onChange={(v) => up({ greekLower: v })} /> <ShapeChoice value={d.greekUpper} onChange={(v) => up({ greekUpper: v })} />
              </Row>
              <Row label="d in derivatives and integrals" sample={<StylePreview latex="\frac{dx}{dt}=\int f\,dt" style={d} />}>
                <ShapeChoice value={d.differential} onChange={(v) => up({ differential: v })} />
              </Row>
              <Row label="Constants e, i, π (i when classified as a constant)" sample={<StylePreview latex="e^{i\pi}+1=0" style={{ ...d, letters: { ...d.letters, i: "constant" } }} />}>
                <ShapeChoice value={d.constants} onChange={(v) => up({ constants: v })} />
              </Row>
              <Row label="Function names, text and units" sample={<StylePreview latex="\sin\theta+\det A\ \text{if }x>0" style={d} />}>
                <ShapeChoice value={d.functions} onChange={(v) => up({ functions: v })} /> text <ShapeChoice value={d.text} onChange={(v) => up({ text: v })} />
              </Row>
              <Row label="Transpose mark" sample={<StylePreview latex="\mathbf{A}^{T}\mathbf{x}" style={d} />}>
                <select value={d.transpose} onChange={(e) => up({ transpose: e.target.value as MathStyle["transpose"] })}>
                  <option value="upright">upright</option>
                  <option value="italic">italic</option>
                  <option value="bold">bold</option>
                </select>
              </Row>
              <Row label="Bold base: index letters" sample={<StylePreview latex="\mathbf{r}_{sf}+\mathbf{A}_{n}" style={d} />}>
                <select value={d.boldScope} onChange={(e) => up({ boldScope: e.target.value as MathStyle["boldScope"] })}>
                  <option value="base">regular (bold on the base only)</option>
                  <option value="scripts">bold too</option>
                </select>{" "}
                <label className="check">
                  <input type="checkbox" checked={d.accentsFollowBold} onChange={(e) => up({ accentsFollowBold: e.target.checked })} /> accents over bold letters in bold
                </label>{" "}
                <button className="link-button" onClick={() => void import("./AccentsDialog").then((m) => m.openAccents())}>
                  Accents…
                </button>
              </Row>
              <Row label="Notation kinds" sample={<StylePreview latex="\pvec[B/N]{r}=\dcm{B}{N}\cmat{v}" style={d} />}>
                <select value={d.notation.preset} onChange={(e) => up({ notation: { ...d.notation, preset: e.target.value as PresetId } })}>
                  {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                    <option key={id} value={id}>
                      {PRESETS[id].name}
                    </option>
                  ))}
                </select>{" "}
                <button className="link-button" onClick={() => void import("./NotationSettings").then((m) => m.openNotationSettings())}>
                  Each kind's look…
                </button>
              </Row>
              <Row label="Font and size" sample={<span className="hint">Times New Roman with Symbol (Classic); STIX Two for symbols they lack</span>}>
                <select value={d.sizePt} onChange={(e) => up({ sizePt: Number(e.target.value) })}>
                  {[9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24].map((n) => (
                    <option key={n} value={n}>
                      {n} pt
                    </option>
                  ))}
                </select>
              </Row>
              <div>
                <strong>Single-letter indices in this document</strong>
                <p className="hint">Proposed from the equations themselves; nothing ambiguous is guessed. Undecided letters are drawn as variables.</p>
                {s.proposals.length === 0 && <p className="hint">{s.document ? "No single-letter indices found." : "Open a document in Word to classify its indices."}</p>}
                {s.proposals.map((p) => (
                  <div key={p.letter} style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--border, #ddd)", padding: "3px 0" }}>
                    <code style={{ minWidth: 24 }}>{p.letter}</code>
                    <select value={s.roles[p.letter] ?? ""} onChange={(e) => s.set({ roles: { ...s.roles, [p.letter]: (e.target.value || null) as LetterRole | null } })}>
                      <option value="">undecided</option>
                      {(Object.keys(ROLE_LABEL) as LetterRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <span className="hint" style={{ flex: 1 }}>
                      {p.uses}× — {p.reasons.join("; ")}
                    </span>
                    {p.examples[0] && <StylePreview latex={p.examples[0]} style={withRoles() ?? d} />}
                  </div>
                ))}
              </div>
            </div>
            {s.message && <p>{s.message}</p>}
          </>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && void importPreset(e.target.files[0])} />
        <div className="modal-actions" style={{ flexWrap: "wrap" }}>
          <button onClick={() => void saveStyle()} disabled={s.busy || !d} title="Into the style in use when it is one of yours; a built-in style asks for a new name">
            Save style
          </button>
          <button onClick={() => void exportPreset()} disabled={s.busy || !d}>
            Export…
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={s.busy || !d}>
            Import…
          </button>
          {s.others.length > 0 && (
            <select value="" onChange={(e) => void copyFrom(e.target.value)} disabled={s.busy || !d}>
              <option value="">Copy style from…</option>
              {s.others.map((o) => (
                <option key={o.fullName} value={o.fullName} disabled={!o.hasStyle}>
                  {o.name}
                  {o.hasStyle ? "" : " (no style)"}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void saveDefault()} disabled={s.busy || !d}>
            Save as my default
          </button>
          <div className="spacer" />
          <button onClick={close} disabled={s.busy}>
            Close
          </button>
          <button className="primary" onClick={() => void save()} disabled={s.busy || !d}>
            {s.busy && d ? "Working…" : s.document ? "Save and redraw" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, sample, children }: { label: string; sample: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10, alignItems: "center", borderBottom: "1px solid var(--border, #ddd)", paddingBottom: 6 }}>
      <div>
        <div>{label}</div>
        <div>{children}</div>
      </div>
      <div>{sample}</div>
    </div>
  );
}

function PresetSelect({ value, onPick }: { value: string; onPick: (p: StylePreset) => void }) {
  const user = useApp((st) => st.stylePresets);
  const all = [...STYLE_PRESETS, ...user];
  const current = all.find((p) => p.id === value);
  return (
    <>
      <select value={current ? value : ""} onChange={(e) => {
        const p = all.find((x) => x.id === e.target.value);
        if (p) onPick(p);
      }}>
        {!current && <option value="">(changed)</option>}
        <optgroup label="Built-in">
          {STYLE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
        {user.length > 0 && (
          <optgroup label="Yours">
            {user.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {current?.description && <span className="hint"> {current.description}</span>}
    </>
  );
}
