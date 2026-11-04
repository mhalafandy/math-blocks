/**
 * Writes an equation as an Enhanced Metafile (EMF): vector graphics every Word version shows
 * (MathType's own previews are metafiles too). The equation's source is stored in a GDI comment,
 * so the picture carries what is needed to edit it again.
 */
import type { PaintOp, PathCmd, RenderResult } from "./svg";

const EMR = {
  HEADER: 1, POLYBEZIERTO: 5, EOF: 14, SETMAPMODE: 17, SETBKMODE: 18, SETPOLYFILLMODE: 19,
  SETWINDOWEXTEX: 9, SETWINDOWORGEX: 10, SETVIEWPORTEXTEX: 11, SETVIEWPORTORGEX: 12, MOVETOEX: 27,
  SELECTOBJECT: 37, CREATEBRUSHINDIRECT: 39, DELETEOBJECT: 40, LINETO: 54, BEGINPATH: 59,
  ENDPATH: 60, CLOSEFIGURE: 61, FILLPATH: 62, GDICOMMENT: 70,
};
const NULL_PEN = 0x80000008;
const MM_ANISOTROPIC = 8;

/** Marker at the start of the comment that carries the equation source. */
export const EMF_COMMENT_MARKER = "MathBlocks1:";

class Writer {
  private chunks: number[] = [];
  records = 0;
  record(type: number, body: number[]) {
    const size = 8 + body.length * 4;
    this.chunks.push(type, size, ...body);
    this.records++;
  }
  /** Record with raw bytes (comment): data padded to 4 bytes. */
  bytesRecord(type: number, data: Uint8Array) {
    const padded = Math.ceil(data.length / 4) * 4;
    const body = new Uint8Array(4 + padded);
    new DataView(body.buffer).setUint32(0, data.length, true);
    body.set(data, 4);
    const ints = Array.from(new Int32Array(body.buffer));
    this.record(type, ints);
  }
  words() {
    return this.chunks;
  }
}

const rgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1]!, 16) : 0;
  return ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff); // COLORREF 0x00BBGGRR
};

export interface EmfOptions {
  /** Text stored in the metafile (the equation's source). */
  comment?: string;
}

/** Converts the engine's drawing (RenderResult) into an EMF file. */
export function renderEmf(r: RenderResult, o: EmfOptions = {}): Uint8Array {
  const w = new Writer();
  // Device: 96 dpi. Logical units: the SVG's (1000 per em).
  const pxW = Math.max(1, Math.round((r.widthPt * 96) / 72));
  const pxH = Math.max(1, Math.round((r.heightPt * 96) / 72));
  const logW = Math.round(r.viewW);
  const logH = Math.round(r.viewH);
  const header: number[] = [];
  w.record(EMR.SETMAPMODE, [MM_ANISOTROPIC]);
  w.record(EMR.SETWINDOWORGEX, [0, 0]);
  w.record(EMR.SETWINDOWEXTEX, [logW, logH]);
  w.record(EMR.SETVIEWPORTORGEX, [0, 0]);
  w.record(EMR.SETVIEWPORTEXTEX, [pxW, pxH]);
  w.record(EMR.SETBKMODE, [1]);
  w.record(EMR.SETPOLYFILLMODE, [2]); // WINDING: glyph outlines
  w.record(EMR.SELECTOBJECT, [NULL_PEN]);
  if (o.comment) w.bytesRecord(EMR.GDICOMMENT, new TextEncoder().encode(EMF_COMMENT_MARKER + o.comment));

  const brushes = new Map<string, number>();
  let nextHandle = 1;
  const brush = (color: string) => {
    let h = brushes.get(color);
    if (h === undefined) {
      h = nextHandle++;
      brushes.set(color, h);
      w.record(EMR.CREATEBRUSHINDIRECT, [h, 0, rgb(color), 0]);
    }
    w.record(EMR.SELECTOBJECT, [h]);
  };

  let current = "";
  for (const op of r.ops) {
    if (op.color !== current) {
      brush(op.color);
      current = op.color;
    }
    w.record(EMR.BEGINPATH, []);
    if (op.kind === "rect") rectPath(w, op);
    else glyphPath(w, op);
    w.record(EMR.ENDPATH, []);
    w.record(EMR.FILLPATH, [0, 0, logW, logH]);
  }
  for (const h of brushes.values()) w.record(EMR.DELETEOBJECT, [h]);
  w.record(EMR.EOF, [0, 16, 20]);

  const body = w.words();
  // Header (with both extensions: 108 bytes).
  const totalBytes = 108 + body.length * 4;
  const frameW = Math.round(((r.widthPt * 25.4) / 72) * 100); // 0.01 mm
  const frameH = Math.round(((r.heightPt * 25.4) / 72) * 100);
  header.push(
    EMR.HEADER, 108,
    0, 0, pxW - 1, pxH - 1, // bounds (device)
    0, 0, frameW, frameH, // frame (0.01 mm)
    0x464d4520, 0x10000, totalBytes, w.records + 1,
    (brushes.size + 1) | 0, // handles (16-bit) + reserved (16-bit, 0)
    0, 0, 0, // nDescription, offDescription, nPalEntries
    1024, 768, // device size (px)
    271, 203, // device size (mm)
    0, 0, 0, // pixel format, OpenGL
    270933, 203200, // device size (µm)
  );
  const out = new Int32Array(header.length + body.length);
  out.set(header.map((v) => v | 0));
  out.set(body.map((v) => v | 0), header.length);
  return new Uint8Array(out.buffer);
}

