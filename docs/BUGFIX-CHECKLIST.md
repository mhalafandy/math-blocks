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

---

# Round 2 — Priority 1 checklist (real Word)

1. **Convert LaTeX:** in a test document, type `$\alpha$` alone on a line, `text $x^2$ and \(y\) and $$a+b$$ here`,
   `\[E=mc^2\]` alone, and `Cost $5 and $6` (must stay text). Ribbon → Convert LaTeX → Convert.
   Expected: all LaTeX converted (alone `$$`/`\[` → display; the others inline), the prices untouched.
   If anything is left, the message now says why; please send the `findLatex …` and `replaceRanges …`
   lines from connector.log.
2. **Snippet prefix:** for each prefix in the Snippets dialog (`;` `:` `'` `!` `.`), type `x+` then the prefix and
   `pv`, press Tab: a vector with an empty slot, **no prefix character left**. `;dc` Tab, `b`, Tab, `a` → C_ba.
   `x;tp` Tab → xᵀ. `inv` Tab → ⁻¹.
3. **Space leaves a kind:** `;pv` Tab `r` Space `+x` → r⃗ + x (the vector unchanged). Same with Tab. In a vector
   with a frame label, Space from inside the label also leaves the kind.
4. **Focus:** with the caret in the middle of an equation, Ctrl+K → Esc → type: the text goes where the caret
   was. Ctrl+K → "fraction" → Enter → type: it goes into the numerator. Open Snippets, close it, type: into the
   editor. Same from the floating editor's command line.
5. **Dialogs:** at 1366×768 and at 125 % / 150 % scaling, open Snippets, Change notation, Save as new…,
   List of symbols: the title and the buttons are always visible; the list scrolls.
6. **Harpoon:** print `harpoon-print-A4.pdf` (sent with this message) at 100 % (no "fit to page") and judge the
   12 pt and 10 pt lines. Then insert a Classic r⃗ at 10 pt in Word and print it.

---

# Round 2 — Priority 2 checklist (kinds)

1. **Hover:** move the mouse over a vector in the editor: "Physical vector" appears above it.
2. **Live restyle:** with `\pvec[P/O]{r}=\dcm{b}{a}` open, Word style tab → Spacecraft notation: Schaub → the
   editor and the Classic preview change at once; Physical vectors: Arrow → the vector changes at once.
3. **Bold on a kind:** cursor after a vector, Ctrl+Shift+B → the popup. "Convert to plain" → it becomes ordinary
   bold letters (no longer a kind; hover shows no name). "Edit kind style…" opens Notation settings on that kind.
4. **Notation settings:** change the physical vector's accent to Hat → preview, editor and library thumbnails
   change; "Reset to preset" brings the harpoon back. Duplicate the physical vector, name it, give a macro and
   trigger → it appears under My notation.
5. **New kind:** New kind → "Angular velocity", macro `angvel`, trigger `av` → Create. In the editor `;av` Tab `w`
   Space → the new kind; in the palette tab "My notation"; type `\angvel` Enter → the kind. Send to Word (Classic
   and native), double-click it back → still the kind. Export .tex → `\newcommand{\angvel}` and it compiles.
6. **Apply to the Word document:** after changing a style, "Apply to the Word document…" → every equation with
   kinds is redrawn (backup if more than 10, progress window, one Ctrl+Z undoes it).
7. **Make → kind:** select `\mathbf{r}_{P/O}` (or put the cursor after a bold r), right-click → Make the selection a
   kind… → Physical vector → `\pvec[P/O]{r}`. Also Ctrl+K → "Make → Unit direction vector".
8. **Floating editor:** the same right-click menu and popup work there; a kind made in the main window is known
   in the floating editor without restarting.

---

# Round 2 — Priority 3 checklist (editing experience)

1. **Editor field:** start the app → a framed field with "Type here, or press Space Space for commands" and a
   blinking caret; typing goes straight in. Ctrl+N → empty field, focused. Focus ring visible while typing.
2. **Space Space:** type `x+y`, press Space twice quickly → command palette; Esc → keep typing where you were,
   no space added. Slowly (two separate Spaces) → nothing happens. Inside `\text{…}` and in the LaTeX editor,
   Space Space types spaces. F1 → turn it off or change the time (Ctrl+K always works).
3. **LaTeX commands:** F1 → "LaTeX commands" tab; search "arrow", "frac", "pvec"; click one → inserted at the
   caret, keyboard back in the editor. Your own kinds appear under "Notation kinds (and my own)".
