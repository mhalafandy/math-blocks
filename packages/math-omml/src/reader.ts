import type { AccentKind, MathNode, MathVariant, MatrixKind, OperatorClass, Row, SpaceWidth } from "@mathblocks/math-core";
import { ACCENT_CHARS, INTEGRALS, MATRIX_DELIMS, SPACE_CHARS } from "./writer";
import { child, elements, localName, parseXml, propVal, textContent, type XmlElement } from "./xmlparse";

/**
 * OMML → AST reader: turns Word's native equations back into the MathBlocks model, so that
 * equations already in a document (ours or typed in Word) can be edited in MathBlocks.
 *
 * Guarantee (tested): for every reference equation, readOmml(toOmml(ast)) equals ast up to the
 * information OMML cannot carry (forced fraction size, \widehat vs \hat, negative space).
 * Equations written by Word itself are read on a best-effort basis; anything unknown becomes a
 * `raw` node holding its text, so nothing is silently lost.
 */
export interface ReadResult {
  root: Row;
  display: boolean;
  /** Structures the reader did not recognise (kept as raw text). */
  unknown: string[];
}

/** Reads the first equation found in an OMML fragment or a full WordprocessingML/Flat OPC document. */
export function readOmml(xml: string): ReadResult | null {
  const doc = parseXml(xml);
  // Word may wrap the math in content controls, tracked changes, bookmarks… in either order
  // (sdt > oMathPara > oMath, oMathPara > sdt > oMath, …): collect every outermost oMath.
  const maths: XmlElement[] = [];
  let display = false;
  const walk = (el: XmlElement, inPara: boolean) => {
    for (const c of elements(el)) {
      const name = localName(c.name);
      if (name === "oMath") {
        maths.push(c);
        if (inPara) display = true;
      } else if (name !== "del" && name !== "moveFrom") walk(c, inPara || name === "oMathPara");
    }
  };
  walk(doc, false);
  if (maths.length === 0) return null;
  const r = new Reader();
  const root = row(maths.flatMap((m) => r.children(m)));
  return { root, display, unknown: r.unknown };
}

/** WordprocessingML wrappers that can appear inside math and are looked through. */
const TRANSPARENT = new Set(["sdt", "sdtContent", "customXml", "smartTag", "ins", "moveTo", "hyperlink", "fldSimple", "oMathPara", "oMath"]);
/** Elements without math content. */
const IGNORED = new Set(["sdtPr", "sdtEndPr", "bookmarkStart", "bookmarkEnd", "proofErr", "permStart", "permEnd", "del", "moveFrom", "commentRangeStart", "commentRangeEnd", "lastRenderedPageBreak"]);

const row = (children: MathNode[]): Row => ({ kind: "row", children });

// Character classes (mirror of the LaTeX symbol table, by Unicode character).
const RELATIONS = new Set([..."=<>:≤≥≠≈≡∼≃≅∝≪≫∈∉∋⊂⊃⊆⊇∥⊥∣≔≐→←↔⇒⇐⇔⟶⟵⟹⟸⟺↦↑↓⇌∴∵⊢⊨"]);
const BINARY = new Set([..."+−±∓×÷⋅∗⋆∘∙∩∪∧∨⊕⊖⊗⊙∖"]);
const PUNCT = new Set([",", ";"]);
const IDENT_SYMBOLS = new Set([..."∞∂∇ℏℓℜℑℵ℘∅"]);
const SPACE_FROM_CHAR = new Map<string, SpaceWidth>(
  Object.entries(SPACE_CHARS)
    .filter(([w, c]) => c.length === 1 && w !== "negthin")
    .map(([w, c]) => [c, w as SpaceWidth]),
);
const ACCENT_FROM_CHAR = new Map<string, AccentKind>();
for (const [kind, ch] of Object.entries(ACCENT_CHARS)) {
  // First mapping wins: hat before widehat, vec before overrightarrow, tilde before widetilde.
  if (!ACCENT_FROM_CHAR.has(ch)) ACCENT_FROM_CHAR.set(ch, kind as AccentKind);
}
ACCENT_FROM_CHAR.set("̄", "bar"); // macron, used by Word for "bar"

