import { convertLatexToMathMl } from "mathlive/ssr";
import { isDesktop } from "./connector";
import { useApp } from "./store";

/**
 * Export (M10): the current equation as MathML, SVG or PNG; a Word document's equations as a
 * LaTeX file. SVG comes from MathJax (bundled in public/mathjax, offline) with the New Computer
 * Modern font, i.e. LaTeX quality.
 */

/** LaTeX as MathJax understands it (MathBlocks dialect → standard LaTeX). */
export function toStandardLatex(latex: string) {
  return latex.replace(/\\placeholder(\[[^\]]*\])?\{\}/g, "\\square").replace(/\\differentialD/g, "\\mathrm{d}").replace(/\\exponentialE/g, "\\mathrm{e}").replace(/\\imaginaryI/g, "\\mathrm{i}").replace(/\\imaginaryJ/g, "\\mathrm{j}");
}

interface MathJaxApi {
  tex2svgPromise: (latex: string, o: { display: boolean }) => Promise<HTMLElement>;
  startup: { promise: Promise<void> };
}

let mathjax: Promise<MathJaxApi> | null = null;

function loadMathJax(): Promise<MathJaxApi> {
  if (mathjax) return mathjax;
  mathjax = new Promise((resolve, reject) => {
    const w = window as unknown as { MathJax?: unknown };
    w.MathJax = {
      loader: { paths: { "mathjax-newcm": "/mathjax/newcm" } },
      tex: {
        macros: {
          overrightharpoon: ["\\overset{\\rightharpoonup}{#1}", 1],
          overleftharpoon: ["\\overset{\\leftharpoonup}{#1}", 1],
        },
      },
      output: { font: "mathjax-newcm", fontCache: "local" },
      // No accessibility extensions (speech worker etc.): only rendering is needed, offline.
      options: {
        enableEnrichment: false,
        enableSpeech: false,
        enableBraille: false,
        enableExplorer: false,
        menuOptions: { settings: { enrich: false, speech: false, braille: false, assistiveMml: false, collapsible: false } },
      },
      startup: { typeset: false },
    };
    const s = document.createElement("script");
    s.src = "/mathjax/tex-svg.js";
    s.async = true;
    s.onload = () => {
      const api = (window as unknown as { MathJax: MathJaxApi }).MathJax;
      api.startup.promise.then(() => resolve(api), reject);
    };
    s.onerror = () => reject(new Error("Could not load MathJax"));
    document.head.appendChild(s);
  });
  mathjax.catch(() => (mathjax = null));
  return mathjax;
}

/** Self-contained SVG of the equation (black, transparent background). */
export async function equationSvg(latex: string, display: boolean): Promise<string> {
  const mj = await loadMathJax();
  const node = await mj.tex2svgPromise(toStandardLatex(latex), { display });
  const svg = node.querySelector("svg");
  if (!svg) throw new Error("MathJax produced no SVG");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("color", "#000");
  svg.style.color = "#000";
  return svg.outerHTML.replace(/currentColor/g, "#000");
}

