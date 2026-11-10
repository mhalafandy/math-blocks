/**
 * Writer for OLE2 Compound File Binary (CFB) containers, as stored in word/embeddings/oleObjectN.bin
 * for an embedded OLE object. Version 3 (512-byte sectors), streams under 4096 bytes in the mini
 * stream (64-byte sectors), one storage level (the root). Spec: [MS-CFB]. The matching reader is
 * readCfb in @mathblocks/mathtype.
 */

const SECTOR = 512;
const MINI = 64;
const CUTOFF = 4096;
const FREE = 0xffffffff;
const END = 0xfffffffe;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;

/** "{B1E5A2C4-6D3F-4E8A-9C21-7F4D0A6B3E15}" → the 16 bytes as stored (first three fields little-endian). */
export function guidBytes(guid: string): Uint8Array {
  const hex = guid.replace(/[{}-]/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error("Bad GUID " + guid);
  const b = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return Uint8Array.from([b(3), b(2), b(1), b(0), b(5), b(4), b(7), b(6), b(8), b(9), b(10), b(11), b(12), b(13), b(14), b(15)]);
}

/** CFB directory order: shorter names first, then by upper-case code units. */
const compareNames = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0);

/** Builds a compound file whose root storage (class `clsid`) holds these streams. */
export function writeCfb(streams: Record<string, Uint8Array>, clsid?: string): Uint8Array {
  const names = Object.keys(streams).sort(compareNames);
  for (const n of names) if (n.length > 31) throw new Error("Stream name too long: " + n);
  const small = names.filter((n) => streams[n]!.length < CUTOFF);
  const big = names.filter((n) => streams[n]!.length >= CUTOFF);
  const sectorsFor = (bytes: number, size: number) => Math.ceil(bytes / size);

  // Mini stream: small streams back to back, each padded to 64 bytes.
  const miniStart = new Map<string, number>();
  let miniSectors = 0;
  for (const n of small) {
    miniStart.set(n, miniSectors);
    miniSectors += Math.max(1, sectorsFor(streams[n]!.length, MINI));
  }
  const miniStreamBytes = miniSectors * MINI;
  const miniFatSectors = miniSectors ? sectorsFor(miniSectors * 4, SECTOR) : 0;
  const dirSectors = sectorsFor((names.length + 1) * 128, SECTOR);
  const miniStreamSectors = sectorsFor(miniStreamBytes, SECTOR);
  const bigSectors = big.reduce((s, n) => s + sectorsFor(streams[n]!.length, SECTOR), 0);
  const others = miniFatSectors + dirSectors + miniStreamSectors + bigSectors;
  let fatSectors = 1;
  while (fatSectors * (SECTOR / 4) < fatSectors + others) fatSectors++;
  if (fatSectors > 109) throw new Error("Object too large for this writer");

  // Sector layout: FAT | mini FAT | directory | mini stream | big streams.
  const total = fatSectors + others;
  const firstMiniFat = fatSectors;
  const firstDir = firstMiniFat + miniFatSectors;
  const firstMiniStream = firstDir + dirSectors;
  let next = firstMiniStream + miniStreamSectors;
  const bigStart = new Map<string, number>();
  for (const n of big) {
    bigStart.set(n, next);
    next += sectorsFor(streams[n]!.length, SECTOR);
  }

  const buf = new Uint8Array(SECTOR * (1 + total));
  const dv = new DataView(buf.buffer);
  const at = (sector: number) => SECTOR * (1 + sector);

  // Header
  buf.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  dv.setUint16(0x18, 0x003e, true); // minor version
  dv.setUint16(0x1a, 0x0003, true); // major version 3
  dv.setUint16(0x1c, 0xfffe, true); // little-endian
  dv.setUint16(0x1e, 9, true); // 512-byte sectors
  dv.setUint16(0x20, 6, true); // 64-byte mini sectors
  dv.setUint32(0x2c, fatSectors, true);
  dv.setUint32(0x30, firstDir, true);
  dv.setUint32(0x38, CUTOFF, true);
  dv.setUint32(0x3c, miniFatSectors ? firstMiniFat : END, true);
  dv.setUint32(0x40, miniFatSectors, true);
  dv.setUint32(0x44, END, true); // no DIFAT sectors
  dv.setUint32(0x48, 0, true);
  for (let i = 0; i < 109; i++) dv.setUint32(0x4c + i * 4, i < fatSectors ? i : FREE, true);

  // FAT
  const fat = new Array<number>(fatSectors * (SECTOR / 4)).fill(FREE);
  for (let i = 0; i < fatSectors; i++) fat[i] = FATSECT;
  const chain = (start: number, count: number) => {
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? END : start + i + 1;
  };
  chain(firstMiniFat, miniFatSectors);
  chain(firstDir, dirSectors);
  chain(firstMiniStream, miniStreamSectors);
  for (const n of big) chain(bigStart.get(n)!, sectorsFor(streams[n]!.length, SECTOR));
  fat.forEach((v, i) => dv.setUint32(at(Math.floor(i / (SECTOR / 4))) + (i % (SECTOR / 4)) * 4, v, true));

  // Mini FAT and mini stream
  if (miniFatSectors) {
    const miniFat = new Array<number>(miniFatSectors * (SECTOR / 4)).fill(FREE);
    for (const n of small) {
      const s = miniStart.get(n)!;
      const c = Math.max(1, sectorsFor(streams[n]!.length, MINI));
      for (let i = 0; i < c; i++) miniFat[s + i] = i === c - 1 ? END : s + i + 1;
      buf.set(streams[n]!, at(firstMiniStream) + s * MINI);
    }
    miniFat.forEach((v, i) => dv.setUint32(at(firstMiniFat) + i * 4, v, true));
  }
  for (const n of big) buf.set(streams[n]!, at(bigStart.get(n)!));

  // Directory: root, then the streams as a chain of right siblings in sorted order (a valid,
  // if unbalanced, binary search tree; all nodes black).
  const entry = (i: number, name: string, type: number, child: number, right: number, start: number, size: number) => {
    const o = at(firstDir) + i * 128;
    for (let j = 0; j < name.length; j++) dv.setUint16(o + j * 2, name.charCodeAt(j), true);
    dv.setUint16(o + 0x40, (name.length + 1) * 2, true);
    buf[o + 0x42] = type;
    buf[o + 0x43] = 1; // black
    dv.setUint32(o + 0x44, NOSTREAM, true); // left sibling
    dv.setUint32(o + 0x48, right, true);
    dv.setUint32(o + 0x4c, child, true);
    if (type === 5 && clsid) buf.set(guidBytes(clsid), o + 0x50);
    dv.setUint32(o + 0x74, start, true);
    dv.setUint32(o + 0x78, size, true);
  };
  entry(0, "Root Entry", 5, names.length ? 1 : NOSTREAM, NOSTREAM, miniStreamSectors ? firstMiniStream : END, miniStreamBytes);
  names.forEach((n, k) => {
    const size = streams[n]!.length;
    const start = size < CUTOFF ? miniStart.get(n)! : bigStart.get(n)!;
    entry(k + 1, n, 2, NOSTREAM, k + 1 < names.length ? k + 2 : NOSTREAM, start, size);
  });
  // Unused directory slots: empty entries.
  for (let i = names.length + 1; i < dirSectors * 4; i++) {
    const o = at(firstDir) + i * 128;
    dv.setUint32(o + 0x44, NOSTREAM, true);
    dv.setUint32(o + 0x48, NOSTREAM, true);
    dv.setUint32(o + 0x4c, NOSTREAM, true);
  }
  return buf;
}

// ------------------------------------------------------------------ OLE object streams

const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u32 = (v: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, true);
  return b;
};
const lpAnsi = (s: string) => concat([u32(s.length + 1), ascii(s), new Uint8Array(1)]);

/** "\x01Ole" stream of an embedded object ([MS-OLEDS] 2.3.3): version, no flags, no moniker. */
export const oleStream = () => concat([u32(0x02000001), u32(0), u32(0), u32(0), u32(0)]);

/** "\x01CompObj" stream ([MS-OLEDS] 2.3.8): user type name, no clipboard format, ProgID. */
export function compObjStream(userType: string, progId: string, clsid: string): Uint8Array {
  return concat([u32(0xfffe0001), u32(0x00000a03), u32(0xffffffff), guidBytes(clsid), lpAnsi(userType), u32(0), lpAnsi(progId)]);
}
