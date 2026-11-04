# Input Filter Tuner

A one-file browser tool for tuning DC-DC converter input filters. It shows the
circuit, Zout against the converter's Rn, H/S21, Zin and the Middlebrook check.
`README.md` has the user-facing description.

## Next: port to Vite + TypeScript (decided 2026-11-04)

The next job is milestone M0 in `ROADMAP.md`: port this tool to the user's
template `D:\KiCAD\KiCAD Templates\web-site-starter`.
- Read M0 for the decision, the template's gaps and the outline.
- Plan the port and get the user's approval before writing code.
- Open question for that plan: single-file double-click build, or GitHub Pages.
- The other milestones wait until M0 is done; the user picks them from `ROADMAP.md`.

## Layout

- `index.html` holds everything, with no build step and no npm packages.
  Plotly is pinned to 2.35.3 from cdnjs.
  - The engine sits between `// ENGINE-START` and `// ENGINE-END`. The tests cut
    the engine out by these markers, so keep them, and keep the engine free of
    DOM access.
  - The UI script follows the engine.
- `test/`: the engine test and the browser check.
- `references/`: app-note PDFs. Their equations are images, so the text
  cannot be extracted.

## Done means both suites pass

```
node test/engine.test.mjs        # engine vs. report numbers and regression cases
python -I test/browser_check.py  # headless installed Chrome (channel "chrome")
```

Report the pass/fail counts. For an engine bug, add a check that fails before
the fix. Screenshots go to `%TEMP%\filter-shots`. Look at them after any change
to the layout or plots.

## Ground truth

The numbers come from the user's design reports in
`C:\Users\AORUS\Documents\Github\document-archive\documents`:
- NP-DR-26001, NP-DR-26003, NP-DR-26004
- AOH-DR-26006
- LQRx `Reports/02_Power_State` and `Reports/03_Buck_1p1MHz`

Every preset and engine check traces back to one of these. When the tool
disagrees with a report, check the report's definition before changing the
math. For example, D4's 54.6 dB is the Lb = 0.8 µH case.

## Definitions (keep them consistent with the reports)

- Rn = −Vin²·η/P is flat. It holds only up to `fcheck`, so both the peak
  search and the Nyquist scan stop there.
- Zout is seen from the converter with the source voltage shorted. Rsrc and
  Lsrc stay in the path.
- H = Vout/Vsrc, with the converter side open by default. S21 covers the
  filter blocks only, between 50 Ω ports.
- Q is the series form Q = Re(Zout(f0))/Z0, which matches the reports.
  Peak/Z0 is shown separately.
- Closed-form optimum damping: only the Rd-Cd, parallel Rd-Ld and series
  Rd∥Ld forms are used. Each one was verified against the numeric optimizer.
  A new closed form needs the same check in the engine test.

## Gotchas

- **Narrow peaks.** A coarse grid steps over high-Q resonances. `peakZout` and
  the Nyquist check bisect each sign change of Im(Zout). Keep that when you
  touch either one.
- **Stage lookup.** Use `sectionOf(st, id)` for anything about one damping
  element (closed form, Rd for Q, Cd hint). `primary` is the stage nearest
  the converter and feeds only the summary tiles.
- **Untrusted input.** `adopt()` is the only entry point for links, JSON files
  and localStorage. It whitelists fields and converts each one to a number.
  A new state field needs a line there. Any string that reaches innerHTML goes
  through `esc()`.
- **New block type.** Add a `TYPES` entry, then cover it in `zBlock`, `dcR`
  (series blocks), `isInductive` (if it is a series L) and `blockShape`.
  `adopt` picks up its parameters from `TYPES[type].p`.
