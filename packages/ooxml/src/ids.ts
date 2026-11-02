/**
 * Identifiers and content-control tags.
 *
 * Every equation MathBlocks inserts is wrapped in a content control whose tag
 * identifies it. Word limits tag length, so IDs are short random base62 strings
 * rather than UUIDs (see DECISIONS.md, D-008).
 *
 *   mb1|<blockId or ->|<instanceId>
 *
 *  - "mb1"       tag format version
 *  - blockId     16 chars (~95 bits): the reusable block this instance links to, "-" if none
 *  - instanceId  12 chars (~71 bits): unique within the document
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomId(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  // 248 = 62*4: rejection sampling keeps the distribution uniform
  for (let i = 0; out.length < length; i++) {
    if (i >= bytes.length) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i]!;
    if (b < 248) out += ALPHABET[b % 62];
  }
  return out;
}

export const newBlockId = () => randomId(16);
export const newInstanceId = () => randomId(12);

export interface EquationTag {
  version: 1;
  blockId: string | null;
  instanceId: string;
}

const TAG_RE = /^mb1\|([0-9A-Za-z]{16}|-)\|([0-9A-Za-z]{12})$/;

export function formatTag(t: Omit<EquationTag, "version">): string {
  return `mb1|${t.blockId ?? "-"}|${t.instanceId}`;
}

/** Returns null for tags that MathBlocks did not create. Never throws. */
export function parseTag(tag: string | null | undefined): EquationTag | null {
  const m = tag ? TAG_RE.exec(tag) : null;
  if (!m) return null;
  return { version: 1, blockId: m[1] === "-" ? null : m[1]!, instanceId: m[2]! };
}
