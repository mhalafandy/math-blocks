import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRegistry, serializeRegistry } from "@mathblocks/ooxml";

const word = { registry: "", calls: [] as { method: string; params: Record<string, unknown> }[], repair: {} as Record<string, unknown> };
vi.mock("./connector", () => ({
  isDesktop: () => false,
  addinSupports: () => true,
  connector: {
    async request(method: string, params: Record<string, unknown>) {
      word.calls.push({ method, params });
      if (method === "repairEquations") return params.dryRun ? { ...word.repair, document: "C:\\t.docx" } : { ...word.repair, document: "C:\\t.docx" };
      if (method === "getRegistry") return { xml: word.registry, fullName: "C:\\t.docx" };
      if (method === "setRegistry") {
        word.registry = params.xml as string;
        return { ok: true };
      }
      if (method === "backupDocument") return { path: "C:\\b\\t.xml" };
      return { ok: true };
    },
  },
}));
vi.mock("./library/useLibrary", () => ({
  useLibrary: { getState: () => ({ equations: [{ id: "BLOCKINLIBRARY01", name: "F", currentVersion: 2, latex: "F=ma", display: true }] }) },
}));
const { repairDocument, identityChanges } = await import("./repair");

describe("repair equations", () => {
  beforeEach(() => {
    word.calls = [];
    word.registry = serializeRegistry({ docId: "d", blocks: {}, sources: { oldInstanc01: { id: "oldInstanc01", latex: "\\pvec{r}", hash: "h1" } } });
  });

  it("moves native sources to the new id, registers linked copies from the library, unlinks unknown ones", async () => {
    word.repair = {
      renamed: [{ from: "mb1|-|oldInstanc01", to: "mb1|-|newInstanc01" }],
      wrapped: [
        { tag: "mb1|BLOCKINLIBRARY01|pastedCopy01", source: "emf" },
        { tag: "mb1|BLOCKNOWHERE0001|pastedCopy02", source: "alt" },
      ],
      wrappedOk: 3,
      bookmarks: 1,
      otherPictures: 2,
    };
    const r = (await repairDocument("C:\\t.docx", { quiet: true }))!;
    const reg = parseRegistry(word.registry);
    expect(reg.sources?.newInstanc01?.latex).toBe("\\pvec{r}");
    expect(reg.blocks.BLOCKINLIBRARY01?.latex).toBe("F=ma");
    expect(word.calls.find((c) => c.method === "retag")?.params).toMatchObject({ tag: "mb1|BLOCKNOWHERE0001|pastedCopy02", newTag: "mb1|-|pastedCopy02" });
    expect(r).toMatchObject({ renamed: 1, wrapped: 2, fromAlt: 1, bookmarks: 1, linkedAdded: 1, unlinked: 1, otherPictures: 2 });
  });

  it("changes nothing when everything is intact", async () => {
    word.repair = { renamed: [], wrapped: [], wrappedOk: 5, bookmarks: 0, otherPictures: 0 };
    const r = (await repairDocument("C:\\t.docx", { quiet: true }))!;
    expect(word.calls.filter((c) => c.method === "repairEquations")).toHaveLength(1);
    expect(r.wrapped).toBe(0);
  });

  it("a read asks for copies' IDs only and writes nothing for baselines or redraws", async () => {
    word.repair = { renamed: [], wrapped: [], wrappedOk: 5, bookmarks: 0, otherPictures: 0, lowered: 3, redraw: [{ tag: "t", latex: "x", mode: "inline", reason: "picture" }] };
    expect(await repairDocument(undefined, { quiet: true, identityOnly: true })).toBeNull();
    const calls = word.calls.filter((c) => c.method === "repairEquations");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params).toMatchObject({ dryRun: true, identityOnly: true });
  });
});

describe("quiet Repair before a read (document index)", () => {
  const none = { renamed: [], wrapped: [], bookmarks: 0 };
  it("writes nothing for baselines, Classic pictures or styles alone", () => {
    expect(identityChanges({ ...none, redraw: [{ reason: "picture" }] })).toBe(0);
    expect(identityChanges(none)).toBe(0);
  });
  it("still fixes copies that need their own ID", () => {
    expect(identityChanges({ ...none, renamed: [{}] })).toBe(1);
    expect(identityChanges({ ...none, bookmarks: 2 })).toBe(2);
    expect(identityChanges({ ...none, redraw: [{ reason: "id" }, { reason: "picture" }] })).toBe(1);
  });
});
