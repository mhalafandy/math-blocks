/**
 * Replaces a snippet trigger before the cursor by the snippet (editor form). Self-contained (no
 * imports, only the field's methods) so the headless check (tools/snippet-check.ts) runs this
 * exact function inside the page.
 *
 * A snippet that is only a superscript or subscript (^{\T}, ^{-1}) attaches to what is before
 * the trigger (x;tp → xᵀ), instead of getting an empty base.
 */
export interface SnippetField {
  position: number;
  lastOffset: number;
  selection: unknown;
  getValue: (a: number, b: number, f: "latex") => string;
  executeCommand: (c: unknown) => boolean;
}

export function applySnippet(mf: SnippetField, positions: number, editorLatex: string): void {
  const pos = mf.position;
  mf.selection = { ranges: [[pos - positions, pos]], direction: "forward" };
  const script = /^(?:\{\})?([\^_])\{([\s\S]*)\}$/.exec(editorLatex.trim());
  if (script && pos - positions > 0) {
    mf.executeCommand("deleteBackward");
    mf.executeCommand(script[1] === "^" ? "moveToSuperscript" : "moveToSubscript");
    mf.executeCommand(["insert", script[2], { insertionMode: "replaceSelection", selectionMode: "placeholder" }]);
    // Leave the script when it holds no slot to fill.
    if (!script[2]!.includes("placeholder") && !script[2]!.includes("#?")) mf.executeCommand("moveAfterParent");
    return;
  }
  const start = pos - positions;
  mf.executeCommand(["insert", editorLatex, { insertionMode: "replaceSelection", selectionMode: "placeholder" }]);
  // Adjacent empty slots (a DCM's two frames, C_{□□}) are selected together by the editor, and
  // typing would fill both: select just the first one.
  if ((editorLatex.match(/\\placeholder|#\?/g) ?? []).length > 1) {
    for (let i = start; i < mf.lastOffset; i++) {
      if (mf.getValue(i, i + 1, "latex") === "\\placeholder{}") {
        mf.selection = { ranges: [[i, i + 1]], direction: "forward" };
        break;
      }
    }
  }
}
