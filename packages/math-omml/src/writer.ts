import type { AccentKind, MathNode, MathVariant, Matrix, MatrixKind, Row } from "@mathblocks/math-core";
import { isRunNode } from "@mathblocks/math-core";
import { TUNED_PROFILE, type StyleProfile } from "./style";
import { el, NS_M, NS_W, val } from "./xml";

export interface OmmlOptions {
  profile?: StyleProfile;
  /** Display equation (own line, <m:oMathPara>) or inline (<m:oMath>). */
  display?: boolean;
  /** Add xmlns declarations on the root element (for standalone use). */
  standalone?: boolean;
}

export const INTEGRALS = new Set(["∫", "∬", "∭", "∮", "∯", "∰"]);

export const ACCENT_CHARS: Record<Exclude<AccentKind, "overline" | "underline">, string> = {
  hat: "̂",
  widehat: "̂",
  bar: "̅",
  vec: "⃗",
  overrightarrow: "⃗",
  overleftarrow: "⃖",
  overrightharpoon: "\u20D1",
  overleftharpoon: "\u20D0",
  dot: "̇",
  ddot: "̈",
  dddot: "⃛",
  tilde: "̃",
  widetilde: "̃",
  check: "̌",
  breve: "̆",
};

export const SPACE_CHARS: Record<string, string> = {
  thin: " ",
  medium: " ",
  thick: " ",
  quad: " ",
  qquad: "  ",
  nbsp: " ",
  negthin: "",
};

export const MATRIX_DELIMS: Record<MatrixKind, [string, string] | null> = {
  matrix: null,
  smallmatrix: null,
  pmatrix: ["(", ")"],
  bmatrix: ["[", "]"],
  Bmatrix: ["{", "}"],
  vmatrix: ["|", "|"],
  Vmatrix: ["‖", "‖"],
};

/** OMML m:sty / m:scr values for a font variant. */
function variantProps(v: MathVariant): { sty?: string; scr?: string } {
  switch (v) {
    case "normal":
      return { sty: "p" };
    case "italic":
      return { sty: "i" };
    case "bold":
      return { sty: "b" };
    case "bold-italic":
      return { sty: "bi" };
    case "double-struck":
      return { scr: "double-struck", sty: "p" };
    case "script":
      return { scr: "script", sty: "p" };
    case "fraktur":
      return { scr: "fraktur", sty: "p" };
    case "sans-serif":
      return { scr: "sans-serif", sty: "p" };
    case "monospace":
      return { scr: "monospace", sty: "p" };
  }
}

interface RunOptions {
  sty?: string;
  scr?: string;
  /** Normal (non-math) text. */
  nor?: boolean;
  /** Red colour, used to flag unparsed input. */
  error?: boolean;
}

/**
 * Converts an AST row to OMML (Office Math Markup Language), Word's native
 * equation format. The output is a fragment suitable for embedding in
 * word/document.xml or a Flat OPC package passed to Range.InsertXML.
 */
export function toOmml(root: Row, options: OmmlOptions = {}): string {
  const w = new OmmlWriter(options.profile ?? TUNED_PROFILE);
  const ns = options.standalone ? { "xmlns:m": NS_M, "xmlns:w": NS_W } : null;
  const math = el("m:oMath", options.display ? null : ns, w.row(root));
  if (!options.display) return math;
  return el("m:oMathPara", ns, el("m:oMathParaPr", null, val("m:jc", "centerGroup")), math);
}

class OmmlWriter {
  /** Next emitted run carries an alignment mark (equation arrays). */
  private alnNext = false;
  /** Overrides identifier style (vectorStyle = bold). */
  private forced: MathVariant | undefined;

  constructor(private readonly profile: StyleProfile) {}

  // ------------------------------------------------------------- primitives

  private fontProps(): string {
    const f = this.profile.mathFont;
    return el("w:rPr", null, el("w:rFonts", { "w:ascii": f, "w:hAnsi": f }));
  }

  /** Every structure property element ends with ctrlPr carrying the math font. */
  private pr(tag: string, ...props: string[]): string {
    return el(tag, null, ...props, el("m:ctrlPr", null, this.fontProps()));
  }

  private run(text: string, o: RunOptions = {}): string {
    const mprops: string[] = [];
    if (o.nor) mprops.push(el("m:nor", null));
    else {
      if (o.scr) mprops.push(val("m:scr", o.scr));
      if (o.sty) mprops.push(val("m:sty", o.sty));
    }
    if (this.alnNext) {
      mprops.push(el("m:aln", null));
      this.alnNext = false;
    }
    const mrpr = mprops.length ? el("m:rPr", null, ...mprops) : "";
    let wrpr = "";
    if (o.error) wrpr = el("w:rPr", null, el("w:color", { "w:val": "C00000" }));
    else if (!o.nor) wrpr = this.fontProps();
    return el("m:r", null, mrpr, wrpr, `<m:t xml:space="preserve">${escapeText(text)}</m:t>`);
  }

