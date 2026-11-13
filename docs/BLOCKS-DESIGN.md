# Blocks — design (for approval)

A **block** is your own reusable chunk of expression with **named slots**: a recurring sub-expression,
a matrix pattern, a term with places to fill. You insert it while building a larger equation, fill its
slots with Space, and it becomes ordinary math. Blocks are for any user and any field; every example here
and in the tests is generic.

Status: **approved** (all seven recommendations in §9, plus the four additions in §10), then **amended
for the kinds model** (docs/KINDS-MODEL.md): §6b and the changes marked *(kinds)* — the amendment awaits
approval together with the kinds model. Blocks are built after the kinds model.

---

## 1. What a block is

| Field | Meaning |
|---|---|
| `name` | Shown on the tile and in search ("Kinetic energy term"). Unique within its scope. |
| `description` | Optional, shown in the tooltip and the editor. |
| `body` | LaTeX with named slots, e.g. `\frac{1}{2}#m\,#v^2` or `\pvec[#to/#from]{#vector}`. May contain notation kinds (`\pvec`, `\dcm`, …) and other blocks (§6). |
| `slots` | Ordered list of the slots in the body: `{ name, label?, default? }`. The order is the Space order (reading order by default; reorderable). |
| `trigger` | Optional short word, typed with the snippet prefix and Tab: `;kin` Tab. |
| `group` | Optional group (folder) in the Blocks sidebar; groups can nest one level. |
| `tags` | Optional, for search. |
| `display` | Whether it is meant as a display block (a multi-line pattern) or an inline piece; only a hint for the tile and the search. |
| housekeeping | `id`, `position` (order in its group), `createdAt`, `updatedAt`, `useCount` (search ranking), `version` (increases on every edit). |

**Slot syntax [decide 1].** In the body a slot is `#name` (letters and digits, starting with a letter:
`#frame`, `#v`, `#x1`). A literal `#` is written `\#`, as in LaTeX. The palette's unnamed slots (`#0`,
`#?`) keep working and count as slots named `1`, `2`, … in reading order.

**A slot used twice [decide 2].** If the same name appears more than once (`#v\cdot#v`), you fill it once:
the first occurrence is the slot you type in; when you leave it (Space), the others receive the same
contents. After that they are ordinary math, edited independently.

## 2. Creating and managing blocks

