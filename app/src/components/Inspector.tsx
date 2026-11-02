import type { MathNode, Row } from "@mathblocks/math-core";
import { childRows } from "@mathblocks/math-core";
import type { CompiledEquation } from "../lib/equation";
import { useApp, type InspectorTab } from "../lib/store";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "style", label: "Word style" },
  { id: "omml", label: "OMML" },
];

export function Inspector({ eq }: { eq: CompiledEquation }) {
  const tab = useApp((s) => s.inspectorTab);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setPrefs({ inspectorTab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "structure" && <StructureTree root={eq.root} />}
        {tab === "style" && <StylePanel />}
        {tab === "omml" && <pre className="code">{eq.omml}</pre>}
      </div>
    </aside>
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
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <div className="form">
      <p className="hint">How equations look when inserted into Word as native equations.</p>
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
        <select value={vectorStyle} onChange={(e) => setPrefs({ vectorStyle: e.target.value as "arrow" | "bold" | "bold-italic" })}>
          <option value="arrow">Arrow accent (v⃗)</option>
          <option value="bold">Bold upright (𝐯)</option>
          <option value="bold-italic">Bold italic (𝒗)</option>
        </select>
      </label>
      <p className="hint">Fonts other than Cambria Math must be installed on every PC that opens the document.</p>
    </div>
  );
}
