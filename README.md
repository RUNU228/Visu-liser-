# Visu@lizer

Local audio player and five simultaneous, measured audio visualizers. Built from [Visualizer_TZ_EN.md](Visualizer_TZ_EN.md), version 1.2. English interface. Light/dark monochrome composition, restrained decoration, and accessible controls. The [2026-10-11 visual pass](docs/VISUAL_PASS_2026-10-11.md) documents the refined wordmark, typography, responsive fixes, and verification gaps.

## Run

Requirements: Node.js 22.12+ (tested with 24.19.0), npm, and a browser with Web Audio. No account, API key, server, or uploaded music.

```powershell
npm ci
npm run dev
```

Open the printed localhost URL. Import local audio, then press Play. Import never starts playback automatically.

```powershell
npm test
npm run build
npm run preview
```

Deploy the `dist/` directory to any static HTTPS host. HTTPS or localhost is required for the primary AudioWorklet path. Relative assets work through Vite; serve through HTTP rather than opening `index.html` as a file. No deployment was performed.

## Features

- Multiple local files, sequential cancellable metadata preparation, 100-track queue, 250 MiB/file limit, duplicate confirmation, per-file errors and retry.
- Play/pause/seek, previous/next, repeat off/queue/one, shuffle with real playback history, 0.5–2× pitch-preserving speed where supported, output gain/mute.
- Queue selection, drag/keyboard/touch reordering, removal, Clear and five-second Undo. Undo restores the former position paused.
- Five independent Canvas displays: spectral history, raw amplitude extrema/RMS, paired stereo cloud/correlation, YIN-triggered captured oscilloscope, calibrated current FFT spectrum.
- Every module's specified control; order, visibility, focus, fullscreen, responsive Composition/Strip, linked main-history duration, global visual trim.
- Four complete built-in presets, user save/rename/delete, validated JSON import/export, versioned guarded localStorage. Reload keeps settings but starts with an empty queue.
- Separate plot freeze, reduced motion, keyboard controls, modal focus management, and local fonts with multilingual UI-text coverage.

Keyboard outside controls: Space play/pause; Left/Right ±5 seconds; Shift+Left/Right ±15 seconds; M mute; Q queue; Escape closes panel, popover, or focus mode. Range inputs keep native keyboard behavior. Touch a plot to pin its measurement.

## Audio and analysis

One HTMLAudioElement and one MediaElementAudioSourceNode persist across track changes. Exactly one audible route feeds the same output GainNode. HTMLAudioElement volume remains 1 and muted remains false. Analysis occurs before the output gain, so mute does not stop measurement. Visual gains and trim never alter audio.

