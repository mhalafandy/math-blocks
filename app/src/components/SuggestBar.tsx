import { create } from "zustand";
import { serializeLatex } from "@mathblocks/math-latex";
import { documentForms, suggestFor, type DocForm } from "../lib/docSuggest";
import { useApp } from "../lib/store";
import { STRUCTURE_CELL, SYMBOL_CELL } from "../lib/tiles";
import { MathTile } from "./MathTile";

/**
 * Suggestions from the document while typing: after a letter, the forms of that symbol the open document
 * already uses (\pvec{\omega}, \cmat{\omega}, \omega_1 …), most used first. Tab or a click takes one
 * (the letter is replaced); Esc or any other key leaves them. Settings → Editor behaviour turns it off.
 */

interface State {
  at: { left: number; top: number; bottom: number } | null;
  items: DocForm[];
  /** The forms of the open document (or of the library when Word is not there), and where they came from. */
  forms: DocForm[];
  source: string;
  set: (s: Partial<State>) => void;
}

export const useSuggest = create<State>((set) => ({ at: null, items: [], forms: [], source: "", set: (s) => set(s) }));

let refreshing: Promise<void> | null = null;
let refreshedAt = 0;

/** Reads the forms of the open Word document (every equation's LaTeX); the library's equations without Word. */
export async function refreshDocForms(force = false) {
  if (refreshing || (!force && Date.now() - refreshedAt < 60_000)) return refreshing ?? undefined;
  refreshing = (async () => {
    const latexes: string[] = [];
    let source = "library";
    try {
      const app = useApp.getState();
      const { addinSupports, connector } = await import("../lib/connector");
      if (app.connector.connected && addinSupports("listInstances")) {
        const r = await connector.request("listInstances", { includeContent: true }, 60_000);
        const { readEquationXml } = await import("../lib/readEquation");
        for (const i of r.documents[0]?.instances ?? []) {
          const read = i.flatOpc ? readEquationXml(i.flatOpc) : null;
          if (read?.root.children.length) latexes.push(serializeLatex(read.root));
        }
        source = r.documents[0]?.name ?? "document";
      }
      if (!latexes.length) {
        const { useLibrary } = await import("../lib/library/useLibrary");
        for (const e of useLibrary.getState().equations) latexes.push(e.latex);
        source = "library";
      }
    } catch {
      // Keep the last forms.
    }
    if (latexes.length) useSuggest.getState().set({ forms: documentForms(latexes), source });
    refreshedAt = Date.now();
  })().finally(() => (refreshing = null));
  return refreshing;
}

/** After an input: the letter just typed (a token of its own) offers the forms built on it. */
export function updateSuggestions(letter: string | null, at: State["at"]) {
  const s = useSuggest.getState();
  if (!useApp.getState().docSuggestions || !letter || !at) {
    if (s.at) s.set({ at: null, items: [] });
    return;
  }
  void refreshDocForms();
  const items = suggestFor(letter, s.forms);
  s.set(items.length ? { at, items } : { at: null, items: [] });
}

export const hideSuggestions = () => useSuggest.getState().at && useSuggest.getState().set({ at: null, items: [] });

/** The suggestion Tab takes (the first), or null. */
export const firstSuggestion = (): DocForm | null => (useSuggest.getState().at ? useSuggest.getState().items[0] ?? null : null);

export function SuggestBar({ onPick }: { onPick: (f: DocForm) => void }) {
  const { at, items, source } = useSuggest();
  if (!at || !items.length) return null;
  const left = Math.max(8, Math.min(at.left - 20, window.innerWidth - 480));
  const top = at.bottom + 8;
  return (
    <div className="suggest-bar" style={{ left, top }} role="listbox" aria-label="Forms used in the document" onMouseDown={(e) => e.preventDefault()}>
      {items.map((f, i) => (
        <button key={f.latex} role="option" aria-selected={i === 0} className={i === 0 ? "on" : undefined} title={`${f.latex}\nused ${f.count}× in ${source}${i === 0 ? "\nTab takes it" : ""}`} onClick={() => onPick(f)}>
          <MathTile latex={f.latex} cell={f.latex.length > 14 ? STRUCTURE_CELL : SYMBOL_CELL} />
          <small>{f.count}</small>
        </button>
      ))}
      <span className="hint">Tab</span>
    </div>
  );
}
