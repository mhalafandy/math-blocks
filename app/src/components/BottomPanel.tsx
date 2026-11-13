import { useWidthMeasure } from "./WidthBar";
import { PreviewView } from "./PreviewView";
import { CONVENTIONS, VECTOR_STYLES, type Convention, type VectorStyle } from "../lib/palette";
import type { MathNode, Row } from "@mathblocks/math-core";
import { childRows } from "@mathblocks/math-core";
import type { CompiledEquation } from "../lib/equation";
import { useApp, type BottomTab } from "../lib/store";
import { DetailsPanel } from "./DetailsPanel";
import { LatexEditor } from "./LatexEditor";
import { SymbolsPanel } from "./SymbolsPanel";
import { ClassicPreview } from "./ClassicPreview";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "latex", label: "LaTeX" },
  { id: "preview", label: "Preview" },
  { id: "details", label: "Library" },
  { id: "symbols", label: "Symbol index" },
  { id: "structure", label: "Structure" },
  { id: "omml", label: "OMML" },
];

/** Collapsible panel under the equation canvas (like VS Code's panel): source and details. */
export function BottomPanel({ eq }: { eq: CompiledEquation }) {
  const tab = useApp((s) => s.bottomTab);
  const open = useApp((s) => s.bottomOpen);
  const setPrefs = useApp((s) => s.setPrefs);
  const problems = eq.diagnostics.length;
  return (
    <section className={open ? "bottom-panel" : "bottom-panel collapsed"} aria-label="LaTeX and details">
      <div className="panel-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={open && tab === t.id}
            className={open && tab === t.id ? "tab active" : "tab"}
            onClick={() => setPrefs(open && tab === t.id ? { bottomOpen: false } : { bottomTab: t.id, bottomOpen: true })}
          >
            {t.label}
            {t.id === "latex" && problems > 0 && <span className={eq.errors ? "badge bad" : "badge warn"}>{problems}</span>}
          </button>
        ))}
        <div className="spacer" />
        <button className="icon-btn" title={open ? "Hide panel (Ctrl+J)" : "Show panel (Ctrl+J)"} onClick={() => setPrefs({ bottomOpen: !open })}>
          {open ? "▾" : "▴"}
        </button>
      </div>
      {open && (
        <div className="panel-body">
          {tab === "latex" && <LatexEditor diagnostics={eq.diagnostics} />}
          {tab === "preview" && <DockedPreview />}
          {tab === "details" && <div className="scroll pad"><DetailsPanel /></div>}
          {tab === "symbols" && <div className="scroll pad"><SymbolsPanel /></div>}
          {tab === "structure" && <div className="scroll pad"><StructureTree root={eq.root} /></div>}
          {tab === "style" && (
            <div className="scroll pad">
              <p className="hint">The Word style settings are in Settings now.</p>
              <button onClick={() => void import("../lib/settingsStore").then((m) => m.openSettings("word"))}>Open Settings → Word style</button>
            </div>
          )}
          {tab === "omml" && <pre className="code scroll pad">{eq.omml}</pre>}
        </div>
      )}
    </section>
  );
}

function label(n: MathNode): string {
  switch (n.kind) {
    case "ident":
    case "number":
    case "operator":
    case "text":
      return `${n.kind} "${n.text}"${"variant" in n && n.variant ? ` · ${n.variant}` : ""}`;
    case "nary":
      return `large operator ${n.op}`;
    case "function":
      return `function ${n.name}`;
    case "accent":
      return `accent ${n.accent}`;
    case "matrix":
      return `matrix (${n.matrixKind}) ${n.rows.length}×${Math.max(...n.rows.map((r) => r.length))}`;
    case "delimited":
      return `delimiters ${n.open || "·"} ${n.close || "·"}`;
    case "space":
      return `space ${n.width}`;
    case "raw":
      return `⚠ unparsed ${n.latex}`;
    default:
      return n.kind;
  }
}

function StructureTree({ root }: { root: Row }) {
  if (root.children.length === 0) return <p className="empty">Empty equation.</p>;
  return <ul className="tree">{root.children.map((c, i) => <TreeNode key={i} node={c} />)}</ul>;
}

