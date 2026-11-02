import { useMemo, useState } from "react";
import { REFERENCE_EQUATIONS, type ReferenceEquation } from "../../../fixtures/reference-equations";
import { useApp } from "../lib/store";

export function Sidebar() {
  const [query, setQuery] = useState("");
  const setLatex = useApp((s) => s.setLatex);
  const setDisplay = useApp((s) => s.setDisplay);
  const latex = useApp((s) => s.latex);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, ReferenceEquation[]>();
    for (const eq of REFERENCE_EQUATIONS) {
      if (q && !`${eq.title} ${eq.category} ${eq.latex}`.toLowerCase().includes(q)) continue;
      map.set(eq.category, [...(map.get(eq.category) ?? []), eq]);
    }
    return [...map.entries()];
  }, [query]);

  return (
    <nav className="sidebar" aria-label="Library">
      <div className="sidebar-search">
        <input type="search" placeholder="Search equations" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <section className="sidebar-section">
        <h2>My library</h2>
        <p className="empty">Your saved equations will appear here (Milestone 4).</p>
      </section>

      <section className="sidebar-section">
        <h2>Reference set</h2>
        {groups.length === 0 && <p className="empty">No matches.</p>}
        {groups.map(([category, items]) => (
          <div key={category} className="group">
            <h3>{category}</h3>
            <ul>
              {items.map((eq) => (
                <li key={eq.id}>
                  <button
                    type="button"
                    className={eq.latex === latex ? "item active" : "item"}
                    title={eq.latex}
                    onClick={() => {
                      setLatex(eq.latex, "external");
                      setDisplay(eq.display);
                    }}
                  >
                    {eq.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </nav>
  );
}
