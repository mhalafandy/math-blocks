import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATHTYPE_OUTPUT_FORMS } from "@mathblocks/mathtype";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";
import { mapLegacyForms, normalizeWordText } from "./latexInterchange";

const problems = (latex: string) => parseLatex(latex).diagnostics.filter((d) => d.severity === "error" || /Unknown/.test(d.message)).map((d) => d.message);

describe("everything Convert MathType writes, Convert LaTeX reads back to the same equation", () => {
  for (const f of MATHTYPE_OUTPUT_FORMS) {
    it(f.what, () => {
      expect(problems(f.latex), f.latex).toEqual([]);
      const back = mapLegacyForms(normalizeWordText(f.latex)).latex;
      expect(serializeLatex(parseLatex(back).root), f.latex).toBe(serializeLatex(parseLatex(f.latex).root));
    });
  }

  it("every LaTeX command the MathType reader can write is one the parser knows", () => {
    const src = readFileSync(new URL("../../../packages/mathtype/src/toLatex.ts", import.meta.url), "utf8");
    const cmds = new Set([...src.matchAll(/["`][^"`\n]*?\\\\([A-Za-z]+)/g)].map((m) => m[1]!));
    // Structural commands are tested through the forms (they need their partners or an environment).
    for (const skip of ["begin", "end", "left", "right", "middle", "limits", "nolimits", "u", "x"]) cmds.delete(skip);
    const unknown = [...cmds].filter((c) => problems(`\\${c}{a}{b}`).some((m) => /Unknown/.test(m)));
    expect(unknown).toEqual([]);
    expect(cmds.size).toBeGreaterThan(20);
  });
});
