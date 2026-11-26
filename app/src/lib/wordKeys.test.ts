import { describe, expect, it } from "vitest";
import { checkWordKeys, DEFAULT_WORD_KEYS, migrateWordKeys, MODE_KEYS, wordKeyCode } from "./wordKeys";

describe("Word shortcuts", () => {
  it("the defaults follow the convention: Ctrl+Alt and a key under the right hand, all different", () => {
    const values = Object.values(DEFAULT_WORD_KEYS);
    for (const k of values) expect(checkWordKeys(k)).toBeNull();
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(values.length);
    for (const k of values) expect(k.startsWith("Ctrl+Alt+")).toBe(true);
  });
  it("the editor's own keys (equation type) are never Word shortcuts: not a default, refused as one", () => {
    const defaults = Object.values(DEFAULT_WORD_KEYS).map((v) => v.toLowerCase());
    for (const k of Object.values(MODE_KEYS)) {
      expect(defaults).not.toContain(k.toLowerCase());
      expect(checkWordKeys(k)).toMatch(/MathBlocks editor/);
      expect(checkWordKeys(k.replace("Ctrl", "Control").toLowerCase())).toMatch(/MathBlocks editor/);
    }
  });
  it("refuses Shift bases, function keys and three modifiers", () => {
    expect(checkWordKeys("Ctrl+Shift+J")).toMatch(/input language/);
    expect(checkWordKeys("Alt+Shift+J")).toMatch(/input language/);
    expect(checkWordKeys("Ctrl+Alt+F5")).toMatch(/Function keys/);
    expect(checkWordKeys("Ctrl+Alt+Shift+L")).not.toBeNull();
    expect(checkWordKeys("")).toBeNull();
  });
  it("gives Word's key codes (BuildKeyCode) for the clash check", () => {
    expect(wordKeyCode("Ctrl+Alt+J")).toBe(512 | 1024 | 74);
    expect(wordKeyCode("Ctrl+Alt+;")).toBe(512 | 1024 | 186);
    expect(wordKeyCode("Ctrl+Alt+'")).toBe(512 | 1024 | 222);
    expect(wordKeyCode("Ctrl+Alt+,")).toBe(512 | 1024 | 188);
    expect(wordKeyCode("Ctrl+Alt+/")).toBe(512 | 1024 | 191);
  });
  it("moves the old edit default off Word's AutoFormat (Ctrl+Alt+K), keeps a chosen key", () => {
    expect(migrateWordKeys({ edit: "Ctrl+Alt+K" }).edit).toBe(DEFAULT_WORD_KEYS.edit);
    expect(migrateWordKeys({ edit: "Ctrl+Alt+]" }).edit).toBe("Ctrl+Alt+]");
    expect(DEFAULT_WORD_KEYS.edit).not.toBe("Ctrl+Alt+K");
  });
});
