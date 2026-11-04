# UX rework of the Tuner page

Status: done (2026-11-04), one commit per phase. Where the build differs
from the plan below:

- The DRAFT badge stays; only its stale "Vite port (M0)" note is gone
  (`site.statusNote` may now be empty).
- The cards that moved into analysis tabs lost their fold and its summary
  line (Corners, Tolerance, Sensitivity, EMI, Time, Assistant, Designs).
- Block cards hide their (i) while folded, so the header has room for the
  value summary.
- A Plotly race showed up in one browser-check run and got its own fix
  (`docs/BUGLOG.md`, 2026-11-04).

## Context

The Tuner page is one long scroll. Inputs sit on the left and the plot top right. Results, Corners, Tolerance, Sensitivity, EMI, Time, Assistant and Designs stack below the plot. The user hit three problems: too much scrolling, slow value editing, and too much small text in the results. The user is the only user and wants help text that can be shown or hidden.

The user's choices:
- Layout: two panes that scroll on their own. The right pane scrolls, with the status strip and the analysis tab bar stuck to its top.
- Narrow screens (390 px): a top tab bar for Inputs / Plot / Analysis.
- Editing: block cards fold to one line, clicking a schematic part opens and focuses its card, and fields get E-series step keys, wheel stepping, a slider range that follows the value, and wider fields with shorter sliders.
- Damping: one "Set Rd" menu with Q first. "For Q" stays on the Rd-Cd leg only.
- Hints: a global switch plus each card's (i).
- No other new features. No engine or number changes, so `parity.test.ts` must not move.

Each phase below is one commit. Each one passes the full "Done" list from CLAUDE.md and updates the `test/browser_check.py` checks it breaks.

## Phase 1: Two-pane shell and analysis tabs

**UI store (new file `components/ui-store.ts`).** Use the same `useSyncExternalStore` pattern as `state/store.ts`. This is view state only: it is not in the design, links, undo or `adopt()`.
- `panel`: the analysis tab. Kept in localStorage `input-filter-tuner-panel`.
- `area`: the narrow-screen tab ('inputs' | 'plot' | 'analysis'), default 'plot'.
- `hints`: the global switch (used in Phase 2). Kept in localStorage `input-filter-tuner-hints`, default off.
- `open`: a Set of open block ids (used in Phase 3). Kept in memory only.

Wrap every storage read and write in try/catch, as in `tool-card.tsx` `readClosed`.

**Page layout (`index.tsx`).**
- Use `<Main fixed fluid>`. The existing `data-layout=fixed` hook in `site-layout.tsx:26-34` makes the inset `h-svh`.
- The toolbar stays on top.
- Below the toolbar, a grid `@5xl/content:grid-cols-[400px_minmax(0,1fr)]` with `min-h-0`. Each pane is `overflow-y-auto min-h-0 overscroll-contain`.
  - Left pane: Converter, the extra converters, Source, blocks, Add block, Plot settings.
  - Right pane: the status strip (sticky top-0), then Circuit and Plot, then the analysis tab bar (sticky, just under the strip), then the active panel.
- Narrow (below `@5xl/content`): an area tab bar under the toolbar. It shows one pane at a time, and 'plot' also shows the analysis tabs below the plot, so the 390 px order stays circuit, plot, analysis. Inputs is its own tab.

**Analysis tabs (new file `components/analysis-tabs.tsx`).**
- The tabs: Results, Corners, Tolerance, Sensitivity, EMI, Time, Assistant, Designs.
- Copy the hand-made `role=tablist` buttons from `plot-card.tsx:40-54`, so both tab rows look the same.
- Every panel stays mounted and is hidden with the `hidden` attribute. This keeps the tolerance worker result, the assistant proposal and the existing ids (`#tolerance`, `#emi`, ...).
- EMI, Time and Assistant keep their on/off checkbox in the card header. Their tab label is dimmed while off.
- Remove the `collapse` prop from the cards that move into tabs (corners, tolerance, sens, emi, time, asst, designs). The tab replaces the fold. Keep `collapse` on Plot settings.

**Status strip (`status-strip.tsx`).** `go(id)` sets `panel` to the chip's tab and then scrolls that panel into view inside the right pane, instead of scrolling the window. Chips:
- Margin: Results.
- Worst corner: Corners.
- EMI: EMI.
- Hot-plug: Time.

