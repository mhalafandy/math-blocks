import { useApp } from "./store";

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];

/** Steps the equation canvas zoom up (+1) or down (−1). */
export function zoomStep(dir: 1 | -1) {
  const z = useApp.getState().zoom;
  let i = ZOOMS.findIndex((v) => v >= z - 0.001);
  if (i < 0) i = ZOOMS.length - 1;
  useApp.getState().setPrefs({ zoom: ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))]! });
}
