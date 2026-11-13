import { create } from "zustand";
import { parseLatex, serializeLatex } from "@mathblocks/math-latex";

/**
 * The writing-speed benchmark (Settings → Benchmark): ten typical equations shown one at a time; the
 * time from the first key to a correct equation, and the keys pressed, are recorded for each. The same
 * set is timed in MathType by hand and typed into the table. Results stay on this PC.
 */

export const BENCH_SET: { name: string; latex: string }[] = [
  { name: "Fraction", latex: "\\frac{a+b}{c-d}" },
  { name: "Integral with limits", latex: "\\int_{0}^{\\infty}e^{-x^{2}}\\,\\mathrm{d}x" },
  { name: "Sum and fraction", latex: "\\sum_{k=1}^{n}k^{2}=\\frac{n(n+1)(2n+1)}{6}" },
  { name: "Matrix product", latex: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}\\begin{bmatrix}x\\\\y\\end{bmatrix}" },
  { name: "Vectors with frames", latex: "\\pvec[B/N]{v}=\\frac{\\mathrm{d}}{\\mathrm{d}t}\\pvec[B/N]{r}" },
  { name: "Direction cosine matrix", latex: "\\cmat{v}=\\dcm{B}{N}\\cmat{r}" },
  { name: "Root", latex: "\\sqrt{x^{2}+y^{2}+z^{2}}" },
  { name: "Multi-line derivation", latex: "\\begin{aligned}f(x)&=(x+1)^{2}\\\\&=x^{2}+2x+1\\end{aligned}" },
  { name: "Limit", latex: "\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}" },
  { name: "Cross products", latex: "\\pvec{\\omega}\\times\\left(\\pvec{\\omega}\\times\\pvec{r}\\right)" },
];

export interface BenchResult {
  ms: number;
  keys: number;
  skipped?: boolean;
}

export interface BenchRun {
  date: string;
  results: (BenchResult | null)[];
}

interface Saved {
  runs: BenchRun[];
  /** MathType, timed by hand: seconds per equation. */
  mathType: (number | null)[];
}

const KEY = "mathblocks.benchmark.v1";

export function loadBench(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && Array.isArray(s.runs)) return { runs: s.runs, mathType: s.mathType ?? [] };
  } catch {
    // Nothing saved.
  }
  return { runs: [], mathType: [] };
}

export function saveBench(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not saved.
  }
}

/**
 * Whether what was typed is the target: the same after normalising (spaces, \left/\right, \mathrm{d}
 * written as d, braces around single characters) — the look, not the keystrokes used to get it.
 */
export function sameEquation(typed: string, target: string): boolean {
  const norm = (l: string) => {
    let s = l;
    try {
      s = serializeLatex(parseLatex(l).root);
    } catch {
      // Compare as written.
    }
    return s
      .replace(/\\left|\\right/g, "")
      .replace(/\\mathrm\{d\}/g, "d")
      .replace(/\\,|\\;|\\:|\\!|\s+/g, "")
      .replace(/\{(\\?[A-Za-z0-9]+)\}/g, "$1");
  };
  return norm(typed) === norm(target);
}

interface RunState {
  running: boolean;
  index: number;
  /** The clock starts with the first key of each equation. */
  startedAt: number | null;
  keys: number;
  results: (BenchResult | null)[];
  set: (s: Partial<RunState>) => void;
}

export const useBench = create<RunState>((set) => ({ running: false, index: 0, startedAt: null, keys: 0, results: [], set: (s) => set(s) }));

/** Records the current equation (done or skipped) and moves to the next; after the last, saves the run. */
export function finishCurrent(skipped = false) {
  const s = useBench.getState();
  const results = [...s.results];
  results[s.index] = skipped ? { ms: 0, keys: s.keys, skipped: true } : { ms: s.startedAt ? Math.round(performance.now() - s.startedAt) : 0, keys: s.keys };
  const next = s.index + 1;
  if (next >= BENCH_SET.length) {
    const saved = loadBench();
    saved.runs.unshift({ date: new Date().toISOString(), results });
    saveBench(saved);
    s.set({ running: false, index: 0, startedAt: null, keys: 0, results });
    return "finished" as const;
  }
  s.set({ index: next, startedAt: null, keys: 0, results });
  return "next" as const;
}
