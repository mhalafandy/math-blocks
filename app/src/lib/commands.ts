import { insertIntoVisual } from "../components/MathEditor";
import { useApp } from "./store";

export interface Command {
  id: string;
  title: string;
  group: "Insert" | "View" | "Word" | "Edit";
  keywords?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

/** Structure templates: #0 = current selection, #? = placeholder. */
export const STRUCTURES: { id: string; title: string; template: string; icon: string; keywords?: string }[] = [
  { id: "frac", title: "Fraction", template: "\\frac{#0}{#?}", icon: "a⁄b", keywords: "divide ratio over" },
  { id: "sup", title: "Superscript", template: "#0^{#?}", icon: "xⁿ", keywords: "power exponent" },
  { id: "sub", title: "Subscript", template: "#0_{#?}", icon: "xᵢ", keywords: "index" },
  { id: "sqrt", title: "Square root", template: "\\sqrt{#0}", icon: "√", keywords: "radical" },
  { id: "nroot", title: "Nth root", template: "\\sqrt[#?]{#0}", icon: "ⁿ√", keywords: "radical cube" },
  { id: "sum", title: "Summation", template: "\\sum_{#?}^{#?}#0", icon: "∑", keywords: "sigma series" },
  { id: "prod", title: "Product", template: "\\prod_{#?}^{#?}#0", icon: "∏", keywords: "pi" },
  { id: "int", title: "Integral", template: "\\int_{#?}^{#?}#0\\,\\mathrm{d}#?", icon: "∫", keywords: "integrate antiderivative" },
  { id: "oint", title: "Contour integral", template: "\\oint_{#?}#0\\,\\mathrm{d}#?", icon: "∮", keywords: "closed line" },
  { id: "lim", title: "Limit", template: "\\lim_{#?\\to #?}#0", icon: "lim", keywords: "limit approaches" },
  { id: "deriv", title: "Derivative", template: "\\frac{\\mathrm{d}#?}{\\mathrm{d}#?}", icon: "d/dx", keywords: "differentiate" },
  { id: "pderiv", title: "Partial derivative", template: "\\frac{\\partial #?}{\\partial #?}", icon: "∂/∂x", keywords: "partial" },
  { id: "vec", title: "Vector arrow", template: "\\vec{#0}", icon: "v⃗", keywords: "arrow accent" },
  { id: "hat", title: "Hat / unit vector", template: "\\hat{#0}", icon: "â", keywords: "unit accent" },
  { id: "dot", title: "Time derivative dot", template: "\\dot{#0}", icon: "ẋ", keywords: "newton dot accent" },
  { id: "paren", title: "Parentheses", template: "\\left(#0\\right)", icon: "( )", keywords: "brackets delimiters" },
  { id: "bmatrix", title: "Matrix 2×2", template: "\\begin{bmatrix}#? & #?\\\\ #? & #?\\end{bmatrix}", icon: "[ ]", keywords: "matrix array" },
  { id: "det", title: "Determinant 2×2", template: "\\begin{vmatrix}#? & #?\\\\ #? & #?\\end{vmatrix}", icon: "| |", keywords: "determinant" },
  { id: "cases", title: "Piecewise", template: "\\begin{cases}#? & #?\\\\ #? & #?\\end{cases}", icon: "{", keywords: "cases conditional" },
];

export function buildCommands(actions: { insertIntoWord: () => void; copyLatex: () => void; focusLatex: () => void }): Command[] {
  const app = useApp.getState();
  return [
    ...STRUCTURES.map((s): Command => ({
      id: `insert.${s.id}`,
      title: `Insert ${s.title.toLowerCase()}`,
      group: "Insert",
      keywords: s.keywords,
      run: () => {
        insertIntoVisual(s.template);
      },
    })),
    { id: "word.insert", title: "Send to Word", group: "Word", shortcut: "Ctrl+Enter", keywords: "insert export", run: actions.insertIntoWord },
    { id: "edit.copyLatex", title: "Copy LaTeX", group: "Edit", run: actions.copyLatex },
    { id: "edit.focusLatex", title: "Switch to LaTeX editor", group: "Edit", shortcut: "Ctrl+L", keywords: "latex mode source", run: actions.focusLatex },
    { id: "view.split", title: "Layout: visual + LaTeX", group: "View", run: () => app.setPrefs({ mode: "split" }) },
    { id: "view.visual", title: "Layout: visual only", group: "View", run: () => app.setPrefs({ mode: "visual" }) },
    { id: "view.latex", title: "Layout: LaTeX only", group: "View", run: () => app.setPrefs({ mode: "latex" }) },
    { id: "view.theme.light", title: "Theme: light", group: "View", run: () => app.setPrefs({ theme: "light" }) },
    { id: "view.theme.dark", title: "Theme: dark", group: "View", run: () => app.setPrefs({ theme: "dark" }) },
    { id: "view.theme.system", title: "Theme: follow system", group: "View", run: () => app.setPrefs({ theme: "system" }) },
    { id: "edit.display", title: "Toggle display / inline equation", group: "Edit", run: () => app.setDisplay(!useApp.getState().display) },
  ];
}
