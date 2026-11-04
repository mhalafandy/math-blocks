import { DEFAULT_PROFILE, expandKind, KIND_BY_ID, peelKind, styleOf, type MathNode, type NotationProfile, type Row } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * Notation kinds in the visual editor (docs/NOTATION-KINDS.md). MathLive macros cannot be edited
 * inside, so the editor holds each kind expanded and wrapped: \pvec{r} becomes
 * \class{nk-pvec}{\overrightharpoon{\mathbf{r}}}. Its inside stays plain, editable structure;
 * what comes back is recognised again (peelKind). An object whose structure no longer matches
 * its kind's style is kept as typed ("hand-styled") and reported.
 */

export const CLASS_PREFIX = "nk-";

/** Stand-in letter for an empty slot while a kind is recognised (the parser drops \placeholder{}). */
const SLOT = "\u24C8";

/** Source (with \pvec…) → what the visual editor holds. */
export function toEditorLatex(latex: string, profile: NotationProfile = DEFAULT_PROFILE): string {
  if (!/\\[a-zA-Z]+/.test(latex)) return latex;
  const { root } = parseLatex(latex);
  if (!containsKind(root)) return latex;
  return serializeLatex(wrapKinds(root, profile));
}

function containsKind(r: Row): boolean {
  let found = false;
  const visit = (n: MathNode) => {
    if (n.kind === "notation") found = true;
    eachRow(n, (x) => x.children.forEach(visit));
  };
  r.children.forEach(visit);
  return found;
}

function eachRow(n: MathNode, f: (r: Row) => void) {
  for (const [k, v] of Object.entries(n)) {
    if (k === "meta") continue;
    const each = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(each);
      const o = x as MathNode;
      if (o.kind === "row") f(o);
    };
    each(v);
  }
}

/** A copy of the tree with every kind object replaced by its wrapped expansion (raw LaTeX). */
function wrapKinds(r: Row, profile: NotationProfile): Row {
  const out: MathNode[] = r.children.map((n) => {
    if (n.kind === "notation") {
      // Empty arguments become slots to fill (\dcm{}{} → C with two empty frame slots).
      const filled = { ...n, args: n.args.map((a) => (a.children.length ? a : { kind: "row", children: [{ kind: "ident", text: SLOT } as MathNode] } as Row)) };
      const expanded: Row = { kind: "row", children: expandKind(filled, styleOf(profile, n.name)) };
      // Adjacent empty slots get a thin space between them: the editor would otherwise empty both
      // when the first is typed into (C_{□□} → C_{b}).
      const inner = serializeLatex(wrapKinds(expanded, profile)).replaceAll(`${SLOT}${SLOT}`, `${SLOT}\\,${SLOT}`).replaceAll(SLOT, "\\placeholder{}");
      return { kind: "raw", latex: `\\class{${CLASS_PREFIX}${n.name}}{${inner}}` } as MathNode;
    }
    const copy = { ...n } as MathNode;
    for (const [k, v] of Object.entries(copy)) {
      if (k === "meta") continue;
      const map = (x: unknown): unknown => {
        if (!x || typeof x !== "object") return x;
        if (Array.isArray(x)) return x.map(map);
        const o = x as MathNode;
        return o.kind === "row" ? wrapKinds(o, profile) : x;
      };
      (copy as unknown as Record<string, unknown>)[k] = map(v);
    }
    return copy;
  });
  return { kind: "row", children: out };
}

export interface FromEditorResult {
  latex: string;
  /** Kinds whose structure was edited out of their style: kept as typed. */
  handStyled: { kind: string; latex: string }[];
}

/** What the visual editor holds → source with \pvec…; unknown structures stay as typed. */
export function fromEditorLatex(latex: string, profile: NotationProfile = DEFAULT_PROFILE): FromEditorResult {
  const handStyled: FromEditorResult["handStyled"] = [];
  const convert = (s: string): string => {
    let out = "";
    let i = 0;
    for (;;) {
      const at = s.indexOf(`\\class{${CLASS_PREFIX}`, i);
      if (at < 0) return out + s.slice(i);
      out += s.slice(i, at);
      const nameStart = at + `\\class{${CLASS_PREFIX}`.length;
      const nameEnd = s.indexOf("}", nameStart);
      const kind = s.slice(nameStart, nameEnd);
      const bodyStart = s.indexOf("{", nameEnd);
      const bodyEnd = matchBrace(s, bodyStart);
      if (nameEnd < 0 || bodyStart !== nameEnd + 1 || bodyEnd < 0) return out + s.slice(at);
      const body = convert(s.slice(bodyStart + 1, bodyEnd));
      out += recognise(kind, body);
      i = bodyEnd + 1;
    }
  };
  const recognise = (kind: string, body: string): string => {
    const def = KIND_BY_ID.get(kind);
    const parsed = parseLatex(body.replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, SLOT));
    const node = def && !parsed.diagnostics.some((d) => d.severity === "error") ? peelKind(kind, parsed.root, styleOf(profile, kind)) : null;
    if (!node) {
      handStyled.push({ kind, latex: body });
      return `{${body}}`;
    }
    const s = serializeLatex({ kind: "row", children: [node] }).replaceAll(SLOT, "");
    // Keep a following script attached to the kind, not to its last argument.
    return node.kind === "notation" ? `{${s}}` : s;
  };
  const converted = convert(latex);
  if (converted === latex) return { latex, handStyled };
  // Normalise (drops the protective braces).
  return { latex: serializeLatex(parseLatex(converted).root), handStyled };
}

/** Index of the brace closing the one at `open`, or −1. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}
