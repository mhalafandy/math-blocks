import { describe, expect, it } from "vitest";
import { handleModeKey } from "./modeKeys";
import { useApp } from "./store";

/** A key as the browser reports it: `key` is the character of the active layout, `code` the physical key. */
const press = (key: string, code: string, mods: Partial<KeyboardEventInit> = { ctrlKey: true, altKey: true }) => {
  const e = { key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods, preventDefault: () => undefined, stopPropagation: () => undefined };
  return handleModeKey(e as unknown as KeyboardEvent);
};
const mode = () => {
  const s = useApp.getState();
  return s.numbered ? "numbered" : s.display ? "display" : "inline";
};

describe("Ctrl+Alt+U / I / N in the editor: the equation type, by physical key", () => {
  it("switches display / inline / numbered with the Latin layout", () => {
    expect(press("i", "KeyI")).toBe(true);
    expect(mode()).toBe("inline");
    expect(press("n", "KeyN")).toBe(true);
    expect(mode()).toBe("numbered");
    expect(press("u", "KeyU")).toBe(true);
    expect(mode()).toBe("display");
  });
  it("works the same with the Arabic (101) layout (other characters, same keys)", () => {
    expect(press("ه", "KeyI")).toBe(true);
    expect(mode()).toBe("inline");
    expect(press("ى", "KeyN")).toBe(true);
    expect(mode()).toBe("numbered");
    expect(press("ع", "KeyU")).toBe(true);
    expect(mode()).toBe("display");
  });
  it("leaves every other combination alone (Shift, no Alt, other keys)", () => {
    expect(press("I", "KeyI", { ctrlKey: true, altKey: true, shiftKey: true })).toBe(false);
    expect(press("i", "KeyI", { ctrlKey: true })).toBe(false);
    expect(press("j", "KeyJ")).toBe(false);
  });
});
