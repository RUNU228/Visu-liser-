# Visu@lizer visual pass — 2026-10-11

Implemented the supplied [visual improvement specification](../Visu@lizer_Visual_Improvement_Pass_Specification.md): English copy, an original SVG wordmark, readable local typography, and responsive layout corrections. Architecture, audio graph, DSP, stored settings, presets, and visualizer artwork remain intact. Changes are local on `codex/visual-improvement`; no deployment, merge, or publication was performed.

**Acceptance remains pending.** Chrome and Edge checks pass on this Windows machine. Firefox, Safari/WebKit, physical Android/iOS input and audio, and audible output quality remain unverified. These are environment gaps, not “not applicable” features. An explicit user decision is required before treating the pass as accepted with those gaps.

## Inventory and baseline

The application has one screen, five simultaneous Canvas visualizers, a queue dialog, a settings dialog, and a narrow-screen player popover. No router, authentication, onboarding, language switcher, share metadata, favicon, compact/loading logo, or logo navigation exists. None was added.

| Existing surface                    | Inspected states and evidence                                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header, brand, toolbar, footer      | Empty, playing, paused, frozen, light/dark, narrow/wide, fullscreen; matched screenshots and browser tests                                                                                                     |
| Local file import                   | Empty prompt, pending metadata and disabled selection, cancellation, ready files, duplicate, corrupt file, retry/failed-only queue; browser acceptance tests and accessibility captures                        |
| Player and track information        | Disabled empty transport, Play/Pause, seek, next/previous, mute/unmute, volume, speed, repeat, shuffle, multilingual long titles; existing regressions plus visual-pass tests                                  |
| Five plot headers, bodies, tooltips | Spectrogram, Waveform, Stereometer, Oscilloscope, Spectrum; empty/active/paused/frozen, Composition/Strip, focus, visibility/order, pointer/pinned touch measurements, theme, resize, degraded analysis notice |
| Queue dialog                        | Empty/populated, active/failed/pending rows, duplicate actions, reorder/remove, Clear/Undo, close/Escape/focus return, narrow layout                                                                           |
| Settings dialog                     | Appearance, Composition, Analysis, Performance, Presets, and all five module sections; navigation, field labels, checked/unchecked/disabled controls, short-screen scrolling                                   |
| Preset controls and notices         | Built-ins, save, rename/delete, valid/invalid import, export, reset, storage failure; multilingual user names retained                                                                                         |
| Mobile player popover               | Open/closed, speed, repeat and shuffle, outside dismissal, Escape, short viewport containment                                                                                                                  |

Baseline at commit `3eb35704d77bc456714f01bd50ba81e32d6db352`: 120 unit/integration tests, build, and 46 Chrome/Edge browser cases passed. Sandboxed Node initially failed with Windows `EPERM realpath`; the same commands passed under approved execution outside that restriction. This was an execution-environment failure, not an application defect. No baseline functional failure was found in the executed checks.

## Defect register

All confirmed defects below are resolved. Evidence paths are relative to this report. “P2” denotes an interaction/readability defect; “P3” denotes lesser visual inconsistency.