4. **Floating editor** (right-click an equation in Word):
   - opens with Visual and LaTeX stacked, caret at the end of the equation; collapse either one (▾);
   - the left rail: ⌕ commands (Space Space / Ctrl+K focus its search), ★ favourites, ≤ symbols, ∑ structures,
     ⇀ spacecraft / my notation / collections, Aa style, ◫ preview — one flyout at a time;
   - footer: "Ctrl+Enter apply · Enter new line · Esc cancel" (inline: "Enter apply"), Cancel / Apply;
   - drag the grip at the bottom right to make it wider; close and reopen → same width, same panes, same flyout;
   - the top row is solid: Word's ribbon no longer shows through it.

---

# Round 3 — Priority 0 checklist (equation identity)

Install the new build and restart Word. Work on a **copy** of MathBlocks Tests.docx.

1. **Repair the test document first:** Ctrl+K → Repair equations. Expected message: "N wrapper(s) holding several
   equations or text split into one per equation (text moved out)", plus new IDs for copies. connector.log:
   `repair: splitting mb1|-|… [pictures 3+0, …, text 120 …]` lines, then `repair: wrapped one equation as …`.
2. **Your three equations again:** right-click the long equation (v ω×c…) → the floating editor shows *that* equation.
   Number equation on it → it gets a number and keeps its content. Repeat for r₂ and one more.
   connector.log: `panel resolved to mb1|-|… [pictures 1+0, math 0, nested 0, text 0, same-tag 1] "…"` with the right LaTeX.
3. **Typing next to an equation:** click just right of an inline equation and type text, then paste text there; the same
   just left of it. The text appears outside: right-click the equation → it still opens alone (log: `text 0`).
   Try to type *into* the equation picture: Word refuses (the wrapper is locked).
4. **Insert next to an equation:** put the cursor right after an equation (End, arrow keys) and Insert into Word → the new
   equation is a separate equation (log: `insert: the cursor was inside … inserting after it` if it was at the edge).
5. **Copy/paste:** copy an equation and paste it twice; right-click each copy → each opens; connector.log shows a new ID
   for a copy that shared one (`was shared by 2 wrappers; this one is now …`).
6. **No stale target:** double-click equation A, change it, Update in Word → the button turns to "Insert into Word" and the
   editing bar disappears; type a new equation and press it → a *new* equation is inserted, A is unchanged.
   Open A in the floating editor and close it with Esc → the main window is no longer attached to A.
7. **Refusals:** in an unrepaired copy of the old document, right-click a grown wrapper → a notice "This equation cannot be
   opened safely: its wrapper holds 3 equations…" with Repair equations; nothing changes in the document.

---

# Round 3 — Priority 1 checklist

1. **Convert LaTeX in your test document:** run Repair equations first (or let Convert LaTeX do it), then ribbon →
   Convert LaTeX. Expected: the small dialog over Word "Convert N LaTeX expression(s)…?" (Enter = Convert), the
   LaTeX becomes equations, the result is in Word's status bar; the MathBlocks window does not come to the front.
   connector.log: one `findLatex span "…" at …: plain text → convert` line per span.
2. **Selection only:** select one paragraph with LaTeX, Convert LaTeX → only that paragraph's LaTeX is converted.
3. **Don't ask again:** tick it in the dialog → next Convert LaTeX converts at once. Turn asking back on in the Word
   style tab ("Ask before Convert LaTeX…").
4. **Insert reference from the ribbon:** a picker over Word lists the numbered equations (number, page, LaTeX); type
   to filter, Enter inserts; "Number only" gives 1.2 instead of (1.2). The app stays in the background.
5. **Floating pastes:** paste a copied equation (Ctrl+V, Keep source formatting, both directions between documents);
   if it arrives with rotate handles / floating, right-click it → it goes back in line and opens. Repair equations
   reports "N floating picture(s) put back in line with the text".
6. **Restyle → Word:** change the physical vector's style (Notation settings), Insert into Word → the new style in Word;
   the same from the floating editor (Apply). Reopen the equation → still the kind, new style.
7. **Kinds in groups:** open an equation containing `{\pvec{r}_2}` → the visual editor shows the vector (not red text).
8. **\text{}:** type `x=1`, then `\text{}` and ` for all t`, Enter, `+y` → x = 1 for all t + y with the words as text.
   Insert "Text" from the palette and from F1 → LaTeX commands → type "if t>0" → it is text; Tab returns to maths.

---

# Round 5 — hybrid identity (test log)

Install the new build, restart Word, work on a **copy** of MathBlocks Tests.docx and a second, empty
document B. "Opens" means: right-click → the floating editor shows that equation (one menu only).
Keep connector.log for the paste rows (lines `document changed …` and `near the selection: …`).

