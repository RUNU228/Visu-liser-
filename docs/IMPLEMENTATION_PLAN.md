# Visu@lizer Implementation Plan

Goal: implement Visualizer_TZ_EN.md v1.2 in this folder. The master specification remains the single source of truth.

Architecture: React/TypeScript/Vite shell; one local media element and audio source; stereo passthrough worklet with twelve transferable buffers; Worker numerical analysis; bounded histories and Canvas renderers outside React state. Settings, queue, transport, capture eligibility, and rendering freeze are separate domains.

## Tasks

- [x] Foundation: package lock, shared message contracts, settings defaults, strict validation, migrations, guarded storage, complete presets. Verify invalid input is atomic and transport never persists.
- [x] Local import and queue: sequential cancellable metadata probes, slot reservations, retry/duplicates, shuffle visitation and navigation history, row controls, five-second Undo and URL ownership. Verify repeat and failed-track scans.
- [x] Audio engine: one graph, gesture resume, GainNode output, acknowledged boundaries, session/epoch rejection, media readiness, hidden/frozen gates, recovery and honest Analyser fallback. Verify passthrough and gate protocols.
- [x] DSP: FFT Hann/Blackman normalization, M/S and stereo power, energy-preserving waveform summaries, LR4 bands, YIN, trigger interpolation, timestamp decay, quantized spectra. Use deterministic PCM tests before implementation.
- [x] Worker: continuous windows, shared matching STFT tasks, per-task revisions, finite buffer/result credits, stale PCM gaps and resets.
- [x] Five Canvas modules: raw spectrogram ring/reprojection, extrema waveform, paired stereo persistence, real triggered scope, smoothed calibrated spectrum. Tooltips retain raw units.
- [x] UI: Russian copy, original static logo, compact transport, one modal panel, every specified control and preset action, focus/fullscreen, stored module order/visibility.
- [x] Responsive and visual integration: specified slot weights and breakpoints, 44px controls, local licensed Cyrillic fonts, monochrome tokens, reduced motion and restrained decoration.
- [x] Verification: build, numerical/queue/settings/protocol tests, browser audio fixtures, screenshot widths, keyboard/modal checks, sixty-second performance run, ten-minute ownership run and twenty switches. Record tested environments and unavailable browser matrix entries truthfully.

## Review contracts

Synthetic DSP tests assert measured behavior, not implementation details. Browser tests import real locally generated WAV/encoded codec fixtures. Performance diagnostics record sample-frame age and FFT-center age separately; allocations and Canvas memory are separate. No release claim for unavailable browsers. No publishing.

Local implementation and verification stages are complete. Unavailable browser/device matrix entries remain release verification tasks, documented in VERIFICATION.md; they are not claimed as passed.
