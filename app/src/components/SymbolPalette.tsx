import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findItem, GROUPS, itemKey, plainLatex, searchPalette, type IndexedItem, type PaletteGroup } from "../lib/palette";
import { afterUse, nextRecents, recentItems, reorderFavorites } from "../lib/paletteUse";
import { ICON_CELL, LARGE_CELL, STRUCTURE_CELL, SYMBOL_CELL, type TileCell } from "../lib/tiles";
import { MathTile } from "./MathTile";
import { useApp } from "../lib/store";
import { lastEditor } from "../lib/focus";
import { insertIntoLatex } from "./LatexEditor";
import { insertIntoVisual } from "./MathEditor";

/**
 * Inserts a palette item into whichever editor is active, records it in Recent and in the use counts,
 * and, once per item clicked often, says how to type it faster.
 */
export function insertPaletteItem(x: IndexedItem) {
  const s = useApp.getState();
  const ok =
    (lastEditor() === "latex" && s.bottomOpen && s.bottomTab === "latex" && insertIntoLatex(plainLatex(x.item.latex))) ||
    insertIntoVisual(x.item.latex);
  if (!ok) return;
  const used = afterUse(x.item.latex, s.paletteUse ?? {}, s.paletteHints ?? []);
  s.setPrefs({ recents: nextRecents(s.recents, x), paletteUse: used.use, paletteHints: used.shown });
  if (used.hint) s.notify(`${used.hint} (for ${x.item.name})`);
}

/** The search with the user's ranking: favourites and frequently used items first. */
export function rankedSearch(query: string, limit?: number): IndexedItem[] {
  const s = useApp.getState();
  return searchPalette(query, limit, { favorites: s.favorites, use: s.paletteUse });
}

function toggleFavorite(key: string) {
  const s = useApp.getState();
  const has = s.favorites.includes(key);
  s.setPrefs({ favorites: has ? s.favorites.filter((k) => k !== key) : [...s.favorites, key] });
  s.notify(has ? "Removed from quick access" : "Pinned to quick access");
}

// ------------------------------------------------------------------ tiles

/** The cell of each button size: one font size everywhere, wider cells for larger formulas. */
export const CELL: Record<"glyph" | "small" | "large", TileCell> = { glyph: SYMBOL_CELL, small: STRUCTURE_CELL, large: LARGE_CELL };

/** One palette button. Mouse-down is prevented so the editor keeps its focus and selection. */
const ItemButton = memo(function ItemButton({ x, size, reorder }: { x: IndexedItem; size: "glyph" | "small" | "large"; reorder?: boolean }) {
  const favorite = useApp((s) => s.favorites.includes(x.key));
  return (
    <button
      type="button"
      className={`pal-item ${size}${favorite ? " fav" : ""}`}
      title={`${x.item.name}\n${x.item.latex.replace(/#0|#\?/g, "□")}\nRight-click: ${favorite ? "unpin" : "pin to quick access"}${reorder ? "; drag to reorder" : ""}`}
      draggable={reorder}
      onDragStart={reorder ? (e) => e.dataTransfer.setData("text/x-mathblocks-fav", x.key) : undefined}
      onDragOver={reorder ? (e) => e.dataTransfer.types.includes("text/x-mathblocks-fav") && e.preventDefault() : undefined}
      onDrop={
        reorder
          ? (e) => {
              const from = e.dataTransfer.getData("text/x-mathblocks-fav");
              if (!from) return;
              e.preventDefault();
              const s = useApp.getState();
              s.setPrefs({ favorites: reorderFavorites(s.favorites, from, x.key) });
            }
          : undefined
      }
      onMouseDown={(e) => !reorder && e.preventDefault()}
      onClick={() => insertPaletteItem(x)}
      onContextMenu={(e) => {
        e.preventDefault();
        toggleFavorite(x.key);
      }}
    >
      <MathTile latex={x.item.latex} cell={CELL[size]} />
    </button>
  );
});

/** A grid of palette buttons; `reorder`: the items are the favourites, reordered by dragging. */
export function Grid({ items, size, reorder }: { items: IndexedItem[]; size: "glyph" | "small" | "large"; reorder?: boolean }) {
  // Spacecraft entries change with the notation setting: redraw them when it changes.
  const notation = useApp((s) => `${s.spacecraftConvention}|${s.spacecraftVector}`);
  return (
    <div className={`pal-grid ${size}`}>
      {items.map((x) => (
        // A template in a glyph-sized row (quick access) still needs room for its preview.
        <ItemButton key={x.item.conventions ? `${x.key}|${notation}` : x.key} x={x} size={size === "glyph" && !x.item.glyph ? "small" : size} reorder={reorder} />
      ))}
    </div>
  );
}

/** Quick access (the favourites), the same everywhere: drag to reorder, right-click to unpin. */
export function QuickAccess({ empty, max }: { empty?: ReactNode; max?: number }) {
  const favorites = useApp((s) => s.favorites);
  const items = useMemo(() => favorites.map(findItem).filter((x): x is IndexedItem => !!x).slice(0, max), [favorites, max]);
  if (!items.length) return <>{empty ?? null}</>;
  return <Grid items={items} size="glyph" reorder />;
}

/** Recent: newest first, one per LaTeX, at most 16. */
export function RecentGrid({ size = "small", empty }: { size?: "glyph" | "small"; empty?: ReactNode }) {
  const recents = useApp((s) => s.recents);
  const items = useMemo(() => recentItems(recents), [recents]);
  if (!items.length) return <>{empty ?? null}</>;
  return <Grid items={items} size={size} />;
}

export const groupItems = (g: PaletteGroup): IndexedItem[] => g.items.map((item) => ({ key: itemKey(g, item), group: g, item }));
export const sizeOf = (g: PaletteGroup) => (g.kind === "symbols" ? "glyph" : g.row === "tabs" ? "large" : "small");

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
          const first = rankedSearch(query, 1)[0];
          if (first) insertPaletteItem(first);
        }
      }}
    />
  );
}

export function SearchResults({ query }: { query: string }) {
  const favorites = useApp((s) => s.favorites);
  const results = useMemo(() => rankedSearch(query), [query, favorites]);
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
  const favorites = useApp((s) => s.favorites);
  const results = useMemo(() => rankedSearch(query, 80), [query, favorites]);
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
              <MathTile latex={x.item.latex} cell={x.item.glyph ? SYMBOL_CELL : STRUCTURE_CELL} />
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

/** A group button's plain-glyph preview ("≤ ≠ ≈") as LaTeX: the glyphs a little apart. */
const iconLatex = (icon: string) => icon.trim().split(/\s+/).join("\\,");

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
      <MathTile latex={group.iconTex ? group.icon : iconLatex(group.icon)} cell={ICON_CELL} />
      <span className="caret">▾</span>
    </button>
  );
}

export function PaletteTop() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
  const tabs = GROUPS.filter((g) => g.row === "tabs" && g.items.length);
  const tabGroup = tabs.find((g) => g.id === tab);
  const tabItems: IndexedItem[] = tab === "recent" ? recentItems(recents) : tabGroup ? groupItems(tabGroup) : [];

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
        <QuickAccess />
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
  const favCount = favorites.filter((k) => !!findItem(k)).length;
  const hasRecent = recents.some((k) => !!findItem(k));
  const collections = GROUPS.filter((g) => g.row === "tabs" && g.items.length);
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
            <Section title="Quick access" defaultOpen count={favCount}>
              <QuickAccess empty={<p className="empty">Right-click any symbol to pin it here.</p>} />
            </Section>
            {hasRecent && (
              <Section title="Recent" defaultOpen>
                <RecentGrid />
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