  private slot(tag: string, r: Row | undefined): string {
    return el(tag, null, r ? this.row(r) : "");
  }

  private e(r: Row | undefined): string {
    return this.slot("m:e", r);
  }

  // ------------------------------------------------------------- tree

  row(r: Row): string {
    return r.children.map((n) => this.node(n)).join("");
  }

  private identRun(text: string, variant: MathVariant | undefined): string {
    const v = this.forced ?? variant;
    return this.run(text, v ? variantProps(v) : {});
  }

  private node(n: MathNode): string {
    switch (n.kind) {
      case "row":
        return this.row(n);
      case "ident":
        return this.identRun(n.text, n.variant);
      case "number":
        return this.identRun(n.text, n.variant ?? (this.forced ? "normal" : undefined));
      case "operator":
        return this.run(n.text, n.opClass === "ordinary" && /[A-Za-z]/.test(n.text) ? { sty: "p" } : {});
      case "text":
        return this.run(n.text, { nor: true });
      case "space": {
        const ch = SPACE_CHARS[n.width] ?? "";
        return ch ? this.run(ch) : "";
      }
      case "raw":
        return this.run(n.latex, { nor: true, error: true });

      case "fraction":
        return el(
          "m:f",
          null,
          this.pr("m:fPr", ...(n.bar ? [] : [val("m:type", "noBar")])),
          this.slot("m:num", n.num),
          this.slot("m:den", n.den),
        );

      case "scripts": {
        if (n.sub && n.sup)
          return el("m:sSubSup", null, this.pr("m:sSubSupPr"), this.e(n.base), this.slot("m:sub", n.sub), this.slot("m:sup", n.sup));
        if (n.sub) return el("m:sSub", null, this.pr("m:sSubPr"), this.e(n.base), this.slot("m:sub", n.sub));
        return el("m:sSup", null, this.pr("m:sSupPr"), this.e(n.base), this.slot("m:sup", n.sup));
      }

      case "prescripts":
        return el("m:sPre", null, this.pr("m:sPrePr"), this.slot("m:sub", n.sub), this.slot("m:sup", n.sup), this.e(n.base));

      case "radical":
        return el(
          "m:rad",
          null,
          this.pr("m:radPr", ...(n.index ? [] : [val("m:degHide", 1)])),
          this.slot("m:deg", n.index),
          this.e(n.body),
        );

      case "nary": {
        const sideLimits = n.limits === "nolimits" || (n.limits === "auto" && INTEGRALS.has(n.op));
        const props = [val("m:chr", n.op), val("m:limLoc", sideLimits ? "subSup" : "undOvr")];
        if (!n.sub) props.push(val("m:subHide", 1));
        if (!n.sup) props.push(val("m:supHide", 1));
        return el("m:nary", null, this.pr("m:naryPr", ...props), this.slot("m:sub", n.sub), this.slot("m:sup", n.sup), this.e(n.body));
      }

      case "delimited": {
        const props = [val("m:begChr", n.open)];
        if (n.separator !== undefined) props.push(val("m:sepChr", n.separator));
        props.push(val("m:endChr", n.close));
        return el("m:d", null, this.pr("m:dPr", ...props), ...n.parts.map((p) => this.e(p)));
      }

      case "function": {
        const name = this.run(n.name, { sty: "p" });
        let fName: string;
        if (n.limits && n.sub) {
          fName = el("m:limLow", null, this.pr("m:limLowPr"), el("m:e", null, name), this.slot("m:lim", n.sub));
          if (n.sup) fName = el("m:sSup", null, this.pr("m:sSupPr"), el("m:e", null, fName), this.slot("m:sup", n.sup));
        } else if (n.sub && n.sup) {
          fName = el("m:sSubSup", null, this.pr("m:sSubSupPr"), el("m:e", null, name), this.slot("m:sub", n.sub), this.slot("m:sup", n.sup));
        } else if (n.sub) {
          fName = el("m:sSub", null, this.pr("m:sSubPr"), el("m:e", null, name), this.slot("m:sub", n.sub));
        } else if (n.sup) {
          fName = el("m:sSup", null, this.pr("m:sSupPr"), el("m:e", null, name), this.slot("m:sup", n.sup));
        } else fName = name;
        return el("m:func", null, this.pr("m:funcPr"), el("m:fName", null, fName), this.e(n.arg));
      }

      case "accent": {
        if (n.accent === "overline" || n.accent === "underline") {
          return el("m:bar", null, this.pr("m:barPr", val("m:pos", n.accent === "overline" ? "top" : "bot")), this.e(n.body));
        }
        if (n.accent === "vec" && this.profile.vectorStyle === "harpoon") {
          return el("m:acc", null, this.pr("m:accPr", val("m:chr", ACCENT_CHARS.overrightharpoon)), this.e(n.body));
        }
        if (n.accent === "vec" && this.profile.vectorStyle !== "arrow") {
          const saved = this.forced;
          this.forced = this.profile.vectorStyle as "bold" | "bold-italic";
          const out = this.row(n.body);
          this.forced = saved;
          return out;
        }
        return el("m:acc", null, this.pr("m:accPr", val("m:chr", ACCENT_CHARS[n.accent])), this.e(n.body));
      }

      case "stack": {
        let inner: string;
        if (n.brace) {
          const top = n.position === "over";
          inner = el(
            "m:groupChr",
            null,
            this.pr("m:groupChrPr", val("m:chr", top ? "⏞" : "⏟"), val("m:pos", top ? "top" : "bot"), val("m:vertJc", top ? "bot" : "top")),
            this.e(n.body),
          );
          if (!n.annotation) return inner;
        } else inner = this.row(n.body);
        const tag = n.position === "over" ? "m:limUpp" : "m:limLow";
        return el(tag, null, this.pr(`${tag}Pr`), el("m:e", null, inner), this.slot("m:lim", n.annotation));
      }

      case "boxed":
        return el("m:borderBox", null, this.pr("m:borderBoxPr"), this.e(n.body));

      case "matrix":
        return this.matrix(n);

      case "cases": {
        const rows = n.rows.map((cells) => {
          let xml = cells[0] ? this.row(cells[0]) : "";
          for (const cell of cells.slice(1)) {
            this.alnNext = true;
            xml += this.run(" ") + this.row(cell);
          }
          return el("m:e", null, xml);
        });
        const arr = el("m:eqArr", null, this.eqArrPr(), ...rows);
        return el("m:d", null, this.pr("m:dPr", val("m:begChr", "{"), val("m:endChr", "")), el("m:e", null, arr));
      }

      case "aligned": {
        const rows = n.rows.map((cells) => {
          let xml = "";
          cells.forEach((cell, i) => {
            if (i > 0 && n.env !== "gathered") {
              this.alnNext = true;
              const first = cell.children[0];
              if (!first || !isRunNode(first) || (first.kind === "space" && first.width === "negthin")) xml += this.run("");
            }
            xml += this.row(cell);
          });
          this.alnNext = false;
          return el("m:e", null, xml);
        });
        return el("m:eqArr", null, this.eqArrPr(), ...rows);
      }
    }
  }

