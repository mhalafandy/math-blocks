import { insertPaletteItem } from "../components/SymbolPalette";
import { ALL_ITEMS } from "./palette";
import { useApp } from "./store";

export interface Command {
  id: string;
  title: string;
  group: "Insert" | "View" | "Word" | "Edit";
  keywords?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

export function buildCommands(actions: { insertIntoWord: () => void; copyLatex: () => void; focusLatex: () => void }): Command[] {
  const app = useApp.getState();
  return [
    // Every palette symbol and template is also a command ("Insert gradient", "Insert 3×3 matrix"…).
    ...ALL_ITEMS.filter((x) => x.group.id !== "tab-matrices").map((x): Command => ({
      id: `insert.${x.key}`,
      title: `Insert ${x.item.name.charAt(0).toLowerCase()}${x.item.name.slice(1)}${x.item.glyph ? `  ${x.item.glyph}` : ""}`,
      group: "Insert",
      keywords: `${x.item.keys ?? ""} ${x.item.latex} ${x.group.label}`,
      run: () => insertPaletteItem(x),
    })),
    {
      id: "view.palette",
      title: "Move symbol palette (top ↔ side)",
      group: "View",
      keywords: "symbols toolbar dock",
      run: () => app.setPrefs({ paletteLocation: useApp.getState().paletteLocation === "top" ? "side" : "top" }),
    },
    { id: "word.insert", title: "Send to Word", group: "Word", shortcut: "Ctrl+Enter", keywords: "insert export", run: actions.insertIntoWord },
    { id: "edit.copyLatex", title: "Copy LaTeX", group: "Edit", run: actions.copyLatex },
    { id: "edit.focusLatex", title: "Switch to LaTeX editor", group: "Edit", shortcut: "Ctrl+L", keywords: "latex mode source", run: actions.focusLatex },
    { id: "view.split", title: "Layout: visual + LaTeX", group: "View", run: () => app.setPrefs({ mode: "split" }) },
    { id: "view.visual", title: "Layout: visual only", group: "View", run: () => app.setPrefs({ mode: "visual" }) },
    { id: "view.latex", title: "Layout: LaTeX only", group: "View", run: () => app.setPrefs({ mode: "latex" }) },
    { id: "view.theme.light", title: "Theme: light", group: "View", run: () => app.setPrefs({ theme: "light" }) },
    { id: "view.theme.dark", title: "Theme: dark", group: "View", run: () => app.setPrefs({ theme: "dark" }) },
    { id: "view.theme.system", title: "Theme: follow system", group: "View", run: () => app.setPrefs({ theme: "system" }) },
    { id: "edit.display", title: "Toggle display / inline equation", group: "Edit", run: () => app.setDisplay(!useApp.getState().display) },
  ];
}
