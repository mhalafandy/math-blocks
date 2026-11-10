import { insertPaletteItem } from "../components/SymbolPalette";
import { convertKindToPlain, makeKindFromSelection, toggleBold } from "../components/MathEditor";
import { KINDS } from "@mathblocks/math-core";
import { newEquation } from "./actions";
import { ALL_ITEMS } from "./palette";
import { checkForUpdate } from "./updates";
import { zoomStep } from "./zoom";
import { askText } from "../components/Dialogs";
import { exportLibrary, importLibrary } from "./library/transfer";
import { convertMathTypeDocument } from "./convertMathType";
import { useLibrary } from "./library/useLibrary";
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
    { id: "lib.save", title: "Save to library", group: "Edit", shortcut: "Ctrl+S", keywords: "store keep library version", run: () => useLibrary.getState().saveCurrent() },
    { id: "lib.saveAs", title: "Save as new library equation…", group: "Edit", shortcut: "Ctrl+Shift+S", keywords: "copy duplicate", run: () => useLibrary.getState().setDialog({ mode: "new" }) },
    { id: "lib.details", title: "Library details and version history", group: "Edit", keywords: "versions history restore tags rename", run: () => app.setPrefs({ bottomOpen: true, bottomTab: "details" }) },
    {
      id: "lib.folder",
      title: "New library folder…",
      group: "Edit",
      keywords: "folder organise",
      run: async () => {
        const name = await askText("New folder", "", "Folder name", "Create");
        if (name) await useLibrary.getState().createFolder(name, null);
      },
    },
    { id: "lib.export", title: "Export library…", group: "Edit", keywords: "backup save file json share", run: () => exportLibrary() },
    { id: "lib.import", title: "Import library…", group: "Edit", keywords: "restore load file json merge", run: () => importLibrary() },
    { id: "word.convertMathType", title: "Convert MathType equations in a document…", group: "Word", keywords: "mathtype import convert docx thesis equation editor ole", run: () => convertMathTypeDocument() },
    { id: "word.convertMathTypeOpen", title: "Convert MathType equations in the open Word document", group: "Word", keywords: "mathtype convert in place ole thesis", run: () => import("./convertMathType").then((m) => m.convertOpenDocument()) },
    { id: "word.reference", title: "Insert reference to an equation…", group: "Word", keywords: "cross reference ref number cite eq", run: () => import("./numbering").then((m) => m.openReferencePicker()) },
    { id: "word.updateNumbers", title: "Update equation numbers and references", group: "Word", keywords: "renumber refresh fields", run: () => import("./numbering").then((m) => m.updateNumbers()) },
    { id: "edit.numbered", title: "Numbered equation (toggle)", group: "Edit", keywords: "number label tag display", run: () => app.setNumbered(!useApp.getState().numbered) },
    { id: "view.numberStyle", title: "Equation number style…", group: "View", keywords: "format chapter brackets parentheses", run: () => app.setPrefs({ bottomOpen: true, bottomTab: "style" }) },
    {
      id: "edit.template",
      title: "Use this equation with other symbols…",
      group: "Edit",
      keywords: "template parameters substitute rename variables reuse",
      run: () => import("../components/TemplateDialog").then((m) => m.openTemplate(useApp.getState().latex, useApp.getState().display)),
    },
    { id: "word.convertLatex", title: "Convert all LaTeX in the Word document to equations", group: "Word", keywords: "latex dollar tex import overleaf convert", run: () => import("./wordShortcuts").then((m) => m.convertAllLatex()) },
    { id: "word.editAtCursor", title: "Edit the equation at Word's cursor", group: "Word", shortcut: "Ctrl+Alt+M (in Word)", keywords: "edit new insert floating", run: () => import("./wordShortcuts").then((m) => m.editAtCursor()) },
    { id: "word.toggleLatex", title: "Equation ↔ LaTeX at Word's cursor", group: "Word", shortcut: "Ctrl+Alt+L (in Word)", keywords: "latex text linear toggle source", run: () => import("./wordShortcuts").then((m) => m.toggleLatexAtCursor()) },
    {
      id: "notation.settings",
      title: "Notation settings: kinds and their styles, new kinds…",
      group: "View",
      keywords: "kind style vector harpoon bold preset hughes schaub markley new kind my notation macro restyle",
      run: () => import("../components/NotationSettings").then((m) => m.openNotationSettings()),
    },
    {
      id: "notation.newKind",
      title: "New notation kind…",
      group: "Edit",
      keywords: "my notation macro kind custom define",
      run: () => import("../components/NotationSettings").then((m) => m.openNotationSettings("__new")),
    },
    // Make → kind on the selection (or the symbol before the cursor), one command per kind.
    ...KINDS.filter((k) => k.args === 1 && k.id !== "diff" && k.id !== "frm").map((k): Command => ({
      id: `notation.make.${k.id}`,
      title: `Make → ${k.name}`,
      group: "Edit",
      keywords: `kind convert selection ${k.macro} notation`,
      run: () => void makeKindFromSelection(k.id),
    })),
    {
      id: "notation.toPlain",
      title: "Convert kind to plain (hand-styled)",
      group: "Edit",
      keywords: "kind plain unlink style manual",
      run: () => {
        if (!convertKindToPlain()) useApp.getState().notify("Put the cursor in or right after a notation kind first.");
      },
    },
    {
      id: "notation.applyWord",
      title: "Apply the notation to the Word document (redraw equations with kinds)…",
      group: "Word",
      keywords: "restyle redraw kinds document notation",
      run: () => import("./kindRestyle").then((m) => m.restyleDocument()),
    },
    {
      id: "word.notation",
      title: "Change notation / check consistency across the document (vectors, dyadics…)…",
      group: "Word",
      keywords: "vector dyadic tensor style arrow harpoon bold hat bar notation consistency consistent check mixed all",
      run: () => import("../components/NotationDialog").then((m) => m.openNotation()),
    },
    {
      id: "word.nomenclature",
      title: "Insert / update the list of symbols (nomenclature)…",
      group: "Word",
      keywords: "nomenclature symbols list notation glossary table thesis front matter",
      run: () => import("../components/NomenclatureDialog").then((m) => m.openNomenclature()),
    },
    {
      id: "word.upgradeNumbering",
      title: "Upgrade numbering: rebuild equation numbers and references as single fields (current format)",
      group: "Word",
      keywords: "numbering number upgrade field reference format chapter section appendix",
      run: () => import("./numbering").then((m) => m.upgradeNumbering()),
    },
    {
      id: "word.numberMarker",
      title: "Insert equation chapter marker (chapter / section / appendix) at Word's cursor…",
      group: "Word",
      keywords: "chapter section appendix marker numbering restart break",
      run: () => import("../components/NumberMarkerDialog").then((m) => m.openNumberMarker()),
    },
    {
      id: "word.repair",
      title: "Repair equations: give pasted copies back their MathBlocks identity",
      group: "Word",
      keywords: "repair paste copy cut identity picture lost wrapper fix duplicate",
      run: () => import("./repair").then((m) => void m.repairDocument()),
    },
    {
      id: "word.selfTest",
      title: "Run Word self-test (inserts, opens, numbers, pastes, moves, undoes in test documents; writes a report)",
      group: "Word",
      keywords: "self test smoke check verify report word paste drag undo baseline",
      run: () => import("./selfTest").then((m) => void m.runWordSelfTest()),
    },
    {
      id: "app.fontCompare",
      title: "Compare symbol fonts on this PC (STIX / thinned / MT Extra)…",
      group: "View",
      keywords: "font fallback stix mt extra mathtype symbols weight compare classic",
      run: () => import("../components/FontCompareDialog").then((m) => m.openFontCompare()),
    },
    {
      id: "app.backups",
      title: "Open backups folder (automatic copies before document-wide changes)",
      group: "Word",
      keywords: "backup restore copy undo safety folder",
      run: async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke<string>("backups_open");
        } catch (e) {
          app.notify(`Could not open the backups folder: ${e instanceof Error ? e.message : String(e)}`, "error");
        }
      },
    },
    {
      id: "word.normalizeBold",
      title: "Normalize bold: keep bold off subscripts and superscripts in the document…",
      group: "Word",
      keywords: "bold scripts subscript superscript index normalize fix weight",
      run: () => import("../components/NormalizeBoldDialog").then((m) => m.openNormalizeBold()),
    },
    {
      id: "word.thesis",
      title: "Thesis check: notation, definitions and linked equations across all chapter files…",
      group: "Word",
      keywords: "thesis chapters files book consistency nomenclature closed documents project",
      run: () => import("../components/ThesisDialog").then((m) => m.openThesis()),
    },
    { id: "view.symbols", title: "Symbols: where is each symbol used? rename everywhere", group: "View", keywords: "symbol index dependency rename variable notation consistency", run: () => app.setPrefs({ bottomOpen: true, bottomTab: "symbols" }) },
    { id: "export.mathml", title: "Copy as MathML", group: "Edit", keywords: "export paste web libreoffice", run: () => import("./export").then((m) => m.copyMathMl()) },
    { id: "export.image", title: "Copy as image (PNG)", group: "Edit", keywords: "export picture clipboard powerpoint slides", run: () => import("./export").then((m) => m.copyImage()) },
    { id: "export.svg", title: "Save equation as SVG…", group: "Edit", keywords: "export vector image file", run: () => import("./export").then((m) => m.saveSvg()) },
    { id: "export.png", title: "Save equation as PNG…", group: "Edit", keywords: "export image picture file", run: () => import("./export").then((m) => m.savePng()) },
    { id: "export.docLatex", title: "Export the Word document's equations as LaTeX…", group: "Word", keywords: "tex overleaf latex export thesis", run: () => import("./export").then((m) => m.exportDocumentLatex()) },
    { id: "recognize.file", title: "Recognise an equation from an image file…", group: "Insert", keywords: "ocr picture screenshot photo scan image recognize mathpix", run: () => import("../components/RecognitionDialog").then((m) => m.recognizeFromFile()) },
    { id: "recognize.settings", title: "Equation recognition settings (API key)…", group: "View", keywords: "ocr picture screenshot claude anthropic api key", run: () => import("../components/RecognitionDialog").then((m) => m.openRecognitionSettings()) },
    { id: "edit.snippets", title: "Snippets (trigger + Tab)…", group: "Edit", keywords: "snippet abbreviation expand tab macro ddt pdv", run: () => import("../components/SnippetsDialog").then((m) => m.openSnippets()) },
    { id: "help.shortcuts", title: "Keyboard shortcuts", group: "View", shortcut: "F1", keywords: "keys help mathtype cheat sheet", run: () => import("../components/ShortcutsDialog").then((m) => m.openShortcuts()) },
    { id: "help.latex", title: "LaTeX commands (cheat sheet)", group: "View", keywords: "latex commands reference cheat sheet macros insert list", run: () => import("../components/ShortcutsDialog").then((m) => m.openShortcuts("latex")) },
    {
      id: "view.doubleSpace",
      title: "Space Space opens the command palette (on/off)",
      group: "View",
      keywords: "double space palette setting",
      run: () => {
        const app = useApp.getState();
        app.setPrefs({ doubleSpace: !app.doubleSpace });
        app.notify(`Space Space ${app.doubleSpace ? "no longer opens" : "opens"} the command palette.`);
      },
    },
    { id: "app.update", title: "Check for updates", group: "View", keywords: "upgrade new version", run: () => checkForUpdate(true) },
    { id: "word.new", title: "New equation", group: "Edit", shortcut: "Ctrl+N", keywords: "clear reset fresh blank stop editing", run: () => newEquation() },
    { id: "edit.bold", title: "Bold (toggle)", group: "Edit", shortcut: "Ctrl+Shift+B", keywords: "bold vector matrix strong", run: () => toggleBold() },
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
