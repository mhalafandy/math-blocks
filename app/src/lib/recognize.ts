import Anthropic from "@anthropic-ai/sdk";
import { parseLatex } from "@mathblocks/math-latex";

/**
 * Equation recognition: a picture of an equation (screenshot, scan, photo, a MathType picture
 * copied from a PDF) becomes editable LaTeX, using Claude's vision with the user's own Anthropic
 * API key. The image is sent to Anthropic's API only when the user pastes or picks one.
 */

const KEY_STORAGE = "mathblocks.anthropicApiKey";

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Not saved: asked again next time.
  }
}

const PROMPT = `Transcribe the mathematics in this image as LaTeX.
Conventions (match the image; these say how to write what you see):
- vectors with an arrow: \\vec{x}; with a harpoon: \\overrightharpoon{x}; bold letters: \\mathbf{x} (bold Greek: \\boldsymbol{\\omega}); hats: \\hat{x}; dots: \\dot{x}, \\ddot{x}
- upright differential d: \\mathrm{d}x; upright text: \\text{...}
- matrices: bmatrix / pmatrix / vmatrix environments; multi-line equations: aligned with & before the relation
- \\frac, \\sqrt, \\int_{a}^{b}, \\sum_{i=1}^{n}, \\left( \\right) for tall brackets
Leave out equation numbers such as (2.1) at the right margin.
Reply with the LaTeX only: no $ signs, no code fences, no explanation.`;

export class RecognitionError extends Error {}

/** Cleans a model reply into bare LaTeX. */
export function cleanLatex(reply: string): string {
  let t = reply.trim();
  t = t.replace(/^```(?:latex|tex)?\s*/i, "").replace(/\s*```$/, "");
  t = t.replace(/^\$\$([\s\S]*)\$\$$/, "$1").replace(/^\$([\s\S]*)\$$/, "$1").replace(/^\\\[([\s\S]*)\\\]$/, "$1");
  t = t.replace(/^\\begin\{(equation\*?|align\*?)\}([\s\S]*)\\end\{\1\}$/, (_, env: string, body: string) => (env.startsWith("align") ? `\\begin{aligned}${body}\\end{aligned}` : body));
  t = t.replace(/\\(tag|label)\{[^}]*\}/g, "");
  return t.trim();
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type ImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** Recognises an equation in an image; returns LaTeX. */
export async function recognizeEquation(image: Blob): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new RecognitionError("Add your Anthropic API key first (Ctrl+K → Equation recognition settings).");
  const mediaType = (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.type) ? image.type : "image/png") as ImageType;
  // The key is the user's own and stays on this PC; the app talks to the API directly.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let response;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: await blobToBase64(image) } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new RecognitionError("The Anthropic API key was not accepted. Check it in Equation recognition settings.");
    if (e instanceof Anthropic.RateLimitError) throw new RecognitionError("Too many requests right now; try again in a moment.");
    if (e instanceof Anthropic.APIConnectionError) throw new RecognitionError("Could not reach Anthropic's API (no internet connection?).");
    if (e instanceof Anthropic.APIError) throw new RecognitionError(`Recognition failed (${e.status ?? "error"}): ${e.message}`);
    throw e;
  }
  if (response.stop_reason === "refusal") throw new RecognitionError("The image could not be processed.");
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const latex = cleanLatex(text);
  if (!latex) throw new RecognitionError("No equation was found in the image.");
  return latex;
}

/** True when the recognised LaTeX parses cleanly. */
export const isCleanLatex = (latex: string) => !parseLatex(latex).diagnostics.some((d) => d.severity === "error");
