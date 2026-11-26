import { useApp } from "./store";
export { MODE_KEYS } from "./wordKeys";

/**
 * Ctrl+Alt+U / I / N: the equation becomes display / inline / numbered (as the bar's buttons). By key position
 * (e.code), so they work on any keyboard layout; Ctrl+Alt+J stays Word's "new inline equation".
 */
export function handleModeKey(e: KeyboardEvent): boolean {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return false;
  const app = useApp.getState();
  if (e.code === "KeyU") {
    app.setDisplay(true);
    app.setNumbered(false);
  } else if (e.code === "KeyI") app.setDisplay(false);
  else if (e.code === "KeyN") app.setNumbered(true);
  else return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}
