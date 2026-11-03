import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { convertLatexToMarkup } from "mathlive/ssr";
import { findItem, GROUPS, itemKey, plainLatex, previewLatex, searchPalette, type IndexedItem, type PaletteGroup } from "../lib/palette";
import { useApp } from "../lib/store";
import { lastEditor } from "../lib/focus";
import { insertIntoLatex } from "./LatexEditor";
import { insertIntoVisual } from "./MathEditor";

const MAX_RECENTS = 18;

/** Inserts a palette item into whichever editor is active and records it as recent. */
export function insertPaletteItem(x: IndexedItem) {
  const s = useApp.getState();
  const ok =
    (lastEditor() === "latex" && s.bottomOpen && s.bottomTab === "latex" && insertIntoLatex(plainLatex(x.item.latex))) ||
    insertIntoVisual(x.item.latex);
  if (!ok) return;
  const recents = [x.key, ...s.recents.filter((k) => k !== x.key)].slice(0, MAX_RECENTS);
  s.setPrefs({ recents });
}

function toggleFavorite(key: string) {
  const s = useApp.getState();
  const has = s.favorites.includes(key);
  s.setPrefs({ favorites: has ? s.favorites.filter((k) => k !== key) : [...s.favorites, key] });
  s.notify(has ? "Removed from quick access" : "Pinned to quick access");
}

// ------------------------------------------------------------------ rendering

const markupCache = new Map<string, string>();
function markup(latex: string): string {
  let html = markupCache.get(latex);
  if (html === undefined) {
    try {
      html = convertLatexToMarkup(previewLatex(latex));
    } catch {
      html = "";
    }
    markupCache.set(latex, html);
  }
  return html;
}

