import { insertPaletteItem } from "../components/SymbolPalette";
import { ALL_ITEMS } from "./palette";
import { checkForUpdate } from "./updates";
import { zoomStep } from "./zoom";
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
      title: "Move symbols (right panel ↔ top bar)",
      group: "View",
      keywords: "symbols toolbar dock",
      run: () => app.setPrefs({ paletteLocation: useApp.getState().paletteLocation === "top" ? "right" : "top", rightOpen: true }),
    },
    { id: "app.update", title: "Check for updates", group: "View", keywords: "upgrade new version", run: () => checkForUpdate(true) },
    { id: "word.insert", title: "Send to Word", group: "Word", shortcut: "Ctrl+Enter", keywords: "insert export", run: actions.insertIntoWord },
    { id: "edit.copyLatex", title: "Copy LaTeX", group: "Edit", run: actions.copyLatex },
    { id: "edit.focusLatex", title: "Switch to LaTeX editor", group: "Edit", shortcut: "Ctrl+L", keywords: "latex mode source", run: actions.focusLatex },
    { id: "view.left", title: "Toggle library panel", group: "View", shortcut: "Ctrl+B", keywords: "sidebar left hide show", run: () => app.setPrefs({ leftOpen: !useApp.getState().leftOpen }) },
    { id: "view.right", title: "Toggle symbols panel", group: "View", shortcut: "Ctrl+Alt+B", keywords: "palette right hide show", run: () => app.setPrefs({ rightOpen: !useApp.getState().rightOpen }) },
    { id: "view.bottom", title: "Toggle LaTeX / details panel", group: "View", shortcut: "Ctrl+J", keywords: "bottom latex structure hide show", run: () => app.setPrefs({ bottomOpen: !useApp.getState().bottomOpen }) },
    { id: "view.focus", title: "Focus mode: hide all panels", group: "View", keywords: "zen distraction large equation space", run: () => app.setPrefs({ leftOpen: false, rightOpen: false, bottomOpen: false }) },
    { id: "view.all", title: "Show all panels", group: "View", run: () => app.setPrefs({ leftOpen: true, rightOpen: true, bottomOpen: true }) },
    { id: "view.zoomin", title: "Zoom in", group: "View", shortcut: "Ctrl +", run: () => zoomStep(1) },
    { id: "view.zoomout", title: "Zoom out", group: "View", shortcut: "Ctrl −", run: () => zoomStep(-1) },
    { id: "view.zoomreset", title: "Reset zoom", group: "View", shortcut: "Ctrl 0", run: () => app.setPrefs({ zoom: 1 }) },
    { id: "view.theme.light", title: "Theme: light", group: "View", run: () => app.setPrefs({ theme: "light" }) },
    { id: "view.theme.dark", title: "Theme: dark", group: "View", run: () => app.setPrefs({ theme: "dark" }) },
    { id: "view.theme.system", title: "Theme: follow system", group: "View", run: () => app.setPrefs({ theme: "system" }) },
    { id: "edit.display", title: "Toggle display / inline equation", group: "Edit", run: () => app.setDisplay(!useApp.getState().display) },
  ];
}
