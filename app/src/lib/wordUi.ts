import { askConfirm } from "../components/Dialogs";
import { addinSupports, connector } from "./connector";
import { useApp } from "./store";

/**
 * Commands started from Word finish in Word: the confirmation is a small dialog over Word, the
 * result goes to Word's status bar (a problem: a message over Word). The app stays in the background.
 */

/** Asks over Word (or in the app for an older add-in). Skipped when the user chose "Don't ask again". */
export async function confirmInWord(title: string, text: string, ok: string, fromWord: boolean): Promise<boolean> {
  const app = useApp.getState();
  if (fromWord && !app.confirmWordCommands) return true;
  if (fromWord && addinSupports("confirm")) {
    const r = await connector.request("confirm", { title, text, ok, offerDontAsk: true }, 600_000);
    if (r.ok && r.dontAsk) app.setPrefs({ confirmWordCommands: false });
    return r.ok;
  }
  return askConfirm(title, text, ok, false);
}

/** Tells the result where the user is: Word for commands started there, the app otherwise. */
export function tell(text: string, kind: "info" | "error", fromWord: boolean) {
  useApp.getState().notify(text, kind);
  if (fromWord && addinSupports("showMessage")) void connector.request("showMessage", { text, kind }).catch(() => undefined);
}