/** One palette button. Mouse-down is prevented so the editor keeps its focus and selection. */
const ItemButton = memo(function ItemButton({ x, size }: { x: IndexedItem; size: "glyph" | "small" | "large" }) {
  const favorite = useApp((s) => s.favorites.includes(x.key));
  const glyph = x.item.glyph;
  return (
    <button
      type="button"
      className={`pal-item ${size}${favorite ? " fav" : ""}`}
      title={`${x.item.name}\n${x.item.latex.replace(/#0|#\?/g, "□")}\nRight-click: ${favorite ? "unpin" : "pin to quick access"}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => insertPaletteItem(x)}
      onContextMenu={(e) => {
        e.preventDefault();
        toggleFavorite(x.key);
      }}
    >
      {glyph && size !== "large" ? <span className="glyph">{glyph}</span> : <span className="tex" dangerouslySetInnerHTML={{ __html: markup(x.item.latex) }} />}
    </button>
  );
});

function Grid({ items, size }: { items: IndexedItem[]; size: "glyph" | "small" | "large" }) {
  return (
    <div className={`pal-grid ${size}`}>
      {items.map((x) => (
        // A template in a glyph-sized row (quick access) still needs room for its preview.
        <ItemButton key={x.key} x={x} size={size === "glyph" && !x.item.glyph ? "small" : size} />
      ))}
    </div>
  );
}

const groupItems = (g: PaletteGroup): IndexedItem[] => g.items.map((item) => ({ key: itemKey(g, item), group: g, item }));
const sizeOf = (g: PaletteGroup) => (g.kind === "symbols" ? "glyph" : g.row === "tabs" ? "large" : "small");

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function SearchBox({ query, setQuery, autoFocus }: { query: string; setQuery: (q: string) => void; autoFocus?: boolean }) {
  return (
    <input
      className="pal-search"
      type="search"
      placeholder="Search symbols: gradient, ≤, \alpha…"
      value={query}
      autoFocus={autoFocus}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const first = searchPalette(query, 1)[0];
          if (first) insertPaletteItem(first);
        }
      }}
    />
  );
}

function SearchResults({ query }: { query: string }) {
  const results = useMemo(() => searchPalette(query), [query]);
  if (results.length === 0) return <p className="empty">No symbols match “{query}”.</p>;
  const symbols = results.filter((r) => r.item.glyph);
  const templates = results.filter((r) => !r.item.glyph);
  return (
    <>
      {symbols.length > 0 && <Grid items={symbols} size="glyph" />}
      {templates.length > 0 && <Grid items={templates} size="small" />}
    </>
  );
}

/** Search results as a list with names (used in the narrow right panel). */
function ResultList({ query }: { query: string }) {
  const results = useMemo(() => searchPalette(query, 80), [query]);
  if (results.length === 0) return <p className="empty">No symbols match “{query}”.</p>;
  return (
    <ul className="result-list">
      {results.map((x) => (
        <li key={x.key}>
          <button
            type="button"
            title={`${x.item.latex.replace(/#0|#\?/g, "□")}\nRight-click: pin to quick access`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertPaletteItem(x)}
            onContextMenu={(e) => {
              e.preventDefault();
              toggleFavorite(x.key);
            }}
          >
            <span className="preview">
              {x.item.glyph ? <span className="glyph">{x.item.glyph}</span> : <span className="tex" dangerouslySetInnerHTML={{ __html: markup(x.item.latex) }} />}
            </span>
            <span className="name">{x.item.name}</span>
            <span className="where">{x.group.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LocationToggle() {
  const loc = useApp((s) => s.paletteLocation);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <button
      type="button"
      className="pal-toggle"
      title={loc === "top" ? "Move the symbols to the right-hand panel" : "Move the symbols above the editor (MathType style)"}
      onClick={() => setPrefs({ paletteLocation: loc === "top" ? "right" : "top", rightOpen: true })}
    >
      {loc === "top" ? "⇥ Right" : "⇡ Top"}
    </button>
  );
}

// ------------------------------------------------------------------ top layout (MathType style)

function DropdownButton({ group, open, onToggle }: { group: PaletteGroup; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={open ? "pal-group open" : "pal-group"}
      title={group.label}
      aria-expanded={open}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      {group.iconTex ? <span className="tex" dangerouslySetInnerHTML={{ __html: markup(group.icon) }} /> : group.icon}
      <span className="caret">▾</span>
    </button>
  );
}

export function PaletteTop() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const favorites = useApp((s) => s.favorites);
  const recents = useApp((s) => s.recents);
  const tab = useApp((s) => s.paletteTab);
  const setPrefs = useApp((s) => s.setPrefs);
  const close = () => {
    setOpenId(null);
    setQuery("");
  };
  const ref = useOutsideClose(openId !== null || query !== "", close);

  const rows: ("symbols" | "templates")[] = ["symbols", "templates"];
  const openGroup = GROUPS.find((g) => g.id === openId && g.row !== "tabs");
  const favItems = favorites.map(findItem).filter((x): x is IndexedItem => !!x);
  const tabs = GROUPS.filter((g) => g.row === "tabs");
  const tabGroup = tabs.find((g) => g.id === tab);
  const tabItems: IndexedItem[] = tab === "recent" ? recents.map(findItem).filter((x): x is IndexedItem => !!x) : tabGroup ? groupItems(tabGroup) : [];

  let popover: ReactNode = null;
  if (query) popover = <SearchResults query={query} />;
  else if (openGroup) popover = <Grid items={groupItems(openGroup)} size={sizeOf(openGroup)} />;

  return (
    <div className="palette-top" ref={ref}>
      {rows.map((row) => (
        <div key={row} className="pal-row">
          {GROUPS.filter((g) => g.row === row).map((g) => (
            <DropdownButton key={g.id} group={g} open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} />
          ))}
        </div>
      ))}
      <div className="pal-row quick">
        <Grid items={favItems} size="glyph" />
        <div className="spacer" />
        <SearchBox query={query} setQuery={(q) => { setQuery(q); setOpenId(null); }} />
      </div>
      <div className="pal-tabs" role="tablist">
        {[{ id: "recent", label: "Recent" }, ...tabs].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPrefs({ paletteTab: tab === t.id ? null : t.id })}
          >
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <LocationToggle />
      </div>
      {tab && (
        <div className="pal-tab-body">
          {tabItems.length === 0 ? <p className="empty">Symbols you insert will appear here.</p> : <Grid items={tabItems} size={tab === "recent" ? "small" : "large"} />}
        </div>
      )}
      {popover && (
        <div className="pal-popover" role="dialog" aria-label={openGroup?.label ?? "Search results"}>
          {openGroup && !query && <div className="pal-popover-title">{openGroup.label}</div>}
          {popover}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ right panel layout

function Section({ title, children, defaultOpen = false, count }: { title: string; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details className="pal-section" open={defaultOpen}>
      <summary>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </summary>
      {children}
    </details>
  );
}

export function SymbolPanel() {
  const [query, setQuery] = useState("");
  const favorites = useApp((s) => s.favorites);
  const recents = useApp((s) => s.recents);
  const tab = useApp((s) => s.paletteTab);
  const setPrefs = useApp((s) => s.setPrefs);
  const favItems = favorites.map(findItem).filter((x): x is IndexedItem => !!x);
  const recentItems = recents.map(findItem).filter((x): x is IndexedItem => !!x);
  const collections = GROUPS.filter((g) => g.row === "tabs");
  const collection = collections.find((g) => g.id === tab) ?? collections[0]!;
  return (
    <aside className="symbol-panel" aria-label="Symbols">
      <div className="panel-head">
        <span className="panel-title">Symbols</span>
        <div className="spacer" />
        <LocationToggle />
        <button className="icon-btn" title="Hide symbols (Ctrl+Alt+B)" onClick={() => setPrefs({ rightOpen: false })}>
          ⇥
        </button>
      </div>
      <div className="panel-search">
        <SearchBox query={query} setQuery={setQuery} />
      </div>
      <div className="panel-scroll">
        {query ? (
          <ResultList query={query} />
        ) : (
          <>
            <Section title="Quick access" defaultOpen count={favItems.length}>
              {favItems.length === 0 ? <p className="empty">Right-click any symbol to pin it here.</p> : <Grid items={favItems} size="glyph" />}
            </Section>
            {recentItems.length > 0 && (
              <Section title="Recent" defaultOpen>
                <Grid items={recentItems} size="small" />
              </Section>
            )}
            <details className="pal-section" open>
              <summary>
                Collection
                <select
                  className="collection-select"
                  value={collection.id}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setPrefs({ paletteTab: e.target.value })}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </summary>
              <Grid items={groupItems(collection)} size="large" />
            </details>
            <div className="pal-divider">Symbols</div>
            {GROUPS.filter((g) => g.row === "symbols").map((g) => (
              <Section key={g.id} title={g.label} count={g.items.length}>
                <Grid items={groupItems(g)} size="glyph" />
              </Section>
            ))}
            <div className="pal-divider">Templates</div>
            {GROUPS.filter((g) => g.row === "templates").map((g) => (
              <Section key={g.id} title={g.label} count={g.items.length}>
                <Grid items={groupItems(g)} size="small" />
              </Section>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
