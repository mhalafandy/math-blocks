import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// The math font for rendering in Node (as wordInsertion.test.ts).
const here = dirname(fileURLToPath(import.meta.url));
const stixFile = join(dirname(createRequire(import.meta.url).resolve("@fontsource/stix-two-math/package.json", { paths: [join(here, "../../../packages/math-render")] })), "files", "stix-two-math-latin-400-normal.woff");
vi.stubGlobal("fetch", async () => ({ arrayBuffer: async () => new Uint8Array(readFileSync(stixFile)).buffer }));

const word = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[] }));

vi.mock("./connector", async () => {
  const { interchangeScan } = await import("./interchangeFixture");
  return {
    isDesktop: () => false,
    addinSupports: () => true,
    bringToFront: async () => undefined,
    connector: {
      async request(method: string, params: Record<string, unknown>) {
        word.calls.push({ method, params });
        if (method === "scanInterchange") return interchangeScan();
        if (method === "backupDocument") return { path: "C:\\backups\\t.xml" };
        if (method === "beginOperation") return { ok: true };
        if (method === "endOperation") return { ms: 1, undoBrokenAt: "" };
        if (method === "convertInterchange") {
          const items = params.items as { id: number }[];
          return { results: items.map((i) => ({ id: i.id, ok: true, problem: "" })), done: items.length, ms: 42, numbers: 5, references: 4 };
        }
        throw new Error(`unexpected ${method}`);
      },
    },
  };
});

const { convertLatexDocument } = await import("./latexInterchangeRun");

describe("Convert LaTeX (interchange) — what is sent to Word", () => {
  it("one operation: every valid equation, the markers, the references; numbers from the markers", async () => {
    word.calls.length = 0;
    const r = (await convertLatexDocument({ yes: true }))!;
    const methods = word.calls.map((c) => c.method);
    expect(methods.indexOf("beginOperation")).toBeLessThan(methods.indexOf("convertInterchange"));
    expect(methods.indexOf("convertInterchange")).toBeLessThan(methods.indexOf("endOperation"));
    expect(methods.filter((m) => m === "convertInterchange")).toHaveLength(1);
    const call = word.calls.find((c) => c.method === "convertInterchange")!;
    const items = call.params.items as Record<string, unknown>[];
    const kinds = items.map((i) => i.kind);
    expect(kinds.filter((k) => k === "inline")).toHaveLength(6);
    expect(kinds.filter((k) => k === "display")).toHaveLength(12);
    expect(kinds.filter((k) => k === "marker")).toHaveLength(9);
    expect(kinds.filter((k) => k === "ref")).toHaveLength(6);
    expect(kinds.filter((k) => k === "highlight")).toHaveLength(1);
    expect(call.params.format).toMatchObject({ parts: "section", source: "markers", open: "(", close: ")" });
    expect(items.filter((i) => i.kind === "marker").map((i) => `${i.chapter}.${i.section}`)).toEqual(["3.0", "3.1", "3.2", "4.0", "4.1", "4.2", "1.0", "1.1", "1.2"]);
    const numbered = items.filter((i) => i.kind === "display" && i.numbered);
    expect(numbered.map((i) => i.bookmark ?? null)).toEqual(["_MBEq_3_1_1", "_MBEq_3_1_2", "_MBEq_3_2_1", "_MBEq_3_2_2", "_MBEq_newton", "_MBEq_4_1_1", "_MBEq_4_1_9", "_MBEq_3_3_1", null, null, "_MBEq_A_2_1"]);
    expect(numbered.map((i) => i.appendix)).toEqual([false, false, false, false, false, false, false, false, true, true, true]);
    for (const i of items.filter((x) => x.kind === "inline" || x.kind === "display")) {
      expect(String(i.flatOpc)).toContain("MathBlocks.Equation");
      expect(String(i.tag)).toMatch(/^mb1\|/);
    }
    expect(r.equations).toBe(18);
    expect(r.failed).toEqual([]);
    expect(r.tags.filter((t) => t.number)).toHaveLength(11);
  });
});
