import { strToU8, zipSync } from "fflate";
import { isDesktop } from "./connector";
import { useApp } from "./store";

/**
 * Report a problem (Ctrl+K, Settings → Word connection): one zip with what is needed to understand a failure — the
 * versions, the app's recent messages, the Word add-in's log, the settings that change behaviour — and no document
 * content unless asked: document names and LaTeX in the logs are masked; the document itself only when ticked.
 */

const RING: string[] = [];
const MAX = 600;

/** Keeps the app's last messages (info, warnings, errors) for a report. Called once at start-up. */
export function startLogRing() {
  for (const level of ["info", "warn", "error"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        RING.push(`${new Date().toISOString()} ${level.toUpperCase()} ${args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : safeJson(a))).join(" ")}`);
        if (RING.length > MAX) RING.splice(0, RING.length - MAX);
      } catch {
        // Never let logging break the app.
      }
      orig(...args);
    };
  }
  window.addEventListener("error", (e) => console.error("uncaught", e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", (e) => console.error("unhandled rejection", e.reason instanceof Error ? e.reason.message : String(e.reason)));
}

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x)?.slice(0, 2000) ?? String(x);
  } catch {
    return String(x);
  }
}

/** Document names and LaTeX masked (a log line can quote either). */
export function maskContent(text: string): string {
  return text
    .replace(/[^\s"'\\/:]+\.(docx|docm|doc|dotx|rtf)\b/gi, "<document>")
    .replace(/[A-Za-z]:\\[^\s"']*/g, "<path>")
    .replace(/\$\$?[^$\n]{1,400}\$\$?/g, "<latex>")
    .replace(/\\[A-Za-z]+(\s*[{[][^\s]*)?/g, "<latex>");
}

export async function buildProblemReport(o: { note: string; includeDocument: boolean }): Promise<Uint8Array> {
  const app = useApp.getState();
  const files: Record<string, Uint8Array> = {};
  const lines = [
    `MathBlocks problem report — ${new Date().toString()}`,
    `App ${app.update.currentVersion ?? "browser preview"}; update channel ${app.updateChannel}`,
    `Word: ${app.connector.connected ? (app.connector.hostVersion ?? "connected") : "not connected"}; add-in methods: ${(app.connector.methods ?? []).length}`,
    `System: ${navigator.userAgent}`,
    `Look ${app.look}; equation size ${app.equationSizePt} pt; palette ${app.paletteLocation}; zoom ${app.zoom}`,
    "",
    "What happened (your words):",
    o.note.trim() || "(nothing written)",
  ];
  files["report.txt"] = strToU8(lines.join("\r\n"));
  const ring = RING.join("\n");
  files["app-log.txt"] = strToU8(o.includeDocument ? ring : maskContent(ring));
  if (isDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const log = await invoke<string>("connector_log");
      files["word-add-in-log.txt"] = strToU8(o.includeDocument ? log : maskContent(log));
      if (o.includeDocument && app.connector.connected) {
        const { connector } = await import("./connector");
        const info = (await connector.request("documentInfo", {})) as { fullName?: string; name?: string };
        if (info.fullName && /\.(docx|docm)$/i.test(info.fullName)) {
          const bytes = new Uint8Array(await invoke<ArrayBuffer>("document_read", { path: info.fullName }));
          files[`document/${info.name ?? "document.docx"}`] = bytes;
        }
      }
    } catch (e) {
      files["collect-errors.txt"] = strToU8(String(e instanceof Error ? e.message : e));
    }
  }
  return zipSync(files);
}

/** Asks where to save it, then saves it. */
export async function saveProblemReport(o: { note: string; includeDocument: boolean }): Promise<string | null> {
  const zip = await buildProblemReport(o);
  if (!isDesktop()) {
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mathblocks-problem-report.zip";
    a.click();
    URL.revokeObjectURL(url);
    return "mathblocks-problem-report.zip";
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ title: "Save the problem report", defaultPath: `mathblocks-problem-report-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "Zip", extensions: ["zip"] }] });
  if (!path) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("export_write", zip, { headers: { "x-path": encodeURIComponent(path) } });
  return path;
}
