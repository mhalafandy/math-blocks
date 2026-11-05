import { afterEach, describe, expect, it } from "vitest";
import { BUILTIN_KINDS, customKindProblem, DEFAULT_PROFILE, expandNotation, KIND_BY_MACRO, KINDS, NEW_KIND_STYLE, peelKind, registerCustomKinds, styleOf } from "@mathblocks/math-core";
import { parseLatex, serializeLatex } from "../src";

const angvel = { id: "u_angvel", name: "Angular velocity", macro: "angvel", snippet: "av", style: { ...NEW_KIND_STYLE, accent: "harpoon" as const, frames: { position: "sub" as const, separator: "/" as const } } };

afterEach(() => void registerCustomKinds([]));

describe("the user's own kinds", () => {
  it("are parsed, serialized and drawn like built-in kinds", () => {
    registerCustomKinds([angvel]);
    expect(KIND_BY_MACRO.get("angvel")?.name).toBe("Angular velocity");
    const root = parseLatex("\\angvel[B/N]{\\omega}+x").root;
    expect(root.children[0]).toMatchObject({ kind: "notation", name: "u_angvel" });
    expect(serializeLatex(root)).toBe("\\angvel[B/N]{\\omega}+x");
    expect(serializeLatex(expandNotation(root, DEFAULT_PROFILE))).toContain("\\overrightharpoon");
    expect(styleOf(DEFAULT_PROFILE, "u_angvel").accent).toBe("harpoon");
    // The user's change on top of the kind's own style.
    expect(styleOf({ preset: "hughes", overrides: { u_angvel: { accent: "hat" } } }, "u_angvel").accent).toBe("hat");
  });
  it("are recognised again from their drawing (the editor)", () => {
    registerCustomKinds([angvel]);
    const drawn = expandNotation(parseLatex("\\angvel{r}").root, DEFAULT_PROFILE);
    expect(peelKind("u_angvel", drawn, styleOf(DEFAULT_PROFILE, "u_angvel"))).toMatchObject({ kind: "notation", name: "u_angvel" });
  });
  it("cannot take a built-in macro, trigger or LaTeX command; replacing the list removes old ones", () => {
    expect(customKindProblem({ ...angvel, macro: "pvec" })).toMatch(/Physical vector/);
    expect(customKindProblem({ ...angvel, snippet: "pv" })).toMatch(/trigger/);
    expect(customKindProblem({ ...angvel, macro: "frac" })).toMatch(/LaTeX command/);
    expect(customKindProblem({ ...angvel, macro: "a1" })).toMatch(/letters only/);
    const r = registerCustomKinds([angvel, { ...angvel, id: "u_x", macro: "pvec" }]);
    expect(r.skipped).toHaveLength(1);
    expect(KINDS.length).toBe(BUILTIN_KINDS.length + 1);
    registerCustomKinds([]);
    expect(KIND_BY_MACRO.has("angvel")).toBe(false);
    expect(KINDS.length).toBe(BUILTIN_KINDS.length);
  });
});
