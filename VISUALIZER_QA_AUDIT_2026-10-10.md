# Visu@lizer QA audit — 10 October 2026

**Result: 12 confirmed findings — 0 Critical, 1 High, 8 Medium, 3 Low. No implementation changes or fixes were made.**

Live target: [visualiser-zeta.vercel.app](https://visualiser-zeta.vercel.app/). Source: [RUNU228/Visu-liser-](https://github.com/RUNU228/Visu-liser-). Audit date: 10 October 2026, Europe/Kiev. Timestamped sustained-playback observations are in the evidence files.

This is a comprehensive audit of the controls and states accessible in the available browser, not certification of every browser, physical device, failure injection, or combination of settings. Important unverified cases are listed explicitly below.

## Basis, environment, and evidence

- Exercised the deployed application through its real UI: file choosers, buttons, sliders, native selects, queue, settings dialog, plots, mobile popover, and fullscreen.
- Browser: Codex in-app browser, Chromium based, on this Windows workspace. Exact embedded browser version and physical output quality were not exposed by the available browser interface. The application's reported audio sample rate was 48 kHz.
- Tested viewport widths: 360, 390, 768, 1024, 1440, 1920 px. These are responsive viewport tests, not physical Android/iOS or touch-device tests.
- Compared behavior with [the authoritative specification, version 1.2](https://github.com/RUNU228/Visu-liser-/blob/main/Visualizer_TZ_EN.md).
- Read GitHub source directly through the GitHub connector. Twelve retrieved files, including the specification, UI, settings, renderers, store, scheduler, importer, controller, and audio engine, had Git blob hashes matching the local files reviewed. Local commit: 08d7555e8f8e5fb5d3f2618c7fc23ff7aaad9d8f. The deployment does not expose a verified build commit; source attribution is based on the matching implementation and reproduced behavior.
- Existing numerical/integration suite: **107 tests passed in 11 files**. The first sandboxed run failed before test execution because Node realpath was denied; the same suite passed outside that restriction. This was an environment failure, not an application defect.
- TypeScript: **npx tsc --noEmit --incremental false passed**. No build output was regenerated.
- Git working tree was clean at the start and remained clean during verification. Audit artifacts and extra synthetic fixtures are stored outside the repository.
- No console warnings/errors were returned by the browser log API during exercised scenarios. No visible application crash occurred. This does not establish the absence of every uncaught browser/Worker error in untested failure states.

Screenshots and machine-readable observations are in the adjacent qa-evidence directory. Source line references below are to the inspected local implementation and matching GitHub files.

## Severity summary

| Severity | Count | Findings |
|---|---:|---|
| Critical | 0 | None confirmed |
| High | 1 | H-01 Spectrum measurement reports the whole-range maximum |
| Medium | 8 | M-01 Fade keyboard trap; M-02 stale pinned measurement; M-03 Strip focus height; M-04 long-window scope fill; M-05 wrong Waveform lane; M-06 incorrect Stereometer gain; M-07 stale empty RMS; M-08 paused latency accounting |
| Low | 3 | L-01 stale notices; L-02 untranslated JSON errors; L-03 missing effective FPS/DPR diagnostics |

## Critical

No Critical issue was confirmed. In the tested environment, import, playback, transport, and all five primary visualizers operated without a general application failure. This is not a claim that the outstanding browser/device matrix is certified.

## High

### H-01 — Spectrum cursor measurement always uses almost the full frequency range

**Affected feature:** Spectrum tooltips, raw level measurement, adjusted levels, frequency/note labeling.

**Reproduction:**

1. Import stereo16.wav, play until the graph contains a spectrum, then pause.
2. Inspect the Spectrum canvas by clicking at the center, near the low-frequency end, and near the high-frequency end.
3. Compare the tooltip range and level while inspecting different positions.
4. Optionally enable frequency/note labels or tilt; the wrong bucket also drives those derived values.

**Expected:** A tooltip measures the frequency bucket under the pointer, using the same pixel projection as the displayed graph, and reports that bucket's raw dBFS. Different horizontal positions should correspond to different frequency ranges.

**Actual:** The tooltip reported **18 Hz–20 kHz, -12.16 dBFS** over the tested positions, with an adjusted value of -16.13 dB in the captured settings state. It effectively reports the maximum across almost the entire plotted spectrum. Silence similarly reports 18 Hz–20 kHz rather than a local bucket.

**Probable technical cause:** Plot creates an independent PlotRenderer solely for measurement. RenderScheduler owns another renderer that performs the drawing. The measurement instance is never rendered, so its spectrumPixels stays at its initial value of 1. measure() therefore asks spectralPixel() to aggregate one bucket spanning the whole graph. The separately initialized spectrogram projection state also deserves review, although this finding is specifically confirmed for Spectrum.

**Relevant source:** [Plot.tsx:43](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Plot.tsx#L43), [scheduler.ts:31](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/scheduler.ts#L31), [renderers.ts:54](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L54), renderers.ts:790 and 832–848; geometry.ts spectralPixel().

**Recommended fix:** Share the rendered instance or an explicit projection description with hit testing. Supply actual plot dimensions and frequency mapping to measurement. Add a browser regression test that inspects several distinct x positions and compares them with the displayed pixel buckets; direct renderer unit tests alone missed the integration error.

**Evidence:** qa-evidence/spectrum-tooltip.jpg and spectrum-tooltip-high-frequency.jpg. Specification §§7.4, 12.2.

## Medium

### M-01 — Spectrogram fade cannot be enabled with normal arrow-key increments from Off

**Affected feature:** Spectrogram settings; keyboard accessibility of history fade.

**Reproduction:**

1. Open Spectrogram settings with History fade at 0.
2. Focus “Затухание истории”.
3. Press Right Arrow.
4. Repeat the key, or set fade to 2 and press Left Arrow.

**Expected:** Keyboard adjustment moves between valid choices: Off and 2–20 seconds. The UI must not offer a value its own validator rejects.

**Actual:** The first increment requests 1 second, displays “Недопустимое значение: Затухание истории.”, and the controlled slider stays at 0. Repeated single increments keep encountering the same rejected value. The downward transition through 1 has the same mismatch.

**Probable technical cause:** The control is a continuous 0–20 range with step 1, while validateSettings explicitly rejects nonzero fade below 2.

**Relevant source:** [schema.ts:183](https://github.com/RUNU228/Visu-liser-/blob/main/src/settings/schema.ts#L183), schema.ts:282–287; [Panels.tsx:Field](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Panels.tsx#L258).

**Recommended fix:** Represent Off separately, or map keyboard/slider positions to the valid sequence 0, 2, 3, …, 20. Keep validator and control domain consistent. Test both transitions around Off.

**Evidence:** Live control remained at 0 after Right Arrow with the validation notice. Specification §8.3.

### M-02 — Pinned tooltips survive track changes and show obsolete measurements

**Affected feature:** Plot measurement lifecycle across track selection, seeking, clear, and analysis resets.

**Reproduction:**

1. Play anti.wav and click Stereometer to pin its measurement.
2. Confirm correlation -1.000.
3. Press Next to play silence.wav.
4. Observe the pinned tooltip and the current correlation displayed by the plot.

**Expected:** When the source/session changes, dismiss or invalidate the old measurement. A retained snapshot must identify the previous track/time explicitly; it must not appear to describe the current plot.

**Actual:** The current track was silence and current correlation was undefined, but the pinned tooltip continued to show **ρ=-1.000, gain 1.46×**. A Spectrum tooltip also survived Clear and subsequent imports while new graphs contained different data.

**Probable technical cause:** Tooltip text and pin are local React state. They update on pointer interaction but have no reset dependency on active track, session, seek boundary, or store clear. The mounted Plot retains that state through these operations.

**Relevant source:** [Plot.tsx:39](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Plot.tsx#L39), Plot.tsx:50–61 and 104–131; audio/engine.ts:646–665, 746–758, 803–815.

**Recommended fix:** Clear pinned measurement on relevant session/discontinuity changes. Alternatively retain a structured snapshot with explicit track/time identity and visibly label it as historical. Test source changes, seek, Clear/Undo, and numerical configuration changes.

**Evidence:** qa-evidence/stale-pinned-measurement.jpg. Specification §§8.3, 10.3, 12.2.

### M-03 — Focus mode in Strip remains only 256 px tall

**Affected feature:** Desktop module focus from Strip layout.

**Reproduction:**

1. At 1440 or 1920 px, select “Полоса · от 1440 px”.
2. Click “Развернуть Spectrum”, or focus another module.
3. Compare focused module height with focus in Composition.

**Expected:** Focus expands the module within the workspace consistently with the focus layout. The focus height rule is 560 px on desktop.

**Actual:** The module expanded horizontally but remained **256 px high**. At 1920 px the measured focused Spectrum was 1856 × 256 px.

**Probable technical cause:** The workspace retains both strip and focus-mode classes. Equal-specificity .strip .module rules occur after .focus-mode .module; the later 256 px rule overrides the 560 px focus height.

**Relevant source:** [App.tsx:workspace classes](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/App.tsx#L289), [styles.css:338](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/styles.css#L338), styles.css:348 and 1001–1005.

**Recommended fix:** Give focused layout explicit priority or remove Strip styling while focused. Preserve the requested layout for restoration. Verify every module at both desktop Strip widths.

**Evidence:** qa-evidence/strip-focus.jpg; measured DOM bounds. Specification §5.1.

### M-04 — Oscilloscope fill does nothing for sufficiently long windows

**Affected feature:** Oscilloscope Fill control, Free mode, long captured windows, narrow plots.

**Reproduction:**

1. Play a nonzero stereo tone.
2. Set Oscilloscope to Free and its window to 100 ms at 48 kHz.
3. Pause after a complete frame.
4. Toggle “Заливка” on and off in the normal desktop composition; repeat at mobile width.

**Expected:** Fill visibly fills the captured waveform or its extrema representation for the selected window, regardless of whether the renderer has downsampled it for display.

**Actual:** The long window uses per-pixel vertical extrema strokes and has no filled area even with Fill enabled. The toggle is ineffective in this rendering branch.

**Probable technical cause:** traceScope() switches to extrema rendering when values.length > width*2. The fill block is explicitly restricted to values.length <= width*2. A 100 ms/48 kHz frame contains roughly 4800 samples, exceeding this condition for ordinary desktop and mobile plot widths.

**Relevant source:** [renderers.ts:traceScope](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L687), especially 695 and 711.

**Recommended fix:** Draw a filled envelope for the extrema branch, preserving actual minima/maxima, or otherwise implement consistent fill semantics for both branches. Test 5–100 ms windows at desktop and mobile widths.

**Evidence:** qa-evidence/scope-long-fill-on-full.jpg and scope-long-fill-off-full.jpg, plus the explicit rendering condition. Specification §11.3.

### M-05 — Waveform tooltip can identify the wrong lane when band history is enabled

**Affected feature:** Waveform lane hit testing with auxiliary band history.

**Reproduction:**

1. Keep Lane 1 = Side and Lane 2 = Mid.
2. Enable slow or fast band history.
3. Play a stereo tone, then pause.
4. Inspect a point just inside the upper edge of the second main lane: approximately v=0.45 in normalized plot coordinates.

**Expected:** The tooltip identifies Mid and reports the second lane's statistics.

**Actual:** At a point belonging to the second rendered lane, the tooltip identified **S**, with min -0.1904, max 0.0954 and RMS 0.1004 in the captured test.

**Probable technical cause:** Drawing subtracts 28 px from the main plot height for auxiliary band history and divides the remainder between the lanes. Hit testing always chooses the first lane below v=0.5; it does not use the reduced main-lane height. It also treats the auxiliary band area as a main lane.

**Relevant source:** [renderers.ts:341](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L341), [renderers.ts:918](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L918); Plot.tsx:53–56.

**Recommended fix:** Share lane rectangles between drawing and hit testing. Handle auxiliary history as its own region, or suppress main-lane measurements there. Test pointer locations around each boundary with band history Off/Fast/Slow.

**Evidence:** qa-evidence/waveform-wrong-lane.jpg. Specification §§9.2–9.3.

### M-06 — Stereometer tooltip reports an auto-zoom gain that is not applied

**Affected feature:** Stereometer measurement/gain disclosure in M/S and L/R modes.

**Reproduction:**

1. Use ordinary M/S geometry, visual gain 1×, and visual trim 0 dB.
2. Play anti.wav.
3. Inspect Stereometer.

**Expected:** Report the applied display gain, which is 1× in these settings, or distinguish an unused calculated auto-zoom factor from applied gain.

**Actual:** The tooltip reported **“усиление 1.46×”** although ordinary M/S geometry did not apply auto-zoom.

**Probable technical cause:** The renderer applies frame.autoGain only when geometry is auto. The tooltip always prints store.stereometer.autoGain and does not account for geometry, local visual gain, or global trim.

**Relevant source:** [renderers.ts:487](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L487), [renderers.ts:935](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/renderers.ts#L935).

**Recommended fix:** Calculate and label the effective display multiplier using the same formula as rendering. Show auto factor separately only when applicable. Test M/S, L/R and auto geometry with non-default gain and trim.

**Evidence:** The anti-phase tooltip and stale-pinned screenshot contain the 1.46× value. Specification §13.2.

### M-07 — Clearing a nonzero signal leaves a stale RMS accessibility summary

**Affected feature:** Waveform textual summary in empty/new-session states.

**Reproduction:**

1. Play stereo16.wav until RMS is nonzero.
2. Clear the queue.
3. Inspect the Waveform description through the accessibility tree or a screen reader.

**Expected:** Empty graphs with no current signal report zero or explicitly unavailable current RMS.

**Actual:** The queue was empty and graphs were cleared, but the textual summary still said **“Текущий RMS: 0.3470.”** The same scalar can survive source/seek resets until another analysis result arrives.

**Probable technical cause:** AnalysisStore.clear() resets histories, frame references and time, but does not reset rms. Plot interpolates that retained scalar into its current summary.

**Relevant source:** [store.ts:22](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/store.ts#L22), [store.ts:57](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/store.ts#L57), [Plot.tsx:139](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Plot.tsx#L139).

**Recommended fix:** Reset global current-signal scalar state on a full session clear, and express “no current data” where appropriate. Preserve the latest value on an ordinary pause. Test Clear and source changes separately from Pause.

**Evidence:** Observed accessibility text after Clear. Specification §§5.3, 15.

### M-08 — Paused redraws contaminate live latency and FPS statistics

**Affected feature:** Performance diagnostics and acceptance evidence.

**Reproduction:**

1. Reload, import long.wav, play briefly in default settings.
2. Pause and open settings.
3. Note latency p95.
4. Leave playback paused and change theme repeatedly; the controlled test used 40 alternating theme selections.
5. Read the diagnostics again.

**Expected:** Live-stream latency statistics sample eligible active capture with fresh results. Time spent paused should not count as visualization lag. Active rendering statistics should distinguish idle redraws.

**Actual:** Reported latency p95 rose from **29.4 ms to 17,720.0 ms**; FFT-center p95 rose from **69.3 ms to 17,762.7 ms**. Playback was paused throughout and no processing backlog was established.

**Probable technical cause:** Scheduler records every dirty redraw. recordRender() samples context.currentTime minus a retained latestFrame whenever that frame is nonzero, without checking active capture or result freshness. The context keeps advancing while media is paused. Frame-time intervals also include idle gaps. The rolling statistics mix measurement regimes.

**Relevant source:** [scheduler.ts:90](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/scheduler.ts#L90), [store.ts:212](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/store.ts#L212), store.ts:220–243; Panels.tsx:530.

**Recommended fix:** Gate latency/FPS acceptance samples on active eligible capture and fresh analysis results. Reset or segment timing series across pause, buffer, freeze, hidden, interruption and configuration boundaries. Keep idle redraw cost separate. Do not interpret the reproduced 17.7-second diagnostic as actual live audio latency.

**Evidence:** qa-evidence/paused-diagnostics.json and paused-diagnostics.jpg. Specification §14.2.

## Low

### L-01 — Resolved error and duplicate notices remain indefinitely

**Affected feature:** Global status line and queue/settings panel notices.

**Reproduction:**

1. Import a corrupt file or exceed the 100-track cap.
2. Remove the failed file or clear the queue.
3. Successfully import a small valid queue, or complete a valid JSON import after an invalid one.
4. Reopen queue/settings.

**Expected:** A resolved notice is dismissed, marked historical, or replaced by relevant completion/status information.

**Actual:** The “limit-101.wav: …100 files” message remained above a later three-track queue. Corrupt-file, duplicate, fade-validation and oversized-JSON notices similarly persisted after unrelated successful operations.

**Probable technical cause:** AppController retains one message string. notify() replaces it only when another notice arrives; successful operations and resolution do not clear it, and the UI has no dismiss action.

**Relevant source:** [controller.ts:60](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/controller.ts#L60), App.tsx status-line, Panels.tsx ModalPanel.

**Recommended fix:** Track notice lifecycle and association with the operation/row. Clear resolved notices or provide dismissal; preserve active durable warnings such as unavailable storage.

**Evidence:** Queue screenshot after successful re-import and the valid-JSON test retaining the oversize warning.

### L-02 — Invalid JSON exposes an English engine error in the Russian UI

**Affected feature:** Preset JSON import error handling.

**Reproduction:**

1. Open Presets.
2. Import invalid.json containing only an opening brace.

**Expected:** A concise Russian explanation that the JSON is invalid, optionally with a useful line/column.

**Actual:** The notice was **“Expected property name or '}' in JSON at position 1 (line 1 column 2)”**.

**Probable technical cause:** JSON.parse throws a SyntaxError, and the UI forwards error.message verbatim for any Error. The localized fallback is used only for non-Error exceptions.

**Relevant source:** [storage.ts:67](https://github.com/RUNU228/Visu-liser-/blob/main/src/settings/storage.ts#L67), [Panels.tsx:659](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Panels.tsx#L659), Panels.tsx:661–667.

**Recommended fix:** Translate known syntax/validation error categories and keep technical parsing detail secondary. Preserve atomic rejection: malformed imports must leave settings unchanged.

**Evidence:** Live malformed-file import result. Specification introduction and §13.

### L-03 — Effective FPS/DPR are not disclosed in the settings diagnostics

**Affected feature:** Performance settings on mobile and in Economy mode.

**Reproduction:**

1. At 360 px, select a stored 60 FPS preference and DPR cap 2.
2. Enable Economy.
3. Inspect the diagnostics beneath the performance controls.

**Expected:** Retain stored preferences but show the effective rendering target/cap after mobile, device DPR and Economy policies are applied.

**Actual:** The UI shows the selected preferences and generic Auto/Economy explanatory text, memory, latency and gap metrics, but no effective FPS/DPR values. The user cannot inspect the applied cap from this UI.

**Probable technical cause:** RenderScheduler computes effective fps/dpr, but the SettingsPanel diagnostic block does not receive or render that result. Stored selections are not an indication of the effective values.

**Relevant source:** [scheduler.ts:54](https://github.com/RUNU228/Visu-liser-/blob/main/src/visualizers/scheduler.ts#L54), [Panels.tsx:515](https://github.com/RUNU228/Visu-liser-/blob/main/src/app/Panels.tsx#L515).

**Recommended fix:** Expose effective target FPS and DPR separately from stored preferences, with the reason for an active cap. Keep observed FPS separate from target FPS.

**Evidence:** Live desktop/mobile settings inventory and source. Specification §13.2.

## Functional coverage and observed passes

| Area | Coverage and result |
|---|---|
| Empty state | No active track; Play/Previous/Next/Seek disabled; both add-audio entry points work; empty queue message; all-hidden restore action |
| Audio import | Multi-file preparation, import without autoplay, optional formats, duplicates Skip/Add again, per-file failures, retry, cancel, queue-slot cap |
| Mandatory formats | PCM16 WAV, PCM24 WAV and MP3 all played with primary stereo/pitch analysis |
| Optional formats | FLAC, M4A/AAC, OGG Vorbis, OGG Opus and WebM Opus all played with primary analysis; this is fixture/browser-specific |
| Error files | Corrupt MP3, empty WAV and non-audio text rejected without crashing; a queue containing only failures kept transport disabled |
| Size/count boundaries | 250 MiB + 1 byte rejected; 101 unique files retained exactly 100 rows with a limit notice; failed rows occupy queue slots |
| Cancel import | Cancelled an active 100-file batch through queue control: 69 completed rows retained, pending rows removed, no pending state remained |
| Playback/pause/resume | Verified primary playback and pause/resume through real controls; graphs retained on pause |
| Seeking | Home, ArrowRight, global ±5 seconds and Shift ±15 seconds; pointer click, drag, release outside, then resume also worked. On the 660-second fixture, click at roughly 25% committed 163.2 s; drag to roughly 75% committed 497.1 s; release outside near 50% committed 330.1 s |
| Volume/mute | 0 and 100% endpoints; mute/unmute labels; analysis continued while output was muted; physical output level was not measured |
| Previous/Next | Paused and playing selection, restart behavior, manual navigation at exhaustion, final ended state, rapid switches |
| Queue selection/removal | Selected tracks; removed inactive mono without intentionally stopping transport; removing active long selected its visible successor and continued playback |
| Reorder | Move Up/Down worked on desktop and mobile; raw pointer drag attempted but did not reorder in this automation surface—see limitations |
| Clear/Undo | Clear stops playback and empties queue; Undo restores former track/position without autoplay; Undo action disappears after deadline |
| Repeat | All three states cycled, repeat-one playback observed across cycles, manual next bypassed repeat-one; repeat-queue navigation exercised |
| Shuffle | Visible list stayed unchanged; traversed seven distinct unvisited IDs after enabling from the eighth; exhausted Next retained the last ID; Previous/Next history replay exercised |
| Rapid interaction | Twenty rapid Previous/Next switches and repeated Play/Pause; no captured console errors or visible crash |
| Spectrogram | Both orientations, Scroll/Sweep, all FFT sizes/windows/scales/channels, range/gamma/grid/labels/fade endpoints, focus and inspection |
| Waveform | All lane options, lane 2 Off, styles, gain, history/speed, RMS toggle, fast/slow auxiliary histories, focus and inspection |
| Stereometer | M/S, L/R and auto geometry, window/persistence/point-size/gain endpoints, grid/labels/correlation/bands, focus and inspection |
| Oscilloscope | Pitch/Free, cycles 1/2/4, all channels/triggers, trigger level/gain/persistence/window endpoints, fill toggle, focus and inspection |
| Spectrum | Line/Bars/Both, smoothing/tilt endpoints, all FFT/window/scale/channel options, floor/ceiling, peaks/note, focus and inspection |
| Synthetic signals | Mono correlation +1.000, antiphase -1.000, silence zero RMS/undefined correlation; real plots showed distinct signal representations |
| Settings | 58 appearance/performance/module controls exercised; layout/order/visibility, restore/reset, trim, linked duration and disabled unlinked controls also tested |
| Presets | Four built-ins, user save/apply/rename/delete, JSON export, valid import, malformed/future/oversized imports; queue and transport survived settings operations |
| Persistence | Reload retained settings and started with an empty queue and fresh transport |
| Responsive UI | All six required widths; Composition below Strip threshold; Strip at desktop widths; mobile player popover, queue and settings; no horizontal page overflow |
| Fullscreen | Entered browser fullscreen and opened module settings there; the automation did not exit it with Escape, so normal native Escape exit is unverified |
| Keyboard/accessibility | Named controls and sliders; global Space/seek/M/Q; settings/queue focus movement; native sliders; mobile menu Escape; the RMS summary defect is listed above |
| Static verification | 107 numerical/integration tests passed; TypeScript passed; existing analysis/lifecycle/storage tests reviewed |

### Codec observations

All eight fixtures played in the live app. Stereo correlation was about 0.870 (AAC around 0.874), and pitch was about 106.5–106.6 Hz for the common synthetic input. These signals are consistent with the fixtures, and show the stereo and pitch primary path was active. Results are stored in qa-evidence/codec-runs.json.

Raw ADTS .aac, alternative WAV codecs, arbitrary codec profiles, extremely long unusual files and other browsers were not separately certified. The UI appropriately describes optional codecs as browser dependent.

### Performance assessment

No visible general freeze or transport failure was established during normal tested interactions. Physical listening was not performed, so audible quality and dropouts are not certified. Default live diagnostics initially showed p95 around 29–43 ms and a 24.2 MiB conservative analysis reservation; settings stress increased gap counts and temporarily changed diagnostic values. Those stress samples should not be mixed with steady-state acceptance measurements.

The controlled paused-redraw test establishes M-08, a diagnostics correctness defect. A separate default playback run was observed after **343 elapsed seconds**, with all five modules enabled, the AudioWorklet + Worker path active, and output muted. It remained in Playback and reported latest-sample p95 **34.7 ms**, FFT-center p95 **77.3 ms**, device output latency **10.0 ms**, reservation **24.2/64 MiB**, and **3 history gaps**. No console warnings/errors were captured. The gap count means this observation is not a claim of perfectly continuous analysis. The timestamp, status, logs and diagnostics are in qa-evidence/steady-playback.json; the screenshot was captured shortly afterward. These are UI observations, not independent profiling, render-FPS, actual heap or leak measurements.

Existing repository evidence reports a separate 60-second Chrome run at 59.88 median FPS, 8.6 ms render p95, and 26.69 ms latest-sample latency p95, plus a ten-minute soak and ownership cleanup. These are **previous project records**, not newly repeated audit measurements. I did not rerun scripts that launch their own browser or overwrite the repository's evidence. No new 10-minute leak certification is claimed.

## Outstanding cases and audit limits

These are coverage gaps, not fabricated application bugs or passes.

1. **Required browser/device matrix:** Firefox, macOS Safari, preceding Chrome/Edge majors, Android Chrome and physical iOS Safari were unavailable through the available browser control surface. The README also records these as outstanding. Full release acceptance requires their mandatory codecs and five-module primary path.
2. **Physical touch and audio output:** Mobile viewport testing does not validate gestures, decoder behavior, OS interruptions, safe-area handling on a physical device, headphone routing, preserved pitch by listening, or absence of audible dropouts.
3. **Drag/drop:** Up/Down reorder passed. A pointer drag of the first row to the third row did not reorder in the available automation. The source has HTML drag handlers, but the tool did not expose a reliable native HTML/file drag path. Treat drag reorder and OS file drop as needing a manual check; do not classify this ambiguous result as a confirmed product bug.
4. **Pointer seeking:** Click, drag, release outside and resume passed through desktop pointer automation; observations are in qa-evidence/pointer-seek.json. Intermediate preview timing and physical mobile touch scrubbing remain unverified.
5. **Fullscreen exit:** Entry and settings inside fullscreen worked. Escape through this automation did not exit browser fullscreen. A reload ended the test. Verify native Escape behavior manually before classifying this as an app or embedded-browser problem.
6. **Failure injection:** No source, runtime or network behavior was altered to force Worker/worklet failure, buffering, storage denial/quota, context interruption, or metadata timeout. Existing unit tests cover several of these with test doubles; that is not a live recovery demonstration.
7. **Reduced motion and lifecycle:** CSS/media-query handling and lifecycle code were reviewed, and existing tests cover them. No physical OS reduced-motion toggle, background/suspend/recovery certification, or bfcache matrix was performed here.
8. **Performance completeness:** Embedded browser hardware/version, independent render timing, heap snapshots, device DPR variants and a fresh 10-minute leak test were not available/measured end to end. Diagnostics must be repaired before using arbitrary paused/stress sessions as acceptance evidence.
9. **State combinations:** Every exposed settings control was exercised, including select options and range endpoints. This does not exhaust every cross-product of settings, malformed file byte pattern or browser policy.

## Recommended next work — no changes applied

First repair Spectrum projection/measurement sharing, then the other incorrect/stale measurements and diagnostics. Next address the fade input domain, focus CSS and long-window fill. Finally clean up notices/localization/effective-cap disclosure.

For regression coverage, add end-to-end tests around actual React-to-renderer integration: pointer buckets, lane boundaries, session changes with pinned tooltips, empty summaries, paused telemetry, Strip focus and both scope drawing branches. Preserve the existing numerical DSP tests; passing DSP tests did not detect these UI integration defects.

After fixes, rerun the same live scenarios and complete the outstanding physical/browser checks before claiming complete release QA. This audit makes no deployment, commit, PR, repository, or implementation changes.

