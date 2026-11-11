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
import { readEquationXml as readOmml } from "./readEquation";
import { useApp } from "./store";

/** Requests the app relies on; an add-in without them is an old one still loaded in Word. */
const REQUIRED = [
  "replaceEquation", "listInstances", "replaceMany", "retag", "selectInstance", "getRegistry", "setRegistry",
  "listMathTypeParagraphs", "replaceParagraphs", "numberEquation", "listNumbered", "insertReference", "updateNumbers",
];

/** True when the Word add-in that is loaded understands this request (an old one may not). */
export function addinSupports(method: string) {
  const m = useApp.getState().connector.methods;
  return !m || m.includes(method);
}

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
export async function bringToFront() {
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

  request<M extends keyof AppToConnector>(method: M, params: AppToConnector[M]["params"], timeoutMs = TIMEOUT_MS): Promise<AppToConnector[M]["result"]> {
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Word did not answer "${method}" in time`));
      }, timeoutMs);
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
        app.setConnector({ connected: true, hostVersion: `Word ${params.hostBuild}`, methods: params.methods });
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
        void import("./linking").then((m) => m.checkDocument(params.fullName, { auto: true })).catch(() => undefined);
        break;
      }
      case "equationActivated": {
        if (isRequest(msg)) this.reply(msg.id, null);
        await activateEquation(msg.params as ConnectorToApp["equationActivated"]["params"]);
        break;
      }
      case "mathTypeActivated": {
        if (isRequest(msg)) this.reply(msg.id, null);
        const params = msg.params as ConnectorToApp["mathTypeActivated"]["params"];
        void bringToFront();
        void import("./convertMathType").then((m) => m.onMathTypeActivated(params));
        break;
      }
      case "runCommand": {
        if (isRequest(msg)) this.reply(msg.id, null);
        const params = msg.params as ConnectorToApp["runCommand"]["params"];
        // Commands that need no window of the app finish in Word (questions and results over Word).
        if (params.command === "convertLatex") void import("./wordShortcuts").then((m) => m.convertAllLatex(params.document, { fromWord: true, selectionOnly: !!params.hasSelection }));
        else if (params.command === "numberEquation") void import("./numbering").then((m) => m.toggleNumberFromRibbon(params, true));
        else if (params.command === "repair") void import("./repair").then((m) => m.repairDocument(params.document, { fromWord: true }));
        else if (params.command === "selfTest") void import("./selfTest").then((m) => m.runWordSelfTest({ spike: false }));
        else if (params.command === "selfTestSpike") void import("./selfTest").then((m) => m.runWordSelfTest({ spike: true }));
        else {
          // These show a dialog of the app (conversion report, list of symbols; the reference picker for an older add-in).
          void bringToFront();
          if (params.command === "convertMathType") void import("./convertMathType").then((m) => m.convertOpenDocument(params.document));
          else if (params.command === "insertReference") void import("./numbering").then((m) => m.openReferencePicker());
          else if (params.command === "listOfSymbols") void import("../components/NomenclatureDialog").then((m) => m.openNomenclature());
        }
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

/** Opens an equation from Word for editing: main window (double-click) or floating editor (panel). */
export async function activateEquation(params: ConnectorToApp["equationActivated"]["params"]) {
  const app = useApp.getState();
  // The wrapper holds more than one equation (or text): never open it, never write to it.
  if (params.problem) {
    void bringToFront();
    const { showWrapperProblem } = await import("./numbering");
    return showWrapperProblem(params.problem);
  }
  const read = readOmml(params.flatOpc);
  if (!read || read.root.children.length === 0) {
    // A linked copy does not need Word's content: the library has it.
    const opened = await import("./linking").then((m) => m.openLinkedForEditing(params.tag)).catch(() => false);
    if (opened) {
      if (params.panel) void import("./panel").then((m) => m.openPanel(params.panel!));
      else void bringToFront();
      app.notify("Editing the linked equation from the library. Press Update everywhere (Ctrl+Enter) when done.");
      return;
    }
    console.warn("equationActivated without readable math", params.tag, params.flatOpc?.length, params.flatOpc?.slice(0, 2000));
    void bringToFront();
    app.notify(
      `The equation from Word arrived empty (${params.flatOpc?.length ?? 0} characters). Please send %LOCALAPPDATA%\\MathBlocks\\connector.log so this can be fixed.`,
      "error",
    );
    return;
  }
  if ((params as { repaired?: boolean }).repaired) {
    // A pasted picture that had lost its wrapper: registry entries follow (linked definition, kinds).
    void import("./repair").then((m) => m.repairDocument(undefined, { quiet: true }));
    app.notify("This pasted equation was a plain picture to Word; it is a MathBlocks equation again (with its own identity).");
  }
  // A linked copy opens from the library only while Word shows that very version; otherwise Word's
  // content is what is opened (never another equation's content under this one's identity).
  const wordLatex = serializeLatex(read.root);
  const linked = await import("./linking").then((m) => m.openLinkedForEditing(params.tag, wordLatex)).catch(() => false);
  if (!linked) {
    useLibraryClose();
    let latex = serializeLatex(read.root);
    if (read.kind === "native") {
      // Native equations keep their notation kinds in the registry; an edit in Word is never lost silently.
      const { sourceOf, recordNativeSources } = await import("./nativeSources");
      const src = await sourceOf(undefined, params.tag, params.flatOpc).catch(() => ({ state: "none" }) as const);
      if (src.state === "same") latex = src.latex;
      else if (src.state === "edited") {
        app.setNotice({
          text: "This equation was edited directly in Word since MathBlocks wrote it; its notation kinds (\\pvec…) are not in Word's version.",
          actions: [
            { label: "Keep Word's edit", run: () => void recordNativeSources(undefined, [{ tag: params.tag, latex: src.wordLatex }]).then(() => useApp.getState().setNotice(null)) },
            {
              label: "Restore MathBlocks version",
              run: () => {
                useApp.getState().setLatex(src.latex, "external");
                useApp.getState().setNotice(null);
              },
            },
          ],
        });
      }
    }
    app.setLatex(latex, "external");
    if (params.spike) {
      // Embedded-object spike: shown, not edited (Update would not find it yet).
      app.setEditing(null);
      app.notify(`Spike: the MathBlocks object (${params.tag}) opened from Word — read-only; editing objects is not built yet.`);
    } else app.setEditing({ tag: params.tag, adopted: !!params.adopted, fingerprint: params.fingerprint, opened: latex });
  } else {
    const ed = useApp.getState().editing;
    if (ed) app.setEditing({ ...ed, fingerprint: params.fingerprint, opened: useApp.getState().latex });
  }
  app.setDisplay(read.display || !!params.number);
  app.setNumbered(!!params.number);
  const ed = useApp.getState().editing;
  if (ed) app.setEditing({ ...ed, numbered: !!params.number });
  app.notify(
    read.unknown.length
      ? `Equation loaded. Some parts could not be read and are shown in red: ${[...new Set(read.unknown)].join(", ")}`
      : "Editing the equation from Word. Press Update in Word (Ctrl+Enter) when done.",
    read.unknown.length ? "error" : "info",
  );
  // Right-click: the floating editor next to the equation; double-click: the main window.
  if (params.panel) void import("./panel").then((m) => m.openPanel(params.panel!));
  else void bringToFront();
}