function rectPath(w: Writer, op: Extract<PaintOp, { kind: "rect" }>) {
  const x0 = Math.round(op.x), y0 = Math.round(op.y), x1 = Math.round(op.x + op.w), y1 = Math.round(op.y + op.h);
  w.record(EMR.MOVETOEX, [x0, y0]);
  w.record(EMR.LINETO, [x1, y0]);
  w.record(EMR.LINETO, [x1, y1]);
  w.record(EMR.LINETO, [x0, y1]);
  w.record(EMR.CLOSEFIGURE, []);
}

function glyphPath(w: Writer, op: Extract<PaintOp, { kind: "path" }>) {
  const [a, b, c, d, e, f] = op.m;
  const tx = (x = 0, y = 0): [number, number] => [Math.round(a * x + c * y + e), Math.round(b * x + d * y + f)];
  let cx = 0, cy = 0; // current point (untransformed) for quadratic → cubic
  let open = false;
  for (const cmd of op.cmds as PathCmd[]) {
    switch (cmd.type) {
      case "M": {
        if (open) w.record(EMR.CLOSEFIGURE, []);
        w.record(EMR.MOVETOEX, tx(cmd.x, cmd.y));
        cx = cmd.x ?? 0;
        cy = cmd.y ?? 0;
        open = true;
        break;
      }
      case "L":
        w.record(EMR.LINETO, tx(cmd.x, cmd.y));
        cx = cmd.x ?? 0;
        cy = cmd.y ?? 0;
        break;
      case "C": {
        const pts = [...tx(cmd.x1, cmd.y1), ...tx(cmd.x2, cmd.y2), ...tx(cmd.x, cmd.y)];
        w.record(EMR.POLYBEZIERTO, [...bounds(pts), 3, ...pts]);
        cx = cmd.x ?? 0;
        cy = cmd.y ?? 0;
        break;
      }
      case "Q": {
        const qx = cmd.x1 ?? 0, qy = cmd.y1 ?? 0, x = cmd.x ?? 0, y = cmd.y ?? 0;
        const c1x = cx + (2 / 3) * (qx - cx), c1y = cy + (2 / 3) * (qy - cy);
        const c2x = x + (2 / 3) * (qx - x), c2y = y + (2 / 3) * (qy - y);
        const pts = [...tx(c1x, c1y), ...tx(c2x, c2y), ...tx(x, y)];
        w.record(EMR.POLYBEZIERTO, [...bounds(pts), 3, ...pts]);
        cx = x;
        cy = y;
        break;
      }
      case "Z":
        w.record(EMR.CLOSEFIGURE, []);
        open = false;
        break;
    }
  }
  if (open) w.record(EMR.CLOSEFIGURE, []);
}

function bounds(pts: number[]): [number, number, number, number] {
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Reads the equation source back from an EMF made by renderEmf (null if absent). */
export function emfComment(bytes: Uint8Array): string | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  while (off + 8 <= bytes.length) {
    const type = dv.getUint32(off, true);
    const size = dv.getUint32(off + 4, true);
    if (size < 8 || off + size > bytes.length) break;
    if (type === EMR.GDICOMMENT) {
      const n = dv.getUint32(off + 8, true);
      const text = new TextDecoder().decode(bytes.subarray(off + 12, off + 12 + n));
      if (text.startsWith(EMF_COMMENT_MARKER)) return text.slice(EMF_COMMENT_MARKER.length);
    }
    if (type === EMR.EOF) break;
    off += size;
  }
  return null;
}
