import { describe, expect, it } from "vitest";
import { markerPieces } from "./printCheckPdf";

describe("print check: the markers around an inline equation", () => {
  it("finds them when Word splits them into single letters", () => {
    const line = [{ str: "E258: ab" }, { str: " " }, { str: "c" }, { str: "d" }];
    const r = markerPieces(line);
    expect(r.left).toBe(line[0]);
    expect(r.right).toBe(line[2]);
  });
  it("finds them in whole pieces and split the other way", () => {
    const line = [{ str: "E7: a" }, { str: "b" }, { str: " cd" }];
    const r = markerPieces(line);
    expect(r.left).toBe(line[1]);
    expect(r.right).toBe(line[2]);
  });
});