**Save as block** (editor context menu, the Blocks sidebar's “+”, Ctrl+K “Save as block…”):

1. The source is the **current selection** in the editor, or the **whole equation** if nothing is selected.
2. A dialog shows the expression large (math-render, the document style) with every symbol and
   sub-expression clickable. Clicking one (or Ctrl+click several) makes it a slot; you name each slot (a
   name is proposed from the symbol: `v`, `omega`, `frame`). A selection made in the editor before opening
   the dialog can be turned into a slot in one click ("Selection → slot").
3. Name, description, trigger (checked live against the snippets, the kinds and the other blocks — a
   clash is shown, not saved), group, tags.
4. Preview: the tile as the sidebar will show it, and the result of inserting it with the slots empty.

**From scratch**: the same dialog with an empty body; you type LaTeX with `#name` slots, or edit
visually and mark slots as above.

**Managing** (Blocks sidebar, context menu on a tile, and the block editor):
edit (opens the dialog), duplicate, rename, delete (with undo), reorder by drag (within a group and
between groups), move to a group, create / rename / delete groups, export (§4), copy as LaTeX.

## 3. Inserting a block

From all of these, the same function inserts it:

- the **Blocks section of the left sidebar** — tiles drawn by math-render in the document style, the same
  MathTile as the palette (slots drawn as the palette's placeholder), name under the tile; search box;
  groups collapsible; "This document" group first when the document has its own blocks;
- the **palette's search** (blocks appear among the results with a “Block” label) and Quick access (a
  block can be pinned like any palette entry);
- **Ctrl+K**: “Insert block: <name>” for every block;
- the **cheat sheet** (F1): a “My blocks” section with name, tile and trigger;
- the **trigger**: prefix + trigger + Tab (`;kin` Tab), through the existing snippet mechanism.

On insertion:

1. Nested blocks are expanded (§6), kinds converted to the editor's form, slots become placeholders.
2. The block goes in at the caret (or replaces the selection; if the block has exactly one slot and text is
   selected, the selection fills that slot — "wrap the selection").
3. The caret lands in the **first slot** (its placeholder selected); **Space moves to the next slot**,
   Shift+Space back, as everywhere in the editor. After the last slot the caret leaves the block.
   While a block's slots are being filled, Space visits *its* slots in the block's slot order, even
   across structures; inside a slot that is itself a structure (a fraction you typed there), Space first
   walks that structure, then continues to the next block slot.
4. Defaults: a slot with a default is pre-filled (selected, so typing replaces it).
5. One Ctrl+Z removes the whole insertion.

## 4. Storage, scope, sharing

- **Global blocks** (the default) live in the library database (SQLite), in new tables added by a
  migration: `blocks`, `block_groups`, `block_tags` (tags shared with the library's `tags`). They are
  included in the library's existing export/backup.
- **Per-document blocks [decide 4]**: a block can be saved "in this document"; it is stored in the Word
  document itself (a Custom XML part `urn:mathblocks:blocks:v1`, like the document style), so it travels
  with the document and appears in the sidebar's "This document" group whenever that document is open.
  A document block can be copied to the global set and back.
- **Export / import a block set**: one file (`*.mbblocks.json`: format name, version, groups, blocks with
  their bodies, slots, triggers, tags). Export: all blocks, a group, or a selection. Import: shows what it
  contains and, for each clash (same name or trigger), lets you keep both (renamed), replace or skip.
  Export → import gives identical blocks (tested).

## 5. Copy, not link

An inserted block becomes **ordinary editable math**: nothing in the equation refers back to the block,
and editing the block later does not change equations already written. This keeps documents
self-contained (they open the same on any PC, with or without your blocks) and keeps every editing
operation working as it does today.

**A "linked block" option** (equations remember which block and slot values they came from; editing the
block offers to update every instance in the document) would be possible later. Cost, honestly: each
instance would carry the block id, version and slot values in its stored source; an "Update instances"
command would rewrite them across the document (one Ctrl+Z, like Apply style); the hard part is an
instance you edited by hand after inserting it — it must be detected and either skipped or shown as a
conflict. Estimate: about two rounds of work plus a self-test section. **I recommend not now**: copies
cover the need; revisit if you find yourself changing a block that is already used in many places.

## 6. Blocks inside blocks [decide 3]

A block's body may use another block by reference: `\block{Kinetic energy term}{m}{v}` (the slot values
in order, or `\block{name}` with its slots left as slots of the outer block). References are expanded at
insertion, so improving an inner block improves every outer block that uses it (for future insertions;
written equations stay copies). A reference cycle (A uses B uses A) is refused when saving. Saving an
equation that *contains* an inserted block simply saves its math (it is a copy).

## 6b. Kinds in blocks *(kinds)*

Blocks are made of **kinds and blocks** (docs/KINDS-MODEL.md):

- **The body stores meaning, never a look.** Plain letters stay plain: their kinds (variable, constant,
  label…) resolve in the document the block is inserted into, by that document's rules — the same block
  draws `e` upright in an ISO document and italic in another. Wrapper kinds stay macros (`\pvec{#v}`).
  Font commands are not stored: Save as block removes a font command that only repeats what the source
  document's kinds already draw, and keeps (and shows) any other.
- **A slot may require a kind** *(kinds)*: `#name:kind` (`#v:pvec`, `#J:mat`). What you type in that slot
  becomes that kind (typing `\omega` in `#v:pvec` gives `\pvec{\omega}`); the tile and the slot hint show
  the kind ("v — vector"). Save as block proposes the kind for a slot made from a symbol that has one
  (a `\pvec{\omega}` turned into a slot becomes `#omega:pvec`).
- **Symbol rules travel with the document, not with the block**: a block inserted into another document
  follows that document's rules (a bold-ω-is-a-vector rule there applies to the inserted ω too).
- **Defining symbols** (docs/SYMBOL-LIST.md): a block can carry definitions for its fixed symbols; after
  insertion, "Define symbols of this block…" offers the ones the document has not defined yet.

## 7. Interaction with what exists

- **Snippets**: a block's trigger is a snippet of kind "block"; the snippet prefix (Settings → Editor) is
  shared, so `;` triggers kinds, snippets and blocks alike, and clashes are checked across all three.
- **Templates (M7)**: "use this equation with other symbols" stays as it is; "Save as block" is the
  reusable version of the same idea (the template dialog gets a "Save as block" button).
- **Document style**: blocks store meaning (`\pvec`, `#slots`); the style decides the look when drawn,
  so the same block looks right in every document.
- **Library equations** stay whole equations (inserted as a new equation or into Word); blocks are pieces
  inserted *into* the equation being edited. A library equation can be turned into a block (context menu
  "Save as block").

## 8. Tests (generic examples)

Unit (pure functions: slot parsing, expansion, export format):
- body parsing: `#name` slots, `\#` literal, unnamed `#?`, repeated names, slot order;
- expansion: kinds kept, nested `\block{…}` expanded, cycle refused;
- export → import identical (bodies, slots, triggers, groups, tags); clash handling (keep both / replace / skip).

In the real editor (headless MathLive, like tools/editor-keys-check.ts, in CI):
- **create from a selection with two slots**: select `\frac{1}{2}m v^2` in an equation, mark `m` and `v`
  as slots, save; the stored body is `\frac{1}{2}#m #v^2` with slots `m`, `v`;
- **insert by click** and **by trigger** (`;ke` Tab): the caret is in the first slot;
- **fill the slots with Space**: type `M`, Space, `u` → `\frac{1}{2}M u^2`, caret after the block;
- **repeated slot**: `#v\cdot#v`, type `a`, Space → `a\cdot a`;
- **nested block**: an outer block using the inner one, inserted and filled in one Space sequence;
- **one Ctrl+Z** removes an insertion.

Word self-test: insert a block into an equation in Word, check the equation's LaTeX.

## 9. Decisions for you

| # | Question | My recommendation |
|---|---|---|
| 1 | Slot syntax in the body | `#name` (short, like the palette's `#?`; `\#` for a literal hash) |
| 2 | A slot name used twice | Fill once, copied to the other places when you leave it |
| 3 | Blocks inside blocks | By reference (`\block{name}{…}`), expanded at insertion |
| 4 | Per-document blocks | Stored in the Word document (Custom XML part), shown as "This document" |
| 5 | Groups | Blocks have their own groups (not the library's equation folders) |
| 6 | Trigger prefix | The same prefix as kind snippets (one prefix for everything) |
| 7 | Linked blocks | Not now (copies only); revisit later if needed |

## 10. Approved additions

1. **Floating editor**: a Blocks flyout in its side rail (the same tiles, search and groups as the
   sidebar), and blocks in its palette search.
2. **Save as block from Word**: right-click an equation → floating editor → "Save as block" (the whole
   equation, or the selection in the editor); the dialog opens in the main window.
3. **Slot hints**: while filling, each empty slot shows its label (e.g. "frame") under it as a hint, and
   the status line shows "slot 2 of 3: frame".
4. **Live repeats**: a slot used more than once updates its other occurrences as you type in the first,
   not only when you leave it (this replaces decision 2's "when you leave it").

## 11. Build status

Built before the kinds model was proposed (kept on the branch `wip/blocks`, not in a release): storage
(database tables, document part, commands), the block model with unit tests, insertion and Space through
slots, live repeats, slot hints and status line, triggers, the Save as block dialog, the sidebar and
floating-editor panels, palette search and Ctrl+K, export/import; a headless editor check passes. After
the kinds model, this work is rebased onto it: slot kinds (§6b), stripping redundant font commands in
Save as block, then the cheat sheet section, per-document loading, the Word self-test and the docs.

Original build order (now as in §11): storage and the block model with unit tests →
insertion and slot filling in the editor (headless checks) → Save as block dialog → sidebar section,
palette search, Ctrl+K, cheat sheet, triggers → per-document blocks and export/import → Word self-test.