| # | Operation | Expected result | Result |
|---|---|---|---|
| 1 | Open the old test document, Ctrl+K → Repair equations | Report: "N Classic equation(s) converted to the new form", "Left untouched: n native Word equation(s), m MathType object(s)"; a backup if many. Click an equation: Word's picture frame, no content-control box | |
| 2 | Ctrl+Z once after 1 | The whole repair is undone in one step (wrappers back) ; Ctrl+Y redoes it | |
| 3 | Insert a new Classic display equation, then click it | Picture frame only (no wrapper). Format Picture → Alt Text shows the title `mb1\|…` and the LaTeX description. Right-click → opens | |
| 4 | Click the picture, Delete; then Ctrl+Z | Deleted completely, nothing left behind; Ctrl+Z brings it back in one step and it still opens | |
| 5 | Click the picture, Ctrl+X, paste elsewhere (Ctrl+V) | Moved; same ID (log: no "duplicate"), it opens, its number (if any) follows | |
| 6 | Copy a **numbered** equation, paste it **before** the original (Ctrl+V) | The copy gets a new ID, the original keeps its own (log: `duplicate ID … is a copy … keeps it (its number bookmark …)`). References still go to the original | |
| 7 | Copy an unnumbered equation, paste it twice | Each copy gets its own ID; the earliest keeps the original ID (logged as "earliest"). Each opens alone; editing one leaves the others unchanged | |
| 8 | Copy picture → Paste options: Keep source formatting / Merge formatting / Picture | Each paste is in line (never floating) and opens; Picture: note whether it still opens (log line tells what it kept) | |
| 9 | Copy picture → Home → Paste Special → Picture (Enhanced Metafile), same document | Expected: recognised from its hidden source, gets a new ID, opens. If it does not open, send the `near the selection` log line | |
| 10 | Same as 9, Paste Special → Picture (PNG) | Becomes an ordinary picture (nothing to recover, as with MathType); Repair lists it under "other pictures" | |
| 11 | 9 and 10 again, from the test document **into B**, then from B back into the test document | EMF: opens in B (and back); PNG: ordinary picture in both directions | |
| 12 | Ctrl+V of a whole paragraph with a Classic and a native equation, into B and back | Both open; in the same document the copies get new IDs; native keeps its kinds only within the same document | |
| 13 | Paste or drop that comes in floating (rotate handle / layout button) | Goes back in line by itself at once (status bar message), one Ctrl+Z step; right-click opens it — no "right-click again" | |
| 14 | Drag an equation to another place in the same document | Moved, same ID, opens. Ctrl+drag (copy): the copy gets a new ID | |
| 15 | Drag an equation from the test document into B | Copied into B, opens there | |
| 16 | Number equation on a Classic equation; then Unnumber | Number appears to the right, picture unchanged and opens; Unnumber removes it; each is one Ctrl+Z step, Ctrl+Y redoes | |
| 17 | Number three equations, insert a reference to the 2nd, then number a new equation above them, Update numbers | Numbers shift (1)(2)(3)(4); the reference shows the 2nd's new number; Ctrl+click jumps to it | |
| 18 | Format Picture → Alt Text: change the **title** to "abc", click elsewhere, then right-click the equation | It opens as the same equation (log: `picture ID restored from its hidden source`); the title shows `mb1\|…` again; its number and references unchanged | |
| 19 | Change the **description** (alt text) too, then right-click | Still opens (identified from the hidden source) | |
| 20 | Review → Track Changes on; edit an equation (Update in Word) | Shown as deletion + insertion; the new one opens; no "duplicate ID" in the log. Accept → one equation; Reject → the old one, which opens | |
| 21 | Track Changes on: Delete an equation, Number another | Tracked as Word's changes; Accept/Reject work; nothing renamed in the log | |
| 22 | Ctrl+Z / Ctrl+Y after each of: Insert, Update, Number, Unnumber, Convert LaTeX | One step each, both directions; the equation opens after undo and after redo | |
| 23 | Type text right before and right after an inline equation, then paste text there | Text is outside; the equation still opens alone | |
| 24 | Native Word equation (look: native): insert, type at its edges, Delete it | Text stays outside; Delete leaves no empty box (removed right after) | |
| 25 | Ribbon → Convert MathType on a document with MathType equations | Converted equations are pictures without wrapper and open; Repair shows nothing to convert | |
| 26 | Close and reopen the test document | No dialog; log: `on open: …` only if copies were found; every equation opens | |

Please send connector.log after rows 8–15 (the paste rows) — I will fix the cause from what each paste kept.
