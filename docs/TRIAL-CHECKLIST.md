# One-day trial on a copy of a real chapter

A working day with MathBlocks instead of MathType, on a **copy** of a real chapter. Each step says what to do,
what should happen, and what to send when it does not. Keep the original chapter untouched; MathBlocks also
writes a backup before every document-wide change (Word style tab → Backups).

Send problems as: the step number, what you saw, and — when asked — the self-test zip or the Word file (the
repository is public: files you send are only looked at locally and never committed).

## 0. Before you start (10 minutes)

| # | Do | Expected |
|---|---|---|
| 0.1 | Install the latest test build; start Word, then MathBlocks. | The MathBlocks tab is in Word; the app's status bar says Word is connected. |
| 0.2 | Run the Word self-test (MathBlocks tab → Run Word self-test); don't click in Word while it runs. | "0 failed". If not, send the zip and stop here. |
| 0.3 | Copy the chapter to a new file and open the copy. | — |

## 1. Converting the chapter (30 minutes)

| # | Do | Expected |
|---|---|---|
| 1.1 | MathBlocks → Convert MathType equations. | Before anything is written, a list of equations that cannot be converted (with where they are) — or none. Then the report: every display equation with its number. |
| 1.2 | MathBlocks → Convert numbering. Choose keep or renumber; check the before → after list and the headings without a MathType break. | "No MathType numbering field is left"; every reference shows its equation's number. |
| 1.3 | Ctrl+K → Review notation kinds. Untick what you don't want; Apply. | The counts and examples look right; one Ctrl+Z would undo it. |
| 1.4 | MathBlocks → Style → Document style…. Pick or make your style (New style…), classify single-letter indices, Save and redraw. | Every equation redrawn; their LaTeX unchanged (double-click one). |
| 1.5 | MathBlocks → Style → Check style. | Only real deviations; conform or keep as exceptions. |

## 2. Writing (most of the day)

| # | Do | Expected |
|---|---|---|
| 2.1 | Ctrl+Alt+M in a paragraph → type an equation → Insert. | It appears in line, on the baseline; typing continues after it. |
| 2.2 | A numbered display equation (Numbered in the app). | Its number at the right margin, continuing the section's numbering. |
| 2.3 | Double-click an equation; change it; Update. | Changed in place; its number and references unchanged. |
| 2.4 | Right-click an equation. | The MathBlocks menu: Edit here, Edit in the window, Number, Copy LaTeX, Convert to LaTeX text, Cut, Copy, Paste, Delete. |
| 2.5 | Insert reference (MathBlocks tab) to an equation; then add an equation before it and Update numbers. | The reference follows its equation. |
| 2.6 | Copy an equation and paste it elsewhere, and into a second document. | The copy is an independent equation (its own ID); editing it does not change the original. |
| 2.7 | Cut a paragraph with equations and paste it elsewhere; drag one. | Nothing else changes; numbers update with Update numbers. |
| 2.8 | Track Changes on: insert, edit and delete an equation; then accept and reject. | Each change is tracked; after accepting, one equation per change; after rejecting, as before. |
| 2.9 | Ctrl+Z and Ctrl+Y after each kind of change. | One Ctrl+Z per action, including document-wide commands. |
| 2.10 | Type a new subsection in LaTeX (TAB `$$…$$` TAB `\label{eq:…}`, `\eqref{…}`) and Convert LaTeX. | The pre-flight report, then numbers and references as labelled. |
| 2.11 | Work with two documents open (e.g. the chapter and notes). | The document you work on stays in front after every command. |

## 3. End of the day (30 minutes)

| # | Do | Expected |
|---|---|---|
| 3.1 | Update numbers. | No broken reference (or each one listed with its text). |
| 3.2 | File → Save As → PDF (Word). | Equations sharp when zoomed in; numbers and references right. |
| 3.3 | Acrobat → Create PDF (if installed). | The same. |
| 3.4 | Print one page. | Equations at the right size, nothing missing. |
| 3.5 | Save, close Word, reopen the copy. | Everything as you left it; double-click still opens equations. |
| 3.6 | Open the copy on a PC without MathBlocks (or send it to someone). | Equations show (they are pictures with their data inside); editing needs MathBlocks. |
| 3.7 | Run the self-test again and send the zip together with notes on anything that felt slow or wrong. | — |

## What "ready" means

The trial is a pass when every step works on the real chapter without workarounds, and nothing changed that you
did not ask for (the text guard undoes document-wide changes that would touch other text, and says so).
