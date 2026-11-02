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
}

export interface ConnectorToApp {
  hello: { params: HelloParams; result: { appVersion: string; protocolVersion: number } };
  equationActivated: { params: EquationActivatedParams; result: void };
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

export interface AppToConnector {
  ping: { params: Record<string, never>; result: { pong: true } };
  insertEquation: { params: InsertEquationParams; result: InsertEquationResult };
  replaceEquation: { params: ReplaceEquationParams; result: InsertEquationResult };
  readEquation: { params: { tag: string }; result: ReadEquationResult };
  documentInfo: { params: Record<string, never>; result: DocumentInfoResult };
}

export const isResponse = (m: RpcMessage): m is RpcResponse => "id" in m && !("method" in m);
export const isRequest = (m: RpcMessage): m is RpcRequest => "id" in m && "method" in m;
