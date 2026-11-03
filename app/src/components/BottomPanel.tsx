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
  { id: "details", label: "Library" },
  { id: "symbols", label: "Symbols" },
  { id: "structure", label: "Structure" },
  { id: "style", label: "Word style" },
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
          {tab === "details" && <div className="scroll pad"><DetailsPanel /></div>}
          {tab === "symbols" && <div className="scroll pad"><SymbolsPanel /></div>}
          {tab === "structure" && <div className="scroll pad"><StructureTree root={eq.root} /></div>}
          {tab === "style" && <div className="scroll pad"><StylePanel /></div>}
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

function StylePanel() {
  const profileBase = useApp((s) => s.profileBase);
  const mathFont = useApp((s) => s.mathFont);
  const vectorStyle = useApp((s) => s.vectorStyle);
  const numberStyle = useApp((s) => s.numberStyle);
  const look = useApp((s) => s.look);
  const sizePt = useApp((s) => s.equationSizePt);
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const setPrefs = useApp((s) => s.setPrefs);
  const numberKey = `${numberStyle.open}${numberStyle.chapter ? "c" : ""}${numberStyle.close}`;
  return (
    <div className="form narrow">
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
            <select value={sizePt} onChange={(e) => setPrefs({ equationSizePt: Number(e.target.value) })}>
              {[10, 10.5, 11, 12, 14, 16].map((n) => (
                <option key={n} value={n}>
                  {n} pt{n === 12 ? " (MathType default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <ClassicPreview latex={latex} display={display} sizePt={sizePt} />
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
      <label>
        Equation numbers
        <select
          value={numberKey}
          onChange={(e) => {
            const v = e.target.value;
            const open = v.startsWith("[") ? "[" : v.startsWith("(") ? "(" : "";
            const close = v.endsWith("]") ? "]" : v.endsWith(")") ? ")" : "";
            setPrefs({ numberStyle: { open, close, chapter: v.includes("c") } });
          }}
        >
          <option value="()">(1)</option>
          <option value="(c)">(2.1): chapter number first</option>
          <option value="[]">[1]</option>
          <option value="[c]">[2.1]: chapter number first</option>
          <option value="">1</option>
        </select>
      </label>
      <p className="hint">Chapter numbers come from your numbered Heading 1 and restart in each chapter. Existing numbers keep their look; press Update numbers in Word after changes.</p>
      <p className="hint">Fonts other than Cambria Math must be installed on every PC that opens the document.</p>
    </div>
  );
}
