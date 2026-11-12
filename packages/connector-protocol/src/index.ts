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
  /** Embedded-object spike: opened read-only (editing objects is not built). */
  spike?: boolean;
  /** true when the connector just wrapped a native Word equation. */
  adopted?: boolean;
  /** Full WordprocessingML (Flat OPC) of the content control's range. */
  flatOpc: string;
  /** The equation's number, when it is a numbered equation. */
  number?: NumberInfo | null;
  /** Right-click: show the floating editor next to the equation (screen pixels). */
  panel?: ScreenRect;
  /** Fingerprint of the equation's content when it was read; sent back (expect) with any write to it. */
  fingerprint?: string;
  /** The wrapper does not hold exactly one equation (and nothing else): not opened, flatOpc is empty. */
  problem?: string;
  /** A pasted picture that had lost its wrapper and was wrapped again. */
  repaired?: boolean;
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
  /**
   * One package per MathType object (in order; null = not converted, left as it is): only the objects
   * are replaced, the paragraph and its properties (style, tabs) are never rewritten.
   */
  packages?: (string | null)[];
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
  /** Older add-ins: prefix the Heading 1 number. Newer: use `parts`. */
  chapter: boolean;
  /** (1), (1.1) chapter.equation, (1.2.3) chapter.section.equation. */
  parts?: "eq" | "chapter" | "section";
  separator?: "." | "-";
  /** The equation counter restarts at each chapter or each section. */
  restart?: "chapter" | "section";
  /** Chapter/section numbers from Word's heading numbering, or from MathBlocks' hidden markers. */
  source?: "headings" | "markers";
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
  runCommand: { params: { command: string; document?: string; tag?: string; flatOpc?: string; numbered?: boolean; fingerprint?: string; problem?: string; hasSelection?: boolean }; result: void };
  /** Ribbon button "Open MathBlocks". */
  showApp: { params: Record<string, never>; result: void };
  /** Word is idle after a selection change in a document whose style follows undo (it has a probe). */
  documentIdle: { params: { document: string }; result: void };
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
  /** The fingerprint read with the equation: the add-in refuses when Word's equation is no longer that one. */
  expect?: string;
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
  /** Its equation number, e.g. "(2.3)", when it is numbered (not in light listings). */
  number?: string | null;
  /** WordprocessingML of the equation, when requested (includeContent). */
  flatOpc?: string;
}

export interface DocumentInstances {
  name: string;
  fullName: string;
  instances: InstanceInfo[];
}

/** A reference to an equation that no longer exists (Word shows "Error! Reference source not found"). */
export interface BrokenReference {
  bookmark: string;
  /** The text around it. */
  snippet: string;
  at: number;
}

