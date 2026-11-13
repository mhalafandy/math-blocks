import { DEFAULT_STYLE, normalizeStyle, readLooks, styleHash, type MathStyle, type NotationProfile, type StylePreset } from "@mathblocks/math-core";
import { broadcastNotation, useApp, type DocStyleState } from "./store";

// Loaded when needed: the drawing code imports this module, and the connector imports the drawing code.
const connection = async () => (await import("./connector")).connector;

/**
 * Document style, app side: which style the current Word document carries (read from the
 * document's Custom XML Part), the user's default for documents without one, and saving changes
 * back into the document. Every drawing (Classic pictures, objects, native equations, previews)
 * takes its look from activeStyle().
 */

export const STYLE_NS = "urn:mathblocks:style:v1";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The Custom XML Part that carries a style (its JSON as the element's text), with its recent history and probe. */
export function styleXml(style: MathStyle, extra: { history?: DocStyleState["history"]; probe?: string } = {}): string {
  return `<style xmlns="${STYLE_NS}">${esc(JSON.stringify({ ...style, ...(extra.history?.length ? { _history: extra.history } : {}), ...(extra.probe ? { _probe: extra.probe } : {}) }))}</style>`;
}

/** The stored part's history and probe (besides the style itself). */
export function parseStyleExtras(xml: string | null | undefined): { history: NonNullable<DocStyleState["history"]>; probe?: string } {
  const m = xml ? /<(?:\w+:)?style\b[^>]*>([\s\S]*)<\/(?:\w+:)?style>/.exec(xml) : null;
  if (!m) return { history: [] };
  try {
    const o = JSON.parse(unesc(m[1]!)) as { _history?: { hash?: string; style?: unknown }[]; _probe?: string };
    const history = (o._history ?? []).filter((h) => typeof h.hash === "string" && h.style).map((h) => ({ hash: h.hash!, style: normalizeStyle(h.style) }));
    return { history, ...(typeof o._probe === "string" ? { probe: o._probe } : {}) };
  } catch {
    return { history: [] };
  }
}

/** The style in a stored part; null when there is none or it cannot be read. */
export function parseStyleXml(xml: string | null | undefined, fallback: MathStyle = userDefaultStyle()): MathStyle | null {
  if (!xml) return null;
  const m = /<(?:\w+:)?style\b[^>]*>([\s\S]*)<\/(?:\w+:)?style>/.exec(xml);
  if (!m) return null;
  try {
    return normalizeStyle(JSON.parse(unesc(m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, ""))), fallback);
  } catch {
    return null;
  }
}

/**
 * The user's default for documents without a stored style: the saved default, or one made from the
 * settings MathBlocks used before document styles (so such documents look exactly as before).
 */
export function userDefaultStyle(): MathStyle {
  const s = useApp.getState();
  if (s.defaultStyle) return normalizeStyle(s.defaultStyle);
  // The app's own settings as a v1 (flat) style, read through the migration.
  return normalizeStyle({
    notation: s.notationProfile,
    sizePt: s.equationSizePt,
    boldScope: s.boldScope === "base" ? "base" : "scripts",
    accentsFollowBold: s.accentsFollowBold,
    transpose: s.transposeForm === "italic" ? "italic" : s.transposeForm === "bold" ? "bold" : "upright",
  });
}

/** The style drawings use now: the current document's, else the user's default. */
export function activeStyle(): MathStyle {
  return useApp.getState().docStyle?.style ?? userDefaultStyle();
}

/** The notation kinds' profile in effect (the document's when it has a style). */
export function activeNotation(): NotationProfile {
  return activeStyle().notation;
}

/** React: the notation in effect (redraws when the document's style or the user's notation changes). */
export function useActiveNotation(): NotationProfile {
  const doc = useApp((s) => s.docStyle);
  const prof = useApp((s) => s.notationProfile);
  return doc?.style.notation ?? prof;
}

/** React: the style in effect. */
export function useActiveStyle(): MathStyle {
  useApp((s) => s.docStyle);
  useApp((s) => s.defaultStyle);
  useApp((s) => s.notationProfile);
  useApp((s) => s.equationSizePt);
  return activeStyle();
}

export const activeStyleHash = () => styleHash(activeStyle());

function setDocStyle(d: DocStyleState | null) {
  useApp.setState({ docStyle: d });
  broadcastNotation();
}

/**
 * Reads the style of a document (the active one when none is named) and makes it the style in
 * effect. A document without a stored style is drawn in the user's default (nothing is written).
 */
export async function loadDocumentStyle(document?: string): Promise<DocStyleState | null> {
  const app = useApp.getState();
  if (!app.connector.connected || !app.connector.methods?.includes("getDocumentStyle")) return app.docStyle;
  try {
    const r = await (await connection()).request("getDocumentStyle", document ? { document } : {});
    const stored = parseStyleXml(r.xml);
    const extras = parseStyleExtras(r.xml);
    const next: DocStyleState = { document: r.fullName, name: r.name, style: stored ?? userDefaultStyle(), stored: !!stored, history: extras.history, ...(extras.probe ? { probe: extras.probe } : {}) };
    if (JSON.stringify(next) !== JSON.stringify(useApp.getState().docStyle)) setDocStyle(next);
    // Word's undo does not cover the stored style: follow the drawings back (or forward) to it.
    if (!document && next.probe && next.history?.length) return (await followUndo(next)) ?? next;
    return next;
  } catch (e) {
    console.warn("loadDocumentStyle", e);
    return useApp.getState().docStyle;
  }
}

