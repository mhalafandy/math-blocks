import { useRef } from "react";

/** Vertical drag handle that resizes a side panel. `direction` is +1 for a left panel, −1 for a right one. */
export function Splitter({ width, onChange, direction, min = 180, max = 560 }: {
  width: number;
  onChange: (w: number) => void;
  direction: 1 | -1;
  min?: number;
  max?: number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(Math.max(min, Math.min(max, width - 16 * direction)));
        if (e.key === "ArrowRight") onChange(Math.max(min, Math.min(max, width + 16 * direction)));
      }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const w = start.current.w + (e.clientX - start.current.x) * direction;
        onChange(Math.max(min, Math.min(max, w)));
      }}
      onPointerUp={() => (start.current = null)}
    />
  );
}
