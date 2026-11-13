import { describe, expect, it } from "vitest";
import { BlockCycleError, bodyWithSlots, editorForm, expandNested, exportBlockSet, parseBlockSet, planImport, slotNameFor, slotNames, stripSlotWrappers, syncSlots, type Block } from "./model";
import { toEditorLatex } from "../kinds";

const block = (name: string, body: string, extra: Partial<Block> = {}): Block => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  description: "",
  body,
  slots: syncSlots(body),
  trigger: "",
  groupId: null,
  tags: [],
  display: false,
  scope: "global",
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  useCount: 0,
  version: 1,
  ...extra,
});

describe("blocks: slots", () => {
  it("named slots in reading order, \\# literal, unnamed numbered, repeats once", () => {
    expect(slotNames("\\frac{1}{2}#m #v^2")).toEqual(["m", "v"]);
    expect(slotNames("#v\\cdot#v + \\#x")).toEqual(["v"]);
    expect(slotNames("\\frac{#?}{#?}")).toEqual(["1", "2"]);
  });
  it("keeps labels and the chosen order when the body changes", () => {
    expect(syncSlots("#a+#b+#c", [{ name: "b", label: "second" }, { name: "a" }])).toEqual([{ name: "b", label: "second" }, { name: "a" }, { name: "c" }]);
  });
});

describe("blocks: nested", () => {
  const ke = block("Kinetic energy", "\\frac{1}{2}#m #v^2");
  const lookup = (n: string) => [ke].find((b) => b.name === n);
  it("a reference expands, with its slots filled in order or left as slots", () => {
    expect(expandNested("E=\\block{Kinetic energy}{M}{u}", lookup)).toBe("E=\\frac{1}{2}{M} {u}^2");
    expect(expandNested("E=\\block{Kinetic energy}", lookup)).toBe("E=\\frac{1}{2}#m #v^2");
    expect(expandNested("\\block{Kinetic energy}^2", lookup)).toBe("{\\frac{1}{2}#m #v^2}^2");
  });
  it("a cycle is refused", () => {
    const a = block("A", "1+\\block{B}");
    const b = block("B", "2+\\block{A}");
    const l = (n: string) => [a, b].find((x) => x.name === n);
    expect(() => expandNested(a.body, l, ["A"])).toThrow(BlockCycleError);
  });
});

describe("blocks: editor form", () => {
  it("every slot occurrence wrapped (kinds converted), wrappers removed again exactly", () => {
    const b = block("Relative velocity", "\\pvec[#to/#from]{#v}+#v");
    const f = editorForm(b, (l) => toEditorLatex(l), () => undefined, "s1");
    expect(f.occurrences.map((o) => o.name)).toEqual(["to", "from", "v", "v"]);
    expect(f.latex).toContain("\\class{mbs-s1-2-v}{\\placeholder{}}");
    expect(f.latex).toContain("\\class{nk-pvec}");
    // Filled and unwrapped: ordinary math.
    const filled = f.latex.replace("\\class{mbs-s1-3-v}{\\placeholder{}}", "\\class{mbs-s1-3-v}{u}");
    expect(stripSlotWrappers(filled)).not.toContain("mbs-");
    expect(stripSlotWrappers("a+\\class{mbs-x-0-v}{u+1}")).toBe("a+u+1");
    expect(stripSlotWrappers("\\class{mbs-x-0-v}{u+1}^2")).toBe("{u+1}^2");
    expect(stripSlotWrappers("a+\\class{mbs-x-0-v}{u}")).toBe("a+u");
    expect(stripSlotWrappers("\\class{mbb-x}{\\frac{1}{\\class{mbs-x-0-n}{2}}}+1")).toBe("\\frac{1}{2}+1");
    expect(f.latex.startsWith("\\class{mbb-s1}{")).toBe(true);
  });
  it("defaults pre-fill their slot", () => {
    const b = block("Sum", "\\sum_{#k=1}^{#n}#a", { slots: [{ name: "k", default: "i" }, { name: "n" }, { name: "a" }] });
    expect(editorForm(b, (l) => l, () => undefined, "s").latex).toContain("\\class{mbs-s-0-k}{i}");
  });
});

