import { describe, expect, it } from "vitest";
import { seeded } from "./soakTest";

describe("soak test: the seeded generator", () => {
  it("repeats the same run for the same seed, a different one for another seed", () => {
    const run = (seed: number) => {
      const r = seeded(seed);
      return Array.from({ length: 20 }, () => r.int(1000));
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
    expect(run(7).every((x) => x >= 0 && x < 1000)).toBe(true);
  });
});
