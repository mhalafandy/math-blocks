/**
 * Word keyboard shortcuts (0.1.170 convention): Ctrl+Alt + a key under the right hand, only for the most frequent
 * commands. No Alt+Shift or Ctrl+Shift base (they switch the Windows input language), no function keys, at most
 * two held modifiers. Changeable in Settings; the shell registers them system-wide and acts only while Word is in
 * front. The self-test checks each against Word's own assignments on this PC.
 */

export type WordKeyName = "inline" | "display" | "latex" | "edit" | "reference" | "number";

export const WORD_KEY_LABELS: Record<WordKeyName, string> = {
  inline: "New inline equation at the cursor",
  display: "New display equation at the cursor",
  latex: "Toggle LaTeX (equation ↔ its LaTeX text)",
  edit: "Edit the equation at the cursor",
  reference: "Insert a reference",
  number: "Number / un-number the equation",
};

/** The default set (keep in step with app/src-tauri/src/shortcuts.rs DEFAULTS). */
export const DEFAULT_WORD_KEYS: Record<WordKeyName, string> = {
  inline: "Ctrl+Alt+J",
  display: "Ctrl+Alt+;",
  latex: "Ctrl+Alt+'",
  edit: "Ctrl+Alt+K",
  reference: "Ctrl+Alt+,",
  number: "Ctrl+Alt+/",
};

const KEYS = new Set([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", ";", "'", ",", ".", "/", "[", "]", "\\", "-", "="]);

/** Null when the shortcut follows the convention (or is empty: switched off); else why not. */
export function checkWordKeys(keys: string): string | null {
  const k = keys.trim();
  if (!k) return null;
  const parts = k.split("+").map((p) => p.trim());
  // "Ctrl+Alt+," / "Ctrl+Alt++" : the last part is the key.
  const key = parts.pop() ?? "";
  const mods = parts.map((p) => p.toLowerCase());
  if (!KEYS.has(key.toUpperCase())) return /^F\d+$/i.test(key) ? "Function keys are taken in Word and need Fn on laptops." : `"${key}" is not a letter, digit or one of ; ' , . / [ ] \\ - =.`;
  if (mods.some((m) => !["ctrl", "control", "alt", "shift"].includes(m))) return "Use Ctrl and Alt.";
  if (mods.includes("shift")) return "Not with Shift: Alt+Shift and Ctrl+Shift switch the Windows input language.";
  if (mods.length === 0 || mods.length > 2) return "One or two modifiers (Ctrl+Alt).";
  return null;
}

/** Word's key code for a shortcut (Application.FindKey / BuildKeyCode), for the self-test's clash check. */
export function wordKeyCode(keys: string): number | null {
  const parts = keys.split("+").map((p) => p.trim());
  const key = parts.pop() ?? "";
  let code = 0;
  for (const m of parts.map((p) => p.toLowerCase())) {
    if (m === "ctrl" || m === "control") code |= 512; // wdKeyControl
    else if (m === "alt") code |= 1024; // wdKeyAlt
    else if (m === "shift") code |= 256; // wdKeyShift
  }
  const special: Record<string, number> = { ";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191, "[": 219, "\\": 220, "]": 221, "'": 222 };
  const k = key.toUpperCase();
  if (special[k] !== undefined) return code | special[k];
  if (/^[A-Z0-9]$/.test(k)) return code | k.charCodeAt(0);
  return null;
}

/** Sends the set to the shell (system-wide registration); returns the ones it could not register. */
export async function applyWordKeys(keys: Record<string, string>): Promise<string[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string[]>("set_word_shortcuts", { shortcuts: Object.entries(keys).filter(([, v]) => !checkWordKeys(v)) });
  } catch {
    return []; // browser preview, or an older shell
  }
}
