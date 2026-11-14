import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useApp } from "./store";

/**
 * Heights in the editor column always fit the window: the editor first (at least its first line with accents and
 * indices), the top palette at most 35 % of the column (it scrolls inside), the bottom panel what is left. When
 * room runs out the bottom panel shrinks first, down to its tab strip, then the top palette.
 */
export interface WorkspaceFit {
  /** The bottom panel's height (px) as laid out. */
  bottom: number;
  /** The most the bottom panel can take now (the splitter's limit). */
  bottomMax: number;
  /** The bottom panel's tab strip (its smallest height). */
  tabs: number;
  /** Max height of the top palette's scrolling area (px), or null without a top palette. */
  palette: number | null;
}

/** The pure computation (tested): heights in px. */
export function fitWorkspace(m: {
  /** The column's content height. */
  height: number;
  /** Bars above the editor other than the palette (editing bar, notices). */
  bars: number;
  /** The top palette: its content's natural height and its frame (padding, border, margin); null if not on top. */
  palette: { natural: number; frame: number } | null;
  editorMin: number;
  tabs: number;
  bottomOpen: boolean;
  bottomWanted: number;
}): Omit<WorkspaceFit, "tabs"> {
  const splitter = m.bottomOpen ? 4 : 0;
  const room = m.height - m.bars - m.editorMin - splitter - (m.palette ? m.palette.frame : 0);
  let pal = m.palette ? Math.min(m.palette.natural, Math.floor(0.35 * m.height)) : 0;
  let bottomMax = Math.max(m.tabs, room - pal);
  if (room - pal < m.tabs && m.palette) {
    // The bottom panel is at its tab strip: the palette gives way (down to one scrolling row).
    pal = Math.max(32, room - m.tabs);
    bottomMax = m.tabs;
  }
  const bottom = m.bottomOpen ? Math.max(m.tabs, Math.min(m.bottomWanted, bottomMax)) : m.tabs;
  return { bottom, bottomMax, palette: m.palette ? Math.floor(pal) : null };
}

export function useWorkspaceFit(ref: RefObject<HTMLElement | null>): WorkspaceFit {
  const bottomHeight = useApp((s) => s.bottomHeight);
  const bottomOpen = useApp((s) => s.bottomOpen);
  const zoom = useApp((s) => s.zoom);
  const location = useApp((s) => s.paletteLocation);
  const collapsed = useApp((s) => s.paletteCollapsed);
  const [fit, setFit] = useState<WorkspaceFit>({ bottom: bottomHeight, bottomMax: bottomHeight, tabs: 44, palette: null });
  useLayoutEffect(() => {
    const ws = ref.current;
    if (!ws) return;
    const measure = () => {
      const cs = getComputedStyle(ws);
      const height = ws.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const head = ws.firstElementChild as HTMLElement | null;
      const top = ws.querySelector<HTMLElement>(".palette-top");
      const scroll = ws.querySelector<HTMLElement>(".palette-top-scroll");
      const content = ws.querySelector<HTMLElement>(".palette-top-content");
      const tabsEl = ws.querySelector<HTMLElement>(".bottom-panel .panel-tabs");
      const tabs = Math.ceil(tabsEl?.offsetHeight ?? 44);
      const palMargin = top ? parseFloat(getComputedStyle(top).marginBottom) : 0;
      const palette = top && scroll && content ? { natural: Math.ceil(content.offsetHeight), frame: Math.ceil(top.offsetHeight - scroll.offsetHeight + palMargin) } : null;
      const bars = Math.max(0, (head?.offsetHeight ?? 0) - (top ? top.offsetHeight + palMargin : 0));
      // The editor's first line: accents above and indices below the letters (about 2.3 em at the zoom), the
      // field's padding and border, the area's padding, the width bar.
      const editorMin = Math.ceil(34 * zoom * 2.3) + 23 + 56 + 34;
      const r = fitWorkspace({ height, bars, palette, editorMin, tabs, bottomOpen, bottomWanted: bottomHeight });
      setFit((old) => (old.bottom === r.bottom && old.bottomMax === r.bottomMax && old.palette === r.palette && old.tabs === tabs ? old : { ...r, tabs }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ws);
    const head = ws.firstElementChild;
    if (head) ro.observe(head);
    const content = ws.querySelector(".palette-top-content");
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [ref, bottomHeight, bottomOpen, zoom, location, collapsed]);
  return fit;
}

/** Side panel widths that leave the editor at least `editorMin` px (panels shrink in proportion, to 160 / 220 px). */
export function fitColumns(width: number, left: number, right: number, editorMin = 440): { left: number; right: number } {
  const gaps = (left ? 4 : 0) + (right ? 4 : 0);
  const over = left + right + gaps + editorMin - width;
  if (over <= 0) return { left, right };
  const minL = left ? Math.min(left, 160) : 0;
  const minR = right ? Math.min(right, 220) : 0;
  const give = left - minL + (right - minR);
  if (give <= 0) return { left, right };
  const f = Math.min(1, over / give);
  return { left: Math.round(left - (left - minL) * f), right: Math.round(right - (right - minR) * f) };
}

export function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
