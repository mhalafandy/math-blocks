/**
 * Generates the M1 spike documents in fixtures/spike/.
 *
 * Open them in Word 2016+ to validate, without any add-in installed:
 *  1. our OMML writer produces native, editable Word equations;
 *  2. how each Style Profile / math font looks (visual comparison);
 *  3. content-control tags survive save, close and reopen, and what copy-paste does to them.
 *
 * Run: pnpm spike:docx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLatex } from "@mathblocks/math-latex";
import { toOmml, TUNED_PROFILE, WORD_DEFAULT_PROFILE, withFont, escapeXml, type StyleProfile } from "@mathblocks/math-omml";
import {
  buildDocx,
  contentControl,
  formatTag,
  heading,
  newBlockId,
  newInstanceId,
  paragraph,
  randomId,
  textRun,
  type SdtLock,
} from "@mathblocks/ooxml";
import { REFERENCE_EQUATIONS } from "../fixtures/reference-equations";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "spike");
const REGISTRY_NS = "urn:mathblocks:registry:v1";

interface Variant {
  file: string;
  profile: StyleProfile;
  note: string;
}

const VARIANTS: Variant[] = [
  { file: "m1-A-word-default.docx", profile: WORD_DEFAULT_PROFILE, note: "Exactly what Word produces by default (Cambria Math, default spacing)." },
  { file: "m1-B-tuned-cambria.docx", profile: TUNED_PROFILE, note: "Tuned matrix/derivation spacing, Cambria Math." },
  { file: "m1-C-tuned-latin-modern.docx", profile: withFont(TUNED_PROFILE, "Latin Modern Math"), note: "Tuned spacing, Latin Modern Math (LaTeX look). Font must be installed." },
  { file: "m1-D-tuned-stix-two.docx", profile: withFont(TUNED_PROFILE, "STIX Two Math"), note: "Tuned spacing, STIX Two Math (Times-like). Font must be installed." },
  { file: "m1-E-tuned-bold-vectors.docx", profile: { ...TUNED_PROFILE, id: "tuned-bold-vectors", name: "Tuned, bold vectors", vectorStyle: "bold" }, note: "Tuned spacing, vectors drawn bold upright instead of arrows." },
];

interface Placed {
  instanceId: string;
  blockId: string | null;
  latex: string;
}

function build(v: Variant): Uint8Array {
  const p: string[] = [];
  const placed: Placed[] = [];
  const grey = { color: "7F7F7F", size: 18 } as const;

  const equation = (latex: string, display: boolean, opts: { blockId?: string | null; title?: string; lock?: SdtLock } = {}) => {
    const { root } = parseLatex(latex);
    const instanceId = newInstanceId();
    const blockId = opts.blockId ?? null;
    placed.push({ instanceId, blockId, latex });
    const omml = toOmml(root, { display, profile: v.profile });
    const ccOpts: Parameters<typeof contentControl>[1] = { tag: formatTag({ blockId, instanceId }), lock: opts.lock ?? "unlocked" };
    if (opts.title) ccOpts.title = opts.title;
    return contentControl(omml, ccOpts);
  };

  p.push(paragraph(textRun(`MathBlocks M1 spike — ${v.profile.name}`, { bold: true, size: 36 })));
  p.push(paragraph(textRun(v.note, { italic: true })));
  p.push(paragraph(textRun(`Generated ${new Date().toISOString().slice(0, 10)} · Style profile "${v.profile.id}" · Math font "${v.profile.mathFont}"`, grey)));

  p.push(heading("1. What to check", 1));
  for (const line of [
    "A. Every equation below is a native Word equation: click it and Word's Equation tab appears; you can edit it.",
    "B. Compare the look of this file with the other m1-*.docx files (matrices, vectors, integrals, derivations).",
    "C. Developer tab → Design Mode shows the content controls (equation wrappers) and their tags.",
    "D. Section 3: save, close and reopen, then check the tags are unchanged; copy-paste a linked equation and look at its tag.",
    "E. Report anything that looks wrong, does not open, or shows red text (= input our converter could not read).",
  ]) p.push(paragraph(textRun(line)));

  p.push(heading("2. Reference equations", 1));
  let lastCategory = "";
  for (const eq of REFERENCE_EQUATIONS.filter((e) => e.display)) {
    if (eq.category !== lastCategory) {
      p.push(heading(eq.category, 2));
      lastCategory = eq.category;
    }
    p.push(paragraph(textRun(`${eq.title}  `, { bold: true }) + textRun(eq.latex, { ...grey, font: "Consolas" })));
    p.push(paragraph(equation(eq.latex, true)));
  }

  p.push(heading("Inline equations", 2));
  p.push(
    paragraph(
      textRun("The kinetic energy ") +
        equation("E_k = \\tfrac{1}{2} m v^2", false) +
        textRun(" of a body of mass ") +
        equation("m", false) +
        textRun(" moving at speed ") +
        equation("v", false) +
        textRun(" grows with the square of ") +
        equation("v", false) +
        textRun(", while the vis-viva relation ") +
        equation("v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)", false) +
        textRun(" holds on any Keplerian orbit."),
    ),
  );

  p.push(heading("3. Content-control tests", 1));
  const newton = newBlockId();
  p.push(paragraph(textRun("3a. Two instances of the same linked block “Newton's second law” (same block ID, different instance IDs):")));
  p.push(paragraph(equation("\\vec{F} = m\\vec{a}", true, { blockId: newton, title: "Newton's second law" })));
  p.push(paragraph(equation("\\vec{F} = m\\vec{a}", true, { blockId: newton, title: "Newton's second law" })));
  p.push(paragraph(textRun("3b. A content-locked equation. Word should refuse to edit it, but allow selecting and copying:")));
  p.push(paragraph(equation("\\ddot{\\vec{r}} = -\\frac{\\mu}{r^3}\\vec{r}", true, { title: "Locked: two-body equation", lock: "contentLocked" })));
  p.push(paragraph(textRun("3c. Copy the first Newton equation and paste it here, then check the pasted control's tag in Design Mode → Properties:")));
  p.push(paragraph(""));

  p.push(heading("4. Tag list (for checking after reopen)", 1));
  for (const pl of placed) {
    p.push(paragraph(textRun(`${formatTag(pl)}   ${pl.latex.slice(0, 60)}`, { ...grey, font: "Consolas" })));
  }

  const registry =
    `<mb:registry xmlns:mb="${REGISTRY_NS}" schemaVersion="1" docId="${randomId(16)}">` +
    `<mb:blocks><mb:block id="${newton}" name="Newton's second law" version="1"><mb:latex>${escapeXml("\\vec{F} = m\\vec{a}")}</mb:latex></mb:block></mb:blocks>` +
    `<mb:equations>${placed.map((pl) => `<mb:eq id="${pl.instanceId}"${pl.blockId ? ` blockId="${pl.blockId}"` : ""}><mb:latex>${escapeXml(pl.latex)}</mb:latex></mb:eq>`).join("")}</mb:equations>` +
    `</mb:registry>`;

  return buildDocx({ paragraphs: p, mathFont: v.profile.mathFont, customXml: [{ namespace: REGISTRY_NS, xml: registry }] });
}

mkdirSync(OUT, { recursive: true });
for (const v of VARIANTS) {
  writeFileSync(join(OUT, v.file), build(v));
  console.log(`wrote fixtures/spike/${v.file}`);
}
