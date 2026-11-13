import { useEffect, useState } from "react";
import { sessionStatus, useBlockSession } from "../lib/blocks/sessionStore";
import { focusedMathField } from "./MathEditor";

/** The status line while a block is being filled: "Block “…” · slot 2 of 3: frame · Space next". */
export function BlockStatus({ className = "" }: { className?: string }) {
  const s = useBlockSession((x) => x.session);
  const text = sessionStatus(s);
  return text ? <span className={`block-status ${className}`}>{text}</span> : null;
}

interface Hint {
  x: number;
  y: number;
  label: string;
}

/**
 * Each empty slot of the block being filled shows its label under it (e.g. “frame”), like a placeholder
 * hint. The labels follow the slots (positions read from the editor's drawing).
 */
export function SlotHints() {
  const s = useBlockSession((x) => x.session);
  const [hints, setHints] = useState<Hint[]>([]);
  useEffect(() => {
    if (!s) return setHints([]);
    const prefix = `mbs-${s.id}-`;
    const update = () => {
      const mf = focusedMathField();
      const root = mf?.shadowRoot;
      if (!root) return setHints([]);
      // Empty occurrences, from the field's LaTeX: \class{mbs-…}{\placeholder{}}.
      const empty = new Set(Array.from(mf.value.matchAll(/\\class\{(mbs-[^}]+)\}\{\\placeholder\{\}\}/g), (m) => m[1]!));
      const out: Hint[] = [];
      const seen = new Set<string>();
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[class*="${prefix}"]`))) {
        const cls = Array.from(el.classList).find((c) => c.startsWith(prefix));
        if (!cls || seen.has(cls)) continue;
        // Only the outermost element of each occurrence; only when it holds just an empty placeholder.
        seen.add(cls);
        if (!empty.has(cls)) continue;
        const name = cls.slice(prefix.length).replace(/^\d+-/, "");
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        out.push({ x: r.left + r.width / 2, y: r.bottom + 2, label: s.labels[name] ?? name });
      }
      setHints((old) => (JSON.stringify(old) === JSON.stringify(out) ? old : out));
    };
    update();
    const t = window.setInterval(update, 150);
    return () => window.clearInterval(t);
  }, [s]);
  if (!hints.length) return null;
  return (
    <div className="slot-hints" aria-hidden>
      {hints.map((h, i) => (
        <span key={i} className="slot-hint" style={{ left: h.x, top: h.y }}>
          {h.label}
        </span>
      ))}
    </div>
  );
}
