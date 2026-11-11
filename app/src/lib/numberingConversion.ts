/**
 * MathType's equation numbering → MathBlocks numbering, so a document has one scheme (new MathBlocks
 * numbers then continue the existing ones). Pure planning: from what the add-in scanned (MathType breaks
 * and numbers, MathBlocks markers and numbers, headings), the writes and the before → after list.
 *
 * - keep: the numbers stay as they are (same levels); MathType's breaks become MathBlocks markers.
 * - renumber: (chapter.section.equation) — a section marker after each section heading (its number read
 *   from Word's numbering or the heading text), the counter restarting per section.
 * Every number keeps its bookmark (ZEqnNum…), so references keep pointing at their equation.
 */

export type NumberingItem =
  | { type: "mtBreak"; start: number; paraStart: number; label: string; code?: string[] }
  | { type: "mtNumber"; start: number; paraStart: number; text: string; bookmark: string; code?: string[]; snippet?: string }
  | { type: "mbMarker"; start: number; paraStart: number; chapter: number; section: number; appendix: boolean }
  | { type: "mbNumber"; start: number; paraStart: number; text: string; snippet?: string }
  | { type: "heading"; start: number; paraStart: number; after: number; level: number; text: string; list: string };

export interface NumberingScan {
  name: string;
  fullName: string;
  items: NumberingItem[];
}

export type NumberingMode = "keep" | "renumber";

export type NumberingWrite =
  | { kind: "replaceBreak"; start: number; chapter: number; section: number; appendix: boolean }
  | { kind: "insertMarker"; start: number; chapter: number; section: number; appendix: boolean }
  | { kind: "replaceNumber"; start: number; bookmark: string; appendix: boolean };

export interface NumberingProblem {
  severity: "error" | "warning";
  what: string;
  snippet: string;
  at: number;
}

export interface NumberingPlan {
  mode: NumberingMode;
  /** Levels of the existing numbers: 1 (5), 2 (A.5), 3 (A.1.5). */
  levels: number;
  /** The MathBlocks number format the document gets. */
  format: { open: string; close: string; chapter: boolean; parts: "eq" | "chapter" | "section"; separator: "."; restart: "chapter" | "section"; source: "markers" };
  writes: NumberingWrite[];
  /** Every MathType number: before → after (the bookmark keeps references on it). */
  changes: { old: string; new: string; bookmark: string; snippet: string }[];
  problems: NumberingProblem[];
  counts: { numbers: number; breaks: number; sectionMarkers: number; changed: number };
  /** Renumbering is possible (the numbers have a chapter part). */
  canRenumber: boolean;
}

/** "(A.1)" → ["A", "1"]; "(3.2.5)" → ["3", "2", "5"]; null when it is not a number. */
export function parseNumber(text: string): string[] | null {
  const m = /^\(\s*(.*?)\s*\)$/.exec(text.trim());
  if (!m) return null;
  const parts = m[1]!.split(/\s*[.\-]\s*/);
  if (!parts.length || parts.some((p) => !/^(?:[0-9]+|[A-Z])$/.test(p))) return null;
  if (parts.slice(1).some((p) => !/^[0-9]+$/.test(p))) return null;
  return parts;
}

const chapterNumber = (key: string) => (/^[0-9]+$/.test(key) ? { chapter: Number(key), appendix: false } : { chapter: key.charCodeAt(0) - 64, appendix: true });

/** A section heading's number: Word's own numbering first, then the heading text ("A.1 Frames", "3.2 Velocity"). */
export function headingSection(h: { text: string; list: string }): { chapter: string; section: number } | null {
  for (const s of [h.list, h.text]) {
    const m = /^\s*(?:section\s+)?([A-Z]|[0-9]+)\.([0-9]+)(?![.0-9])/i.exec(s ?? "");
    if (m) return { chapter: m[1]!.toUpperCase(), section: Number(m[2]) };
  }
  return null;
}