/** PNG of the equation at `scale` × its natural size (ex units are about 8 px). */
export async function equationPng(latex: string, display: boolean, scale = 4): Promise<Blob> {
  const svg = await equationSvg(latex, display);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const ex = 8;
  const w = parseFloat(doc.getAttribute("width") ?? "10") * ex;
  const h = parseFloat(doc.getAttribute("height") ?? "10") * ex;
  doc.setAttribute("width", `${w}px`);
  doc.setAttribute("height", `${h}px`);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not render the image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG encoding failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function equationMathMl(latex: string, display: boolean) {
  const inner = convertLatexToMathMl(toStandardLatex(latex));
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ""}>${inner}</math>`;
}

// ------------------------------------------------------------------ actions

const notify = (text: string, kind: "info" | "error" = "info") => useApp.getState().notify(text, kind);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function copyMathMl() {
  const { latex, display } = useApp.getState();
  try {
    await navigator.clipboard.writeText(equationMathMl(latex, display));
    notify("MathML copied: paste it into Word, LibreOffice or a web page");
  } catch (e) {
    notify(errorText(e), "error");
  }
}

export async function copyImage() {
  const { latex, display } = useApp.getState();
  try {
    const png = await equationPng(latex, display);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    notify("Image copied (PNG, LaTeX quality)");
  } catch (e) {
    notify(errorText(e), "error");
  }
}

/** Saves bytes to a file the user picks (desktop) or downloads it (browser). */
export async function saveFile(name: string, ext: string, data: Uint8Array | string, mime: string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isDesktop()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ title: `Save ${ext.toUpperCase()}`, defaultPath: `${name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("export_write", bytes, { headers: { "x-path": encodeURIComponent(path) } });
    return path;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  a.download = `${name}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
  return a.download;
}

async function currentName() {
  const { useLibrary } = await import("./library/useLibrary");
  const lib = useLibrary.getState();
  const q = lib.open ? lib.equations.find((x) => x.id === lib.open!.id) : undefined;
  return (q?.name ?? "equation").replace(/[\\/:*?"<>|]/g, "_");
}

export async function saveSvg() {
  const { latex, display } = useApp.getState();
  try {
    const path = await saveFile(await currentName(), "svg", await equationSvg(latex, display), "image/svg+xml");
    if (path) notify(`Saved ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    notify(errorText(e), "error");
  }
}

export async function savePng() {
  const { latex, display } = useApp.getState();
  try {
    const png = new Uint8Array(await (await equationPng(latex, display)).arrayBuffer());
    const path = await saveFile(await currentName(), "png", png, "image/png");
    if (path) notify(`Saved ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    notify(errorText(e), "error");
  }
}

// ------------------------------------------------------------------ document → LaTeX

export interface ExportedEquation {
  latex: string;
  display: boolean;
  number?: string | null;
  page?: number;
}

/** A compilable LaTeX file with the equations in document order. */
export function documentToLatex(name: string, equations: ExportedEquation[]): string {
  const lines = [
    `% Equations of “${name}”, exported by MathBlocks on ${new Date().toISOString().slice(0, 10)}`,
    "\\documentclass{article}",
    "\\usepackage{amsmath,amssymb,bm}",
    "\\providecommand{\\overrightharpoon}[1]{\\overset{\\rightharpoonup}{#1}}",
    "\\providecommand{\\overleftharpoon}[1]{\\overset{\\leftharpoonup}{#1}}",
    "\\begin{document}",
    "",
  ];
  for (const e of equations) {
    const body = toStandardLatex(e.latex);
    const where = e.page ? `% page ${e.page}` : "";
    if (e.number) {
      const n = e.number.replace(/^[([]|[)\]]$/g, "");
      lines.push(where, "\\begin{equation}", `  ${body}`, `  \\tag{${n}}\\label{eq:${n.replace(/[^\w.:-]/g, "")}}`, "\\end{equation}", "");
    } else if (e.display) lines.push(where, "\\[", `  ${body}`, "\\]", "");
    else lines.push(`${where ? `${where}: ` : "% "}inline: $${body}$`, "");
  }
  lines.push("\\end{document}", "");
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export async function exportDocumentLatex() {
  if (!useApp.getState().connector.connected) return notify("Word is not connected.", "error");
  try {
    const { buildDocumentIndex } = await import("./symbolIndex");
    const { connector } = await import("./connector");
    const index = await buildDocumentIndex();
    const numbers = new Map<string, string>();
    try {
      const r = await connector.request("listNumbered", { document: index.document }, 120_000);
      for (const e of r.equations) if (e.tag) numbers.set(e.tag, e.number);
    } catch {
      // Old add-in: export without numbers.
    }
    const tex = documentToLatex(
      index.name,
      index.equations.map((e) => ({ latex: e.latex, display: e.display || numbers.has(e.tag), number: numbers.get(e.tag) ?? null, page: e.page })),
    );
    const path = await saveFile(index.name.replace(/\.\w+$/, "") + " equations", "tex", tex, "application/x-tex");
    if (path) notify(`Exported ${index.equations.length} equation(s) to ${path.split(/[\\/]/).pop()}`);
  } catch (e) {
    notify(errorText(e), "error");
  }
}
