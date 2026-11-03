import { useMemo } from "react";
import { countNodes } from "@mathblocks/math-core";
import { parseLatex, type Diagnostic } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE, type StyleProfile } from "@mathblocks/math-omml";
import { contentControl, flatOpc, formatTag, newInstanceId, paragraph } from "@mathblocks/ooxml";
import { useApp } from "./store";

/** The Word style profile from the current preferences (outside React). */
export function currentProfile(): StyleProfile {
  const { profileBase, mathFont, vectorStyle } = useApp.getState();
  const base = profileBase === "tuned" ? TUNED_PROFILE : WORD_DEFAULT_PROFILE;
  return { ...base, mathFont, vectorStyle, id: `${base.id}-custom` };
}

export function useProfile(): StyleProfile {
  const profileBase = useApp((s) => s.profileBase);
  const mathFont = useApp((s) => s.mathFont);
  const vectorStyle = useApp((s) => s.vectorStyle);
  return useMemo(() => {
    const base = profileBase === "tuned" ? TUNED_PROFILE : WORD_DEFAULT_PROFILE;
    return { ...base, mathFont, vectorStyle, id: `${base.id}-custom` };
  }, [profileBase, mathFont, vectorStyle]);
}

export interface CompiledEquation {
  root: ReturnType<typeof parseLatex>["root"];
  diagnostics: Diagnostic[];
  errors: number;
  nodeCount: number;
  omml: string;
}

/** Parses the current LaTeX and produces OMML; recomputed only when inputs change. */
export function useCompiledEquation(): CompiledEquation {
  const latex = useApp((s) => s.latex);
  const display = useApp((s) => s.display);
  const profile = useProfile();
  return useMemo(() => {
    const { root, diagnostics } = parseLatex(latex);
    return {
      root,
      diagnostics,
      errors: diagnostics.filter((d) => d.severity === "error").length,
      nodeCount: countNodes(root) - 1,
      omml: toOmml(root, { display, profile, standalone: true }),
    };
  }, [latex, display, profile]);
}

/** Builds the Flat OPC package the Word connector inserts with Range.InsertXML. */
export function buildInsertion(latex: string, display: boolean, profile: StyleProfile, existingTag?: string) {
  const { root } = parseLatex(latex);
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const omml = toOmml(root, { display, profile });
  return { tag, flatOpc: flatOpc([paragraph(contentControl(omml, { tag, title: "MathBlocks equation" }))]) };
}