**Small fixes.**
- Remove the stale "DRAFT · Vite port (M0)" badge in the site header.
- Move "click a part to edit it" into a hint (Phase 2).

## Phase 2: Hints

**Two components in `tool-card.tsx`.** Today `Hint` is used both for help text and for status text, so split it:
- `Hint`: help text that can be hidden. It reads a `HintScope` context and renders nothing when hidden.
- `Note`: status, empty-state and computed text, always shown. Examples:
  - `sensitivity.tsx:40` "No part values to vary"
  - `tolerance.tsx:167` (empty state) and `:230` (status line)
  - `assistant.tsx:377` (stage lines)
  - `emi.tsx:219` (the f0 hint)

**When a hint shows.** `ToolCard` provides `HintScope`: shown = global `hints` OR the card's own (i) toggle. Every card that contains a `Hint` gets the (i) button. Right now only cards with an `info` prop have it. `info` becomes a `Hint` at the bottom of the card body.

**Global switch.** A "Hints" toggle button in `toolbar.tsx` (lucide `Lightbulb`, `aria-pressed`). It stays on the same row: the browser check needs `#preset` and `#bExport` on one row.

**Text that moves into `Hint`.**
- Corners footer (`corners.tsx:63`).
- Sensitivity footer (`sensitivity.tsx:71`).
- Tolerance method line (`tolerance.tsx:319`).
- Time method (`time.tsx:126`).
- Assistant explanations (`assistant.tsx:142, 411, 434`).
- The EMI, Time and Assistant "off" descriptions (`emi.tsx:53`, `time.tsx:69`, `assistant.tsx:76`).
- In `block-card.tsx`: the bead formula note (`:207`) and the tolerance note (`:366`).
- The Circuit card's "click a part to edit it".

Block cards get their own `HintScope` and (i) as well.

**Stays visible.** Tile subtexts in `results.tsx` (they are data) and the plot note `#plotnote`.

## Phase 3: Block cards

**Fold (`block-card.tsx`).**
- The header gets a chevron that toggles the block id in `open`.
- While folded, the header shows a one-line summary next to the name, for example `22 µH · 20 mΩ · Rd-Cd`. The tol and curve badges ("1 tol", "4 pts") stay visible.
- Up, down, duplicate, remove and the enable checkbox stay in the header in both states.

**Summary text (new pure helper `components/block-summary.ts`).** Move the value choice out of `blockShape` in `schematic.tsx:254-311` (cap `n× C (−derate%)`, ind `L`, bead `Lb`, res `R`, rc `Rd`, `Cd`) into this helper. Both the schematic and the fold summary use it, so they always show the same values. Use `fmtSI` from `lib/si.ts`.

**Type label.** The `kind · label` span gets a `title`, so the cut-off text ("Capacitor ba...") can be read on hover.

**When a card opens.**
- On first load every block is folded.
- A block you add opens. `AddBlockCard` already scrolls to it.
- Duplicate opens the copy.

**Schematic click (`schematic.tsx:315-325` `focusField`).**
- It opens the block first and waits one animation frame for the rows to render.
- Then it scrolls inside the left pane (on narrow screens it also switches `area` to 'inputs'), focuses and selects the field.
- It flashes a ring on `#card-<id>` for about 1 s.
- This also covers the damping fields `dR` and `dL`, which exist only while their rows render.

`ConvCard` gets the same fold, with summary `P · fsw · η`.

## Phase 4: Value fields (`value-row.tsx`)

**Row layout.**
- New grid: `[label 88px | field 112px | slider 1fr]`. The unit moves inside the field as a right-aligned suffix (an absolutely placed span plus padding on the input), so the 22 px unit column goes away.
- Check that the 400 px left pane still fits the Vin min/nom/max trio and the bare fields.

**Step keys and wheel.**
- Fields with unit H, F or Ω: Up/Down step one E24 value, and Shift steps one E6 value. Use `stepE` from `engine/eseries.ts` (it is pure, so the folder rule allows it).
- Other log fields keep ×1.05 / ×1.25. Linear fields keep their 1 % / 5 % or ±1 steps.
- The wheel steps the same way, but only while the field has focus. Use a non-passive `wheel` listener on a ref, so the page does not scroll at the same time.
- Escape drops the draft and puts back the last value.

