import { isDesktop } from "./connector";
import { useApp } from "./store";

/**
 * App self-update on a channel (Settings → Backups and updates), and Word add-in installation status.
 *
 * Every build of `main` is published as the "Latest test build" (the **test** channel) and kept under its own
 * version. A build reaches the **stable** channel (the default) only when it is promoted (the "Promote to stable"
 * workflow) after a clean self-test of that exact build on the owner's PC; the stable before it stays available to
 * roll back to in one click. The app checks its channel at start-up and every 2 hours, downloads a newer version in
 * the background, then offers a one-click restart. Every download is verified against the public key in
 * tauri.conf.json, so only builds signed with the project's private key are accepted.
 */

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;

let ready = false;
let checking = false;

export async function startUpdates() {
  if (!isDesktop()) return;
  const { getVersion } = await import("@tauri-apps/api/app");
  useApp.getState().setUpdate({ currentVersion: await getVersion() });
  setTimeout(() => void checkForUpdate(false), 4000);
  setInterval(() => void checkForUpdate(false), CHECK_EVERY_MS);
  void watchConnectorInstall();
}

type Found = { version: string; current: string; notes?: string | null } | null;

async function checkChannel(channel: "stable" | "test" | "rollback"): Promise<Found> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Found>("update_check", { channel });
}

export async function checkForUpdate(manual: boolean) {
  if (!isDesktop() || checking || ready) return;
  checking = true;
  const app = useApp.getState();
  const channel = app.updateChannel;
  try {
    const found = await checkChannel(channel);
    if (!found) {
      if (manual) app.notify(channel === "stable" ? "MathBlocks is up to date (stable channel)" : "MathBlocks is up to date (test channel)");
      return;
    }
    app.setUpdate({ status: "downloading", newVersion: found.version });
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_download");
    ready = true;
    app.setUpdate({ status: "ready" });
  } catch (e) {
    app.setUpdate({ status: "idle" });
    const msg = e instanceof Error ? e.message : String(e);
    // No stable build promoted yet: not an error to show at start-up.
    if (manual) app.notify(channel === "stable" && /404|not found|Could not fetch/i.test(msg) ? "No stable build has been promoted yet: the test channel has the newest builds." : `Update check failed: ${msg}`, "error");
    else console.warn("update check failed", e);
  } finally {
    checking = false;
  }
}

/** Goes back to the stable build before the current one (one click; asks first). */
export async function rollbackToPreviousStable() {
  if (!isDesktop()) return;
  const app = useApp.getState();
  try {
    const found = await checkChannel("rollback");
    if (!found) return app.notify("There is no previous stable build to go back to.");
    const { askConfirm } = await import("../components/Dialogs");
    if (!(await askConfirm("Roll back", `Install the previous stable build ${found.version} instead of ${found.current}? MathBlocks restarts.`, "Roll back"))) return;
    app.setUpdate({ status: "downloading", newVersion: found.version });
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_download");
    ready = true;
    await installAndRestart();
  } catch (e) {
    app.setUpdate({ status: "idle" });
    app.notify(`Roll back failed: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

export async function installAndRestart() {
  if (!ready) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  useApp.getState().setUpdate({ status: "installing" });
  await invoke("update_install"); // on Windows the installer closes the app itself
  await relaunch();
}

export type ConnectorInstall =
  | { state: "unavailable" | "upToDate" | "installed" | "pendingWordClosed" }
  | { state: "failed"; message: string };

function applyInstall(s: ConnectorInstall | null) {
  if (!s) return;
  const app = useApp.getState();
  app.setUpdate({ addin: s.state });
  if (s.state === "installed") app.notify("Word add-in installed or updated. Restart Word to load it.");
  if (s.state === "failed") app.notify(`Word add-in installation failed: ${s.message}`, "error");
}

async function watchConnectorInstall() {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  await listen<ConnectorInstall>("connector://install", (e) => applyInstall(e.payload));
  applyInstall(await invoke<ConnectorInstall | null>("connector_install_status"));
}
