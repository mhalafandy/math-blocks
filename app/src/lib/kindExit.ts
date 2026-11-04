/**
 * Space / Tab inside a notation kind: the caret leaves the kind and lands right after it, the
 * kind unchanged (as when leaving a slot in MathType). Tab first visits the kind's remaining
 * empty slots (a DCM's second frame). Self-contained (only the field's methods) so the headless
 * round trip (tools/kinds-roundtrip.ts) runs this exact function in the page.
 */
export interface KindField {
  position: number;
  lastOffset: number;
  getValue: (a: number, b: number, f: "latex") => string;
}

/** True when the caret moved out of a kind (the key is then consumed). */
export function exitKind(mf: KindField, key: "Space" | "Tab"): boolean {
  const prefix = "\\class{nk-";
  const complete = (v: string) => {
    const e = v.indexOf("}");
    if (!v.startsWith(prefix) || e < 0 || v[e + 1] !== "{") return false;
    let d = 0;
    for (let i = e + 1; i < v.length; i++) {
      if (v[i] === "\\") {
        i++;
        continue;
      }
      if (v[i] === "{") d++;
      else if (v[i] === "}" && --d === 0) return i === v.length - 1;
    }
    return false;
  };
  /** "^{…}", "_1", "_{…}^{…}": nothing but complete scripts. */
  const onlyScripts = (r: string) => {
    let i = 0;
    if (!r) return false;
    while (i < r.length) {
      if (r[i] !== "^" && r[i] !== "_") return false;
      i++;
      if (r[i] === "{") {
        let d = 0;
        for (; i < r.length; i++) {
          if (r[i] === "\\") {
            i++;
            continue;
          }
          if (r[i] === "{") d++;
          else if (r[i] === "}" && --d === 0) break;
        }
        if (d !== 0) return false;
        i++;
      } else if (r[i] === "\\") {
        i++;
        while (i < r.length && /[A-Za-z]/.test(r[i]!)) i++;
      } else if (i < r.length) i++;
      else return false;
    }
    return true;
  };
  const pos = mf.position;
  // Innermost kind around the caret: the nearest start before it whose group ends after it.
  for (let a = pos - 1; a >= Math.max(0, pos - 60); a--) {
    if (!mf.getValue(a, mf.lastOffset, "latex").startsWith(prefix)) continue;
    for (let b = pos + 1; b <= Math.min(mf.lastOffset, pos + 60); b++) {
      if (!complete(mf.getValue(a, b, "latex"))) continue;
      if (key === "Tab" && mf.getValue(pos, b, "latex").includes("\\placeholder")) return false;
      // Past the kind's own scripts too (\cmat{c}^{\T}, \pvec{b}_1), so they stay on the kind.
      const kind = mf.getValue(a, b, "latex");
      let end = b;
      for (let c = b + 1; c <= Math.min(mf.lastOffset, b + 40); c++) {
        const v = mf.getValue(a, c, "latex");
        if (v.startsWith(kind) && onlyScripts(v.slice(kind.length))) end = c;
      }
      if (pos >= end) return false;
      mf.position = end;
      return true;
    }
  }
  return false;
}
