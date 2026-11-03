/**
 * MathBlocks connector protocol, version 1.
 *
 * Transport: a Windows named pipe `\\.\pipe\mathblocks-v1-<user>`, hosted by the desktop app.
 * The Word connector connects as a client when Word starts and reconnects automatically.
 * Framing: one UTF-8 JSON object per line ("\n"-terminated). Messages follow JSON-RPC 2.0;
 * both sides may send requests and notifications.
 *
 * The C# mirror of these types lives in connector-word/src/Protocol.cs. Any change here must
 * bump PROTOCOL_VERSION if it is not backward compatible.
 */
export const PROTOCOL_VERSION = 1;

export const pipeName = (user: string) => `mathblocks-v1-${user}`;

export interface RpcRequest<M extends string = string, P = unknown> {
  jsonrpc: "2.0";
  id: number;
  method: M;
  params: P;
}

export interface RpcNotification<M extends string = string, P = unknown> {
  jsonrpc: "2.0";
  method: M;
  params: P;
}

export interface RpcError {
  code: number;
  message: string;
}

export interface RpcResponse<R = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: R;
  error?: RpcError;
}

export type RpcMessage = RpcRequest | RpcNotification | RpcResponse;

export const ErrorCodes = {
  ParseError: -32700,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  Internal: -32603,
  /** Word has no open document / no selection. */
  NoDocument: 1001,
  /** Word refused the operation (e.g. the selection is inside a locked control). */
  WordRejected: 1002,
  /** The content control with the given tag was not found. */
  NotFound: 1003,
} as const;

// ------------------------------------------------------------------ connector → app

/** First message after connecting. */
export interface HelloParams {
  client: "word-connector";
  protocolVersion: number;
  connectorVersion: string;
  /** Word's Application.Version, e.g. "16.0". */
  hostVersion: string;
  /** Word's Application.Build, e.g. "16.0.5422.1000". */
  hostBuild: string;
  /** Requests the add-in understands (missing in add-ins older than 0.1.23). */
  methods?: string[];
}

/**
 * The user double-clicked an equation in Word. Equations without a MathBlocks wrapper (typed in
 * Word) are wrapped first, so `tag` always identifies the equation for a later replaceEquation.
 */
