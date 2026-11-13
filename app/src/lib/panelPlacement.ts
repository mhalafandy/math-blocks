/**
 * Where the floating editor goes, and what it remembers. Pure functions (physical pixels): the main
 * window places the panel with them, the tests check them.
 *
 * - Size and position are remembered per screen (the user moved or resized it there).
 * - It never covers the equation it edits when there is room elsewhere: the remembered position if it
 *   leaves the equation free, else below, above, right of or left of the equation, the first that fits.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logical size of a new floating editor (the window includes the card's shadow margin). */
export const PANEL_DEFAULT = { w: 900, h: 580 };
/** Smallest window that keeps the editor usable (logical px; tauri.conf.json has the same). */
export const PANEL_MIN = { w: 560, h: 360 };

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const clamp = (p: { x: number; y: number }, size: { w: number; h: number }, screen: Rect) => ({
  x: Math.round(Math.max(screen.x, Math.min(p.x, screen.x + screen.w - size.w))),
  y: Math.round(Math.max(screen.y, Math.min(p.y, screen.y + screen.h - size.h))),
});

/**
 * The window's position. `inset`: the transparent margin around the visible card (it may cover the
 * equation without hiding it). `saved`: the position remembered on this screen.
 */
export function placePanel(eq: Rect, size: { w: number; h: number }, screen: Rect, o: { saved?: { x: number; y: number }; inset?: number; gap?: number } = {}): { x: number; y: number } {
  const inset = o.inset ?? 0;
  const gap = o.gap ?? 6;
  const card = (p: { x: number; y: number }): Rect => ({ x: p.x + inset, y: p.y + inset, w: size.w - 2 * inset, h: size.h - 2 * inset });
  const candidates: { x: number; y: number }[] = [];
  if (o.saved) candidates.push(o.saved);
  candidates.push(
    { x: eq.x - inset, y: eq.y + eq.h + gap - inset }, // below, left edges aligned
    { x: eq.x - inset, y: eq.y - size.h - gap + inset }, // above
    { x: eq.x + eq.w + gap - inset, y: eq.y + eq.h / 2 - size.h / 2 }, // right
    { x: eq.x - size.w - gap + inset, y: eq.y + eq.h / 2 - size.h / 2 }, // left
  );
  const placed = candidates.map((c) => clamp(c, size, screen));
  const free = placed.find((p) => overlap(card(p), eq) === 0);
  if (free) return free;
  // No room anywhere: cover as little of the equation as possible.
  return placed.reduce((best, p) => (overlap(card(p), eq) < overlap(card(best), eq) ? p : best));
}

/** A screen's key: the same screen keeps its key across sessions (name, size and position). */
export const screenKey = (m: { name?: string | null; size: { width: number; height: number }; position: { x: number; y: number } }) => `${m.name ?? "screen"}|${m.size.width}x${m.size.height}@${m.position.x},${m.position.y}`;

const KEY = "mathblocks.panel.geometry.v1";

export function loadGeometry(screen: string): Geometry | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Geometry>;
    return all[screen] ?? null;
  } catch {
    return null;
  }
}

export function saveGeometry(screen: string, g: Geometry) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Geometry>;
    all[screen] = g;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not remembered.
  }
}