  private eqArrPr(): string {
    const a = this.profile.equationArray;
    const props: string[] = [];
    if (a.rowSpacingRule !== undefined) props.push(val("m:rSpRule", a.rowSpacingRule));
    if (a.rowSpacing !== undefined) props.push(val("m:rSp", a.rowSpacing));
    return this.pr("m:eqArrPr", ...props);
  }

  private matrix(n: Matrix): string {
    const cols = Math.max(1, ...n.rows.map((r) => r.length));
    const m = this.profile.matrix;
    const props: string[] = [];
    if (m.rowSpacingRule !== undefined) props.push(val("m:rSpRule", m.rowSpacingRule));
    if (m.rowSpacing !== undefined) props.push(val("m:rSp", m.rowSpacing));
    if (m.columnGapRule !== undefined) props.push(val("m:cGpRule", m.columnGapRule));
    if (m.columnGap !== undefined) props.push(val("m:cGp", m.columnGap));
    props.push(
      el("m:mcs", null, el("m:mc", null, el("m:mcPr", null, val("m:count", cols), val("m:mcJc", "center")))),
    );
    const rows = n.rows.map((cells) => {
      const padded = [...cells];
      while (padded.length < cols) padded.push({ kind: "row", children: [] });
      return el("m:mr", null, ...padded.map((c) => this.e(c)));
    });
    const mat = el("m:m", null, this.pr("m:mPr", ...props), ...rows);
    const d = MATRIX_DELIMS[n.matrixKind];
    if (!d) return mat;
    const pad = m.bracketPadding ?? "none";
    const dProps = [val("m:begChr", d[0]), val("m:endChr", d[1])];
    if (pad === "match") dProps.push(val("m:shp", "match"));
    let inner = mat;
    if (pad === "scripts" || pad === "limits") inner = this.paddingStrut(mat, pad) + mat;
    return el("m:d", null, this.pr("m:dPr", ...dProps), el("m:e", null, inner));
  }

  /** Invisible, zero-width copy of `content` made taller above and below, so delimiters around it grow. */
  private paddingStrut(content: string, kind: "scripts" | "limits"): string {
    const bar = this.run("|");
    const tall =
      kind === "scripts"
        ? el("m:sSubSup", null, this.pr("m:sSubSupPr"), el("m:e", null, content), el("m:sub", null, bar), el("m:sup", null, bar))
        : el(
            "m:limUpp", null, this.pr("m:limUppPr"),
            el("m:e", null, el("m:limLow", null, this.pr("m:limLowPr"), el("m:e", null, content), el("m:lim", null, bar))),
            el("m:lim", null, bar),
          );
    return el("m:phant", null, this.pr("m:phantPr", val("m:show", 0), val("m:zeroWid", 1)), el("m:e", null, tall));
  }
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
