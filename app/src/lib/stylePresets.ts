import { applyPreset, BLANK_STYLE_VALUES, withLetterRoles, presetFrom, STYLE_PRESETS, STYLE_PRESET_BY_ID, type MathStyle, type StylePreset } from "@mathblocks/math-core";
import { useApp } from "./store";
import { userDefaultStyle } from "./docStyle";

/**
 * The user's own styles ("My styles"): create (from blank or from any style), rename, edit, duplicate,
 * delete, set as the default for new documents. The built-in presets are read-only: saving one asks
 * for a new name. Stored in the preferences; exported/imported as files (docStyle.ts).
 */

export const myStyles = (): StylePreset[] => useApp.getState().stylePresets;
export const allStyles = (): StylePreset[] => [...STYLE_PRESETS, ...myStyles()];
export const isBuiltIn = (id: string) => STYLE_PRESET_BY_ID.has(id);

function save(list: StylePreset[]) {
  useApp.getState().setPrefs({ stylePresets: list });
}

/** Why a name cannot be used (empty, or another style has it); null when it can. */
export function nameProblem(name: string, exceptId?: string): string | null {
  const n = name.trim();
  if (!n) return "Give the style a name.";
  if (allStyles().some((p) => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase())) return `A style named “${n}” already exists.`;
  return null;
}

const newId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A new style of the user's, from blank (neutral starting values) or from any style. */
export function createStyle(name: string, description: string, from: "blank" | string): StylePreset {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  const base = from === "blank" ? null : allStyles().find((p) => p.id === from);
  if (from !== "blank" && !base) throw new Error("That style no longer exists.");
  const p: StylePreset = { id: newId(), name: name.trim(), description: description.trim(), values: { ...(base ? base.values : BLANK_STYLE_VALUES) } };
  save([...myStyles(), p]);
  return p;
}

export function renameStyle(id: string, name: string, description?: string): StylePreset {
  if (isBuiltIn(id)) throw new Error("Built-in styles cannot be renamed: duplicate one first.");
  const problem = nameProblem(name, id);
  if (problem) throw new Error(problem);
  const list = myStyles().map((p) => (p.id === id ? { ...p, name: name.trim(), ...(description !== undefined ? { description: description.trim() } : {}) } : p));
  save(list);
  return list.find((p) => p.id === id)!;
}

/** Saves a style's look into one of the user's styles (built-in ones are read-only). */
export function updateStyle(id: string, style: MathStyle): StylePreset {
  if (isBuiltIn(id)) throw new Error("Built-in styles are read-only: save under a new name.");
  const cur = myStyles().find((p) => p.id === id);
  if (!cur) throw new Error("That style no longer exists.");
  const next = { ...presetFrom(style, id, cur.name, cur.description) };
  save(myStyles().map((p) => (p.id === id ? next : p)));
  return next;
}

/** A copy of any style (built-in or the user's), named "… (copy)", "… (copy 2)"… */
export function duplicateStyle(id: string): StylePreset {
  const src = allStyles().find((p) => p.id === id);
  if (!src) throw new Error("That style no longer exists.");
  let name = `${src.name} (copy)`;
  for (let i = 2; nameProblem(name); i++) name = `${src.name} (copy ${i})`;
  return createStyle(name, src.description, id);
}

export function deleteStyle(id: string) {
  if (isBuiltIn(id)) throw new Error("Built-in styles cannot be deleted.");
  save(myStyles().filter((p) => p.id !== id));
}

/** Makes a style the default for documents without a style of their own. */
export function setDefaultStyle(id: string): MathStyle {
  const p = allStyles().find((x) => x.id === id);
  if (!p) throw new Error("That style no longer exists.");
  const style = { ...withLetterRoles(applyPreset(userDefaultStyle(), p), {}), exceptions: [] };
  useApp.getState().setPrefs({ defaultStyle: style });
  return style;
}

/** Adds (or replaces, same id) an imported style. */
export function addImportedStyle(p: StylePreset): StylePreset {
  let name = p.name;
  for (let i = 2; nameProblem(name, p.id); i++) name = `${p.name} (${i})`;
  const next = { ...p, name, id: isBuiltIn(p.id) ? newId() : p.id };
  save([...myStyles().filter((x) => x.id !== next.id), next]);
  return next;
}