| ID / severity | Location and reproduction                                                                            | Correction / evidence                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01 / P2      | Empty workspace, 320/390/1440 px: centered import overlay obscured plot actions                      | Dedicated import row; baseline geometry test failed, final unobscured-action test passes. [Before](screenshots/visual-pass/before/chrome-empty-1440.png), [after](screenshots/visual-pass/after/chrome-empty-1440.png) |
| V02 / P2      | Desktop player: seek input measured 32 px high                                                       | 44 px input hit area; red/green seek geometry test                                                                                                                                                                     |
| V03 / P2      | 320 px player with long multilingual filename: title received only 96 px                             | Full title row, now 288 px; accessible full value and title retained. Long-title regression passes                                                                                                                     |
| V04 / P2      | Strip with larger readable labels: Stereometer heading/actions exceeded narrow module                | Actions below title and a 132 px minimum slot; Strip containment and existing focus restoration tests pass                                                                                                             |
| V05 / P2      | Open Settings: unconditional initial section scroll concealed top navigation                         | Preserve initial dialog position; module-specific jumps retained. All ten sections and reset action reachable at 844 × 390                                                                                             |
| V06 / P2      | Light-theme fields/ranges: essential borders inherited a pale decorative divider                     | Separate control-border token; measured minimum 3.105:1 on actual light surfaces                                                                                                                                       |
| V07 / P3      | Source and running UI: Russian labels/messages, English tooltips mismatched state                    | English presentation literals, shared state/repeat names, state-aware titles and accessible names. No Cyrillic app-owned source literals remain                                                                        |
| V08 / P3      | Across settings, metadata and Canvas labels: 11 px text and inconsistent 13 px controls              | 14 px normal text/controls, 12 px secondary/data/Canvas labels, 16 px dialog headings                                                                                                                                  |
| V09 / P3      | Header at mobile/desktop sizes: font-dependent wordmark with excessive unused SVG space              | Original outlined geometry, predictable 248 × 50 view box; 144/208 px displayed widths                                                                                                                                 |
| V10 / P2      | New empty import row at 768 px changed child parity: final Spectrum was 344 px in a 704 px workspace | Filter final-row parity to module slots; reproduced during independent review, then verified odd/even module counts in Chrome and Edge                                                                                 |

Optional refinements: consistent 3 px field radius, geometry-stable hover, strong selected/pressed outline/fill, tabular numerical readouts, bounded mobile popover scrolling, and balanced header spacing. These support the existing monochrome composition without adding a theme or changing the visualizer art.

## Brand, fonts and tokens

The canonical [wordmark](../src/assets/wordmark.svg) is original editable geometric SVG artwork created for this pass. It contains no third-party artwork and requires no font. An open `@` tail and a small displaced detail supply a static glitch accent. The header is its sole graphical placement; the existing textual footer brand is retained. The meaningful outer image has the name “Visu@lizer”; its inner SVG is decorative. Header height is unchanged.

| Role                              | Family / actual weight | Size / line height / tracking                                                      |
| --------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Dialog heading                    | Inter Variable 600     | 16 px / inherited 1.5 / normal                                                     |
| Plot and settings section heading | Inter Variable 600     | 14 px / 1.5 / plot headings 0.01em                                                 |
| Body, fields, normal controls     | Inter Variable 400     | 14 px / body 1.5, buttons/field labels 1.4 / normal                                |
| Track title                       | Inter Variable 500     | 14 px / 1.5 / normal                                                               |
| Secondary copy                    | Inter Variable 400     | 12 px / 1.5–1.7 according to surface / normal                                      |
| Time, data, technical labels      | IBM Plex Mono 400      | 12 px / generally 1.5–1.6 / zero or existing restrained tracking; tabular numerals |

Inter Variable 5.2.8 and IBM Plex Mono 5.2.7 were already installed from Fontsource. Both use SIL OFL 1.1: [Inter license](../licenses/Inter-OFL.txt), [Plex license](../licenses/IBM-Plex-Mono-OFL.txt). Inter retains existing Unicode subset declarations for external content; browser fallback supplies unsupported glyphs. Plex loads one local Latin 400 WOFF2 for numerical/technical data. Duplicate Plex declarations were removed. Variable Inter supplies the used 400/500/600 weights; synthetic weights are disabled.

Fallback stacks: `"Inter Variable", Arial, sans-serif`; `"IBM Plex Mono", Consolas, "Liberation Mono", monospace`. Fonts use swap loading and remain local. No dependency or font service was added. Blocked and deliberately delayed WOFF2 tests verify usable controls and unchanged header-action geometry after load.

Shared CSS tokens retain existing light/dark surfaces and introduce font roles, 12/14/16 px text roles, 16 px workspace gaps, 3 px control radius, essential control borders (`#878784` light, `#808080` dark), and 120 ms control transitions. Disabled opacity and the existing reduced-motion override are preserved. Selected/pressed states have outline/fill; focus uses a 2 px ink outline with 3 px offset. No logo animation was added.

