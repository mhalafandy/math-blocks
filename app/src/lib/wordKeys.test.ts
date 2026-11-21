import { describe, expect, it } from "vitest";
import { checkWordKeys, DEFAULT_WORD_KEYS, wordKeyCode } from "./wordKeys";

describe("Word shortcuts", () => {
  it("the defaults follow the convention: Ctrl+Alt and a key under the right hand, all different", () => {
    const values = Object.values(DEFAULT_WORD_KEYS);
    for (const k of values) expect(checkWordKeys(k)).toBeNull();
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(values.length);
    for (const k of values) expect(k.startsWith("Ctrl+Alt+")).toBe(true);
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
});
