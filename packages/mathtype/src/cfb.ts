/**
 * Reader for OLE2 / Compound File Binary (CFB) containers, as used by embedded OLE objects
 * (word/embeddings/oleObjectN.bin). Read-only, no dependencies. Spec: [MS-CFB].
 */
export class CfbError extends Error {}

export interface CfbEntry {
  name: string;
  type: "storage" | "stream" | "root";
  data: Uint8Array;
}

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

export function readCfb(buf: Uint8Array): Map<string, CfbEntry> {
  if (buf.length < 512 || !SIGNATURE.every((b, i) => buf[i] === b)) throw new CfbError("Not an OLE compound file");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  const sectorSize = 1 << u16(0x1e);
  const miniSectorSize = 1 << u16(0x20);
  const firstDir = u32(0x30);
  const miniCutoff = u32(0x38);
  const firstMiniFat = u32(0x3c);
  const firstDifat = u32(0x44);
  const numDifat = u32(0x48);
  const sectorOffset = (n: number) => (n + 1) * sectorSize;

  // FAT sector numbers: 109 in the header, then chained DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREE) fatSectors.push(s);
  }
  for (let s = firstDifat, k = 0; s !== END_OF_CHAIN && s !== FREE && k < numDifat; k++) {
    const off = sectorOffset(s);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const v = u32(off + i * 4);
      if (v !== FREE) fatSectors.push(v);
    }
    s = u32(off + per * 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const off = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(off + i * 4 + 4 <= buf.length ? u32(off + i * 4) : FREE);
  }

  const chain = (start: number, next: number[]) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== END_OF_CHAIN && s !== FREE && s < next.length; s = next[s]!) {
      if (seen.has(s)) throw new CfbError("Corrupt sector chain");
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const s of chain(start, fat)) {
      if (pos >= size) break;
      const off = sectorOffset(s);
      const n = Math.min(sectorSize, size - pos, buf.length - off);
      out.set(buf.subarray(off, off + n), pos);
      pos += n;
    }
    return out;
  };

  // Directory
  const dirSectors = chain(firstDir, fat);
  const dirBytes = new Uint8Array(dirSectors.length * sectorSize);
  dirSectors.forEach((s, i) => dirBytes.set(buf.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), i * sectorSize));
  const ddv = new DataView(dirBytes.buffer);
  interface Raw { name: string; type: number; start: number; size: number }
  const raws: Raw[] = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const nameLen = ddv.getUint16(o + 0x40, true);
    const type = dirBytes[o + 0x42]!;
    let name = "";
    for (let i = 0; i + 2 <= Math.max(0, nameLen - 2); i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    raws.push({ name, type, start: ddv.getUint32(o + 0x74, true), size: ddv.getUint32(o + 0x78, true) });
  }
  const root = raws[0];
  if (!root || root.type !== 5) throw new CfbError("Missing root entry");

  // Mini stream (small streams live here, in 64-byte sectors).
  const miniStream = readChain(root.start, root.size);
  const miniFat: number[] = [];
  if (firstMiniFat !== END_OF_CHAIN) {
    const bytes = readChain(firstMiniFat, chain(firstMiniFat, fat).length * sectorSize);
    const mdv = new DataView(bytes.buffer);
    for (let i = 0; i + 4 <= bytes.length; i += 4) miniFat.push(mdv.getUint32(i, true));
  }
  const readMini = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const s of chain(start, miniFat)) {
      if (pos >= size) break;
      const off = s * miniSectorSize;
      const n = Math.min(miniSectorSize, size - pos);
      out.set(miniStream.subarray(off, off + n), pos);
      pos += n;
    }
    return out;
  };

  const entries = new Map<string, CfbEntry>();
  for (const r of raws) {
    if (r.type === 2) entries.set(r.name, { name: r.name, type: "stream", data: r.size < miniCutoff ? readMini(r.start, r.size) : readChain(r.start, r.size) });
    else if (r.type === 1) entries.set(r.name, { name: r.name, type: "storage", data: new Uint8Array() });
  }
  return entries;
}
