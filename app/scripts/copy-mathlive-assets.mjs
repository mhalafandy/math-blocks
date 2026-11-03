// Copies MathLive's fonts and MathJax (used for SVG/PNG export) into public/ so the app works
// fully offline.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appDir, "package.json"));

const source = join(appDir, "node_modules", "mathlive", "fonts");
const target = join(appDir, "public", "mathlive", "fonts");
if (!existsSync(source)) throw new Error(`MathLive fonts not found at ${source}. Run pnpm install first.`);
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("MathLive fonts copied to public/mathlive/fonts");

const mathjax = dirname(require.resolve("@mathjax/src/package.json"));
const font = dirname(require.resolve("@mathjax/mathjax-newcm-font/package.json"));
const mj = join(appDir, "public", "mathjax");
mkdirSync(join(mj, "newcm"), { recursive: true });
cpSync(join(mathjax, "bundle", "tex-svg.js"), join(mj, "tex-svg.js"));
cpSync(join(font, "svg.js"), join(mj, "newcm", "svg.js"));
cpSync(join(font, "svg"), join(mj, "newcm", "svg"), { recursive: true });
console.log("MathJax copied to public/mathjax");
