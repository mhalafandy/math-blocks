/**
 * Windows Metafiles (WMF) as MathType writes its equation previews: the records it uses read into
 * drawing operations (text with its font, polygons, rectangles, lines), in the metafile's logical
 * units with the placeable header's bounds. The app draws them with real font outlines to compare
 * MathType's picture with MathBlocks' (tools and the self-test; nothing here draws).
 *
 * Also a small writer (polygons and text) for synthetic MathType documents in the tests.
 */

export interface WmfFont {
  face: string;
  /** Character height in logical units (negative lfHeight: the em; positive: the cell). */
  height: number;
  weight: number;
  italic: boolean;
  charset: number;
}

export type WmfOp =
  | { k: "text"; x: number; y: number; codes: number[]; dx?: number[]; font: WmfFont; align: number }
  | { k: "poly"; rings: [number, number][][]; fill: boolean }
  | { k: "rect"; left: number; top: number; right: number; bottom: number }
  | { k: "line"; pts: [number, number][] };

export interface Wmf {
  /** Placeable header bounds (logical units) and units per inch. */
  bounds: { left: number; top: number; right: number; bottom: number };
  inch: number;
  /** Window origin and extent when the metafile sets them. */
  window?: { x: number; y: number; w: number; h: number };
  ops: WmfOp[];
}

const PLACEABLE = 0x9ac6cdd7;

/** Reads a WMF (with or without the placeable header). Unknown records are skipped. */
export function readWmf(bytes: Uint8Array): Wmf {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  let bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  let inch = 1440;
  if (v.getUint32(0, true) === PLACEABLE) {
    bounds = { left: v.getInt16(6, true), top: v.getInt16(8, true), right: v.getInt16(10, true), bottom: v.getInt16(12, true) };
    inch = v.getUint16(14, true) || 1440;
    p = 22;
  }
  // META_HEADER: type, header size (words), version, size, objects, max record, params.
  const headerWords = v.getUint16(p + 2, true);
  const objectCount = v.getUint16(p + 10, true);
  p += headerWords * 2;
  const objects: (null | { kind: "font"; font: WmfFont } | { kind: "pen" | "brush" | "other"; nullBrush?: boolean })[] = new Array(Math.max(objectCount, 1)).fill(null);
  const add = (o: (typeof objects)[number]) => {
    const i = objects.indexOf(null);
    if (i >= 0) objects[i] = o;
    else objects.push(o);
  };
  let font: WmfFont = { face: "Times New Roman", height: -12, weight: 400, italic: false, charset: 0 };
  let align = 0;
  let fill = true;
  let window: Wmf["window"];
  let cur: [number, number] = [0, 0];
  let line: [number, number][] | null = null;
  const ops: WmfOp[] = [];
  const flushLine = () => {
    if (line && line.length > 1) ops.push({ k: "line", pts: line });
    line = null;
  };
  while (p + 6 <= bytes.length) {
    const size = v.getUint32(p, true) * 2;
    const fn = v.getUint16(p + 4, true);
    if (size < 6 || p + size > bytes.length) break;
    const a = p + 6; // parameters
    const i16 = (k: number) => v.getInt16(a + 2 * k, true);
    const u16 = (k: number) => v.getUint16(a + 2 * k, true);
    switch (fn) {
      case 0x0000:
        p = bytes.length;
        continue;
      case 0x020b: // SetWindowOrg(y, x)
        window = { ...(window ?? { w: 0, h: 0 }), y: i16(0), x: i16(1) };
        break;
      case 0x020c: // SetWindowExt(y, x)
        window = { ...(window ?? { x: 0, y: 0 }), h: i16(0), w: i16(1) };
        break;
      case 0x012e: // SetTextAlign
        align = u16(0);
        break;
      case 0x02fb: {
        // CreateFontIndirect
        let face = "";
        for (let k = 18; k < 18 + 32 && a + k < p + size; k++) {
          const c = bytes[a + k]!;
          if (!c) break;
          face += String.fromCharCode(c);
        }
        add({ kind: "font", font: { height: i16(0), weight: i16(4), italic: bytes[a + 10]! !== 0, charset: bytes[a + 13]!, face } });
        break;
      }
      case 0x02fa: // CreatePenIndirect
        add({ kind: "pen" });
        break;
      case 0x02fc: // CreateBrushIndirect: style 1 = BS_NULL
        add({ kind: "brush", nullBrush: u16(0) === 1 });
        break;
      case 0x0142: // DibCreatePatternBrush
      case 0x00f7: // CreatePalette
      case 0x06ff: // CreateRegion
        add({ kind: "other" });
        break;
      case 0x012d: {
        // SelectObject
        const o = objects[u16(0)];
        if (o?.kind === "font") font = o.font;
        else if (o?.kind === "brush") fill = !o.nullBrush;
        break;
      }
      case 0x01f0: // DeleteObject
        if (u16(0) < objects.length) objects[u16(0)] = null;
        break;
      case 0x0521: {
        // TextOut(count, string…, y, x)
        const n = u16(0);
        const codes = [...bytes.subarray(a + 2, a + 2 + n)];
        const off = a + 2 + n + (n % 2);
        ops.push({ k: "text", y: v.getInt16(off, true), x: v.getInt16(off + 2, true), codes, font, align });
        break;
      }
      case 0x0a32: {
        // ExtTextOut(y, x, count, options, [rect], string, [dx])
        const y = i16(0);
        const x = i16(1);
        const n = u16(2);
        const opts = u16(3);
        let q = a + 8 + (opts & 0x0006 ? 8 : 0);
        const codes = [...bytes.subarray(q, q + n)];
        q += n + (n % 2);
        const dx: number[] = [];
        if (q + 2 * n <= p + size) for (let k = 0; k < n; k++) dx.push(v.getInt16(q + 2 * k, true));
        ops.push({ k: "text", x, y, codes, dx: dx.length === n ? dx : undefined, font, align });
        break;
      }
      case 0x0324: // Polygon(count, points)
      case 0x0325: {
        // Polyline
        const n = u16(0);
        const pts: [number, number][] = [];
        for (let k = 0; k < n; k++) pts.push([i16(1 + 2 * k), i16(2 + 2 * k)]);
        ops.push(fn === 0x0324 ? { k: "poly", rings: [pts], fill } : { k: "line", pts });
        break;
      }
      case 0x0538: {
        // PolyPolygon(polygons, counts…, points…)
        const np = u16(0);
        const counts = Array.from({ length: np }, (_, k) => u16(1 + k));
        let k = 1 + np;
        const rings = counts.map((c) => {
          const ring: [number, number][] = [];
          for (let j = 0; j < c; j++, k += 2) ring.push([i16(k), i16(k + 1)]);
          return ring;
        });
        ops.push({ k: "poly", rings, fill });
        break;
      }
      case 0x041b: // Rectangle(bottom, right, top, left)
        ops.push({ k: "rect", bottom: i16(0), right: i16(1), top: i16(2), left: i16(3) });
        break;
      case 0x0214: // MoveTo(y, x)
        flushLine();
        cur = [i16(1), i16(0)];
        line = [cur];
        break;
      case 0x0213: // LineTo(y, x)
        cur = [i16(1), i16(0)];
        (line ??= []).push(cur);
        break;
      default:
        break;
    }
    p += size;
  }
  flushLine();
  if (!bounds.right && !bounds.bottom && window) bounds = { left: window.x, top: window.y, right: window.x + window.w, bottom: window.y + window.h };
  return { bounds, inch, window, ops };
}