/** Reads a document's stored style without making it the one in effect (copy from another document). */
export async function readDocumentStyle(document: string): Promise<MathStyle | null> {
  const r = await (await connection()).request("getDocumentStyle", { document });
  return parseStyleXml(r.xml);
}

/**
 * Stores a style in a document (the current one when none is named) and makes it the style in effect.
 * The style it replaces goes into the document's recent history (Ctrl+Z of a restyle returns to it).
 * `probe`: the equation whose drawing tells which style the document is drawn in (null clears it).
 */
export async function saveDocumentStyle(style: MathStyle, document?: string, o: { probe?: string | null } = {}): Promise<void> {
  const cur = useApp.getState().docStyle;
  const target = document ?? cur?.document;
  const same = !!cur && (!target || cur.document === target);
  const hash = styleHash(style);
  const prev = same && cur?.stored ? [{ hash: styleHash(cur.style), style: cur.style }] : [];
  const seen = new Set<string>([hash]);
  const history = [...prev, ...(same ? (cur?.history ?? []) : [])].filter((h) => !seen.has(h.hash) && (seen.add(h.hash), true)).slice(0, 10);
  // The probe stays only while the style is the one the equations were drawn in: a changed style (not
  // yet redrawn) clears it, so the old drawings are not taken for an undo.
  const probe = o.probe === undefined ? (same && cur && styleHash(cur.style) === hash ? cur.probe : undefined) : (o.probe ?? undefined);
  const r = await (await connection()).request("setDocumentStyle", { ...(target ? { document: target } : {}), xml: styleXml(style, { history, probe }) });
  const name = (same ? cur?.name : undefined) ?? r.fullName.split(/[\\/]/).pop() ?? r.fullName;
  setDocStyle({ document: r.fullName, name, style, stored: true, history, ...(probe ? { probe } : {}) });
}

/**
 * After Ctrl+Z (or Ctrl+Y) of a restyle the drawings are in an earlier (or later) style than the stored
 * one: the stored style follows them, from the document's history. Returns the new state, or null.
 */
export async function followUndo(d: DocStyleState): Promise<DocStyleState | null> {
  if (!d.probe || !d.history?.length) return null;
  try {
    const c = await connection();
    const r = await c.request("readEquation", { tag: d.probe, quiet: true });
    const { readEquationXml } = await import("./readEquation");
    const drawn = readEquationXml(r.flatOpc)?.styleHash;
    if (!drawn || drawn === styleHash(d.style)) return null;
    const entry = d.history.find((h) => h.hash === drawn);
    if (!entry) return null;
    // That earlier style, keeping the exceptions and classification decided since.
    const style = { ...entry.style, exceptions: d.style.exceptions };
    await saveDocumentStyle(style, d.document, { probe: d.probe });
    const note = "The document style followed Ctrl+Z / Ctrl+Y: the stored style is again the one the equations are drawn in.";
    useApp.getState().notify(note);
    void c.request("showMessage", { text: `MathBlocks: ${note}`, kind: "info" }).catch(() => undefined);
    return useApp.getState().docStyle;
  } catch {
    // The probe equation is gone (deleted): nothing to follow.
    return null;
  }
}

/** Changes the style in effect: in the document when one is open, else the user's default. */
export async function updateActiveStyle(change: (s: MathStyle) => MathStyle): Promise<MathStyle> {
  const next = change(activeStyle());
  if (useApp.getState().docStyle && useApp.getState().connector.connected) await saveDocumentStyle(next);
  else useApp.getState().setPrefs({ defaultStyle: next });
  return next;
}

/** The notation kinds' profile changed (Notation settings): the document's style follows, or the user's notation. */
export function setActiveNotation(profile: NotationProfile) {
  const doc = useApp.getState().docStyle;
  if (doc && useApp.getState().connector.connected) {
    const style = { ...doc.style, notation: profile };
    setDocStyle({ ...doc, style });
    void saveDocumentStyle(style, doc.document).catch((e: unknown) => useApp.getState().notify(e instanceof Error ? e.message : String(e), "error"));
    return;
  }
  useApp.getState().setPrefs({ notationProfile: profile });
}

/** The open Word documents (copy style from another document). */
export async function openDocuments() {
  return (await (await connection()).request("listDocuments", {})).documents;
}

// ------------------------------------------------------------------ presets as files

export const PRESET_FILE_KIND = "mathblocks-style-preset";

export function presetToJson(p: StylePreset): string {
  return JSON.stringify({ kind: PRESET_FILE_KIND, version: 1, preset: p }, null, 2);
}

/** A preset from an exported file; throws with a readable message when it is not one. */
export function presetFromJson(text: string): StylePreset {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("This file is not a MathBlocks style preset (not JSON).");
  }
  const f = o as { kind?: string; preset?: StylePreset };
  if (f.kind !== PRESET_FILE_KIND || !f.preset || typeof f.preset.name !== "string" || typeof f.preset.values !== "object") throw new Error("This file is not a MathBlocks style preset.");
  // Only known look settings, with valid values (presets written before the kinds model read the same way).
  const clean: StylePreset["values"] = readLooks(f.preset.values as Record<string, unknown>);
  return { id: String(f.preset.id || `user-${Date.now()}`), name: f.preset.name, description: String(f.preset.description ?? ""), values: clean };
}