The primary graph uses explicit two-channel `speakers` interpretation in an unchanged stereo passthrough AudioWorklet. Mono duplicates as L=R. Web Audio downmixes multichannel sources to stereo: quad uses L′=0.5(L+SL), R′=0.5(R+SR); 5.1 adds center and respective surrounds at √0.5 to the fronts, dropping LFE. These are post-downmix channels, not the original file channel count. Bypass uses the same explicit stereo speaker interpretation. See the [standard speaker mixing rules](https://www.w3.org/TR/webaudio/#down-mix).

Twelve reusable 1024-frame interleaved PCM buffers transfer through main to Worker and recycle. Audio passthrough continues without capture credits. Session, capture epoch, sample frame, sequence, and per-task revision checks reject obsolete analysis. Seek/source mutations use acknowledged boundaries. Pause, buffering, hidden tabs, interruptions and plot freeze close capture without synthesizing silence; return from hidden/frozen state clears live history. Worklet/Worker failures have bounded automatic recovery and manual retry, retaining transport.

Worker DSP uses actual sample rate, periodic Hann/Blackman, N/4 hops, unnormalized FFT and one-sided window-sum calibration. Stereo energy averages L/R power; M=(L+R)/2 and S=(L−R)/2. Spectrum smooths power with elapsed-sample-time coefficients, then converts to dBFS; peak hold is before display trim/tilt. Spectrogram stores raw 16-bit quantized −160…+160 dBFS codes in fixed logarithmic frequency buckets. Display scale, floor, gamma, orientation, theme, fade and trim reproject these retained measurements.

Waveform retains min/max, sample count and sum of squares. Frequency layers are supplementary LR4-filtered RMS. A bounded 300 ms paired PCM ring supports 100 ms correlation, deterministic sample-timed stereo selection and YIN 40–2000 Hz with ≥0.8 confidence / >−60 dBFS. Scope trigger endpoints interpolate actual samples and preserve per-pixel extrema; failed pitch checks fall back to Free. Signal time drives history and decay, independent of render FPS.

See [analysis API and numerical tests](src/analysis/README.md). Application analysis reservations are capped at 64 MiB, including spectral-history sub-budget 24 MiB. Encoded media, browser decoder memory, Canvas backing stores, and JS engine overhead are separate. Long histories use summaries, not full-track PCM. The optional decoded seek-bar overview is deliberately omitted; the standard seek bar is always available and no whole-track `decodeAudioData` allocation occurs.

## Formats and fallback

Mandatory: MP3 and PCM16/PCM24 WAV. Additional FLAC, AAC/M4A, OGG Vorbis, OGG Opus and WebM Opus are accepted when actual browser loading succeeds. MIME/extension are hints; they do not establish decoder support. WAV is a container; other WAV codecs are not promised. Metadata times out after 10 seconds and is retryable. Files need finite positive duration.

If AudioWorklet or Worker fails, playback continues through bypass. AnalyserNode supplies an explicitly labeled degraded mono Waveform/Free Oscilloscope and its own non-calibrated FFT Spectrum/Spectrogram with reduced history fidelity. Stereometer and pitch detection are unavailable in fallback. Selected settings remain intact. This mode does not satisfy five-module primary-path release acceptance.

## Browser verification matrix

Frozen implementation date: **2026-10-10**. Reference device: Windows 11 Pro 10.0.26300, AMD Ryzen 7 5700X, NVIDIA GeForce RTX 4060. Browser checks launch installed browsers headlessly with Playwright; physical speaker output, touch devices, and other operating systems require separate checks.

| Target                         | Exact tested version       | Status                                             |
| ------------------------------ | -------------------------- | -------------------------------------------------- |
| Chrome current desktop         | 155.0.8059.39 / Windows 11 | Primary path and codec tests executed              |
| Edge current desktop           | 155.0.4283.45 / Windows 11 | Primary path and codec tests executed              |
| Chrome preceding major         | 154 / desktop              | Test environment unavailable; outstanding          |
| Edge preceding major           | 154 / desktop              | Test environment unavailable; outstanding          |
| Firefox current / preceding    | 157 / 156                  | Test environment unavailable; outstanding          |
| Safari current / preceding     | 27 / 26 on macOS           | Test environment unavailable; outstanding          |
| Chrome Android current         | 155 / Android              | Physical test environment unavailable; outstanding |
| Safari iOS current / preceding | iOS 27 / 26                | Physical test environment unavailable; outstanding |

Unavailable entries are targets, **not verified supported browsers**. Responsive desktop viewport emulation does not count as mobile decoder/device verification. See [verification report](docs/VERIFICATION.md) and machine-readable evidence in `docs/verification/` for measured results and remaining release checks.

Official platform references: [Web Audio channel mixing](https://www.w3.org/TR/webaudio/), [AudioWorklet secure context](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet), [codec/container guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs), [Edge versions](https://learn.microsoft.com/microsoft-edge/web-platform/release-notes/), [Firefox releases](https://www.firefox.com/en-US/releases/), [Safari 27](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/).

## Reproduce browser checks

```powershell
node scripts/fixtures.mjs
node scripts/codecs.mjs
# Keep npm run dev active in another terminal:
npm run test:browser
node scripts/performance.mjs
```

Fixtures are original deterministic synthetic tones, silence, antiphase and multichannel signals. FFmpeg is a development-only fixture encoder and is never imported into the app. Numerical DSP tests bypass browser decoders. Tests write screenshots and JSON measurements locally. `scripts/soak.mjs` runs ten minutes of real playback followed by 20 track switches and Undo expiration; generate `tests/fixtures/soak.mp3` first as described in the verification report.

## Project map

`src/app` UI/controller; `src/player` queue/import; `src/audio` graph/lifecycle/worklet; `src/analysis` Worker/numerical algorithms; `src/visualizers` retained histories/Canvas/scheduler; `src/settings` schema/presets/storage; `src/shared` contracts/units. PCM and FFT streams never enter React state. React handles controls and low-rate transport announcements.

## Fonts and licenses

Inter Variable 5.2.8 supplies UI text and multilingual external titles; IBM Plex Mono 5.2.7 supplies Latin numerical/technical readouts at weight 400. Both are bundled locally through Fontsource under the SIL Open Font License 1.1, with licenses retained in `licenses/`. The original [SVG wordmark](src/assets/wordmark.svg) uses editable geometric paths and needs no font. No reference artwork or artist logos are included. Runtime dependencies are pinned with `package-lock.json`.
