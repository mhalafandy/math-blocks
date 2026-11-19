import { describe, expect, it } from "vitest";
import { identityChanges } from "./repair";

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
