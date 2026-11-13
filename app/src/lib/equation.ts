import { useMemo } from "react";
import { countNodes } from "@mathblocks/math-core";
import { parseLatex, type Diagnostic } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE, type StyleProfile } from "@mathblocks/math-omml";
import { compObjStream, objInfoStream, contentControl, flatOpc, formatTag, newInstanceId, oleObjectRun, oleStream, paragraph, parseTag, REL_OLE_OBJECT, vmlPictureRun, writeCfb } from "@mathblocks/ooxml";
import { useApp } from "./store";
import { activeStyle, activeStyleHash } from "./docStyle";

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
  const docStyle = useApp((s) => s.docStyle);
  const notation = useApp((s) => s.notationProfile);
  return useMemo(() => {
    const { root, diagnostics } = parseLatex(latex);
    return {
      root,
      diagnostics,
      errors: diagnostics.filter((d) => d.severity === "error").length,
      nodeCount: countNodes(root) - 1,
      omml: toOmml(root, { display, profile, standalone: true, mathStyle: activeStyle() }),
    };
  }, [latex, display, profile, docStyle, notation]);
}

/** Native Word equation (OMML) as a Flat OPC package for Range.InsertXML. */
export function buildNativeInsertion(latex: string, display: boolean, profile: StyleProfile, existingTag?: string) {
  const { root } = parseLatex(latex);
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const omml = toOmml(root, { display, profile, mathStyle: activeStyle() });
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
  // Classic: an embedded MathBlocks object, as MathType stores its equations (Word keeps it as an
  // object, with the simple frame, through copy and paste; its data holds the full source).
  const { tag, flatOpc } = await buildObjectInsertion(latex, display, existingTag, typesetDisplay);
  return { tag, flatOpc };
}

/**
 * A Classic equation as a plain VML picture (the form before embedded objects): kept for older
 * documents' tests and comparisons; new equations are objects (buildInsertion).
 */
export async function buildPictureInsertion(
  latex: string,
  display: boolean,
  existingTag?: string,
  /** Typeset in display style although placed inline (numbered equations). */
  typesetDisplay = display,
) {
  const { renderPicture, toBase64, altText } = await import("./render");
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const mode = display ? "display" : typesetDisplay ? "numbered" : "inline";
  const pic = await renderPicture(latex, typesetDisplay, activeStyle().global.sizePt, mode, false, { block: parseTag(tag)?.blockId, tag });
  const n = ++pictureCounter;
  const run = vmlPictureRun({
    rId: "rIdMbE1",
    widthPt: pic.widthPt,
    heightPt: pic.heightPt,
    depthPt: pic.depthPt,
    id: Date.now() % 1_000_000_000 + n,
    alt: altText(latex, mode, tag),
    // The picture is the equation: its ID is its title (no content control around it).
    title: tag,
  });
  const body = display ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run}</w:p>` : paragraph(run);
  return {
    tag,
    flatOpc: flatOpc([body], [{ rId: "rIdMbE1", target: `media/mathblocks${n}.emf`, contentType: "image/x-emf", base64: toBase64(pic.emf) }]),
  };
}

// ------------------------------------------------------------------ embedded object (spike)

/** Class of the MathBlocks embedded object (spike; not registered on the PC). */
export const MB_OBJECT_CLSID = "{B1E5A2C4-6D3F-4E8A-9C21-7F4D0A6B3E15}";
export const MB_OBJECT_PROGID = "MathBlocks.Equation.1";

/** What the object's own "MathBlocks" stream holds: enough to recover the equation from the object alone. */
export interface ObjectData {
  version: 1;
  latex: string;
  mode: "display" | "inline" | "numbered";
  tag: string;
  depthPt: number;
  widthPt: number;
  heightPt: number;
  sizePt: number;
  style: string;
  /** Fingerprint of the document style it was drawn in (Check style lists drawings in an older style). */
  styleHash?: string;
  block: string | null;
}

/**
 * A Classic equation as an embedded OLE object, as MathType stores its equations: the cached
 * picture (our Classic EMF) in the VML shape, the data in the object's compound file. Spike only:
 * used by the Word self-test in its own test documents.
 */
export async function buildObjectInsertion(
  latex: string,
  display: boolean,
  existingTag?: string,
  typesetDisplay = display,
  /** Replace in place: the object's run only, the paragraph keeps its own alignment (Repair conversion). */
  o: { keepParagraph?: boolean; mode?: "display" | "inline" | "numbered" } = {},
) {
  const { renderPicture, toBase64, altText } = await import("./render");
  const tag = existingTag ?? formatTag({ blockId: null, instanceId: newInstanceId() });
  const mode = o.mode ?? (display ? "display" : typesetDisplay ? "numbered" : "inline");
  const sizePt = activeStyle().global.sizePt;
  const pic = await renderPicture(latex, typesetDisplay, sizePt, mode, false, { block: parseTag(tag)?.blockId, tag });
  const { CLASSIC } = await import("@mathblocks/math-render");
  const data: ObjectData = { version: 1, latex, mode, tag, depthPt: pic.depthPt, widthPt: pic.widthPt, heightPt: pic.heightPt, sizePt, style: CLASSIC.id, styleHash: activeStyleHash(), block: parseTag(tag)?.blockId ?? null };
  const bin = objectBin(data);
  const n = ++pictureCounter;
  const run = oleObjectRun({ imageRId: "rIdMbE1", oleRId: "rIdMbO1", progId: MB_OBJECT_PROGID, widthPt: pic.widthPt, heightPt: pic.heightPt, depthPt: pic.depthPt, id: (Date.now() % 1_000_000) * 10 + (n % 10), alt: altText(latex, mode, tag) });
  const body = display && !o.keepParagraph ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run}</w:p>` : paragraph(run);
  return {
    tag,
    data,
    flatOpc: flatOpc(
      [body],
      [
        { rId: "rIdMbE1", target: `media/mathblocks${n}.emf`, contentType: "image/x-emf", base64: toBase64(pic.emf) },
        { rId: "rIdMbO1", target: `embeddings/mathblocks${n}.bin`, contentType: "application/vnd.openxmlformats-officedocument.oleObject", base64: toBase64(bin), relType: REL_OLE_OBJECT },
      ],
    ),
  };
}