## Verification

Device: Windows 11 Pro 10.0.26300, AMD Ryzen 7 5700X, NVIDIA GeForce RTX 4060. Installed browsers launched headlessly through existing Playwright 1.56.0: Chrome **155.0.8059.39**, Edge **155.0.4283.45**. Physical output and touch hardware were not tested.

| Command / check                                                     | Actual result                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                                          | 120 tests passed, 11 files                                                                                               |
| `npm run build`                                                     | TypeScript and Vite production build passed                                                                              |
| `npx tsc --noEmit --incremental false`                              | Passed                                                                                                                   |
| `npm run test:browser`                                              | 64 passed: 32 Chrome, 32 Edge; includes the original 46 cases and 18 focused visual cases                                |
| `node scripts/visual-pass.mjs before` / `after`                     | Matched captures and 60-second playback diagnostics recorded; no page errors                                             |
| `node scripts/visual-accessibility.mjs`                             | Chrome actual browser zoom, computed contrast, loading/error/preset/hidden states, and touch-event controls passed       |
| `$env:TEST_BROWSER='msedge'; node scripts/visual-accessibility.mjs` | Same checks passed in Edge                                                                                               |
| Source language audit                                               | `rg -n '[А-Яа-яЁё]' src index.html`: no matches; multilingual test filenames/user messages intentionally retained        |
| Formatting / diff hygiene                                           | Changed code, scripts and documentation pass Prettier; `git diff --check` passes. No lint command exists in this project |
| Independent review                                                  | No remaining substantive findings; reviewer-confirmed tablet parity issue fixed and regression-tested                    |

Executed responsive sizes: **320 × 568, 375 × 812, 390 × 844, 844 × 390, 768 × 1024, 1024 × 768, 1440 × 900, 1920 × 1080**. Both themes were checked during playback, with long Ukrainian/Japanese filenames, explicit breakpoint edges, and a 32 px stepped width sweep from 320 through 1920. Playback remained playing throughout; controls stayed at least 44 × 44 and no page-level horizontal overflow appeared. Canvas backing dimensions matched their displayed dimensions at DPR 1 in the capture measurements. Existing pixel/pointer/focus tests verify the five renderers after resize.

