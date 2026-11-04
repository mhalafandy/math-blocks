import { describe, expect, it } from "vitest";
import { parseRegistry, serializeRegistry } from "@mathblocks/ooxml";
import { buildNativeInsertion, currentProfile } from "./equation";
import { nativeHash, needsSource, wordHash } from "./nativeSources";

describe("native equations with notation kinds", () => {
  it("recognises Word's unchanged content by its hash, and an edit made in Word", () => {
    const latex = "\\pvec[P/O]{r}=\\dcm{b}{a}\\cmat{c}";
    const written = buildNativeInsertion(latex, true, currentProfile()).flatOpc;
    expect(wordHash(written)).toBe(nativeHash(latex));
    const edited = buildNativeInsertion("\\pvec[P/O]{r}=\\dcm{b}{a}\\cmat{d}", true, currentProfile()).flatOpc;
    expect(wordHash(edited)).not.toBe(nativeHash(latex));
  });

  it("only equations with kinds need a stored source", () => {
    expect(needsSource("\\pvec{r}+x")).toBe(true);
    expect(needsSource("x^2+\\vec{r}")).toBe(false);
  });

  it("keeps sources in the document registry", () => {
    const xml = serializeRegistry({ docId: "d", blocks: {}, sources: { i1: { id: "i1", latex: "\\pvec{r}<x", hash: "abc" } } });
    expect(parseRegistry(xml).sources?.i1).toEqual({ id: "i1", latex: "\\pvec{r}<x", hash: "abc" });
  });
});
