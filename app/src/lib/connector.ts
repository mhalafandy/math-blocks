import {
  PROTOCOL_VERSION,
  isRequest,
  isResponse,
  type AppToConnector,
  type ConnectorToApp,
  type RpcMessage,
  type RpcResponse,
} from "@mathblocks/connector-protocol";
import { useApp } from "./store";

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

    await listen<string>("connector://line", (e) => this.receive(e.payload));
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

  private receive(line: string) {
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
        if (isRequest(msg)) this.reply(msg.id, { appVersion: APP_VERSION, protocolVersion: PROTOCOL_VERSION });
        break;
      }
      case "showApp":
        if (isRequest(msg)) this.reply(msg.id, null);
        break;
      case "equationActivated":
        // M5: load the equation into the editor. M1: just acknowledge.
        app.notify("An equation was activated in Word (editing arrives in M5)");
        if (isRequest(msg)) this.reply(msg.id, null);
        break;
      default:
        if (isRequest(msg)) {
          void this.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method ${String(method)}` } }));
        }
    }
  }
}

export const connector = new ConnectorClient();
