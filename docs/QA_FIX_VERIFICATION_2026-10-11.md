# QA audit fix verification — 11 October 2026

All twelve confirmed findings in `VISUALIZER_QA_AUDIT_2026-10-10.md` have local fixes and regression coverage. The original audit remains unchanged. These results cover the local application; the deployed website has not been updated.

| Finding | Resulting behavior |
|---|---|
| H-01 | Pointer measurements use the renderer and projection that drew the plot, including local Spectrum buckets. |
| M-01 | Keyboard fade adjustment crosses Off and 2 seconds in both directions. Valid fractional values imported from presets retain their value and position. |
| M-02 | Store resets, source changes, seeks, and settings changes invalidate pinned measurements. Pause retains the displayed measurement. |
| M-03 | Focusing any module expands its height in Strip layout; collapsing restores Strip. |
| M-04 | Scope fill draws the extrema envelope for long windows as well as short windows. |
| M-05 | Waveform pointer inspection uses the displayed main-lane height and identifies the auxiliary history region separately. |
| M-06 | Stereometer inspection includes the same local gain, dB trim, and applicable automatic gain as drawing. |
| M-07 | Clearing the full analysis store resets RMS to zero; pausing and module-only clears preserve applicable signal state. |
| M-08 | Live latency and FPS require eligible capture and fresh frames. Idle redraw costs are separate; capture, performance configuration, enabled-module, and viewport changes reset timing samples. |
| L-01 | Transient notices can be dismissed and clear when operations resolve them. Durable storage failures remain visible. |
| L-02 | Malformed JSON produces a Russian syntax message. Rejected imports leave settings unchanged. |
| L-03 | Diagnostics show effective FPS/DPR and cap reasons separately from saved preferences and observed FPS. |

## Verification

- `npm test`: 120 tests passed in 11 files.
- `npm run build`: TypeScript and production Vite build passed.
- `npx tsc --noEmit --incremental false`: passed.
- `git -c core.safecrlf=false diff --check`: passed.
- Audit regressions plus existing settings accessibility checks: 22 browser cases passed across Chrome and Edge.
- Existing acceptance checks for multichannel downmix, mono/anti-phase/silence, plot freezing, audio recovery, rapid seeks, layout linking, focus, keyboard controls, and duplicate/corrupt queue handling: 10 browser cases passed across Chrome and Edge.
- Read-only code review completed; the resulting fixes preserve imported fractional fade values and reset telemetry when the viewport or enabled module set changes.

Browser tests used Playwright at desktop and mobile viewport sizes. Scope raster checks use native canvas contexts with `willReadFrequently` to keep repeated pixel reads on a consistent raster backend.

Physical Android/iOS devices, Safari, Firefox, physical audio output, and the audit's remaining untested combinations have not been certified by these local checks.
