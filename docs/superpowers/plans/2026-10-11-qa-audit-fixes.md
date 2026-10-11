# QA audit fixes

**Goal:** Repair all twelve confirmed findings in VISUALIZER_QA_AUDIT_2026-10-10.md, preserving existing audio behavior and settings validation.

**Architecture:** Pointer inspection uses the scheduler's rendered PlotRenderer. Store reset generations invalidate measurements. Capture eligibility and fresh frames govern live telemetry; idle render costs are separate. Existing React controls retain their settings semantics.

**Validation:** Add failing regression tests first, run each affected group after fixes, then run the complete Vitest suite, TypeScript/build, and Chromium browser scenarios. Physical-device and browser coverage gaps from the audit remain outside this local repair.

- [x] H-01: Share drawing and measurement renderer in scheduler.ts and Plot.tsx. Browser test compares local buckets at multiple pointer positions and plot sizes.
- [x] M-01: Map fade slider positions to 0, 2–20 seconds in schema.ts/Panels.tsx. Browser test checks both keyboard transitions around Off.
- [x] M-02/M-07: Advance store reset generations and reset RMS on full clear; invalidate Plot tooltips on reset/configuration. Test pause retention, source/seek/Clear/Undo invalidation and empty accessibility text.
- [x] M-03: Remove Strip workspace styling during focus in App.tsx. Browser test checks all modules at 1440 and 1920 px and restores Strip on collapse.
- [x] M-04: Fill extrema scope envelopes in renderers.ts. Test short/long windows at narrow and desktop widths with fill on/off.
- [x] M-05: Use rendered main-lane height for Waveform hit testing and suppress auxiliary-region main measurements. Test Off/Fast/Slow boundaries.
- [x] M-06: Use the same effective Stereometer gain calculation for rendering and measurement. Test M/S, L/R, auto, local gain and trim.
- [x] M-08: Gate live telemetry on eligible capture and fresh frame identity, separate idle costs, segment on capture/configuration/reset boundaries. Unit and browser tests ensure paused redraws cannot inflate latency/FPS.
- [x] L-01: Clear transient notices on new operations and resolution; provide dismissal, preserving storage warnings. Browser test covers failed/valid JSON, queue clear and dismiss.
- [x] L-02: Translate JSON SyntaxError in parsePreset without changing atomic validation. Unit and browser tests verify localized failure and unchanged settings.
- [x] L-03: Pass scheduler effective FPS/DPR and cap reasons to settings diagnostics, separate from observed FPS. Browser test covers mobile/Economy/stored preferences.

Review final diff and test outputs. Leave fixes in the user's workspace; no deployment or publication requested.
