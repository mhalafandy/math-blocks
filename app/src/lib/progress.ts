import { create } from "zustand";

/**
 * One progress window for the app's own long operations (converting a MathType document file, checking chapter
 * files, exporting LaTeX, the self-tests): what is running, how far (a bar and a count when the total is known),
 * the current step, and Cancel where the operation can stop. Whole-document operations in Word show the add-in's
 * window instead.
 */
export interface ProgressOp {
  title: string;
  done: number;
  total: number | null;
  text: string;
  canCancel: boolean;
  cancelled: boolean;
}

export const useProgress = create<{ op: ProgressOp | null; set: (op: ProgressOp | null) => void }>((set) => ({ op: null, set: (op) => set({ op }) }));

export interface Progress {
  /** How far: `done` of `total` (the total may be given or changed here), and the current step. */
  update: (done: number, total?: number | null, text?: string) => void;
  /** The current step only. */
  step: (text: string) => void;
  /** True once the user pressed Cancel: the operation stops at its next safe point. */
  readonly cancelled: boolean;
  end: () => void;
}

export function beginProgress(title: string, o: { total?: number; cancel?: boolean } = {}): Progress {
  const s = useProgress.getState();
  s.set({ title, done: 0, total: o.total ?? null, text: "", canCancel: !!o.cancel, cancelled: false });
  const patch = (p: Partial<ProgressOp>) => {
    const cur = useProgress.getState().op;
    if (cur && cur.title === title) useProgress.getState().set({ ...cur, ...p });
  };
  return {
    update: (done, total, text) => patch({ done, ...(total !== undefined ? { total } : {}), ...(text !== undefined ? { text } : {}) }),
    step: (text) => patch({ text }),
    get cancelled() {
      const cur = useProgress.getState().op;
      return !!cur && cur.title === title && cur.cancelled;
    },
    end: () => {
      if (useProgress.getState().op?.title === title) useProgress.getState().set(null);
    },
  };
}

/** Runs `f` with the progress window open; it closes however `f` ends. */
export async function withProgress<T>(title: string, o: { total?: number; cancel?: boolean }, f: (p: Progress) => Promise<T>): Promise<T> {
  const p = beginProgress(title, o);
  try {
    return await f(p);
  } finally {
    p.end();
  }
}