/** Functions whose subscript is placed underneath in display style (mirror of math-latex). */
const LIMIT_FUNCTIONS = new Set(["lim", "lim inf", "lim sup", "max", "min", "sup", "inf", "det", "gcd", "Pr"]);

const SCR: Record<string, MathVariant> = {
  "double-struck": "double-struck",
  script: "script",
  fraktur: "fraktur",
  "sans-serif": "sans-serif",
  monospace: "monospace",
};

function variantOf(rPr: XmlElement | undefined): MathVariant | undefined {
  if (!rPr) return undefined;
  const scr = propVal(rPr, "scr");
  if (scr && SCR[scr]) return SCR[scr];
  switch (propVal(rPr, "sty")) {
    case "p":
      return "normal";
    case "i":
      return "italic";
    case "b":
      return "bold";
    case "bi":
      return "bold-italic";
    default:
      return undefined;
  }
}

const opClass = (c: string): OperatorClass =>
  RELATIONS.has(c) ? "relation" : BINARY.has(c) ? "binary" : PUNCT.has(c) ? "punctuation" : "ordinary";

/** Sentinel inserted where an m:aln (alignment point) occurs; consumed by equation arrays. */
const ALN: MathNode = { kind: "raw", latex: "", message: "__aln__" };
const isAln = (n: MathNode) => n === ALN;

class Reader {
  readonly unknown: string[] = [];

  /** Converts the child elements of a container (oMath, m:e, m:num…) to nodes. */
  children(el: XmlElement | undefined): MathNode[] {
    if (!el) return [];
    const out: MathNode[] = [];
    for (const c of elements(el)) {
      const name = localName(c.name);
      if (name.endsWith("Pr") || name === "ctrlPr" || IGNORED.has(name)) continue;
      if (TRANSPARENT.has(name)) out.push(...this.children(name === "sdt" ? child(c, "sdtContent") : c));
      else out.push(...this.node(c));
    }
    return out;
  }

  slot(el: XmlElement | undefined): Row {
    return row(this.children(el).filter((n) => !isAln(n)));
  }

  private node(el: XmlElement): MathNode[] {
    const name = localName(el.name);
    const pr = child(el, `${name}Pr`);
    switch (name) {
      case "r":
        return this.run(el);
      case "f":
        return [{ kind: "fraction", num: this.slot(child(el, "num")), den: this.slot(child(el, "den")), bar: propVal(pr, "type") !== "noBar" }];
      case "sSub":
        return [{ kind: "scripts", base: this.slot(child(el, "e")), sub: this.slot(child(el, "sub")) }];
      case "sSup":
        return [{ kind: "scripts", base: this.slot(child(el, "e")), sup: this.slot(child(el, "sup")) }];
      case "sSubSup":
        return [{ kind: "scripts", base: this.slot(child(el, "e")), sub: this.slot(child(el, "sub")), sup: this.slot(child(el, "sup")) }];
      case "sPre": {
        const n: MathNode = { kind: "prescripts", base: this.slot(child(el, "e")) };
        const sub = this.slot(child(el, "sub"));
        const sup = this.slot(child(el, "sup"));
        if (sub.children.length) n.sub = sub;
        if (sup.children.length) n.sup = sup;
        return [n];
      }
      case "rad": {
        const hidden = ["1", "on", "true"].includes(propVal(pr, "degHide") ?? "0");
        const deg = this.slot(child(el, "deg"));
        return [hidden || deg.children.length === 0 ? { kind: "radical", body: this.slot(child(el, "e")) } : { kind: "radical", index: deg, body: this.slot(child(el, "e")) }];
      }
      case "nary":
        return [this.nary(el, pr)];
      case "d":
        return [this.delimited(el, pr)];
      case "func":
        return [this.func(el)];
      case "acc": {
        const chr = propVal(pr, "chr") || "̂";
        return [{ kind: "accent", accent: ACCENT_FROM_CHAR.get(chr) ?? "hat", body: this.slot(child(el, "e")) }];
      }
      case "bar":
        return [{ kind: "accent", accent: propVal(pr, "pos") === "top" ? "overline" : "underline", body: this.slot(child(el, "e")) }];
      case "groupChr": {
        const top = propVal(pr, "pos") === "top";
        return [{ kind: "stack", position: top ? "over" : "under", body: this.slot(child(el, "e")), brace: true }];
      }
      case "limUpp":
      case "limLow":
        return [this.limit(el, name === "limUpp" ? "over" : "under")];
      case "borderBox":
        return [{ kind: "boxed", body: this.slot(child(el, "e")) }];
      case "m":
        return [{ kind: "matrix", matrixKind: "matrix", rows: this.matrixRows(el) }];
      case "eqArr":
        return [this.eqArr(el)];
      case "phant": {
        // Invisible phantoms (e.g. our matrix-bracket strut) carry no visible content.
        if (["0", "off", "false"].includes(propVal(pr, "show") ?? "1")) return [];
        return this.children(child(el, "e"));
      }
      case "box":
        return this.children(child(el, "e"));
      case "e":
        return this.children(el);
      default: {
        const text = textContent(el);
        this.unknown.push(name);
        return text ? [{ kind: "raw", latex: text, message: `Unsupported Word structure <${name}>` }] : [];
      }
    }
  }