Actual 200% browser zoom was verified, rather than CSS scaling: a 1440 × 900 browser viewport yielded 720 × 450 CSS content; 640 × 1136 yielded **320 × 568**, DPR 2. No overflow or clipped actions; settings reset remained reachable. The isolated temporary-profile method follows [Chromium's zoom preference implementation](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc). It does not touch the user's browser profile.

Keyboard checks cover shortcuts, panel focus containment/restoration, Enter activation, Escape dismissal and visible focus. Short-screen settings navigation exposes every section and the reset action. Reduced-motion checks confirm zero control transition duration. Touch-event emulation at 375 × 812 operates Play, speed, repeat, shuffle, outside dismissal and pinned plot measurements. Emulation is not physical mobile verification.

Contrast uses computed RGB values and the WCAG luminance formula across actual background/surface/field colors. Lowest normal-text ratio: **5.420:1 light**, **6.848:1 dark**. Lowest essential-boundary ratio: **3.105:1 light**, **4.028:1 dark**. Ink focus/icons exceed the text threshold on those adjacent surfaces. Decorative grid/divider lines and disabled elements are excluded as specified.

Runtime state captures include empty, active, paused, dark paused, queue errors, pending metadata, duplicate handling, Undo, preset rename, all hidden/restored, analysis fallback, and mobile options. Pending metadata is held briefly by the verification harness's existing promise, then released to perform real loading/playback. The degraded-analysis notice is invoked through the existing fallback path. These simulated conditions are identified here; they do not modify production behavior. Normal checked font requests return successfully; deliberate blocked-font tests are separate.

Existing regression cases retain their assertions for primary AudioWorklet/Worker operation, mandatory/optional codecs, mono/antiphase/multichannel measurements, rapid seek, freeze/interruption/recovery, queue/history/presets, persistence, pointer measurements, production builds without diagnostics hooks, and input/focus behavior. English locator changes preserve their meaning. Screenshot-only legacy tests now use Playwright output paths instead of overwriting historical production images.

## Matched playback measurement

Same desktop, Chrome 155.0.8059.39, synthetic `long.wav`, default five-module Composition, 1440 × 900, DPR 1, 48 kHz, 60 seconds after seek-to-zero. No other playback check ran during the final measurement. The baseline was collected while separate baseline browser checks were active, so this single pair is evidence against an obvious regression, not a controlled performance-gain claim.

| Existing metric             |         Before |          After |
| --------------------------- | -------------: | -------------: |
| Effective target FPS        |             60 |             60 |
| Measured FPS                |          59.88 |          59.52 |
| Render p95                  |        6.60 ms |        4.90 ms |
| Analysis latency p95        |       26.69 ms |       26.69 ms |
| Analysis center age p95     |       69.34 ms |       69.34 ms |
| Recorded capture gaps       |              2 |              2 |
| Reserved analysis memory    |   25,352,432 B |   25,352,432 B |
| Analysis samples            |          2,812 |          2,813 |
| Idle redraw p95             |        7.70 ms |        9.20 ms |
| Final state / primary graph | Playing / true | Playing / true |

The checked session stayed near 60 FPS, with unchanged analysis latency and gap count. Active render p95 stayed below one frame; idle redraw is a separate noncontinuous metric and rose by 1.5 ms. No sustained slowdown was observed. These diagnostics cannot prove speaker output is glitch-free; audible listening remains unverified. No numerical performance gain is claimed.

## Evidence and requirement mapping

Matched [before screenshots](screenshots/visual-pass/before/) and [after screenshots](screenshots/visual-pass/after/) cover empty/playing at 320, 390 and 1440 px, paused at 1440, Settings at 1440, and Queue/mobile options at 390. Additional after captures show dark 320/1440, zoom, loading/error, presets, all-hidden, fallback and touch options. Captures visit offscreen plots first because their existing scheduler intentionally suspends rendering while offscreen. Baseline screenshots are retained as captured; signal timing differs between live captures.

Machine-readable evidence: [before Chrome](verification/visual-pass/before-chrome.json), [after Chrome](verification/visual-pass/after-chrome.json), [Chrome accessibility](verification/visual-pass/accessibility-chrome.json), [Edge accessibility](verification/visual-pass/accessibility-msedge.json). The [implementation plan](superpowers/plans/2026-10-11-visual-improvement.md) and [focused tests](../tests/browser/visual-pass.spec.ts) document reproduction and choices. Large original audio fixtures and historical screenshots are not added or replaced by this pass.

“Verified” below means verified in the available Windows Chrome/Edge environment. Broader environment gaps remain explicit.

| Requirement | Result and supporting evidence                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| EN-01       | Verified: all source-owned UI, Canvas labels, settings, notices and accessibility literals translated; inventory/runtime checks |
| EN-02       | Verified: multilingual long filenames/preset names retained; tests and preset screenshot; brand spelling retained               |
| EN-03       | Verified: sentence case and local “Add audio” terminology; shared transport/repeat names                                        |
| EN-04       | Verified: `lang="en"`, English title/description, Play/Pause/Mute/Unmute/theme/repeat title assertions                          |
| EN-05       | Verified: existing literal ownership retained, tiny `copy.ts` for repeated state/repeat text; no stored enum/key changes        |
| EN-06       | Verified locally: source search plus inventoried states; external fixtures and OS/browser dialogs excluded                      |
| BR-01       | Verified visually: readable wordmark and intentional `@`, mobile/desktop screenshots                                            |
| BR-02       | Verified: static monochrome path artwork with restrained detail                                                                 |
| BR-03       | Verified: editable 248 × 50 SVG, no font dependency or asset toolchain                                                          |
| BR-04       | Verified: two displayed sizes, both themes, unchanged header height, narrow screenshot                                          |
| BR-05       | Verified existing placements; favicon/compact/loading variants absent and not applicable                                        |
| BR-06       | Verified: named outer image, decorative inner SVG, original source/rights recorded; no navigation existed                       |
| TY-01       | Verified: two existing families with distinct UI/data roles                                                                     |
| TY-02       | Verified: family/weight/source/OFL/fallback/role record above                                                                   |
| TY-03       | Verified: shared 12/14/16 px hierarchy and actual weight/line-height roles                                                      |
| TY-04       | Verified locally: long names, zoom, Strip containment, tabular data, font-load action geometry                                  |
| TY-05       | Verified: local WOFF2 swap loading, no duplicate Plex or synthetic weights; successful normal requests                          |
| TY-06       | Verified Chrome/Edge: aborted/delayed fonts preserve access and action geometry                                                 |
| UI-01       | Verified locally: sole screen, overlays, plot/player/preset states inventoried above                                            |
| UI-02       | Verified: V01–V10 resolved, baseline evidence and regression checks; no known architectural conflict                            |
| UI-03       | Verified: existing palette retained; shared font, size, gap, radius, border and motion tokens                                   |
| UI-04       | Verified locally: no measured overflow; full external title accessible; phone title and Strip/tablet regressions                |
| UI-05       | Verified locally: stable hover geometry, visible pressed/selected/focus cues, loading/disabled behavior retained                |
| UI-06       | Verified Chrome/Edge: 44 px actions/ranges, keyboard names/focus and touch emulation; physical devices unverified               |
| UI-07       | Verified computed token/surface ratios and focus colors; values above                                                           |
| UI-08       | Verified locally: native dialogs/popover containment, short-screen actions and dismissal/focus tests                            |
| UI-09       | Verified locally: flex plot framing, correct measured backing stores, retained pixel/pointer/resize regressions                 |
| UI-10       | Verified locally: static logo, retained visualizer motion controls, reduced UI transitions test                                 |

## Acceptance checklist

| Criterion                  | Status                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| AC-01 English              | Verified in source and inventoried local states                                                                     |
| AC-02 Brand                | Verified and editable asset delivered                                                                               |
| AC-03 Typography           | Verified locally, including font failure/delay                                                                      |
| AC-04 UI polish            | All confirmed in-scope defects fixed; local inventory/review complete                                               |
| AC-05 Usability            | Verified keyboard/contrast/geometry/emulated touch; physical touch unverified                                       |
| AC-06 Responsive           | All specified sizes, stepped sweep, edges and 200% zoom pass locally; Firefox/WebKit and physical mobile unverified |
| AC-07 Functional integrity | Available tests pass; broader platform/audio-device behavior unverified                                             |
| AC-08 Performance          | Matched diagnostics show no sustained regression; audible output unverified                                         |
| AC-09 Scope                | Verified: presentation changes and limited necessary markup only                                                    |
| AC-10 Evidence             | Deliverables and gaps recorded; overall acceptance pending environment checks or explicit user decision             |

Firefox and WebKit Playwright binaries are absent. Safari/macOS, physical iOS/Android, and preceding browser versions from the broader project support matrix are unavailable. They remain unverified; this report does not extend browser support claims. No unresolved in-scope visual defect or known introduced functional regression remains in the tested environments.

Technical changes beyond styling/copy: the import prompt occupies its own flow row; plot containers flex to the remaining header space; phone title/transport use separate grid rows; Settings skips only its default initial scroll; state labels are shared; the SVG is inserted from a static trusted local asset. Renderer edits are English text and 11-to-12 px label sizing only. Audio files contain presentation-string changes only; graph, lifecycle and DSP code were not changed. The review and existing behavioral/pixel tests cover these boundaries.
