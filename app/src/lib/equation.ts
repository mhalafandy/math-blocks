import { useMemo } from "react";
import { countNodes } from "@mathblocks/math-core";
import { parseLatex, type Diagnostic } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE, type StyleProfile } from "@mathblocks/math-omml";
import { contentControl, flatOpc, formatTag, newInstanceId, paragraph, parseTag, vmlPictureRun } from "@mathblocks/ooxml";
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
      omml: toOmml(root, { display, profile, standalone: true, notation: useApp.getState().notationProfile }),
    };
  }, [latex, display, profile]);
}

/** Native Word equation (OMML) as a Flat OPC package for Range.InsertXML. */
export function buildNativeInsertion(latex: string, display: boolean, profile: StyleProfile, existingTag?: string) {
  const { root } = parseLatex(latex);
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const omml = toOmml(root, { display, profile, notation: useApp.getState().notationProfile });
  return { tag, flatOpc: flatOpc([paragraph(contentControl(omml, { tag, title: "MathBlocks equation" }))]) };
}

let pictureCounter = 0;

/**
 * Builds what the Word connector inserts: a Classic picture (default) or a native equation,
 * following the "look" preference unless `look` is given.
 */
export async function buildInsertion(
  latex: string,
  display: boolean,
  profile: StyleProfile,
  existingTag?: string,
  look = useApp.getState().look,
  /** Typeset in display style although placed inline (numbered equations). */
  typesetDisplay = display,
) {
  if (look === "native") return buildNativeInsertion(latex, display, profile, existingTag);
  const { renderPicture, toBase64, altText } = await import("./render");
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const mode = display ? "display" : typesetDisplay ? "numbered" : "inline";
  const pic = await renderPicture(latex, typesetDisplay, useApp.getState().equationSizePt, mode, false, { block: parseTag(tag)?.blockId });
  const n = ++pictureCounter;
  const run = vmlPictureRun({
    rId: "rIdMbE1",
    widthPt: pic.widthPt,
    heightPt: pic.heightPt,
    depthPt: pic.depthPt,
    id: Date.now() % 1_000_000_000 + n,
    alt: altText(latex, mode),
  });
  const cc = contentControl(run, { tag, title: "MathBlocks equation" });
  const body = display ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${cc}</w:p>` : paragraph(cc);
  return {
    tag,
    flatOpc: flatOpc([body], [{ rId: "rIdMbE1", target: `media/mathblocks${n}.emf`, contentType: "image/x-emf", base64: toBase64(pic.emf) }]),
  };
}
