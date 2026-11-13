import { beforeEach, describe, expect, it } from "vitest";
import { applyPreset, BLANK_STYLE_VALUES, DEFAULT_STYLE, STYLE_PRESETS, styleHash, styleLabel, looksOf, withLooks } from "@mathblocks/math-core";
import { useApp } from "./store";
import { addImportedStyle, allStyles, createStyle, deleteStyle, duplicateStyle, myStyles, nameProblem, renameStyle, setDefaultStyle, updateStyle } from "./stylePresets";
import { parseStyleExtras, parseStyleXml, presetFromJson, presetToJson, styleXml } from "./docStyle";

describe("My styles", () => {
  beforeEach(() => useApp.getState().setPrefs({ stylePresets: [], defaultStyle: null }));
  const builtIn = JSON.stringify(STYLE_PRESETS);

  it("creates from blank or from a style, renames, duplicates, deletes", () => {
    const a = createStyle("Report style", "for reports", "blank");
    expect(a.values).toEqual(BLANK_STYLE_VALUES);
    const b = createStyle("ISO copy", "", "iso");
    expect(b.values.labels).toBe("upright");
    expect(nameProblem("report STYLE")).toMatch(/already exists/);
    expect(() => createStyle("ISO 80000-2", "", "blank")).toThrow(/already exists/);
    const r = renameStyle(a.id, "Report style 2", "renamed");
    expect(r.name).toBe("Report style 2");
    const c = duplicateStyle(r.id);
    expect(c.name).toBe("Report style 2 (copy)");
    expect(c.values).toEqual(r.values);
    expect(duplicateStyle(r.id).name).toBe("Report style 2 (copy 2)");
    deleteStyle(c.id);
    expect(myStyles().some((p) => p.id === c.id)).toBe(false);
    expect(JSON.stringify(STYLE_PRESETS)).toBe(builtIn);
  });

  it("built-in styles are read-only", () => {
    expect(() => updateStyle("iso", DEFAULT_STYLE)).toThrow(/read-only/);
    expect(() => renameStyle("iso", "Mine")).toThrow();
    expect(() => deleteStyle("iso")).toThrow();
    expect(duplicateStyle("iso").name).toBe("ISO 80000-2 (copy)");
    expect(JSON.stringify(STYLE_PRESETS)).toBe(builtIn);
  });

  it("edits a style of mine and sets it as my default", () => {
    const a = createStyle("Lab notes", "", "blank");
    updateStyle(a.id, withLooks(DEFAULT_STYLE, { labels: "upright" }));
    expect(allStyles().find((p) => p.id === a.id)!.values.labels).toBe("upright");
    const def = setDefaultStyle(a.id);
    expect(useApp.getState().defaultStyle?.presetName).toBe("Lab notes");
    expect(looksOf(def).labels).toBe("upright");
  });

  it("a document says which style it uses, and when it was changed after applying", () => {
    const a = createStyle("Thesis style", "chapters", "iso");
    const doc = applyPreset(DEFAULT_STYLE, a);
    expect(styleLabel(doc, allStyles())).toBe("Thesis style");
    expect(styleLabel(withLooks(doc, { labels: "italic" }), allStyles())).toBe("Thesis style, modified");
    // Stored in the document with its name and description.
    const back = parseStyleXml(styleXml(doc));
    expect(back?.presetName).toBe("Thesis style");
    expect(back?.presetDescription).toBe("chapters");
  });

  it("an exported style imports with its name, description and look", () => {
    const a = createStyle("Shared style", "for the group", "physics");
    const json = presetToJson(a);
    deleteStyle(a.id);
    const b = addImportedStyle(presetFromJson(json));
    expect(b.name).toBe("Shared style");
    expect(b.description).toBe("for the group");
    expect(styleHash(applyPreset(DEFAULT_STYLE, b))).toBe(styleHash(applyPreset(DEFAULT_STYLE, a)));
    // Importing again does not overwrite another style's name.
    expect(addImportedStyle({ ...presetFromJson(json), id: "other" }).name).toBe("Shared style (2)");
  });

  it("the stored part keeps the recent history and the probe", () => {
    const h = [{ hash: styleHash(DEFAULT_STYLE), style: DEFAULT_STYLE }];
    const xml = styleXml(withLooks(DEFAULT_STYLE, { labels: "upright" }), { history: h, probe: "mb1|-|abc" });
    expect(looksOf(parseStyleXml(xml)!).labels).toBe("upright");
    const extras = parseStyleExtras(xml);
    expect(extras.probe).toBe("mb1|-|abc");
    expect(extras.history.map((x) => x.hash)).toEqual([styleHash(DEFAULT_STYLE)]);
  });
});
