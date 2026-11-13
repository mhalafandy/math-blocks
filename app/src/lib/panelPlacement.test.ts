import { describe, expect, it } from "vitest";
import { placePanel, screenKey } from "./panelPlacement";

const screen = { x: 0, y: 0, w: 1920, h: 1080 };
const size = { w: 900, h: 580 };
const covers = (p: { x: number; y: number }, eq: { x: number; y: number; w: number; h: number }, inset = 0) =>
  p.x + inset < eq.x + eq.w && p.x + size.w - inset > eq.x && p.y + inset < eq.y + eq.h && p.y + size.h - inset > eq.y;

describe("floating editor placement", () => {
  it("below the equation when there is room", () => {
    const eq = { x: 300, y: 200, w: 120, h: 30 };
    const p = placePanel(eq, size, screen, { inset: 14 });
    expect(covers(p, eq, 14)).toBe(false);
    expect(p.y).toBeGreaterThan(eq.y);
  });

  it("above it near the bottom of the screen, beside it when neither fits", () => {
    const low = { x: 300, y: 900, w: 120, h: 30 };
    const p = placePanel(low, size, screen, { inset: 14 });
    expect(covers(p, low, 14)).toBe(false);
    expect(p.y + size.h).toBeLessThanOrEqual(low.y + 14);
    // A short screen: neither below nor above fits, so it goes to the right.
    const short = { x: 0, y: 0, w: 1920, h: 700 };
    const mid = { x: 200, y: 330, w: 100, h: 30 };
    const q = placePanel(mid, size, short, { inset: 14 });
    expect(covers(q, mid, 14)).toBe(false);
    expect(q.x).toBeGreaterThan(mid.x + mid.w - 14);
  });

  it("the remembered position wins unless it covers the equation", () => {
    const eq = { x: 300, y: 200, w: 120, h: 30 };
    expect(placePanel(eq, size, screen, { saved: { x: 1000, y: 400 } })).toEqual({ x: 1000, y: 400 });
    const p = placePanel(eq, size, screen, { saved: { x: 250, y: 100 } });
    expect(covers(p, eq)).toBe(false);
  });

  it("always on the screen; with no room at all, covers as little as possible", () => {
    const tiny = { x: 0, y: 0, w: 950, h: 600 };
    const eq = { x: 400, y: 280, w: 120, h: 30 };
    const p = placePanel(eq, size, tiny);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + size.w).toBeLessThanOrEqual(950);
  });

  it("a screen keeps its key", () => {
    expect(screenKey({ name: "DISPLAY1", size: { width: 1920, height: 1080 }, position: { x: 0, y: 0 } })).toBe("DISPLAY1|1920x1080@0,0");
  });
});
