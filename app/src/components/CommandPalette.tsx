import { restoreEditorFocus } from "../lib/editorFocus";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Command } from "../lib/commands";
import { useApp } from "../lib/store";

/** Scores a command against the query: every query word must appear; prefix matches rank higher. */
function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const hay = `${cmd.title} ${cmd.group} ${cmd.keywords ?? ""}`.toLowerCase();
  let s = 0;
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const i = hay.indexOf(word);
    if (i < 0) return 0;
    s += i === 0 || hay[i - 1] === " " ? 3 : 1;
  }
  return s;
}

export function CommandPalette({ commands }: { commands: Command[] }) {
  const open = useApp((s) => s.paletteOpen);
  const setOpen = useApp((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () =>
      commands
        .map((c) => ({ c, s: score(c, query) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.c),
    [commands, query],
  );

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    } else if (wasOpen.current) {
      // Closed (command run, Escape or click outside): back to the editor, caret where it was
      // (or in the first slot of what the command inserted).
      restoreEditorFocus();
    }
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    void c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          placeholder="Type a command or structure…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[index]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <ul role="listbox">
          {results.length === 0 && <li className="empty">No matching commands</li>}
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index} className={i === index ? "active" : undefined} onMouseEnter={() => setIndex(i)} onClick={() => run(c)}>
              <span className="group">{c.group}</span>
              <span className="title">{c.title}</span>
              {c.shortcut && <kbd>{c.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
