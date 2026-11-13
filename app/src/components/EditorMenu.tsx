import type { MathfieldElement } from "mathlive";
import { KIND_BY_ID, KINDS } from "@mathblocks/math-core";
import { openMenu, type MenuItem } from "./ContextMenu";
import { convertKindToPlain, letterAt, makeKindFromSelection } from "./MathEditor";
import { explainSymbol, kindDisplayName, type MathStyle, type SymbolContext, type SymbolRule } from "@mathblocks/math-core";
import { symbolContextAt } from "../lib/kindHover";
import { describeRule, ruleFromLatex, TOKEN_KIND_CHOICES, wrapperKindChoices } from "../lib/symbolRules";
import { activeStyle, userDefaultStyle } from "../lib/docStyle";
import { useApp } from "../lib/store";
import { kindAt, type KindField } from "../lib/kindExit";

/** Kinds a selection can be made into (one symbol argument). */
const makeable = () => KINDS.filter((k) => k.args === 1 && k.id !== "diff" && k.id !== "frm");

/** The equation editor's right-click menu. */
export function openEditorMenu(mf: MathfieldElement, e: MouseEvent) {
  // The caret goes where the click was (a selection stays as it is).
  if (mf.selectionIsCollapsed) {
    try {
      const off = mf.getOffsetFromPoint(e.clientX, e.clientY);
      if (off >= 0) mf.position = off;
    } catch {
      // Keep the caret.
    }
  }
  mf.focus();
  // The letter under the pointer (before the caret moved): its kind can be set here.
  const hit = letterAt(mf, e.clientX, e.clientY);
  const sym = hit ? symbolContextAt(mf, hit.offset) : null;
  const k = kindAt(mf as unknown as KindField);
  const def = k ? KIND_BY_ID.get(k.id) : undefined;
  const at = { clientX: e.clientX, clientY: e.clientY, preventDefault: () => undefined };
  const items: MenuItem[] = [];
  if (def) {
    items.push(
      { label: `${def.name}: edit kind style…`, onSelect: () => void import("./NotationSettings").then((m) => m.openNotationSettings(def.id)) },
      { label: "Convert to plain (hand-styled)", onSelect: () => void convertKindToPlain() },
      { separator: true, label: "" },
    );
  }
  if (sym && !sym.inKind) {
    const now = explainSymbol(sym, activeStyle());
    items.push(
      {
        label: `Kind of ${sym.label}: ${kindDisplayName(now.kind)} ▸`,
        onSelect: () =>
          openMenu(at, [
            { label: now.reason, disabled: true },
            { separator: true, label: "" },
            ...[...TOKEN_KIND_CHOICES, ...wrapperKindChoices()].map((c) => ({ label: `→ ${c.name}`, onSelect: () => openMenu(at, scopeItems(mf, hit!.offset, sym, c.id)) })),
          ]),
      },
      { label: `Define ${sym.label}… (meaning and unit, for the list of symbols)`, onSelect: () => void import("./SymbolList").then((m) => m.openDefineSymbol({ symbol: sym.sub ? `${latexOfLetter(sym.text)}_{${sym.sub}}` : sym.bold ? `\\boldsymbol{${latexOfLetter(sym.text)}}` : latexOfLetter(sym.text) })) },
      { separator: true, label: "" },
    );
  }
  items.push(
    {
      label: mf.selectionIsCollapsed ? "Make the symbol before the cursor a kind…" : "Make the selection a kind…",
      onSelect: () => openMenu(at, makeable().map((x) => ({ label: `Make → ${x.name}`, onSelect: () => void makeKindFromSelection(x.id) }))),
    },
    { label: "Notation settings…", onSelect: () => void import("./NotationSettings").then((m) => m.openNotationSettings(def?.id ?? null)) },
    { separator: true, label: "" },
    ...(mf.selectionIsCollapsed
      ? []
      : [{ label: "Define the selection as a symbol… (list of symbols)", onSelect: () => void import("./MathEditor").then((m) => import("./SymbolList").then((sl) => sl.openDefineSymbol({ symbol: m.editorSelectionLatex() ?? "" }))) }]),
    { label: mf.selectionIsCollapsed ? "Save the equation as a block…" : "Save the selection as a block…", onSelect: () => void import("./BlocksPanel").then((m) => m.saveSelectionAsBlock()) },
  );
  openMenu(at, items);
}

/** Where a kind is set: this occurrence (its macro), this document (a rule), every document (my default). */
function scopeItems(mf: MathfieldElement, offset: number, sym: SymbolContext & { label: string }, kind: string): MenuItem[] {
  const def = KINDS.find((x) => x.id === kind || x.token === kind);
  const symbolLatex = sym.sub ? `${latexOfLetter(sym.text)}_{${sym.sub}}` : latexOfLetter(sym.text);
  const rule = ruleFromLatex(sym.bold ? `\\boldsymbol{${symbolLatex}}` : symbolLatex, kind, sym.where === "index" ? { where: "index" } : {});
  const addRule = (s: MathStyle): MathStyle => (rule ? { ...s, symbols: [...s.symbols.filter((r) => !(r.text === rule.text && (r.sub ?? "") === (rule.sub ?? "") && JSON.stringify(r.when ?? {}) === JSON.stringify(rule.when ?? {}))), rule] } : s);
  return [
    {
      label: def ? `This occurrence only (writes \\${def.macro}{…})` : "This occurrence only (no macro for this kind)",
      disabled: !def,
      onSelect: () => {
        mf.selection = { ranges: [[offset - 1, offset]], direction: "forward" };
        void makeKindFromSelection(def!.id);
      },
    },
    {
      label: `In this document: ${rule ? describeRuleFor(rule) : ""}`,
      disabled: !rule,
      onSelect: async () => {
        const app = useApp.getState();
        try {
          if (!app.connector.connected) {
            app.setPrefs({ defaultStyle: addRule(activeStyle()) });
            app.notify("Word is not connected: the rule is in your default style (for new documents).");
            return;
          }
          const { restyleDocument } = await import("../lib/styleRun");
          const r = await restyleDocument(addRule(activeStyle()));
          app.notify(`Rule added to this document${r.equations ? `; redrew ${r.equations} equation(s) (one Ctrl+Z in Word)` : ""}.`);
        } catch (err) {
          app.notify(err instanceof Error ? err.message : String(err), "error");
        }
      },
    },
    {
      label: "In every new document (my default style)",
      disabled: !rule,
      onSelect: () => {
        const app = useApp.getState();
        app.setPrefs({ defaultStyle: addRule(userDefaultStyle()) });
        app.notify("Rule added to your default style.");
      },
    },
  ];
}

const GREEK_NAMES: Record<string, string> = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", π: "pi", ρ: "rho", σ: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega", Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Υ: "Upsilon", Φ: "Phi", Ψ: "Psi", Ω: "Omega", ϑ: "vartheta", ϕ: "varphi", ϵ: "varepsilon", ϱ: "varrho", ς: "varsigma", ϖ: "varpi" };
const latexOfLetter = (t: string) => (GREEK_NAMES[t] ? `\\${GREEK_NAMES[t]}` : t);
const describeRuleFor = (r: SymbolRule) => `${r.symbol} is a ${describeRule(r)}`;
