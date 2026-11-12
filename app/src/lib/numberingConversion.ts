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
  /** Section headings with no MathType break (keep mode, chapter.section.equation): a marker can be added. */
  headingsWithoutBreak: { text: string; start: number; chapter: string; section: number; marked: boolean }[];
}

export interface NumberingOptions {
  /** Add a section marker after each section heading that had no MathType break (keep mode). Default true. */
  markHeadings?: boolean;
}

/**
 * The chapter and section counters after a MathType break, evaluated as Word evaluates its hidden SEQ
 * fields: "SEQ MTChap \r 3" sets 3, "SEQ MTChap" (no \r, no \c) adds one, "\c" leaves it; the same for
 * MTSec. Without fields, the break's text ("Equation Chapter 3 Section 2") is read.
 */
export function breakCounters(code: string[] | undefined, label: string, prev: { chap: number; sec: number }): { chap: number; sec: number } {
  let { chap, sec } = prev;
  const seqs = (code ?? []).map((c) => /SEQ\s+(MTChap|MTSec)\b(.*)$/i.exec(c)).filter((m): m is RegExpExecArray => !!m);
  if (!seqs.length) {
    const c = /Chapter\s+(\d+)/i.exec(label);
    const sn = /Section\s+(\d+)/i.exec(label);
    if (/Chapter\s*\(Next\)/i.test(label)) chap++;
    else if (c) chap = Number(c[1]);
    if (/Section\s*\(Next\)/i.test(label)) sec++;
    else if (sn) sec = Number(sn[1]);
    return { chap, sec };
  }
  for (const m of seqs) {
    const sw = m[2]!;
    const r = /\\r\s*(\d+)/.exec(sw);
    const next = (cur: number) => (r ? Number(r[1]) : /\\c\b/.test(sw) ? cur : cur + 1);
    if (/^MTChap$/i.test(m[1]!)) chap = next(chap);
    else sec = next(sec);
  }
  return { chap, sec };
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

export function planNumberingConversion(scan: NumberingScan, mode: NumberingMode, o: NumberingOptions = {}): NumberingPlan {
  const markHeadings = o.markHeadings ?? true;
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

  // Every MathType break becomes a marker. Its chapter and section: what its own fields set (evaluated
  // as Word does), checked against the first number after it (before the next break), which wins.
  const breakAt = new Map<number, { key: string; sec: number }>();
  {
    let counters = { chap: 0, sec: 0 };
    let letters = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.type === "mtNumber") {
        const p = parseNumber(it.text);
        if (p && p.length >= 2) letters = /^[A-Z]$/.test(p[0]!);
        continue;
      }
      if (it.type !== "mtBreak") continue;
      counters = breakCounters(it.code, it.label, counters);
      let next: string[] | null = null;
      for (let j = i + 1; j < items.length; j++) {
        const x = items[j]!;
        if (x.type === "mtBreak" || x.type === "mbMarker") break;
        if (x.type === "mtNumber") {
          next = parseNumber(x.text);
          break;
        }
      }
      const appendix: boolean = next && next.length >= 2 ? /^[A-Z]$/.test(next[0]!) : letters;
      const declaredKey = appendix ? String.fromCharCode(64 + Math.max(1, counters.chap)) : String(counters.chap);
      let key = declaredKey;
      let sec = counters.sec;
      if (next && next.length >= 2) {
        key = next[0]!;
        if (next.length >= 3) sec = Number(next[1]);
        if (key !== declaredKey || (next.length >= 3 && sec !== counters.sec))
          problem("warning", `MathType break “${it.label}” sets ${declaredKey}${levels >= 3 ? `.${counters.sec}` : ""}, the first number after it says ${next.slice(0, -1).join(".")}: the number's is used`, it.label, it.start);
        counters = { chap: appendix ? key.charCodeAt(0) - 64 : Number(key), sec };
      }
      letters = appendix;
      if (counters.chap < 1) {
        problem("warning", `MathType break “${it.label}” sets no chapter: chapter 1 is used`, it.label, it.start);
        counters = { chap: 1, sec };
        key = appendix ? "A" : "1";
      }
      breakAt.set(it.start, { key, sec });
    }
  }
  const headingsWithoutBreak: NumberingPlan["headingsWithoutBreak"] = [];

  let ctx: { chap: string | null; sec: number } | null = null;
  let counter = 0;
  let inChapter = false;
  let sectionCount = 0;
  const warnedNoSection = new Set<string>();
  let sectionMarkers = 0;
  let breaks = 0;
  let warnedMixed = false;

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]!;
    switch (it.type) {
      case "mtBreak": {
        const b = breakAt.get(it.start)!;
        const sec = renumber ? 0 : levels >= 3 ? b.sec : 0;
        writes.push({ kind: "replaceBreak", start: it.start, section: sec, ...chapterNumber(b.key) });
        breaks++;
        ctx = { chap: b.key, sec };
        counter = 0;
        inChapter = true;
        sectionCount = 0;
        break;
      }
      case "heading": {
        if (it.level === 1) {
          if (renumber) inChapter = false;
          break;
        }
        if (it.level !== 2) break;
        // A heading whose section has its own MathType break (in the heading or right after it) needs nothing.
        const nextItem = items.slice(idx + 1).find((x) => x.type !== "heading" || x.level <= 2);
        const hasBreak = nextItem?.type === "mtBreak" || nextItem?.type === "mbMarker";
        if (!renumber) {
          if (levels < 3 || hasBreak || !ctx?.chap) break;
          const found = headingSection(it);
          const sec: number = found ? found.section : (ctx.sec ?? 0) + 1;
          headingsWithoutBreak.push({ text: it.text, start: it.start, chapter: ctx.chap, section: sec, marked: markHeadings });
          if (markHeadings) {
            writes.push({ kind: "insertMarker", start: it.after, section: sec, ...chapterNumber(ctx.chap) });
            sectionMarkers++;
            ctx = { chap: ctx.chap, sec };
            counter = 0;
          } else problem("warning", `Section heading “${it.text}” has no MathType break: equations added to it later would continue the section before`, it.text, it.start);
          break;
        }
        if (!inChapter || !ctx?.chap) break;
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
        } else if (!ctx || ctx.chap !== chap || ctx.sec !== sec) {
          if (chap) {
            writes.push({ kind: "insertMarker", start: it.paraStart, section: sec, ...chapterNumber(chap) });
            if (ctx) problem("warning", `No MathType break before ${it.text}: a marker is added before it`, snippet, it.start);
          }
          ctx = { chap, sec };
          counter = 0;
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
  problems.sort((a, b) => a.at - b.at);
  return {
    mode,
    levels,
    format,
    writes,
    changes,
    problems,
    canRenumber,
    headingsWithoutBreak,
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
