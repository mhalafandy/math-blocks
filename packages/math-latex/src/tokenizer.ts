export type TokenType =
  | "command" // \frac, \alpha, \, (value is the name without backslash)
  | "char" // any single character that is not special
  | "lbrace"
  | "rbrace"
  | "sup"
  | "sub"
  | "amp"
  | "newline" // \\
  | "prime" // '
  | "tilde" // ~ (non-breaking space)
  | "ws" // whitespace (ignored in math mode, kept for \text)
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  /** Offset of the first character of the token in the source. */
  start: number;
  /** Offset just after the token. */
  end: number;
}

const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

/** Splits LaTeX source into tokens. Never throws; positions allow precise diagnostics. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string, start: number, end: number) =>
    tokens.push({ type, value, start, end });

  while (i < src.length) {
    const c = src[i]!;
    const start = i;
    if (c === "%") {
      // Comment until end of line
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      while (i < src.length && /\s/.test(src[i]!)) i++;
      push("ws", " ", start, i);
      continue;
    }
    if (c === "\\") {
      const next = src[i + 1];
      if (next === undefined) {
        push("char", "\\", start, i + 1);
        i++;
        continue;
      }
      if (next === "\\") {
        push("newline", "\\\\", start, i + 2);
        i += 2;
        continue;
      }
      if (isLetter(next)) {
        let j = i + 1;
        while (j < src.length && isLetter(src[j]!)) j++;
        push("command", src.slice(i + 1, j), start, j);
        i = j;
        continue;
      }
      // Control symbol: \, \; \{ \| \! \  …
      push("command", next, start, i + 2);
      i += 2;
      continue;
    }
    switch (c) {
      case "{":
        push("lbrace", c, start, i + 1);
        break;
      case "}":
        push("rbrace", c, start, i + 1);
        break;
      case "^":
        push("sup", c, start, i + 1);
        break;
      case "_":
        push("sub", c, start, i + 1);
        break;
      case "&":
        push("amp", c, start, i + 1);
        break;
      case "'":
        push("prime", c, start, i + 1);
        break;
      case "~":
        push("tilde", c, start, i + 1);
        break;
      default: {
        // Keep surrogate pairs (astral Unicode math letters) together
        const cp = src.codePointAt(i)!;
        const ch = String.fromCodePoint(cp);
        push("char", ch, start, i + ch.length);
        i += ch.length;
        continue;
      }
    }
    i++;
  }
  push("eof", "", src.length, src.length);
  return tokens;
}
