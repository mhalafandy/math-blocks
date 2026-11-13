import { useEffect, useState } from "react";
import { BENCH_SET, finishCurrent, loadBench, sameEquation, saveBench, useBench } from "../lib/benchmark";
import { useApp } from "../lib/store";
import { useSettings } from "../lib/settingsStore";
import { LARGE_CELL, STRUCTURE_CELL } from "../lib/tiles";
import { MathTile } from "./MathTile";

/** Starts a run: the editor is emptied, the settings close, the first equation is shown. */
export function startBenchmark() {
  useBench.getState().set({ running: true, index: 0, startedAt: null, keys: 0, results: [] });
  useSettings.getState().set({ open: false });
  useApp.getState().setLatex("", "external");
  requestAnimationFrame(() => (document.querySelector(".canvas math-field") as HTMLElement | null)?.focus());
}

const secs = (ms: number) => (ms / 1000).toFixed(1);

/** While a run is going: the equation to type, the clock and the keys counted. */
export function BenchmarkBar() {
  const { running, index, startedAt, keys, set } = useBench();
  const latex = useApp((s) => s.latex);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
      const s = useBench.getState();
      s.set({ keys: s.keys + 1, startedAt: s.startedAt ?? performance.now() });
    };
    window.addEventListener("keydown", onKey, true);
    const t = setInterval(() => tick((x) => x + 1), 200);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearInterval(t);
    };
  }, [running]);
  // Done as soon as the equation is right.
  useEffect(() => {
    if (!running || !startedAt) return;
    if (sameEquation(latex, BENCH_SET[index]!.latex)) next(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex]);
  if (!running) return null;
  const target = BENCH_SET[index]!;
  function next(skipped: boolean) {
    const r = finishCurrent(skipped);
    useApp.getState().setLatex("", "external");
    if (r === "finished") {
      useApp.getState().notify("Benchmark finished: the results are in Settings → Benchmark");
      useSettings.getState().set({ open: true, page: "benchmark" });
    } else requestAnimationFrame(() => (document.querySelector(".canvas math-field") as HTMLElement | null)?.focus());
  }
  return (
    <div className="bench-bar" role="status">
      <div className="bench-info">
        <strong>
          Benchmark {index + 1} of {BENCH_SET.length}: {target.name}
        </strong>
        <span>
          {startedAt ? `${secs(performance.now() - startedAt)} s` : "the clock starts with your first key"} · {keys} key(s)
        </span>
      </div>
      <div className="bench-target">
        <MathTile latex={target.latex} cell={{ ...LARGE_CELL, id: "bench", w: 360, h: 70, fontPx: 26 }} />
      </div>
      <div className="bench-actions">
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => next(false)} title="When the editor shows the equation but the check did not catch it">
          Done
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => next(true)}>
          Skip
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => set({ running: false })}>
          Stop
        </button>
      </div>
    </div>
  );
}

/** Settings → Benchmark: the set, the latest and best times and keys, and MathType's times typed by hand. */
export function BenchmarkPage() {
  const [saved, setSaved] = useState(loadBench);
  const last = saved.runs[0];
  const best = (i: number) => {
    const t = saved.runs.map((r) => r.results[i]).filter((x) => x && !x.skipped && x.ms > 0).map((x) => x!.ms);
    return t.length ? Math.min(...t) : null;
  };
  const setMt = (i: number, v: string) => {
    const mathType = [...saved.mathType];
    mathType[i] = v.trim() ? Math.max(0, Number(v)) : null;
    const next = { ...saved, mathType };
    saveBench(next);
    setSaved(next);
  };
  const total = (pick: (i: number) => number | null) => {
    const v = BENCH_SET.map((_, i) => pick(i));
    return v.every((x) => x !== null) ? v.reduce((a, b) => a! + b!, 0) : null;
  };
  return (
    <section className="settings-embedded">
      <h3>Benchmark</h3>
      <p className="hint">
        Ten typical equations, one at a time. The clock starts with your first key and stops when the equation is right (or when you press Done); keys are counted. Time the same set in MathType by hand and type its seconds in the last column. Results stay on this PC.
      </p>
      <p>
        <button className="primary" onClick={startBenchmark}>
          Start the benchmark
        </button>{" "}
        {saved.runs.length > 0 && (
          <button
            onClick={() => {
              const next = { ...saved, runs: [] };
              saveBench(next);
              setSaved(next);
            }}
          >
            Clear the MathBlocks runs ({saved.runs.length})
          </button>
        )}
      </p>
      <table className="bench-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Equation</th>
            <th>Last run</th>
            <th>Keys</th>
            <th>Best</th>
            <th>MathType (s)</th>
          </tr>
        </thead>
        <tbody>
          {BENCH_SET.map((e, i) => {
            const r = last?.results[i];
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <MathTile latex={e.latex} cell={STRUCTURE_CELL} /> <span className="hint">{e.name}</span>
                </td>
                <td>{r ? (r.skipped ? "skipped" : `${secs(r.ms)} s`) : "—"}</td>
                <td>{r ? r.keys : "—"}</td>
                <td>{best(i) !== null ? `${secs(best(i)!)} s` : "—"}</td>
                <td>
                  <input type="number" min={0} step={0.1} style={{ width: 80 }} value={saved.mathType[i] ?? ""} onChange={(ev) => setMt(i, ev.target.value)} />
                </td>
              </tr>
            );
          })}
          <tr>
            <td />
            <td>
              <strong>Total</strong>
            </td>
            <td>{(() => {
              const t = total((i) => (last?.results[i] && !last.results[i]!.skipped ? last.results[i]!.ms : null));
              return t !== null ? `${secs(t)} s` : "—";
            })()}</td>
            <td>{last ? last.results.reduce((a, r) => a + (r?.keys ?? 0), 0) : "—"}</td>
            <td>{(() => {
              const t = total(best);
              return t !== null ? `${secs(t)} s` : "—";
            })()}</td>
            <td>{(() => {
              const t = total((i) => saved.mathType[i] ?? null);
              return t !== null ? `${t.toFixed(1)} s` : "—";
            })()}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
