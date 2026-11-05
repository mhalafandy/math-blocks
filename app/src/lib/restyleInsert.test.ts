import { describe, expect, it } from "vitest";
import { TUNED_PROFILE } from "@mathblocks/math-omml";
import { styleOf } from "@mathblocks/math-core";
import { useApp } from "./store";
import { buildNativeInsertion } from "./equation";
import { setKindStyle, resetKind } from "./kindStyles";
import { notationProfile } from "./render";

describe("a kind's new style reaches what is inserted into Word", () => {
  it("native: the OMML written after a restyle uses the new accent", () => {
    resetKind("pvec");
    const before = buildNativeInsertion("\\pvec{r}", true, TUNED_PROFILE).flatOpc;
    expect(before).toContain('m:chr m:val="\u20D1"'); // harpoon (Hughes default)
    setKindStyle("pvec", { ...styleOf(useApp.getState().notationProfile, "pvec"), accent: "hat" });
    const after = buildNativeInsertion("\\pvec{r}", true, TUNED_PROFILE).flatOpc;
    expect(after).not.toContain('m:chr m:val="\u20D1"');
    expect(after).toContain('m:chr m:val="\u0302"'); // hat
    resetKind("pvec");
  });
  it("Classic: the picture is drawn with the profile in effect at insertion time", () => {
    setKindStyle("pvec", { ...styleOf(useApp.getState().notationProfile, "pvec"), accent: "arrow" });
    expect(styleOf(notationProfile(), "pvec").accent).toBe("arrow");
    resetKind("pvec");
    expect(styleOf(notationProfile(), "pvec").accent).toBe("harpoon");
  });
});