export interface AppToConnector {
  /** Word self-test operations (ribbon → Run Word self-test): type, paste, move, undo, inspect. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smoke: { params: { op: string; [key: string]: unknown }; result: Record<string, any> };
  /** MathBlocks equations per document; copies sharing a tag get new instance ids first. */
  listInstances: {
    /** light: no page numbers / context (they make Word lay out the document). */
    params: DocTarget & { all?: boolean; blockId?: string; includeContent?: boolean; light?: boolean };
    result: { documents: DocumentInstances[] };
  };
  /** Replaces several equations (by tag) in one undo step. */
  replaceMany: { params: DocTarget & { items: { tag: string; flatOpc: string; expect?: string }[]; undoLabel: string; verified?: boolean }; result: { replaced: number; missing: string[]; refused?: { tag: string; reason: string }[] } };
  /** LaTeX interchange: the paragraphs with LaTeX, equation numbers or numbering markers, and the number bookmarks already there. */
  scanInterchange: {
    params: DocTarget;
    result: {
      name: string;
      fullName: string;
      paragraphs: { start: number; end: number; text: string; style: string; numbered?: boolean; number?: string; bookmark?: string; marker?: { chapter: number; appendix: boolean; section?: number }; complex?: boolean }[];
      bookmarks: string[];
      /** MathType number fields still in the document (one numbering scheme: convert them first). */
      mathTypeNumbers?: number;
    };
  };
  /** MathType numbering → MathBlocks: breaks, numbers (shown text, bookmark), MathBlocks markers and numbers, headings, in order. */
  scanNumbering: { params: DocTarget; result: { name: string; fullName: string; items: Record<string, unknown>[] } };
  /** Writes the numbering plan (one undo step), then updates numbers and references; what each bookmark shows afterwards. */
  convertNumbering: {
    params: DocTarget & { items: Record<string, unknown>[]; format: Record<string, unknown> };
    result: {
      problems: string[];
      shows: Record<string, string>;
      ms: number;
      broken?: BrokenReference[];
      undoBrokenAt?: string;
      /** MathType bookmark → the MathBlocks bookmark of the same number. */
      aliases?: Record<string, string>;
      referencesConverted?: number;
      referenceMismatches?: { bookmark: string; expected: string; shows: string; snippet: string }[];
      aliasesRemoved?: number;
      /** MathType numbering fields still in the document (none expected). */
      leftovers?: { code: string; snippet: string; start: number }[];
    };
  };
  /** LaTeX interchange: writes the planned items (one undo step), then updates numbers and references. */
  convertInterchange: {
    params: DocTarget & { items: (Record<string, unknown> & { id: number; kind: string; start: number; end: number; expect: string })[]; format: Record<string, unknown>; undoLabel: string };
    result: { results: { id: number; ok: boolean; problem: string }[]; done: number; ms: number; numbers: number; references: number; broken?: BrokenReference[]; undoBrokenAt?: string };
  };
  /** The checks of replaceMany alone (before an operation opens its undo record: they read Word's XML, which ends it). */
  verifyMany: { params: DocTarget & { items: { tag: string; flatOpc: string; expect?: string }[]; undoLabel: string }; result: { replaced: number; missing: string[]; refused?: { tag: string; reason: string }[] } };
  /**
   * Repairs identities: duplicated instance ids get new ones, MathBlocks pictures that lost their
   * content control are wrapped again, numbered copies get a number bookmark.
   */
  repairEquations: {
    /**
     * The real run gets the dry run's plan and only writes (reading Word's XML ends the operation's undo
     * record): the baselines to set and the steps with nothing to do.
     */
    params: DocTarget & { dryRun?: boolean; lowerings?: { tag: string; want: number }[]; skip?: ("inline" | "split" | "convert" | "identify")[] };
    result: {
      document: string;
      /** Baselines to restore (the dry run's plan for the real run). */
      lowerings?: { tag: string; want: number }[];
      renamed: { from: string; to: string }[];
      wrapped: { tag: string; source: "emf" | "alt" }[];
      wrappedOk: number;
      bookmarks: number;
      otherPictures: number;
      /** Floating MathBlocks pictures (pasted as floating) put back in line with the text. */
      inlined?: number;
      /** Classic equations of an older build (picture in a content control) converted to titled pictures. */
      converted?: number;
      /** Left untouched: native Word equations (they keep their wrapper) and MathType objects. */
      native?: number;
      mathType?: number;
      /** Classic pictures whose baseline lowering was restored from their source. */
      lowered?: number;
      /** Classic pictures listed for conversion to embedded objects / copies with another ID inside. */
      toObjects?: number;
      idRewrites?: number;
      /** Numbered equation paragraphs that got their display-equation style (or tab stops) back. */
      styled?: number;
      /** Classic pictures whose hidden source lacks the ID or the depth: the app redraws them once. */
      redraw?: { tag: string; latex: string; mode: "display" | "inline" | "numbered"; reason?: "picture" | "id" }[];
      /** Wrappers that held more than one equation, text or nested wrappers, split back into one per equation. */
      split?: { tag: string; equations: number; text: number; nested: number; otherPictures: number }[];
    };
  };
  /** Whole-document backup (Flat OPC .xml in %LOCALAPPDATA%\MathBlocks\backups). */
  backupDocument: { params: DocTarget; result: { path: string } };
  /** Opens one undo record and a progress window owned by Word (document blocked). */
  beginOperation: { params: DocTarget & { title: string; total: number; undoLabel: string; exclude?: { start: number; end: number }[]; noGuard?: boolean }; result: { ok: true } };
  operationProgress: { params: { done: number; text?: string }; result: { cancelled: boolean } };
  endOperation: { params: { done: number }; result: { ms: number; undoBrokenAt?: string; guardFailed?: string; guardRestored?: boolean } };
  retag: { params: DocTarget & { tag: string; newTag: string }; result: { found: number } };
  selectInstance: { params: DocTarget & { tag: string }; result: { found: number } };
  /** The document's MathBlocks registry (Custom XML Part), or null. */
  getRegistry: { params: DocTarget; result: { xml: string | null; fullName: string } };
  setRegistry: { params: DocTarget & { xml: string }; result: { ok: true } };
  /** The document's style (Custom XML Part urn:mathblocks:style:v1), or null when it has none. */
  getDocumentStyle: { params: DocTarget; result: { xml: string | null; fullName: string; name: string } };
  setDocumentStyle: { params: DocTarget & { xml: string }; result: { ok: true; fullName: string } };
  /** Open documents (copy style from another document). */
  listDocuments: { params: Record<string, never>; result: { documents: { name: string; fullName: string; active: boolean; hasStyle: boolean }[] } };
  ping: { params: Record<string, never>; result: { pong: true } };
  insertEquation: { params: InsertEquationParams; result: InsertEquationResult };
  replaceEquation: { params: ReplaceEquationParams; result: InsertEquationResult };
  readEquation: { params: { tag: string; quiet?: boolean }; result: ReadEquationResult & { number?: NumberInfo | null } };
  listMathTypeParagraphs: {
    params: DocTarget & { from: number; limit: number };
    result: { name: string; fullName: string; total: number; totalObjects: number; paragraphs: MathTypeParagraph[] };
  };
  replaceParagraphs: { params: DocTarget & { items: MathTypeParagraph[]; undoLabel: string }; result: { replaced: number; skipped: number; guardFailed?: string; guardRestored?: boolean } };
  activateObject: { params: DocTarget & { start: number; end: number; index: number }; result: { ok: true } };
  /** Puts the equation in its own numbered paragraph; flatOpc is its inline version. */
  numberEquation: { params: DocTarget & NumberFormat & { tag: string; flatOpc: string; expect?: string }; result: { bookmark: string; number: string } };
  /** Removes the number; flatOpc is the display version. */
  unnumberEquation: { params: DocTarget & { tag: string; flatOpc: string; expect?: string }; result: { ok: true } };
  listNumbered: { params: DocTarget & { includeContent?: boolean }; result: { name: string; fullName: string; equations: NumberedEquation[] } };
  insertReference: { params: { bookmark: string; numberOnly?: boolean }; result: { text: string } };
  /** Hidden chapter/section(/appendix) marker at the cursor (markers numbering source). */
  insertNumberMarker: { params: { chapter: number; section: number; appendix?: boolean; restartEquations?: boolean }; result: { ok: true } };
  /** Rebuilds MathBlocks numbers and references as single fields (bookmark names kept). */
  upgradeNumbering: { params: DocTarget & NumberFormat; result: { numbers: number; references: number } };
  updateNumbers: { params: DocTarget; result: { numbers: number; references: number; broken?: BrokenReference[]; undoBrokenAt?: string; guardFailed?: string; guardRestored?: boolean } };
  /** The numbering marker nearest before the cursor (for "Insert section marker"). */
  markerBefore: { params: Record<string, never>; result: { chapter?: number; section?: number; appendix?: boolean; none?: boolean } };
  /** Text width (pt) of the paragraph holding the equation (tag) or the cursor: page minus margins, gutter, indents. */
  textWidth: { params: DocTarget & { tag?: string }; result: { textWidthPt: number; document: string } };
  /** What is at the cursor: a MathBlocks equation, selected text, or a LaTeX span around it. */
  selectionInfo: {
    params: Record<string, never>;
    result: { document: string; rect: ScreenRect | null; tag?: string; flatOpc?: string; number?: NumberInfo | null; text?: string; start?: number; end?: number; fingerprint?: string; problem?: string };
  };
  /** LaTeX spans ($…$, $$…$$, \(…\), \[…\]) in the document text. */
  findLatex: {
    params: DocTarget & { selectionOnly?: boolean };
    result: { name: string; fullName: string; items: { start: number; end: number; text: string; alone: boolean }[]; skippedInside?: number; notLocated?: number; insideWrapper?: number; selection?: boolean };
  };
  /** A confirmation over Word (Enter confirms); commands started from Word finish in Word. */
  confirm: { params: { title: string; text: string; ok?: string; offerDontAsk?: boolean }; result: { ok: boolean; dontAsk: boolean } };
  /** A result in Word's status bar, or a problem in a message over Word. */
  showMessage: { params: { text: string; kind?: "info" | "error" }; result: { ok: true } };
  /** Replaces ranges (still holding `expect`) by Flat OPC or text, one undo step. */
  replaceRanges: {
    params: DocTarget & { items: { start: number; end: number; expect?: string; flatOpc?: string; text?: string }[]; undoLabel: string };
    result: { replaced: number; skipped: number; guardFailed?: string; guardRestored?: boolean };
  };
  /** Turns a MathBlocks equation into plain text (its LaTeX), selected. */
  equationToText: { params: DocTarget & { tag: string; text: string }; result: { ok: true } };
  /** Word's own context menu at the mouse position. */
  showWordMenu: { params: Record<string, never>; result: { ok: true } };
  documentInfo: { params: Record<string, never>; result: DocumentInfoResult };
}

export const isResponse = (m: RpcMessage): m is RpcResponse => "id" in m && !("method" in m);
export const isRequest = (m: RpcMessage): m is RpcRequest => "id" in m && "method" in m;
