# Classic equation identity: wrapper or not (evaluation, round 5)

**Status:** decided — the hybrid (c) is built: Classic = titled picture, native = unlocked guarded
wrapper. Implementation: `WordOps.Equations.cs` (the `Eq` handle), `EquationIdentity.ChooseKeeper`
and `SourceTag` (tested without Word). Older documents are converted by Repair equations.

## Where we are

Every MathBlocks equation sits in a content control (the "wrapper") whose tag is its identity
(`mb1|block|instance`). Word treats the wrapper as a container: text typed or pasted at its edge goes
inside, a copy keeps the tag, and a locked wrapper blocks Delete, Cut, drag and our own paragraph
edits (numbering). MathType equations have no wrapper: each OLE object carries its own data.

A Classic picture already carries everything needed to rebuild the equation without a wrapper:
the source JSON in the EMF comment (`MathBlocks1:{latex,mode,style,sizePt,block}`) and the alt text
(`MathBlocks display: …`). Repair already reads both.

## (a) No content control for Classic equations

**How.** The picture is the equation.
- Identity: `InlineShape.Title` = `mb1|block|instance` (set through COM after insertion; stored as
  the drawing's `docPr title`, kept by copy, cut, drag and the normal paste modes). The alt text keeps
  the LaTeX (screen readers, and a fallback); the EMF comment keeps the source (second fallback).
- Find by tag: scan `doc.InlineShapes` reading `Title` (a property, no XML) — milliseconds for
  hundreds of equations. Read: the picture's own XML (EMF comment), as today.
- Update: `InsertXML` over the picture's range with a package holding just the new picture, then set
  `Title` again. One undo record.
- Copy/paste duplicates the ID: detected whenever a scan or a click sees the same ID twice; the copy
  (the occurrence without the number bookmark, else the later one) gets a new ID. Every write still
  checks the ID is unique, so a duplicate can never be written by mistake.

**What changes for the user.** Select by clicking the picture, Delete, Cut, Copy, every paste
mode, drag, Ctrl+A: all exactly Word's picture behaviour, like MathType. Text can never end up
"inside" an equation, so the whole class of grown-wrapper bugs disappears.

**Numbering and references.** Unchanged in principle: the number (fields + bookmark) sits after
the picture in its paragraph; bookmark names come from the instance ID; references are REF fields
to the bookmark. NumberInfo / listNumbered look at the picture's paragraph instead of a wrapper.

**Linked copies.** The block ID is part of the tag in `Title`; the document registry (custom XML) is
unchanged. Highlighting linked copies switches from coloured wrappers to a temporary picture border.

**Undo / track changes.** User operations: Word's own. Ours: one custom undo record each, as now.
Tracked changes record an update as deletion + insertion of the picture (as today).

**Native (OMML) equations.** OMML has no place for an ID, so native equations keep a wrapper —
unlocked, with the caret guard and the self-healing checks of (b). Native equations are the
minority (Classic is the default look).

**Risks.** Paste Special → "Picture (Enhanced Metafile)" or "Picture (PNG)" makes a new picture
without `Title`; the EMF variant usually keeps our EMF comment, PNG keeps nothing (as with MathType,
whose data is lost by the same paste). Such copies are recognised from alt text/EMF where present and
get a new ID; "Keep text only" keeps nothing, as for any picture. `InlineShape.Title` needs Word 2010+.

**Cost.** The largest change to the add-in so far: every method that finds, reads or writes by tag
(about 15: find/list instances, replace one/many, retag, dedupe, select, highlight, number/unnumber/
number info/list numbered/upgrade/bookmarks, equation ↔ LaTeX, selection info, right/double-click,
text width, repair, convert LaTeX/MathType output) moves to an "equation handle" that is either a
picture (Classic) or a wrapper (native). The app keeps using tags; only the Classic insertion XML
changes (no `w:sdt`). Migration: Repair (offered automatically when a document with Classic wrappers
opens) moves each wrapper's tag onto its picture and removes the wrapper — one undo step, backup.

## (b) Keep the wrapper, unlocked, with self-healing

**How.** Wrappers stay but are never locked. Before every read and write, and when the caret enters
or leaves a wrapper (`Document.ContentControlOnEnter/OnExit`, plus the selection guard), anything
that is not the equation is pushed out of it; empty wrappers are removed; duplicate tags re-IDed.

**What breaks or stays awkward.**
- Delete/Cut/drag of a selected picture leave the wrapper behind (we remove it afterwards: an extra
  step in Word's undo list — Ctrl+Z first restores the empty wrapper, then the picture).
- Text typed at the edge still goes inside until the next heal; healing edits the document outside
  the user's action, so Ctrl+Z can undo our heal instead of the user's typing.
- Copying a paragraph still copies tags (healed later). Content-control events fire only when the
  caret enters/leaves through the UI, not for programmatic or pasted changes.
- Behaviour stays different from MathType and from ordinary pictures.

**Cost.** Small (most of it exists in the interim build). Numbering, linked copies and native
equations as today.

## (c) Alternatives considered

- **Hybrid — (a) for Classic, (b) for native** (recommended; see below).
- **A field around the picture** (`ADDIN`/`MACROBUTTON` carrying the ID): fields grow the same way
  (text typed into the result), are rebuilt by F9 / Ctrl+A F9, and show field shading. Rejected.
- **An OLE object like MathType:** needs a registered OLE server (out-of-process COM, admin install,
  per-version registration). Far heavier; rejected.
- **A bookmark per equation:** bookmarks stretch when text is typed at their edge and are dropped on
  paste, so they cannot carry identity. Rejected.
- **ID only in the EMF comment:** changing an ID would mean re-rendering the picture. Kept as the
  last fallback only.

## Recommendation

**(c) = (a) for Classic equations + an unlocked, self-healing wrapper for native equations.**
Classic equations then behave exactly like MathType equations or pictures; native equations keep
the protection they need without locks.

## What I would test for (a)

Here (CI, no Word): reading identity from Title / alt text / EMF; duplicate resolution (which copy
gets a new ID); refusal of writes to a duplicated or changed equation; migration of a wrapped
equation (tag moved to the picture); the app flows against a simulated document (open, edit, update,
number, unnumber each of several equations; copy → duplicate → new ID).

In Word (your checklist): select by clicking + Delete, Cut, Copy, each paste mode (Ctrl+V, Keep
source formatting, Merge formatting, Picture, Keep text only, Paste Special EMF/PNG), both
directions between documents, drag within and between documents, Number / unnumber, Update numbers,
references after renumbering, track changes on, undo/redo of each, migration of an old document.
