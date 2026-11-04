import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { validateLatex } from "mathlive/ssr";
import { loadFont, type FontSet } from "@mathblocks/math-render";
import { ENTRIES, type Support } from "./palette";
import { entrySupport, isRegression, type SupportResult } from "./paletteSupport";

/**
 * Computes how every palette entry works in MathLive, Classic, Word (OMML) and the LaTeX round
 * trip, and compares it with palette-support.json: anything that got worse fails. After adding
 * or improving entries, refresh the file: UPDATE_PALETTE_SUPPORT=1 pnpm test palette.support
 * Fonts: Liberation Serif for Times New Roman (CI installs fonts-liberation), STIX Two Math.
 */
const L = "/usr/share/fonts/truetype/liberation/LiberationSerif-";
const require = createRequire(import.meta.url);
const STIX = require.resolve("@fontsource/stix-two-math/files/stix-two-math-latin-400-normal.woff");
const available = existsSync(`${L}Regular.ttf`);
const FILE = new URL("./palette-support.json", import.meta.url);

type Recorded = Record<string, Omit<SupportResult, "notes"> & { notes?: string[] }>;

describe.skipIf(!available && !process.env.CI)("palette support", () => {
  it("no entry works worse than recorded in palette-support.json", () => {
    expect(available, "Liberation Serif is required (apt install fonts-liberation)").toBe(true);
    const fonts: FontSet = {
      regular: loadFont(readFileSync(`${L}Regular.ttf`)),
      italic: loadFont(readFileSync(`${L}Italic.ttf`)),
      bold: loadFont(readFileSync(`${L}Bold.ttf`)),
      boldItalic: loadFont(readFileSync(`${L}BoldItalic.ttf`)),
      math: loadFont(readFileSync(STIX)),
    };
    const deps = { fonts, validate: (l: string) => validateLatex(l) as { code: string; arg?: string }[] };
    const now: Recorded = {};
    for (const e of [...ENTRIES].sort((a, b) => a.id.localeCompare(b.id))) {
      const r = entrySupport(e, deps);
      now[e.id] = { mathlive: r.mathlive, classic: r.classic, omml: r.omml, roundtrip: r.roundtrip, ...(r.notes.length ? { notes: r.notes } : {}) };
    }
    if (process.env.UPDATE_PALETTE_SUPPORT) {
      writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n");
      return;
    }
    const before = JSON.parse(readFileSync(FILE, "utf8")) as Recorded;
    const problems: string[] = [];
    for (const [id, r] of Object.entries(now)) {
      const b = before[id];
      if (!b) {
        problems.push(`${id}: new entry — refresh palette-support.json`);
        continue;
      }
      for (const k of ["mathlive", "classic", "omml", "roundtrip"] as const)
        if (isRegression(r[k], b[k] as Support)) problems.push(`${id}: ${k} ${b[k]} → ${r[k]} (${(r.notes ?? []).join("; ")})`);
    }
    for (const id of Object.keys(before)) if (!now[id]) problems.push(`${id}: no longer in the palette — refresh palette-support.json`);
    expect(problems).toEqual([]);
  });
});
