# Visual improvement implementation plan

> **For agentic workers:** Execute inline using executing-plans. Steps use checkboxes for tracking.

**Goal:** Apply the supplied visual-pass specification to the existing local audio instrument, preserving its architecture and audio-reactive artwork.

**Architecture:** Keep React controls, native dialogs/popover, existing controller and Canvas scheduler. Translate literal presentation strings in their current owners; centralize repeated transport/action names in `src/app/copy.ts`. Use existing local Inter Variable and IBM Plex Mono assets, a font-independent SVG wordmark, and small shared CSS tokens.

**Tech stack:** React 19, TypeScript, Vite 7, native Canvas/Web Audio, Vitest, Playwright Chrome/Edge.

## Global constraints

- Preserve the exact product name **Visu@lizer** and external filenames/preset names.
- No framework, dependency, audio graph, DSP, routing, visualizer algorithm, or theme replacement.
- At most two UI font families. Controls 14–16 px; secondary text at least 12 px; touch targets at least 44 × 44 px.
- No new product features or branding surfaces. Existing app has no favicon or logo navigation.
- English sentence case; stable state-aware visible and accessible names.
- Record unavailable Firefox/WebKit/physical devices as unverified. No deployment or acceptance claim without all applicable evidence.

## Design decision

Three approaches considered: retain fonts with corrected hierarchy (chosen: smallest loading/layout risk); replace both fonts (unnecessary dependency and metric changes); custom display typography throughout (hurts reading and competes with plots).

Palette retains paper `#f7f7f5`, white `#ffffff`, ink `#161616`, secondary `#606060`, and dark counterparts `#0c0c0c`, `#141414`, `#f1f1ef`, `#aaaaaa`. Introduce a dedicated control boundary token distinct from decorative dividers. Primary font Inter Variable 400/500/600; values Plex Mono 400. Signature: a static, readable wordmark with an open, slightly displaced @ detail. No continuous logo animation. Keep asymmetric two-row plot composition and existing strip.

```
wordmark                                     import / theme / settings
status                                             freeze / fullscreen
spectrogram                           waveform
stereometer          oscilloscope             spectrum
transport / full track name / seek / options / volume / queue
```

Narrow layout retains stacked plots; import prompt gets its own layout space, avoiding plot controls. Player title gets a full row on phones, so transport cannot squeeze it away. Short-screen dialogs scroll internally.

## Task 1 — Baseline and focused regression reproduction

Files: `scripts/visual-pass.mjs`, `tests/browser/visual-pass.spec.ts`, `docs/verification/visual-pass/`, `docs/screenshots/visual-pass/`.

- [x] Run `npm test` and `npm run build`. Sandbox realpath EPERM is environmental; elevated runs pass (120 tests).
- [x] Capture matched empty/playing/paused and settings/queue/mobile-options screenshots; all eight specified viewport measurements.
- [x] Run a 60-second default Chrome playback with `long.wav`, 1440 × 900, DPR 1; save diagnostics.
- [x] Finish unchanged baseline `npm run test:browser` before editing production.
- [x] Add focused browser cases that reproduce obscured empty-state actions, desktop seek target, phone long-title loss, Strip header overflow, state-label mismatch, font-failure reflow, and modal navigation. Use geometry and real accessible controls rather than CSS-source assertions. Baseline tests reproduced three defects; additional cases verified the implementation, including a red/green review-found tablet defect.

## Task 2 — English and brand foundations

Files: `src/app/{App,Panels,Plot,icons,controller}.tsx/ts`, `src/app/copy.ts`, `src/settings/{schema,storage}.ts`, `src/player/importer.ts`, `src/audio/engine.ts`, `src/shared/units.ts`, `src/visualizers/{renderers,scheduler}.ts`, `index.html`, `src/assets/wordmark.svg`, `src/main.tsx`.

- [x] Translate UI literals without modifying identifiers, enums, stored values, formulas, or callbacks. Change only presentation literals in audio/rendering files.
- [x] Centralize transport names, play/pause, repeat and mute action labels; ensure titles match accessible actions.
- [x] Set HTML language and metadata to English.
- [x] Deliver editable SVG paths using local OFL font outlines or original geometry; no runtime font dependency.
- [x] Load local WOFF2 families without duplicate font declarations; keep character coverage for external text.
- [x] Update existing test locators/error expectations to English without changing regression logic.

## Task 3 — Typography, layout, interaction polish

Files: `src/app/styles.css`, minimal markup in `App.tsx`, `Panels.tsx`, `Plot.tsx`.

- [x] Define font/size/line-height, spacing, radius, control-border and motion tokens. Normal controls 14 px, body 14 px, metadata 12 px, tabular values.
- [x] Put import prompt in dedicated workspace row; make module headers and Canvas body flex to their actual available space.
- [x] Restore 44 px seek target; readable full-width phone track row; keep full track text accessible.
- [x] Resolve Strip header containment by placing actions beneath title consistently. Preserve focus sizing and plot pointer coordinate convention.
- [x] Give essential control boundaries 3:1 contrast and retain strong focus/selected/pressed cues. Preserve subtle motion and reduced-motion behavior.
- [x] Preserve all settings navigation on initial open; existing module-specific section jump remains.
- [x] Verify representative desktop/320 px compositions before global final checks.

## Task 4 — Verification and handoff

Files: `tests/browser/visual-pass.spec.ts`, `scripts/visual-pass.mjs`, `docs/VISUAL_PASS_2026-10-11.md`, `README.md`.

- [x] Run focused regressions, entire existing browser suite, unit tests, build, TypeScript, formatting/diff checks.
- [x] Test all eight viewports, changed breakpoint edges and intermediate widths, long multilingual content, keyboard focus/dismissal, touch-event emulation, reduced motion, blocked/delayed fonts, error/loading/empty/populated/paused/frozen/all-hidden states, both themes, all settings sections and presets.
- [x] Compare matched 60-second after run with before on the same installed Chrome; isolate from other playback measurements.
- [x] Capture matching after screenshots and check images visually; preserve baseline evidence.
- [x] Record inventory, defect register, font/logo rights, commands, browser versions, requirement mapping and unverified environments in final report. Report implementation separately from acceptance.

Self-review: all EN/BR/TY/UI groups covered by Tasks 2–3; responsive/regression evidence by Tasks 1/4. No missing product features will be added. Physical audio quality and unavailable browser engines cannot be certified by these desktop checks.
