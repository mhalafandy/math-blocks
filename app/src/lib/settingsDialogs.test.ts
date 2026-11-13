import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * No old settings dialog can be opened: every dialog that became a settings page declares its page (its Modal
 * then never draws as a pop-up outside the settings window: it opens the settings at that page instead), and
 * nothing outside the settings window opens those dialogs' state directly — every entry point goes through
 * openSettings(page).
 */
const dir = new URL("../components/", import.meta.url);
const lib = new URL("./", import.meta.url);
const read = (u: URL, f: string) => readFileSync(new URL(f, u), "utf8");

/** The settings pages that are dialogs: file, page id, and the store that opens the dialog. */
const DIALOG_PAGES = [
  { file: "DocumentStyleDialog.tsx", page: "docstyle", store: "useDocumentStyle" },
  { file: "NotationSettings.tsx", page: "kinds", store: "useNotationSettings" },
  { file: "AccentsDialog.tsx", page: "accents", store: "useAccents" },
  { file: "SnippetsDialog.tsx", page: "snippets", store: "useSnippets" },
  { file: "RecognitionDialog.tsx", page: "recognition", store: "useRecognition" },
];

const sources = (): { name: string; text: string }[] => [
  ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => ({ name: `components/${f}`, text: read(dir, f) })),
  ...readdirSync(lib).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => ({ name: `lib/${f}`, text: read(lib, f) })),
];

describe("settings: no old settings dialog can be opened", () => {
  it("every dialog that is a settings page declares its page on its Modal", () => {
    for (const d of DIALOG_PAGES) {
      const text = read(dir, d.file);
      // Each <Modal …> opening (on one line in these files).
      const modals = [...text.matchAll(/<Modal\b[^\n]*/g)].map((m) => m[0]);
      expect(modals.length, d.file).toBeGreaterThan(0);
      for (const m of modals) expect(m, `${d.file}: ${m}`).toContain(`page="${d.page}"`);
    }
  });

  it("a Modal with a page never draws its pop-up outside the settings window (it redirects)", () => {
    const text = read(dir, "Dialogs.tsx");
    expect(text).toMatch(/if \(page\) return <RedirectToSettings page=\{page\} \/>;/);
  });

  it("nothing outside the settings window opens a settings dialog's state directly", () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      if (name === "components/SettingsDialog.tsx") continue;
      for (const d of DIALOG_PAGES) {
        // Opening: .set(true…), .set({ open: true…}), setState({ open: true…}).
        const re = new RegExp(`${d.store}\\.(?:getState\\(\\)\\.set\\((?:true|\\{\\s*open:\\s*true)|setState\\(\\{\\s*open:\\s*true)`, "g");
        if (re.test(text)) offenders.push(`${name} opens ${d.store}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("openSettings tells every caller it handled the request (no caller opens the old dialog after it)", () => {
    const text = read(lib, "settingsStore.ts");
    const body = text.slice(text.indexOf("export function openSettings"));
    expect(body.slice(0, body.indexOf("\n}"))).not.toMatch(/return false/);
  });
});