function TreeNode({ node }: { node: MathNode }) {
  if (node.kind === "matrix" || node.kind === "cases" || node.kind === "aligned") {
    return (
      <li>
        <span>{label(node)}</span>
        <ul>
          {node.rows.map((cells, r) => (
            <li key={r}>
              <span className="muted">line {r + 1}</span>
              <ul>
                {cells.map((cell, c) => (
                  <li key={c}>
                    <span className="muted">cell {c + 1}</span>
                    {cell.children.length > 0 && <ul>{cell.children.map((n, i) => <TreeNode key={i} node={n} />)}</ul>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </li>
    );
  }
  const kids = node.kind === "row" ? node.children : childRows(node).flatMap((r) => r.children);
  return (
    <li className={node.kind === "raw" ? "warn" : undefined}>
      <span>{label(node)}</span>
      {kids.length > 0 && <ul>{kids.map((c, i) => <TreeNode key={i} node={c} />)}</ul>}
    </li>
  );
}

const FONTS = ["Cambria Math", "Latin Modern Math", "STIX Two Math", "XITS Math", "Asana Math"];

export function StylePanel() {
  const profileBase = useApp((s) => s.profileBase);
  const mathFont = useApp((s) => s.mathFont);
  const vectorStyle = useApp((s) => s.vectorStyle);
  const numberStyle = useApp((s) => s.numberStyle);
  const look = useApp((s) => s.look);
  const docStyle = useApp((s) => s.docStyle);
  const sizePt = useApp((s) => (s.docStyle?.stored ? s.docStyle.style.global.sizePt : s.equationSizePt));
  const width = useWidthMeasure();
  const convention = useApp((s) => s.spacecraftConvention);
  const scVector = useApp((s) => s.spacecraftVector);
  const confirmWord = useApp((s) => s.confirmWordCommands);
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <div className="form narrow">
      <label>
        Spacecraft notation
        <select value={convention} onChange={(e) => setPrefs({ spacecraftConvention: e.target.value as Convention })} title="Which textbook's notation the Spacecraft palette uses">
          {Object.entries(CONVENTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Physical vectors
        <select value={scVector} onChange={(e) => setPrefs({ spacecraftVector: e.target.value as VectorStyle })} title="How the Spacecraft palette writes vectors (r, ω, h…)">
          {Object.entries(VECTOR_STYLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <button className="link-button" onClick={() => void import("./DocumentStyleDialog").then((m) => m.openDocumentStyle())}>
        Document style… (labels, variables, d/e/i/π, kinds, size — stored in the document)
      </button>
      <button className="link-button" onClick={() => void import("./CheckStyleDialog").then((m) => m.openCheckStyle())}>
        Check style…
      </button>
      <button className="link-button" onClick={() => void import("./AccentsDialog").then((m) => m.openAccents())}>
        Accents… (harpoons, arrows, hats: size, stroke, gap)
      </button>
      <button className="link-button" onClick={() => void import("./NotationSettings").then((m) => m.openNotationSettings())}>
        Kinds and their styles, my own kinds…
      </button>
      <label className="check">
        <input type="checkbox" checked={confirmWord} onChange={(e) => setPrefs({ confirmWordCommands: e.target.checked })} /> Ask before Convert LaTeX and other
        document-wide commands started from Word (one Ctrl+Z undoes them; a backup is made)
      </label>
      <label>
        Equations in Word
        <select value={look} onChange={(e) => setPrefs({ look: e.target.value as "classic" | "native" })}>
          <option value="classic">Classic: MathType look (drawn by MathBlocks)</option>
          <option value="native">Native Word equation (editable with Word's tools)</option>
        </select>
      </label>
      {look === "classic" ? (
        <>
          <label>
            Size
            <select
              value={sizePt}
              onChange={(e) => {
                const n = Number(e.target.value);
                // A document with its own style keeps its size there (it travels with the document).
                if (docStyle?.stored) void import("../lib/docStyle").then((m) => m.updateActiveStyle((st) => ({ ...st, sizePt: n })));
                else setPrefs({ equationSizePt: n });
              }}
            >
              {[10, 10.5, 11, 12, 14, 16].map((n) => (
                <option key={n} value={n}>
                  {n} pt{n === 12 ? " (MathType default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <p>
            <button onClick={() => void import("../lib/previewWindow").then((m) => m.togglePreview())}>Open the Word preview</button>{" "}
            <span className="hint">its own window: the equation exactly as Word gets it, at true size and zoomable, with the line width (Ctrl+Alt+P)</span>
          </p>
          <p className="hint">Classic equations use MathType's fonts and spacing (Times New Roman, Symbol) and look the same on every PC. Double-click one in Word to edit it in MathBlocks.</p>
        </>
      ) : (
        <p className="hint">Settings for native Word equations:</p>
      )}
      {look === "native" && <>
      <label>
        Spacing
        <select value={profileBase} onChange={(e) => setPrefs({ profileBase: e.target.value as "tuned" | "word-default" })}>
          <option value="tuned">MathBlocks tuned</option>
          <option value="word-default">Word default</option>
        </select>
      </label>
      <label>
        Math font
        <select value={mathFont} onChange={(e) => setPrefs({ mathFont: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        Vectors
        <select value={vectorStyle} onChange={(e) => setPrefs({ vectorStyle: e.target.value as "arrow" | "harpoon" | "bold" | "bold-italic" })}>
          <option value="arrow">Arrow accent (v⃗)</option>
          <option value="harpoon">Harpoon accent (v⃑)</option>
          <option value="bold">Bold upright (𝐯)</option>
          <option value="bold-italic">Bold italic (𝒗)</option>
        </select>
      </label>
      </>}
      <NumberingSettings />
      <p className="hint">Fonts other than Cambria Math must be installed on every PC that opens the document.</p>
    </div>
  );
}

/** Equation numbers: format, brackets, separator, restart rule, where chapter/section numbers come from. */
export function NumberingSettings() {
  const ns = useApp((s) => s.numberStyle);
  const setPrefs = useApp((s) => s.setPrefs);
  const set = (patch: Partial<typeof ns>) => {
    const next = { ...ns, ...patch };
    next.chapter = (next.parts ?? (ns.chapter ? "chapter" : "eq")) !== "eq";
    setPrefs({ numberStyle: next });
  };
  const parts = ns.parts ?? (ns.chapter ? "chapter" : "eq");
  const sep = ns.separator ?? ".";
  const sample = `${ns.open}${parts === "section" ? `2${sep}3${sep}` : parts === "chapter" ? `2${sep}` : ""}4${ns.close}`;
  return (
    <fieldset className="numbering-settings">
      <legend>Equation numbers <span className="muted">e.g. {sample}</span></legend>
      <label>
        Format
        <select value={parts} onChange={(e) => set({ parts: e.target.value as "eq" | "chapter" | "section" })}>
          <option value="eq">1 (equation)</option>
          <option value="chapter">1.1 (chapter.equation)</option>
          <option value="section">1.2.3 (chapter.section.equation)</option>
        </select>
      </label>
      <label>
        Brackets
        <select value={`${ns.open}${ns.close}`} onChange={(e) => set({ open: e.target.value[0] ?? "", close: e.target.value[1] ?? "" })}>
          <option value="()">( )</option>
          <option value="[]">[ ]</option>
          <option value="">none</option>
        </select>
      </label>
      {parts !== "eq" && (
        <>
          <label>
            Separator
            <select value={sep} onChange={(e) => set({ separator: e.target.value as "." | "-" })}>
              <option value=".">. (2.4)</option>
              <option value="-">- (2-4)</option>
            </select>
          </label>
          {parts === "section" && (
            <label>
              Equations restart at each
              <select value={ns.restart ?? "chapter"} onChange={(e) => set({ restart: e.target.value as "chapter" | "section" })}>
                <option value="chapter">chapter</option>
                <option value="section">section</option>
              </select>
            </label>
          )}
          <label>
            Chapter numbers from
            <select value={ns.source ?? "headings"} onChange={(e) => set({ source: e.target.value as "headings" | "markers" })}>
              <option value="headings">Word's heading numbering (Heading 1/2; appendix headings numbered A, B…)</option>
              <option value="markers">MathBlocks chapter markers (hidden, like MathType)</option>
            </select>
          </label>
        </>
      )}
      <label>
        References
        <select value={ns.references ?? "brackets"} onChange={(e) => set({ references: e.target.value as "brackets" | "number" })}>
          <option value="brackets">with brackets: (2.4)</option>
          <option value="number">number only: 2.4 (for “Eq. 2.4”)</option>
        </select>
      </label>
      <p className="hint">
        {parts !== "eq" && (ns.source ?? "headings") === "markers"
          ? "Insert a chapter marker where each chapter (or appendix) starts: Ctrl+K → “Insert equation chapter marker”. "
          : parts !== "eq"
            ? "Appendix headings numbered A, B… (Heading 1 with letter numbering) give (A.1). "
            : ""}
        New settings apply to new numbers; Ctrl+K → “Upgrade numbering” rebuilds the existing ones (references keep pointing at the same equations).
      </p>
    </fieldset>
  );
}

/** The Word preview docked under the editor (it widens with the editor); ⧉ pops it out into its own window. */
function DockedPreview() {
  const s = useApp();
  const sizePt = s.docStyle?.stored ? s.docStyle.style.global.sizePt : s.equationSizePt;
  if (!s.previewDocked)
    return (
      <div className="scroll pad">
        <p className="hint">The preview is in its own window.</p>
        <button onClick={() => void import("../lib/previewWindow").then((m) => m.dockPreview())}>Dock it here</button>
      </div>
    );
  return <PreviewView latex={s.latex} display={s.display} numbered={s.numbered} sizePt={sizePt} textWidthPt={s.textWidthPt} onPopOut={() => void import("../lib/previewWindow").then((m) => m.popOutPreview())} />;
}