/** Writes a placeable WMF with filled polygons and text (tests, synthetic MathType documents). */
export function writeWmf(o: { bounds: Wmf["bounds"]; inch?: number; polys?: [number, number][][][]; texts?: { x: number; y: number; text: string; face: string; height: number; italic?: boolean }[] }): Uint8Array {
  const words: number[] = [];
  const rec = (fn: number, params: number[]) => words.push((params.length + 3) & 0xffff, (params.length + 3) >>> 16, fn, ...params.map((x) => x & 0xffff));
  const b = o.bounds;
  rec(0x020b, [b.top, b.left]);
  rec(0x020c, [b.bottom - b.top, b.right - b.left]);
  rec(0x02fc, [0, 0, 0, 0]); // solid black brush (object 0)
  rec(0x012d, [0]);
  for (const rings of o.polys ?? []) {
    const pts = rings.flat();
    rec(0x0538, [rings.length, ...rings.map((r) => r.length), ...pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)])]);
  }
  let objects = 1;
  for (const t of o.texts ?? []) {
    const face = [...t.face.slice(0, 31)].map((c) => c.charCodeAt(0));
    while (face.length < 32) face.push(0);
    const lf = [-Math.round(t.height), 0, 0, 0, 400, (t.italic ? 1 : 0) | 0, 0, 0];
    const faceWords: number[] = [];
    for (let k = 0; k < 32; k += 2) faceWords.push(face[k]! | (face[k + 1]! << 8));
    // lfHeight, lfWidth, escapement, orientation, weight; then 8 bytes (italic, underline, strikeout,
    // charset, precisions, quality, pitch) and the 32-byte face name.
    rec(0x02fb, [...lf.slice(0, 5), t.italic ? 1 : 0, 0, 0, 0, ...faceWords]);
    rec(0x012d, [objects++]);
    rec(0x012e, [24]); // TA_BASELINE
    const s = [...t.text].map((c) => c.charCodeAt(0) & 0xff);
    if (s.length % 2) s.push(0);
    const sw: number[] = [];
    for (let k = 0; k < s.length; k += 2) sw.push(s[k]! | (s[k + 1]! << 8));
    rec(0x0521, [t.text.length, ...sw, Math.round(t.y), Math.round(t.x)]);
  }
  rec(0x0000, []);
  const body = new Uint8Array(18 + words.length * 2);
  const dv = new DataView(body.buffer);
  dv.setUint16(0, 1, true);
  dv.setUint16(2, 9, true);
  dv.setUint16(4, 0x0300, true);
  dv.setUint32(6, (18 + words.length * 2) / 2, true);
  dv.setUint16(10, objects + 1, true);
  words.forEach((w, k) => dv.setUint16(18 + 2 * k, w, true));
  const out = new Uint8Array(22 + body.length);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, PLACEABLE, true);
  ov.setInt16(6, b.left, true);
  ov.setInt16(8, b.top, true);
  ov.setInt16(10, b.right, true);
  ov.setInt16(12, b.bottom, true);
  ov.setUint16(14, o.inch ?? 1440, true);
  let sum = 0;
  for (let k = 0; k < 10; k++) sum ^= ov.getUint16(2 * k, true);
  ov.setUint16(20, sum, true);
  out.set(body, 22);
  return out;
}