export interface EquationActivatedParams {
  tag: string;
  /** true when the connector just wrapped a native Word equation. */
  adopted?: boolean;
  /** Full WordprocessingML (Flat OPC) of the content control's range. */
  flatOpc: string;
  /** The equation's number, when it is a numbered equation. */
  number?: NumberInfo | null;
  /** Right-click: show the floating editor next to the equation (screen pixels). */
  panel?: ScreenRect;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NumberInfo {
  /** Bookmark covering the number (_MBEq_… for MathBlocks, ZEqnNum… for MathType), if any. */
  bookmark: string | null;
  number: string;
}

/** A paragraph's content (without the paragraph mark) that holds MathType objects. */
export interface MathTypeParagraph {
  start: number;
  end: number;
  /** MathType objects in it (checked again before replacing). */
  objects: number;
  flatOpc: string;
}

/** The user double-clicked a MathType equation. */
export interface MathTypeActivatedParams extends MathTypeParagraph {
  document: string;
  /** Which of the paragraph's MathType objects was clicked (0-based). */
  index: number;
}

export interface NumberedEquation {
  bookmark: string;
  number: string;
  kind: "mathblocks" | "mathtype";
  page: number;
  /** MathBlocks equation in that paragraph, if any. */
  tag: string | null;
  context: string;
  flatOpc?: string;
}

/** How new equation numbers look: "(1)", "[1]", "(2.1)" with the chapter number. */
export interface NumberFormat {
  open: string;
  close: string;
  /** Prefix the number with the Heading 1 number (STYLEREF 1 \s) and restart it in each chapter. */
  chapter: boolean;
}

/** A document with MathBlocks equations was opened in Word. */
export interface DocumentOpenedParams {
  name: string;
  fullName: string;
}

export interface ConnectorToApp {
  documentOpened: { params: DocumentOpenedParams; result: void };
  hello: { params: HelloParams; result: { appVersion: string; protocolVersion: number } };
  equationActivated: { params: EquationActivatedParams; result: void };
  mathTypeActivated: { params: MathTypeActivatedParams; result: void };
  /** Ribbon buttons handled by the app: convertMathType, insertReference, numberEquation. */
  runCommand: { params: { command: string; document?: string; tag?: string; flatOpc?: string; numbered?: boolean }; result: void };
  /** Ribbon button "Open MathBlocks". */
  showApp: { params: Record<string, never>; result: void };
}

// ------------------------------------------------------------------ app → connector

export interface InsertEquationParams {
  /** Flat OPC package containing one paragraph whose content is the content control. */
  flatOpc: string;
  /** Content-control tag (mb1|block|instance), used to locate it after insertion. */
  tag: string;
  display: boolean;
  /** Label for Word's undo list, e.g. "Insert equation". */
  undoLabel: string;
}

export interface InsertEquationResult {
  /** Number of content controls with this tag in the document after insertion (expected 1). */
  found: number;
}

export interface ReadEquationResult {
  flatOpc: string;
  /** Whether the control's text could be edited (not content-locked). */
  locked: boolean;
}

export interface DocumentInfoResult {
  name: string;
  fullName: string;
  saved: boolean;
  /** Content controls whose tag starts with "mb1|". */
  equationTags: string[];
}

export interface ReplaceEquationParams {
  /** Tag of the content control to replace (keeps the equation's identity). */
  tag: string;
  /** Flat OPC package with one paragraph holding a content control with the same tag. */
  flatOpc: string;
  undoLabel: string;
}

/** Optional target document (Word's FullName); default: the active document. */
export interface DocTarget {
  document?: string;
}

export interface InstanceInfo {
  tag: string;
  /** Page number of the equation (0 if unknown). */
  page: number;
  /** Text of the surrounding paragraph. */
  context: string;
  /** WordprocessingML of the equation, when requested (includeContent). */
  flatOpc?: string;
}

export interface DocumentInstances {
  name: string;
  fullName: string;
  instances: InstanceInfo[];
}

export interface AppToConnector {
  /** MathBlocks equations per document; copies sharing a tag get new instance ids first. */
  listInstances: {
    /** light: no page numbers / context (they make Word lay out the document). */
    params: DocTarget & { all?: boolean; blockId?: string; includeContent?: boolean; light?: boolean };
    result: { documents: DocumentInstances[] };
  };
  /** Replaces several equations (by tag) in one undo step. */
  replaceMany: { params: DocTarget & { items: { tag: string; flatOpc: string }[]; undoLabel: string }; result: { replaced: number; missing: string[] } };
  retag: { params: DocTarget & { tag: string; newTag: string }; result: { found: number } };
  selectInstance: { params: DocTarget & { tag: string }; result: { found: number } };
  /** The document's MathBlocks registry (Custom XML Part), or null. */
  getRegistry: { params: DocTarget; result: { xml: string | null; fullName: string } };
  setRegistry: { params: DocTarget & { xml: string }; result: { ok: true } };
  ping: { params: Record<string, never>; result: { pong: true } };
  insertEquation: { params: InsertEquationParams; result: InsertEquationResult };
  replaceEquation: { params: ReplaceEquationParams; result: InsertEquationResult };
  readEquation: { params: { tag: string }; result: ReadEquationResult & { number?: NumberInfo | null } };
  listMathTypeParagraphs: {
    params: DocTarget & { from: number; limit: number };
    result: { name: string; fullName: string; total: number; totalObjects: number; paragraphs: MathTypeParagraph[] };
  };
  replaceParagraphs: { params: DocTarget & { items: MathTypeParagraph[]; undoLabel: string }; result: { replaced: number; skipped: number } };
  activateObject: { params: DocTarget & { start: number; end: number; index: number }; result: { ok: true } };
  /** Puts the equation in its own numbered paragraph; flatOpc is its inline version. */
  numberEquation: { params: DocTarget & NumberFormat & { tag: string; flatOpc: string }; result: { bookmark: string; number: string } };
  /** Removes the number; flatOpc is the display version. */
  unnumberEquation: { params: DocTarget & { tag: string; flatOpc: string }; result: { ok: true } };
  listNumbered: { params: DocTarget & { includeContent?: boolean }; result: { name: string; fullName: string; equations: NumberedEquation[] } };
  insertReference: { params: { bookmark: string }; result: { text: string } };
  updateNumbers: { params: DocTarget; result: { numbers: number; references: number } };
  /** Word's own context menu at the mouse position. */
  showWordMenu: { params: Record<string, never>; result: { ok: true } };
  documentInfo: { params: Record<string, never>; result: DocumentInfoResult };
}

export const isResponse = (m: RpcMessage): m is RpcResponse => "id" in m && !("method" in m);
export const isRequest = (m: RpcMessage): m is RpcRequest => "id" in m && "method" in m;
