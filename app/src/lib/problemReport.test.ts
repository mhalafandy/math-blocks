import { describe, expect, it } from "vitest";
import { maskContent } from "./problemReport";

describe("Report a problem: no document content unless asked", () => {
  it("masks document names, paths and LaTeX in log lines", () => {
    const line = 'convertInterchange in Thesis draft 3.docx: 12/12 item(s); C:\\Users\\Someone\\Documents\\x.docx $\\pvec{\\omega}$ and \\frac{a}{b}';
    const m = maskContent(line);
    expect(m).not.toMatch(/draft 3|Someone|omega|frac/);
    expect(m).toContain("12/12 item(s)");
  });
});
