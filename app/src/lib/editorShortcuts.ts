/**
 * The equation editor's keyboard shortcuts as plain data (MathType habits). editorKeys.ts adds the
 * behaviour; the palette registry reads it to show the fastest way to type each entry.
 */
export interface ShortcutDef {
  keys: string;
  label: string;
  /** LaTeX template (#0 = the selection or an empty slot, #? = empty slot). */
  insert?: string;
  /** MathLive command. */
  command?: string;
}

export const SHORTCUT_TABLE: ShortcutDef[] = [
  { keys: "Ctrl+F", label: "Fraction", insert: "\\frac{#0}{#?}" },
  { keys: "Ctrl+/", label: "Slash fraction a/b", insert: "#0/#?" },
  { keys: "Ctrl+R", label: "Square root", insert: "\\sqrt{#0}" },
  { keys: "Ctrl+Shift+R", label: "n-th root", insert: "\\sqrt[#?]{#0}" },
  { keys: "Ctrl+H", label: "Superscript", command: "moveToSuperscript" },
  { keys: "Ctrl+L", label: "Subscript", command: "moveToSubscript" },
  { keys: "Ctrl+J", label: "Subscript and superscript", insert: "#0_{#?}^{#?}" },
  { keys: "Ctrl+I", label: "Integral with limits", insert: "\\int_{#?}^{#?}#0" },
  { keys: "Ctrl+Shift+S", label: "Sum with limits", insert: "\\sum_{#?}^{#?}#0" },
  { keys: "Ctrl+9", label: "Parentheses ( )", insert: "\\left(#0\\right)" },
  { keys: "Ctrl+[", label: "Brackets [ ]", insert: "\\left[#0\\right]" },
  { keys: "Ctrl+Shift+[", label: "Braces { }", insert: "\\left\\{#0\\right\\}" },
  { keys: "Ctrl+Shift+\\", label: "Absolute value | |", insert: "\\left|#0\\right|" },
  { keys: "Ctrl+Shift+V", label: "Physical vector (notation kind)", insert: "\\pvec{#0}" },
  { keys: "Ctrl+Shift+H", label: "Hat (unit vector)", insert: "\\hat{#0}" },
  { keys: "Ctrl+Shift+D", label: "Dot (time derivative)", insert: "\\dot{#0}" },
  { keys: "Ctrl+Shift+E", label: "Double dot", insert: "\\ddot{#0}" },
  { keys: "Ctrl+Shift+O", label: "Overline (bar)", insert: "\\bar{#0}" },
  { keys: "Ctrl+Shift+M", label: "2×2 matrix in brackets", insert: "\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}" },
  { keys: "Ctrl+Shift+B", label: "Bold (vector style) on/off" },
  { keys: "Ctrl+Space", label: "Thin space", insert: "\\," },
  { keys: "Ctrl+Shift+Enter", label: "New derivation line (aligned at =, starts from the last right-hand side)" },
  { keys: "Ctrl+G, letter", label: "Greek letter (a α, b β, q θ, f φ, w ω, D Δ…)" },
  { keys: "trigger + Tab", label: "Snippet: ddt, pdv, intab, mat3, col3, norm, inv, trans… (Ctrl+K → Snippets)" },
];
