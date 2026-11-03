import {
  PROTOCOL_VERSION,
  isRequest,
  isResponse,
  type AppToConnector,
  type ConnectorToApp,
  type RpcMessage,
  type RpcResponse,
} from "@mathblocks/connector-protocol";
import { serializeLatex } from "@mathblocks/math-latex";
import { readOmml } from "@mathblocks/math-omml";
import { useApp } from "./store";

/** Requests the app relies on; an add-in without them is an old one still loaded in Word. */
const REQUIRED = ["replaceEquation", "listInstances", "replaceMany", "retag", "selectInstance", "getRegistry", "setRegistry"];

async function checkAddinVersion(params: ConnectorToApp["hello"]["params"]) {
  const app = useApp.getState();
  let appVersion = "";
  try {
    appVersion = await (await import("@tauri-apps/api/app")).getVersion();
  } catch {
    // Browser preview.
  }
  const missing = REQUIRED.filter((m) => !params.methods?.includes(m));
  const stale = missing.length > 0 || (!!appVersion && params.connectorVersion !== appVersion && params.connectorVersion !== "0.1.0");
  if (!stale) return;
  app.setNotice({
    text: `Word is still running an older MathBlocks add-in (${params.connectorVersion}${appVersion ? `, app ${appVersion}` : ""}). Close Word completely and start it again to load the new one${missing.length ? "; until then some features will not work" : ""}.`,
    actions: [{ label: "OK", run: () => app.setNotice(null) }],
  });
}

/** Leaves the library equation when an unlinked Word equation is opened for editing. */
function useLibraryClose() {
  void import("./library/useLibrary").then((m) => m.useLibrary.getState().closeEquation());
}

/** Shows and focuses the app window (after a double-click in Word or the ribbon button). */
async function bringToFront() {
  if (!isDesktop()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
  } catch (e) {
    console.warn("could not focus the window", e);
  }
}

const APP_VERSION = "0.1.0";
const TIMEOUT_MS = 20_000;

export const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/**
 * JSON-RPC client for the Word connector. Lines travel through the Rust shell, which owns
 * the named pipe (`connector://line` events in, `connector_send` command out).
 */
class ConnectorClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private started = false;
  private send: (line: string) => Promise<void> = async () => {
    throw new Error("The Word connector is only available in the desktop app");
  };

  async start() {
    if (this.started || !isDesktop()) return;
    this.started = true;
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    this.send = (line) => invoke("connector_send", { line });
    useApp.getState().setConnector({ available: true });

    await listen<string>("connector://line", (e) => void this.receive(e.payload));
    await listen<boolean>("connector://status", (e) => this.onStatus(e.payload));
    this.onStatus(await invoke<boolean>("connector_status"));
  }

  private onStatus(connected: boolean) {
    useApp.getState().setConnector(connected ? { connected } : { connected, hostVersion: undefined });
    if (!connected) {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error("Word connector disconnected"));
        this.pending.delete(id);
      }
    }
  }

  request<M extends keyof AppToConnector>(method: M, params: AppToConnector[M]["params"]): Promise<AppToConnector[M]["result"]> {
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Word did not answer "${method}" in time`));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(JSON.stringify(msg)).catch((e: unknown) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  private reply(id: number, result: unknown) {
    const msg: RpcResponse = { jsonrpc: "2.0", id, result };
    void this.send(JSON.stringify(msg));
  }

  private async receive(line: string) {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(line) as RpcMessage;
    } catch {
      console.warn("Connector sent invalid JSON:", line);
      return;
    }
    if (isResponse(msg)) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    const method = msg.method as keyof ConnectorToApp;
    const app = useApp.getState();
    switch (method) {
      case "hello": {
        const params = msg.params as ConnectorToApp["hello"]["params"];
        app.setConnector({ connected: true, hostVersion: `Word ${params.hostBuild}` });
        void checkAddinVersion(params);
        if (isRequest(msg)) this.reply(msg.id, { appVersion: APP_VERSION, protocolVersion: PROTOCOL_VERSION });
        // Once connected, check open documents for outdated linked equations.
        setTimeout(() => void import("./linking").then((m) => m.checkOpenDocuments()), 1500);
        break;
      }
      case "showApp":
        if (isRequest(msg)) this.reply(msg.id, null);
        void bringToFront();
        break;
      case "documentOpened": {
        if (isRequest(msg)) this.reply(msg.id, null);
        const params = msg.params as ConnectorToApp["documentOpened"]["params"];
        void import("./linking").then((m) => m.checkDocument(params.fullName)).catch(() => undefined);
        break;
      }
      case "equationActivated": {
        if (isRequest(msg)) this.reply(msg.id, null);
        const params = msg.params as ConnectorToApp["equationActivated"]["params"];
        const read = readOmml(params.flatOpc);
        if (!read || read.root.children.length === 0) {
          // A linked copy does not need Word's content: the library has it.
          const opened = await import("./linking").then((m) => m.openLinkedForEditing(params.tag)).catch(() => false);
          if (opened) {
            void bringToFront();
            app.notify("Editing the linked equation from the library. Press Update everywhere (Ctrl+Enter) when done.");
            break;
          }
          console.warn("equationActivated without readable math", params.tag, params.flatOpc?.length, params.flatOpc?.slice(0, 2000));
          void bringToFront();
          app.notify(
            `The equation from Word arrived empty (${params.flatOpc?.length ?? 0} characters). Please send %LOCALAPPDATA%\\MathBlocks\\connector.log so this can be fixed.`,
            "error",
          );
          break;
        }
        const linked = await import("./linking").then((m) => m.openLinkedForEditing(params.tag)).catch(() => false);
        if (!linked) {
          useLibraryClose();
          app.setLatex(serializeLatex(read.root), "external");
          app.setEditing({ tag: params.tag, adopted: !!params.adopted });
        }
        app.setDisplay(read.display);
        app.notify(
          read.unknown.length
            ? `Equation loaded. Some parts could not be read and are shown in red: ${[...new Set(read.unknown)].join(", ")}`
            : "Editing the equation from Word. Press Update in Word (Ctrl+Enter) when done.",
          read.unknown.length ? "error" : "info",
        );
        void bringToFront();
        break;
      }
      default:
        if (isRequest(msg)) {
          void this.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${String(method)}` } }));
        }
    }
  }
}

export const connector = new ConnectorClient();
