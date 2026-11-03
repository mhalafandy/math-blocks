import { useEffect, useRef } from "react";
import { create } from "zustand";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a separator line instead of an item. */
  separator?: boolean;
  shortcut?: string;
}

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  show: (x: number, y: number, items: MenuItem[]) => void;
  hide: () => void;
}

export const useMenu = create<MenuState>((set) => ({
  menu: null,
  show: (x, y, items) => set({ menu: { x, y, items } }),
  hide: () => set({ menu: null }),
}));

/** Opens a context menu at the mouse position. */
export const openMenu = (e: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]) => {
  e.preventDefault();
  useMenu.getState().show(e.clientX, e.clientY, items);
};

export function ContextMenu() {
  const menu = useMenu((s) => s.menu);
  const hide = useMenu((s) => s.hide);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      hide();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", key);
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu, hide]);

  if (!menu) return null;
  // Keep the menu inside the window.
  const x = Math.min(menu.x, window.innerWidth - 230);
  const y = Math.min(menu.y, window.innerHeight - 32 * menu.items.length - 16);
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: x, top: Math.max(8, y) }}>
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            className={it.danger ? "danger" : undefined}
            onClick={() => {
              hide();
              it.onSelect?.();
            }}
          >
            <span>{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
