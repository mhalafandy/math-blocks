import { describe, expect, it } from "vitest";
import { fitColumns, fitWorkspace } from "./workspaceFit";

const base = { height: 600, bars: 0, editorMin: 190, tabs: 44, bottomOpen: true, bottomWanted: 280 };

describe("heights in the editor column", () => {
  it("gives the bottom panel what it asks for when there is room", () => {
    expect(fitWorkspace({ ...base, height: 900, palette: null })).toMatchObject({ bottom: 280, palette: null });
  });
  it("caps the top palette at 35 % and shrinks the bottom panel first", () => {
    const r = fitWorkspace({ ...base, palette: { natural: 400, frame: 24 } });
    expect(r.palette).toBe(210);
    expect(r.bottom).toBe(600 - 190 - 4 - 24 - 210);
    expect(r.bottom + r.palette! + 24 + 4 + 190).toBeLessThanOrEqual(600);
  });
  it("shrinks the bottom panel to its tab strip, then the palette", () => {
    const r = fitWorkspace({ ...base, height: 360, palette: { natural: 400, frame: 24 } });
    expect(r.bottom).toBe(44);
    expect(r.palette).toBe(360 - 190 - 4 - 24 - 44);
  });
  it("never goes over the column with the panel closed", () => {
    const r = fitWorkspace({ ...base, bottomOpen: false, height: 500, palette: { natural: 100, frame: 24 } });
    expect(r.bottom).toBe(44);
    expect(r.palette).toBe(100);
  });
});

describe("side panel widths", () => {
  it("keeps the editor at least 440 px wide, panels shrinking in proportion", () => {
    expect(fitColumns(1366, 250, 360)).toEqual({ left: 250, right: 360 });
    const r = fitColumns(900, 250, 360);
    expect(r.left + r.right + 8 + 440).toBeLessThanOrEqual(900);
    expect(r.left).toBeGreaterThanOrEqual(160);
    expect(r.right).toBeGreaterThanOrEqual(220);
    expect(fitColumns(700, 0, 360).right).toBe(360 - (360 + 4 + 440 - 700));
  });
});
