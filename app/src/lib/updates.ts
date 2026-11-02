import { isDesktop } from "./connector";
import { useApp } from "./store";

/**
 * App self-update (Tauri updater) and Word add-in installation status.
 *
 * Every build of `main` is published as the "Latest test build" release with a signed
 * `latest.json`. The app checks it at start-up and every 2 hours, downloads a newer version in
 * the background, then offers a one-click restart. Updates are verified against the public key
 * in tauri.conf.json, so only builds signed with the project's private key are accepted.
 */

const CHECK_EVERY_MS = 2 * 60 * 60 * 1000;

type Pending = { install: () => Promise<void> };
let pending: Pending | null = null;
let checking = false;

export async function startUpdates() {
  if (!isDesktop()) return;
  const { getVersion } = await import("@tauri-apps/api/app");
  useApp.getState().setUpdate({ currentVersion: await getVersion() });
  setTimeout(() => void checkForUpdate(false), 4000);
  setInterval(() => void checkForUpdate(false), CHECK_EVERY_MS);
  void watchConnectorInstall();
}

export async function checkForUpdate(manual: boolean) {
  if (!isDesktop() || checking || pending) return;
  checking = true;
  const app = useApp.getState();
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      if (manual) app.notify("MathBlocks is up to date");
      return;
    }
    app.setUpdate({ status: "downloading", newVersion: update.version });
    await update.download();
    pending = { install: () => update.install() };
    app.setUpdate({ status: "ready" });
  } catch (e) {
    app.setUpdate({ status: "idle" });
    if (manual) app.notify(`Update check failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    else console.warn("update check failed", e);
  } finally {
    checking = false;
  }
}

export async function installAndRestart() {
  if (!pending) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  useApp.getState().setUpdate({ status: "installing" });
  await pending.install(); // on Windows the installer closes the app itself
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
