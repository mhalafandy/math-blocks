// Copies MathLive's fonts into public/ so the app works fully offline.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(appDir, "node_modules", "mathlive", "fonts");
const target = join(appDir, "public", "mathlive", "fonts");
if (!existsSync(source)) throw new Error(`MathLive fonts not found at ${source}. Run pnpm install first.`);
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("MathLive fonts copied to public/mathlive/fonts");