export function planNumberingConversion(scan: NumberingScan, mode: NumberingMode): NumberingPlan {
  const items = [...scan.items].sort((a, b) => a.start - b.start);
  const problems: NumberingProblem[] = [];
  const writes: NumberingWrite[] = [];
  const changes: NumberingPlan["changes"] = [];
  const problem = (severity: "error" | "warning", what: string, snippet: string, at: number) => problems.push({ severity, what, snippet, at });
  const numbers = items.filter((i): i is Extract<NumberingItem, { type: "mtNumber" }> => i.type === "mtNumber");

  // Levels of the existing numbers (the most common; others are reported).
  const lengths = new Map<number, number>();
  for (const n of numbers) {
    const p = parseNumber(n.text);
    if (p) lengths.set(p.length, (lengths.get(p.length) ?? 0) + 1);
  }
  const levels = [...lengths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2;
  const canRenumber = levels >= 2;
  const renumber = mode === "renumber" && levels < 3 && canRenumber;
  if (mode === "renumber" && !canRenumber) problem("error", "The numbers have no chapter part, so they cannot be renumbered to chapter.section.equation: use “keep the existing numbers”", "", 0);
  const parts: "eq" | "chapter" | "section" = renumber || levels >= 3 ? "section" : levels === 2 ? "chapter" : "eq";
  const format = { open: "(", close: ")", chapter: parts !== "eq", parts, separator: "." as const, restart: (parts === "section" ? "section" : "chapter") as "chapter" | "section", source: "markers" as const };
  const fmt = (chap: string | null, sec: number, n: number) => `(${parts === "eq" || !chap ? "" : `${chap}.`}${parts === "section" ? `${sec}.` : ""}${n})`;

  // The chapter of each MathType break: that of the first number after it (before the next break).
  const breakChapter = new Map<number, string>();
  {
    let pending: number | null = null;
    for (const it of items) {
      if (it.type === "mtBreak") pending = it.start;
      else if (it.type === "mbMarker") pending = null;
      else if (it.type === "mtNumber" && pending !== null) {
        const p = parseNumber(it.text);
        if (p && p.length >= 2) breakChapter.set(pending, p[0]!);
        pending = null;
      }
    }
  }

  let ctx: { chap: string | null; sec: number } | null = null;
  let counter = 0;
  let pendingBreak: Extract<NumberingItem, { type: "mtBreak" }> | null = null;
  let inChapter = false;
  let sectionCount = 0;
  const warnedNoSection = new Set<string>();
  let sectionMarkers = 0;
  let breaks = 0;
  let warnedMixed = false;

  for (const it of items) {
    switch (it.type) {
      case "mtBreak": {
        if (renumber) {
          const chap = breakChapter.get(it.start);
          if (!chap) {
            problem("warning", "MathType break with no numbered equation after it: left as it is", it.label, it.start);
            inChapter = false;
            break;
          }
          writes.push({ kind: "replaceBreak", start: it.start, section: 0, ...chapterNumber(chap) });
          breaks++;
          ctx = { chap, sec: 0 };
          counter = 0;
          inChapter = true;
          sectionCount = 0;
        } else {
          if (pendingBreak) problem("warning", "MathType break with no numbered equation after it: left as it is", pendingBreak.label, pendingBreak.start);
          pendingBreak = it;
        }
        break;
      }
      case "heading": {
        if (!renumber) break;
        if (it.level === 1) {
          inChapter = false;
          break;
        }
        if (it.level !== 2 || !inChapter || !ctx?.chap) break;
        const found = headingSection(it);
        let sec: number;
        if (found) {
          if (found.chapter !== ctx.chap) problem("warning", `Heading “${it.text}” is numbered ${found.chapter}.${found.section} inside ${/^[A-Z]$/.test(ctx.chap) ? "appendix" : "chapter"} ${ctx.chap}: section ${found.section} is used`, it.text, it.start);
          sec = found.section;
        } else {
          sec = sectionCount + 1;
          problem("warning", `Section heading “${it.text}” has no number (Word's numbering or a “${ctx.chap}.n” at its start): counted as ${ctx.chap}.${sec}`, it.text, it.start);
        }
        writes.push({ kind: "insertMarker", start: it.after, section: sec, ...chapterNumber(ctx.chap) });
        sectionMarkers++;
        sectionCount = sec;
        ctx = { chap: ctx.chap, sec };
        counter = 0;
        break;
      }
      case "mbMarker": {
        ctx = { chap: it.appendix ? String.fromCharCode(64 + it.chapter) : String(it.chapter), sec: it.section };
        counter = 0;
        pendingBreak = null;
        break;
      }
      case "mbNumber": {
        counter++;
        if (renumber && !warnedMixed) {
          problem("warning", "This document already has MathBlocks numbers: they keep their own format (only MathType's are renumbered)", it.snippet ?? it.text, it.start);
          warnedMixed = true;
        }
        break;
      }
      case "mtNumber": {
        const p = parseNumber(it.text);
        const snippet = it.snippet ?? it.text;
        if (!p) {
          problem("error", `MathType number “${it.text}” could not be read: it is left as it is`, snippet, it.start);
          break;
        }
        if (p.length !== levels) problem("warning", `MathType number ${it.text} has ${p.length} level(s); the others have ${levels}`, snippet, it.start);
        if ((it.code ?? []).some((c) => /SEQ\s+MTEqn\b/.test(c) && /\\r/.test(c))) problem("warning", `MathType number ${it.text} resets the equation counter by hand (SEQ MTEqn \\r)`, snippet, it.start);
        const chap = p.length >= 2 ? p[0]! : null;
        let sec = p.length >= 3 ? Number(p[1]) : 0;
        if (renumber) {
          if (!ctx || ctx.chap !== chap) {
            // No break before it: a chapter marker in front of its paragraph.
            if (chap) {
              writes.push({ kind: "insertMarker", start: it.paraStart, section: 0, ...chapterNumber(chap) });
              problem("warning", `No MathType break before ${it.text}: a chapter marker is added before it`, snippet, it.start);
            }
            ctx = { chap, sec: 0 };
            counter = 0;
            inChapter = true;
            sectionCount = 0;
          }
          sec = ctx.sec;
          if (sec === 0 && chap && !warnedNoSection.has(chap)) {
            problem("warning", `Missing section heading: ${it.text} comes before the first section heading of ${/^[A-Z]$/.test(chap) ? "appendix" : "chapter"} ${chap} (numbered ${chap}.0.n)`, snippet, it.start);
            warnedNoSection.add(chap);
          }
        } else {
          const key = { chap, sec };
          if (pendingBreak) {
            writes.push({ kind: "replaceBreak", start: pendingBreak.start, section: sec, ...(chap ? chapterNumber(chap) : { chapter: 1, appendix: false }) });
            breaks++;
            pendingBreak = null;
            ctx = key;
            counter = 0;
          } else if (!ctx || ctx.chap !== chap || ctx.sec !== sec) {
            if (chap) {
              writes.push({ kind: "insertMarker", start: it.paraStart, section: sec, ...chapterNumber(chap) });
              if (ctx) problem("warning", `No MathType break before ${it.text}: a marker is added before it`, snippet, it.start);
            }
            ctx = key;
            counter = 0;
          }
        }
        counter++;
        const next = fmt(chap, sec, counter);
        if (!renumber && next !== it.text.replace(/\s+/g, "")) {
          problem("warning", `${it.text} would become ${next}: the numbers skip here or MathType's counter was set by hand`, snippet, it.start);
        }
        writes.push({ kind: "replaceNumber", start: it.start, bookmark: it.bookmark, appendix: !!chap && /^[A-Z]$/.test(chap) });
        changes.push({ old: it.text, new: next, bookmark: it.bookmark, snippet });
        break;
      }
    }
  }
  if (pendingBreak) problem("warning", "MathType break with no numbered equation after it: left as it is", pendingBreak.label, pendingBreak.start);
  problems.sort((a, b) => a.at - b.at);
  return {
    mode,
    levels,
    format,
    writes,
    changes,
    problems,
    canRenumber,
    counts: { numbers: changes.length, breaks, sectionMarkers, changed: changes.filter((c) => c.old.replace(/\s+/g, "") !== c.new).length },
  };
}

/** The before → after list as text (to update numbers written outside the document). */
export function describeNumberingChanges(plan: NumberingPlan, name: string): string {
  return [
    `Equation numbers of “${name}” — ${plan.mode === "renumber" ? "renumbered to chapter.section.equation" : "kept"}`,
    ...plan.changes.map((c) => `${c.old}\t→\t${c.new}`),
    ...(plan.problems.length ? ["", ...plan.problems.map((p) => `${p.severity === "error" ? "ERROR" : "WARNING"}  ${p.what}${p.snippet ? ` — “${p.snippet}”` : ""}`)] : []),
  ].join("\n");
}
