/**
 * Writes docs/LATEX-INTERCHANGE.md from the parser's real support (app/src/lib/interchangeDoc.ts).
 * Run: pnpm interchange:doc
 */
import { writeFileSync } from "node:fs";
import { interchangeDocument } from "../app/src/lib/interchangeDoc";

writeFileSync(new URL("../docs/LATEX-INTERCHANGE.md", import.meta.url), interchangeDocument());
console.log("wrote docs/LATEX-INTERCHANGE.md");
