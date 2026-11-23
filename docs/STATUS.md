# Status

Updated at the end of every round. Public repository: generic content only. Earlier rounds: `docs/status-archive/`.

## Latest round — 0.1.176

**Stable: 0.1.175** (promoted 2026-11-23 after the core self-test, 313 checks, 0 failed, `RESULT: PASS`, and the 4 manual checks). The stable manifest downloads (rollback 0.1.168).
**Test channel:** 0.1.176, CI passed. Editor-only fix; stable stays 0.1.175.

**Editor (visual math field only; nothing written to Word changes):**
- A subscript typed right after an arrow or harpoon (palette, kinds) sat under the letter like a limit, and the space before "=" went with it: the accent is now grouped as soon as a script follows it, as the editor's loaded form already was. Reproduced and checked in the real editor (headless): the index now sits right of the letter.
- The harpoon, narrowed to the letter, showed only the left end of its 400 em drawing (a stroke without its barb, the "tick"): the drawing is anchored at the right, so the barb shows.
- Plain `\vec{\mathbf{x}}_i` reaches the editor unchanged and draws correctly there; the screenshot did not arrive, so if your case was typed differently, send it.

**Next round:** the UX areas list (short, written, no code), then Apply style on very large documents.

## Details

- `MathEditor.tsx` input handler: `groupScriptedAccents` live. `editorAccents.ts`: harpoon `.slice-1-of-1` anchored right.