describe("blocks: save as block", () => {
  it("chosen parts become named slots (whole tokens only); names proposed", () => {
    expect(bodyWithSlots("\\frac{1}{2}m v^2", [{ latex: "m", name: "m" }, { latex: "v", name: "v" }])).toBe("\\frac{1}{2}#m #v^2");
    expect(bodyWithSlots("\\omega+\\omega_1", [{ latex: "\\omega_1", name: "w1" }])).toBe("\\omega+#w1");
    expect(bodyWithSlots("x#y", [])).toBe("x\\#y");
    expect(slotNameFor("\\omega")).toBe("omega");
    expect(slotNameFor("v", ["v"])).toBe("v2");
    expect(slotNameFor("\\pvec{r}")).toBe("r");
  });
});

describe("blocks: export / import", () => {
  it("export → import gives identical blocks; clashes keep both, replace or skip", () => {
    const blocks = [block("Kinetic energy", "\\frac{1}{2}#m #v^2", { trigger: "ke", tags: ["mechanics"] }), block("Rotation", "\\begin{bmatrix}\\cos#t&-\\sin#t\\\\\\sin#t&\\cos#t\\end{bmatrix}")];
    const file = parseBlockSet(JSON.stringify(exportBlockSet(blocks, [])));
    expect(file.blocks.map((b) => [b.name, b.body, b.slots, b.trigger, b.tags])).toEqual(blocks.map((b) => [b.name, b.body, b.slots, b.trigger, b.tags]));
    const keep = planImport(blocks, file, () => "keep-both");
    expect(keep.add.map((b) => `${b.name}|${b.trigger}`)).toEqual(["Kinetic energy (2)|ke2", "Rotation (2)|"]);
    expect(planImport(blocks, file, () => "replace").replace.map((r) => r.id)).toEqual(["kinetic-energy", "rotation"]);
    expect(planImport(blocks, file, () => "skip").skipped).toEqual(["Kinetic energy", "Rotation"]);
    expect(planImport([], file, () => "skip").add.length).toBe(2);
    expect(() => parseBlockSet("{}")).toThrow(/Not a MathBlocks block set/);
  });
});

describe("slot kinds (#v:pvec)", () => {
  it("are written out as the kind around the slot; the slot name stays v", async () => {
    const { resolveSlotKinds, slotKinds, slotNames: names, editorForm: form } = await import("./model");
    expect(resolveSlotKinds("\\frac{d}{dt}#v:pvec+#J:mat#w:pvec")).toBe("\\frac{d}{dt}\\pvec{#v}+\\mat{#J}\\pvec{#w}");
    expect(slotKinds("#v:pvec+#u:unit+#x")).toEqual({ v: "pvec", u: "unit" });
    expect(names("#v:pvec\\times#v:pvec")).toEqual(["v"]);
    // An unknown kind is dropped (the slot stays plain).
    expect(resolveSlotKinds("#v:nosuchkind")).toBe("#v");
    const f = form({ name: "B", body: "#v:pvec", slots: [{ name: "v", label: "velocity" }] }, (l) => l, () => undefined, "s");
    expect(f.latex).toBe("\\class{mbb-s}{\\pvec{\\class{mbs-s-0-v}{\\placeholder{}}}}");
    expect(f.labels.v).toBe("velocity — physical vector");
  });
});

describe("fillSlots", () => {
  it("fills every occurrence, nested blocks and slot kinds included", async () => {
    const { fillSlots: fill } = await import("./model");
    const inner = { id: "i", name: "Inner", body: "\\frac{1}{2}#m #v^2", slots: [], description: "", trigger: "", groupId: null, tags: [], display: false, scope: "global" as const, position: 0, createdAt: 0, updatedAt: 0, useCount: 0, version: 1 };
    expect(fill({ name: "S", body: "#v\\cdot#v", slots: [] }, { v: "a" })).toBe("{a}\\cdot{a}");
    expect(fill({ name: "K", body: "\\mat{J}#w:pvec", slots: [] }, { w: "u" })).toBe("\\mat{J}\\pvec{{u}}");
    expect(fill({ name: "T", body: "\\block{Inner}+#m g", slots: [] }, { m: "M", v: "u" }, (n) => (n === "Inner" ? inner : undefined))).toBe("\\frac{1}{2}{M} {u}^2+{M} g");
  });
});
