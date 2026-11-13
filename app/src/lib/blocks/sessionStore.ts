import { create } from "zustand";

/** The block being filled in the editor: its slots' order and labels, and where the caret is. */
export interface BlockSession {
  id: string;
  name: string;
  order: string[];
  labels: Record<string, string>;
  /** The slot the caret is in (status line: "slot 2 of 3: frame"). */
  current: { index: number; total: number; label: string } | null;
}

export const useBlockSession = create<{ session: BlockSession | null; set: (s: BlockSession | null) => void }>((set) => ({ session: null, set: (session) => set({ session }) }));

/** "Block “Kinetic energy” · slot 2 of 3: v" (null when no slot has the caret). */
export function sessionStatus(s: BlockSession | null): string | null {
  if (!s?.current || s.current.index < 0) return null;
  return `Block “${s.name}” · slot ${s.current.index + 1} of ${s.current.total}: ${s.current.label} · Space next`;
}
