import { focusVisualEditor } from "../components/MathEditor";
import { useLibrary } from "./library/useLibrary";
import { useApp } from "./store";

/** Starts a fresh equation: empty editor, not attached to a library or Word equation. */
export function newEquation() {
  const app = useApp.getState();
  app.setEditing(null);
  useLibrary.getState().closeEquation();
  app.setLatex("", "external");
  requestAnimationFrame(() => focusVisualEditor());
}
