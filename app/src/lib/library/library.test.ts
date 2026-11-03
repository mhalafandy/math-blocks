import { describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore";
import { recentEquations, searchEquations } from "./search";
import type { EquationInput } from "./types";

const input = (name: string, latex: string, extra: Partial<EquationInput> = {}): EquationInput => ({
  folderId: null, name, description: "", latex, display: true, favorite: false, tags: [], ...extra,
});

/** Behaviour shared with the SQLite store (app/src-tauri/src/library.rs tests). */
describe("memory library store", () => {
  it("records a version only when the content changes, and restores by adding a version", async () => {
    const s = memoryStore();
    await s.save("A", input("Newton", "F=ma"));
    let q = await s.save("", { ...input("Newton's 2nd law", "F=ma"), id: "A" });
    expect(q.currentVersion).toBe(1);
    q = await s.save("", { ...input("Newton's 2nd law", "\\vec{F}=m\\vec{a}"), id: "A" });
    expect(q.currentVersion).toBe(2);
    expect((await s.versions("A")).map((v) => v.latex)).toEqual(["\\vec{F}=m\\vec{a}", "F=ma"]);
    q = await s.restoreVersion("A", 1);
    expect([q.latex, q.currentVersion]).toEqual(["F=ma", 3]);
  });

  it("cleans tags (case-insensitive, trimmed, sorted)", async () => {
    const s = memoryStore();
    const q = await s.save("A", input("a", "x", { tags: ["orbit ", "Mechanics", "mechanics", ""] }));
    expect(q.tags).toEqual(["Mechanics", "orbit"]);
  });

  it("deleting a folder deletes sub-folders and unfiles their equations", async () => {
    const s = memoryStore();
    await s.createFolder("F", "Thesis", null);
    await s.createFolder("G", "Chapter 2", "F");
    await s.save("A", input("eq", "x", { folderId: "G" }));
    await expect(s.moveFolder("F", "G")).rejects.toThrow();
    await s.deleteFolder("F");
    const { folders, equations } = await s.list();
    expect(folders).toEqual([]);
    expect(equations[0]!.folderId).toBeNull();
  });

  it("rejects empty names", async () => {
    const s = memoryStore();
    await expect(s.save("A", input("  ", "x"))).rejects.toThrow("A name is required");
  });

  it("exports and re-imports without duplicates; newer wins", async () => {
    const a = memoryStore();
    await a.createFolder("F", "Thesis", null);
    await a.save("E", input("A.1", "\\vec{\\mathbf{c}}_i", { folderId: "F", tags: ["mass"] }));
    const json = (await a.exportTo("")) as string;
    const b = memoryStore();
    expect(await b.importFrom(json)).toEqual({ foldersAdded: 1, equationsAdded: 1, equationsUpdated: 0, equationsSkipped: 0 });
    expect((await b.importFrom(json)).equationsSkipped).toBe(1);
    expect((await b.versions("E")).length).toBe(1);
    await expect(b.importFrom('{"format":"other"}')).rejects.toThrow("not a MathBlocks library");
  });

  it("keeps the autosave draft", async () => {
    const s = memoryStore();
    expect(await s.loadDraft()).toBeNull();
    await s.saveDraft({ latex: "x^2", display: false, equationId: null, updatedAt: 1 });
    expect((await s.loadDraft())!.latex).toBe("x^2");
  });

  it("persists every change through the callback", async () => {
    let saved = 0;
    const s = memoryStore(undefined, () => saved++);
    await s.save("A", input("a", "x"));
    await s.setFavorite("A", true);
    expect(saved).toBe(2);
  });
});

describe("library search", () => {
  const base = { id: "", folderId: null, description: "", display: true, favorite: false, currentVersion: 1, createdAt: 0, updatedAt: 0, lastUsedAt: null as number | null, tags: [] as string[] };
  const eqs = [
    { ...base, id: "1", name: "First moment of mass", latex: "\\vec{\\mathbf{c}}_i", tags: ["mass", "appendix A"] },
    { ...base, id: "2", name: "Vis-viva equation", latex: "v^2=\\mu(...)", tags: ["orbit"], favorite: true, lastUsedAt: 5 },
    { ...base, id: "3", name: "Kepler's equation", latex: "M=E-e\\sin E", description: "relates mean and eccentric anomaly", tags: ["orbit"], lastUsedAt: 9 },
  ];

  it("ranks name matches above description and LaTeX", () => {
    expect(searchEquations(eqs, "equation").map((q) => q.id)).toEqual(["3", "2"]);
    expect(searchEquations(eqs, "anomaly").map((q) => q.id)).toEqual(["3"]);
    expect(searchEquations(eqs, "\\sin").map((q) => q.id)).toEqual(["3"]);
  });

  it("filters by #tag and is:fav", () => {
    expect(searchEquations(eqs, "#orb").map((q) => q.id).sort()).toEqual(["2", "3"]);
    expect(searchEquations(eqs, "#orbit is:fav").map((q) => q.id)).toEqual(["2"]);
  });

  it("lists recently used, newest first", () => {
    expect(recentEquations(eqs).map((q) => q.id)).toEqual(["3", "2"]);
  });
});