  private run(el: XmlElement): MathNode[] {
    const rPr = child(el, "rPr");
    const text = elements(el).filter((c) => localName(c.name) === "t").map(textContent).join("");
    const out: MathNode[] = [];
    if (rPr && child(rPr, "aln")) out.push(ALN);
    if (rPr && child(rPr, "nor")) {
      if (text) out.push({ kind: "text", text });
      return out;
    }
    const variant = variantOf(rPr);
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]!;
      if (/[0-9]/.test(c)) {
        let num = c;
        while (i + 1 < chars.length && (/[0-9]/.test(chars[i + 1]!) || (chars[i + 1] === "." && /[0-9]/.test(chars[i + 2] ?? "")))) num += chars[++i];
        out.push(variant ? { kind: "number", text: num, variant } : { kind: "number", text: num });
        continue;
      }
      // Two em spaces are one \qquad (checked before the single-character space table).
      if (c === "\u2003" && chars[i + 1] === "\u2003") {
        i++;
        out.push({ kind: "space", width: "qquad" });
        continue;
      }
      const space = SPACE_FROM_CHAR.get(c);
      if (space) {
        out.push({ kind: "space", width: space });
        continue;
      }
      if (/\s/.test(c)) continue;
      if (/\p{L}/u.test(c) || IDENT_SYMBOLS.has(c)) {
        out.push(variant ? { kind: "ident", text: c, variant } : { kind: "ident", text: c });
        continue;
      }
      const ch = c === "-" ? "−" : c === "*" ? "∗" : c;
      out.push({ kind: "operator", text: ch, opClass: opClass(ch) });
    }
    return out;
  }

  private nary(el: XmlElement, pr: XmlElement | undefined): MathNode {
    const op = propVal(pr, "chr") || "∫";
    const loc = propVal(pr, "limLoc");
    const sideByDefault = INTEGRALS.has(op);
    const side = loc ? loc === "subSup" : sideByDefault;
    const limits = side === sideByDefault ? "auto" : side ? "nolimits" : "limits";
    const on = (v: string | undefined) => v !== undefined && ["1", "on", "true", ""].includes(v);
    const node: MathNode = { kind: "nary", op, limits, body: this.slot(child(el, "e")) };
    if (!on(propVal(pr, "subHide"))) node.sub = this.slot(child(el, "sub"));
    if (!on(propVal(pr, "supHide"))) node.sup = this.slot(child(el, "sup"));
    return node;
  }

  private delimited(el: XmlElement, pr: XmlElement | undefined): MathNode {
    const open = propVal(pr, "begChr") ?? "(";
    const close = propVal(pr, "endChr") ?? ")";
    const sep = propVal(pr, "sepChr");
    const parts = elements(el).filter((c) => localName(c.name) === "e");

    // Matrix inside delimiters → pmatrix / bmatrix / … (ignoring our invisible bracket strut).
    if (parts.length === 1) {
      const inner = elements(parts[0]!).filter((c) => localName(c.name) !== "phant" && !localName(c.name).endsWith("Pr"));
      if (inner.length === 1 && localName(inner[0]!.name) === "m") {
        const kind = (Object.entries(MATRIX_DELIMS) as [MatrixKind, [string, string] | null][]).find(
          ([, d]) => d && d[0] === open && d[1] === close,
        )?.[0];
        if (kind) return { kind: "matrix", matrixKind: kind, rows: this.matrixRows(inner[0]!) };
      }
      // Piecewise: "{" + equation array whose second cells start with the quad space we write.
      if (inner.length === 1 && localName(inner[0]!.name) === "eqArr" && open === "{" && close === "") {
        const arr = this.eqArrRows(inner[0]!);
        const looksLikeCases = arr.every((cells) => cells.length <= 2 && (cells.length < 2 || cells[1]!.children[0]?.kind === "space"));
        if (looksLikeCases) {
          const rows = arr.map((cells) => cells.map((c, i) => (i === 1 && c.children[0]?.kind === "space" ? row(c.children.slice(1)) : c)));
          return { kind: "cases", rows };
        }
      }
    }
    const node: MathNode = { kind: "delimited", open, close, parts: parts.map((p) => this.slot(p)) };
    if (sep !== undefined && parts.length > 1) node.separator = sep;
    return node;
  }

  private func(el: XmlElement): MathNode {
    const fName = child(el, "fName");
    const arg = this.slot(child(el, "e"));
    const nameEl = fName ? elements(fName).find((c) => !localName(c.name).endsWith("Pr")) : undefined;
    let name = "";
    let sub: Row | undefined;
    let sup: Row | undefined;
    let limits = false;
    const nameText = (e: XmlElement | undefined) => (e ? textContent(e).replace(/\s+/g, " ").trim() : "");
    if (nameEl) {
      switch (localName(nameEl.name)) {
        case "limLow":
          name = nameText(child(nameEl, "e"));
          sub = this.slot(child(nameEl, "lim"));
          limits = true;
          break;
        case "sSup": {
          const base = child(nameEl, "e");
          const low = base ? child(base, "limLow") : undefined;
          if (low) {
            name = nameText(child(low, "e"));
            sub = this.slot(child(low, "lim"));
            limits = true;
          } else name = nameText(base);
          sup = this.slot(child(nameEl, "sup"));
          break;
        }
        case "sSub":
          name = nameText(child(nameEl, "e"));
          sub = this.slot(child(nameEl, "sub"));
          break;
        case "sSubSup":
          name = nameText(child(nameEl, "e"));
          sub = this.slot(child(nameEl, "sub"));
          sup = this.slot(child(nameEl, "sup"));
          break;
        default:
          name = nameText(fName);
      }
    }
    // Without a subscript, OMML does not record whether limits go underneath: decide by name.
    if (!sub && LIMIT_FUNCTIONS.has(name)) limits = true;
    const node: MathNode = { kind: "function", name, limits, arg };
    if (sub) node.sub = sub;
    if (sup) node.sup = sup;
    return node;
  }

  private limit(el: XmlElement, position: "over" | "under"): MathNode {
    const e = child(el, "e");
    const annotation = this.slot(child(el, "lim"));
    const inner = e ? elements(e).filter((c) => !localName(c.name).endsWith("Pr")) : [];
    if (inner.length === 1 && localName(inner[0]!.name) === "groupChr") {
      const pr = child(inner[0]!, "groupChrPr");
      const top = propVal(pr, "pos") === "top";
      if ((position === "over") === top) {
        return { kind: "stack", position, body: this.slot(child(inner[0]!, "e")), annotation, brace: true };
      }
    }
    return { kind: "stack", position, body: this.slot(e), annotation, brace: false };
  }

  private matrixRows(m: XmlElement): Row[][] {
    return elements(m)
      .filter((c) => localName(c.name) === "mr")
      .map((mr) => elements(mr).filter((c) => localName(c.name) === "e").map((e) => this.slot(e)));
  }

  /** Rows of an equation array, split into cells at alignment marks. */
  private eqArrRows(arr: XmlElement): Row[][] {
    return elements(arr)
      .filter((c) => localName(c.name) === "e")
      .map((e) => {
        const cells: Row[] = [row([])];
        for (const n of this.children(e)) {
          if (isAln(n)) cells.push(row([]));
          else cells[cells.length - 1]!.children.push(n);
        }
        return cells;
      });
  }

  private eqArr(arr: XmlElement): MathNode {
    const rows = this.eqArrRows(arr);
    const aligned = rows.some((cells) => cells.length > 1);
    return { kind: "aligned", env: aligned ? "aligned" : "gathered", rows };
  }
}
