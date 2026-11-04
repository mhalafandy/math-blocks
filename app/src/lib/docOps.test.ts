import { describe, expect, it, vi } from "vitest";

const calls: { method: string; params: Record<string, unknown> }[] = [];
let cancelAfter = Infinity;
vi.mock("./connector", () => ({
  isDesktop: () => false,
  addinSupports: () => true,
  connector: {
    async request(method: string, params: Record<string, unknown>) {
      calls.push({ method, params });
      if (method === "replaceMany") return { replaced: (params.items as unknown[]).length, missing: [] };
      if (method === "operationProgress") return { cancelled: (params.done as number) >= cancelAfter };
      if (method === "backupDocument") return { path: "C:\\backups\\t.xml" };
      if (method === "endOperation") return { ms: 1200 };
      return { ok: true };
    },
  },
}));
const { replaceInDocument, describeOperation } = await import("./docOps");

const items = Array.from({ length: 35 }, (_, i) => ({ tag: `t${i}`, flatOpc: `new${i}`, previous: `old${i}` }));

describe("document-wide replacements", () => {
  it("backs up, replaces in batches inside one operation, and reports the time per equation", async () => {
    calls.length = 0;
    cancelAfter = Infinity;
    const r = await replaceInDocument({ document: "d", title: "Restyle", undoLabel: "Restyle", items });
    expect(calls[0]!.method).toBe("backupDocument");
    expect(calls[1]!.method).toBe("beginOperation");
    expect(calls.filter((c) => c.method === "replaceMany")).toHaveLength(4);
    expect(calls.at(-1)!.method).toBe("endOperation");
    expect(r).toMatchObject({ replaced: 35, cancelled: false, backup: "C:\\backups\\t.xml" });
    expect(describeOperation(r, "Restyled")).toBe("Restyled: 35 equation(s) in 1.2 s (34 ms each). Backup: t.xml");
  });

  it("Cancel restores every equation already replaced from its stored XML", async () => {
    calls.length = 0;
    cancelAfter = 20;
    const r = await replaceInDocument({ document: "d", title: "Restyle", undoLabel: "Restyle", items });
    expect(r.cancelled).toBe(true);
    expect(r.restored).toBe(20);
    const restoring = calls.filter((c) => c.method === "replaceMany").slice(2).flatMap((c) => c.params.items as { tag: string; flatOpc: string }[]);
    expect(restoring.map((x) => x.flatOpc)).toEqual(items.slice(0, 20).map((x) => x.previous));
    expect(describeOperation(r, "Restyled")).toMatch(/^Cancelled: 20 equation\(s\) restored/);
  });
});