**Slider range that follows the value (log fields only).**
- The slider covers value/10 to value·10, clipped to [min, max].
- The window is set again on pointer up, and whenever the value changes from outside a drag (text, keys, undo, preset). It never moves during a drag, so the thumb does not jump.
- A value of 0 on a `zero` field uses the full range.
- Linear fields keep the fixed range.

Update the doc comment at `value-row.tsx:38-42`.

## Phase 5: Damping control (`block-card.tsx` `DampHelpers`)

**Rd-Cd leg.**
- One row: `Q [0.707] [Set Rd for Q]`, plus a `⋯` menu (`components/ui/dropdown-menu.tsx`) with Optimum (numeric) and Closed form.
- The "For Q" logic (`forQ`, `rdForQ`, the `_q` patch, the "rL alone" toast) stays as it is.

**Inductor Rd-Ld forms.** One "Set Rd" menu button with Optimum (numeric) and Closed form. There is no Q item.

**Text under the control.**
- One short visible line: `closed-form Rd 463 mΩ · peak 577 mΩ`.
- For Rd-Cd, also `Cd ≥ 140 µF`, shown only when Cd is below that value.
- Everything else from `InfoLines` (section name, n, Rd total, AC loss, C eff, SRF) moves into a `Hint`. Keep `id='info-<id>'` on the element that holds it.

Keep the `data-h` attributes (opt, cf, q, qv) on the menu items and buttons for the browser check.

## Phase 6: Docs

- `CLAUDE.md` "Look": replace the old rules ("leads with the circuit and the plot card", "new cards go below Results", "grid rows") with the two-pane layout, analysis tabs, area tabs on narrow screens, `ui-store.ts`, and Hint vs Note.
- Update the EMI, Time and Assistant wording at `CLAUDE.md` lines 114-116, 135-136, 154 and 175 where it says "card".
- `README.md`: update the UI description and the browser-check description.
- Save this plan as `docs/UX-plan.md` and add it to "Next" and to `ROADMAP.md`.
- Add an entry to `docs/BUGLOG.md` only if a bug turns up.

## Browser check changes (`test/browser_check.py`), done in the same phase as the change that needs them

- Add a helper `tab(name)` that clicks the analysis tab before any `inner_text` of a panel (tolerance, EMI, time, assistant, sensitivity, designs, corners).
- Add a helper `open_block(id)` before the `.fill` / `.press` calls on block fields (`:159-214`, `:274-305`, `:384-432`, `:456-473`, `:533`). The `m1b_editor` screenshot is taken with the card open.
- `:286` reads `#info-<id>` `textContent`. This still works while the hint is hidden only if the element is in the DOM. Turn hints on for that check instead.
- `:1040-1050` (Corners collapse persists): replace it with "the analysis tab persists across a reload".
- `:1034` (strip at top 0 after scrolling the window) and `:1070`: scroll the right pane instead, and assert that the strip and tab bar stay at the pane top.
- `no_hscroll`: also check `scrollWidth <= clientWidth` for both panes.
- `full_page=True` screenshots (`:243`, `:246`, `:433`): change them to element screenshots of the panes.
- Order at 390 px (`:1091-1092`): assert the area tabs. 'plot' shows `#sch` before `#pl1`. 'inputs' shows `#cv-vinMin`.
- New checks:
  - The global Hints switch shows and hides `text=negative resistance`, and (i) works with the switch off.
  - A schematic click on a folded block opens it and focuses `in-<id>-L`.
  - ArrowUp on a 22 µH field gives 24 µH (E24), and Shift+ArrowUp gives 33 µH (E6).
  - The wheel steps the field only while it is focused.
  - After a slider drag and release, the slider window is re-centred on the new value.
  - The EMI chip in the status strip switches to the EMI tab.

## Verification

- `npm test`, `npm run build && npm run build:single`, `python -I test/browser_check.py`, `npm run lint`, `npx prettier --check .`, `npm run knip`. Report the pass/fail counts per phase.
- `parity.test.ts` and the engine tests must not change. This work does not touch the numbers.
- Look at the screenshots in `%TEMP%\filter-shots` at 1440 and 390 px, dark and light, after each phase. Check in particular:
  - Both panes scroll on their own.
  - The strip and the tab bar stay stuck at the top of the right pane.
  - The folded block list.
  - The field width and the unit suffix.
  - The damping row.
- Single-file build: the analysis tabs and the hint switch work from `file://`. The `single_file.png` check is updated.
