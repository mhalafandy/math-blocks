# Real-Word checklist: Bugs 1–3

Install the new build, restart Word (so the add-in reloads), open a copy of the thesis.

## Bug 1 — copy/paste keeps identity

Insert one Classic display equation with a kind (`\pvec[P/O]{r}`), one numbered, one linked from the library.
For each paste mode below: copy the equation, paste it elsewhere, then **Ctrl+K → Repair equations** and note the report.

| Copy | Paste as | Expected |
|---|---|---|
| Whole paragraph | Ctrl+V | wrapped OK; "new ids" for the copy |
| Picture only (click it, Ctrl+C) | Ctrl+V | "re-wrapped (emf)" |
| Picture only | Keep source formatting | "re-wrapped (emf)" |
| Picture only | Merge formatting | "re-wrapped (emf)" or "(alt)" |
| Picture only | **Picture** | likely "other pictures +1" → **avoid** |
| Any | **Keep text only** | no picture at all → **avoid** |
| Into another document | Ctrl+V | kinds survive (Classic); native equations lose kinds |

Then: double-click a re-wrapped copy, which should open in MathBlocks with its kinds. Edit it and check the original is unchanged.
For a numbered copy: Update numbers. Both should have their own number, and references should still point at the original.
Please send me the Repair report numbers for each row.

## Bug 3 — numbering

1. Word style tab, then Numbering: try (1), (1.1), (1.2.3), with brackets [ ] and none, and separator "-". Number an equation for each one.
2. Number a multi-line equation. The number should sit level with its vertical centre.
3. Insert a reference both ways: "(1.2)" and number-only "1.2". Check there are no spaces inside, and that Ctrl+click jumps to the equation.
4. Chapter numbers:
   - with heading numbering on (STYLEREF);
   - then switch to markers: insert a chapter marker, and an "Appendix" marker that should give (A.1).
5. Open an older document and run **Upgrade numbering**. Every number and reference should become a single field, and one Ctrl+Z should undo it.
6. Make an equation too wide to share its line with the number. Note what Word does: I expect the number to wrap to the next line, right-aligned.

## Bug 2 — multi-line and page width

1. Display mode: type `x=a+b+c`, put the cursor before `+c` and press **Enter**. You should get two lines aligned at `=`, the second starting with `\quad +c`.
2. Press End, then Enter again, then type `=d`: a third aligned line.
3. Put the cursor in a line and press **Ctrl+;**: that line should align at the cursor.
4. Insert each template from Matrices & cases: aligned 3 lines, multline, gathered, continued.
   - In Word, Classic multline should have its first line left and last line right.
   - Native multline comes out centred, which is a known limitation.
5. Floating editor (right-click an equation):
   - Enter adds a line;
   - **Ctrl+Enter applies**;
   - for an inline equation, Enter still applies.
6. Type a very long equation. The bar should show more than 100% "too wide". Click **Suggest a line break**, check the preview, then **Use this break**.
   - The width should be Word's real text width. It says "default" when Word isn't connected.
   - Numbered equations should leave room for the number.
7. Word style tab: the Classic preview shows dashed line-width guides once the equation comes close to the line width.
8. Export .tex: multline equations become `\begin{multline}` (with `\tag` when numbered) and compile.