/** The compound file of a MathBlocks object holding this data (as MathType's objects are laid out). */
export function objectBin(data: ObjectData): Uint8Array {
  return writeCfb(
    {
      "\u0001Ole": oleStream(),
      "\u0003ObjInfo": objInfoStream(),
      "\u0001CompObj": compObjStream("MathBlocks Equation", MB_OBJECT_PROGID, MB_OBJECT_CLSID),
      MathBlocks: new TextEncoder().encode(JSON.stringify(data)),
    },
    MB_OBJECT_CLSID,
  );
}

/** The data of a MathBlocks object read back from its compound file (base64), or null. */
export async function readObjectData(base64: string | null | undefined): Promise<ObjectData | null> {
  if (!base64) return null;
  try {
    const { readCfb } = await import("@mathblocks/mathtype");
    const bytes = Uint8Array.from(atob(base64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    const s = readCfb(bytes).get("MathBlocks");
    return s ? (JSON.parse(new TextDecoder().decode(s.data)) as ObjectData) : null;
  } catch {
    return null;
  }
}

/**
 * The MathType control object for the spike: a synthetic Equation.DSMT4 object (a²+b²=c², built by
 * @mathblocks/mathtype from generic MTEF — no user content), with our own drawing of it as its cached
 * picture (an EMF without the MathBlocks source, so it is never taken for a MathBlocks equation).
 */
export async function buildMathTypeControlInsertion() {
  const { syntheticMathTypeObject, SYNTHETIC_EQUATIONS } = await import("@mathblocks/mathtype");
  const { renderEmf, renderSvg } = await import("@mathblocks/math-render");
  const { loadFonts, classicStyle, toBase64 } = await import("./render");
  const sizePt = useApp.getState().equationSizePt;
  const r = renderSvg(parseLatex(SYNTHETIC_EQUATIONS.pythagoras.latex).root, { fonts: await loadFonts(), style: classicStyle(), display: false, sizePt });
  const emf = renderEmf(r);
  const n = ++pictureCounter;
  const run = oleObjectRun({ imageRId: "rIdMtW1", oleRId: "rIdMtO1", progId: "Equation.DSMT4", widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt, id: (Date.now() % 1_000_000) * 10 + (n % 10), alt: "" });
  return flatOpc(
    [paragraph(run)],
    [
      { rId: "rIdMtW1", target: `media/mathtype${n}.emf`, contentType: "image/x-emf", base64: toBase64(emf) },
      { rId: "rIdMtO1", target: `embeddings/mathtype${n}.bin`, contentType: "application/vnd.openxmlformats-officedocument.oleObject", base64: toBase64(syntheticMathTypeObject("pythagoras")), relType: REL_OLE_OBJECT },
    ],
  );
}
