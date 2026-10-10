# Visu@lizer — Technical Specification for Codex

Version: 1.2 · Date: October 10, 2026 · Specification language: English.

Default UI language: Russian, preserved from the original specification. English control names and example messages below describe their meaning; localize the displayed text for the default UI language. This translation does not require adding a language switcher.

## 1. Purpose and Deliverables

Build a browser-based audio visualizer for local music files. Users add tracks, control a compact player and playback queue, and observe five simultaneous visualizers: **Spectrogram, Waveform, Stereometer, Oscilloscope, and Spectrum**.

Visual direction: an almost-white canvas, black and gray, restrained typography, fine lines, occasional spatial glitch shifts, and soft moving light gradients. The visualizers should form a coherent artistic composition while retaining the meaning of the measured signal.

Required deliverables: a working responsive website, source code, setup instructions, documented format support and limitations, and verified audio-analysis algorithms. All five visualizers must respond to actual playback audio. Random animation must never substitute for signal data.

This specification defines an independent product inspired by the supplied references. Do not reproduce the cover artwork, brand marks, or MiniMeters interface literally.

This document is the authoritative foundation for the entire project. Development is iterative; the implementation order in Section 17 defines milestones, not permission to omit requirements. Additional pages and expanded layout customization, presets, display settings, and other functionality may be specified in later revisions. Features already included here remain part of the current baseline. References and implementation choices must not override its artistic direction or signal-analysis requirements.

## 2. References and Limits of the Analysis

### 2.1. Reviewed Attachments

| Reference | Attachment filename | Elements used |
|---|---|---|
| pluko — SIXTEEN | `pluko - sixteen - Large 640×640.jpg` | Fragmentation, horizontal displacement, translucent layers, space around the central form |
| pluko — CLASS XIX | `pluko - CLASS XIX - Large 640×640.jpg` | Large empty field, compact uppercase text block, asymmetry, peripheral typography |
| pluko — BLEACH [Hi-Fi] | `pluko - BLEACH [Hi-Fi] - Large 640×640.jpg` | The supplied image appears almost entirely white: a reference for extreme visual restraint |
| MEMBA — BACK ONLINE | `MEMBA - BACK ONLINE - Large 640×640.jpg` | Dark negative space, illuminated organic forms with depth, grain, a composition divided into windows |
| MiniMeters visualizers | `image(20261010-140306).png` | A horizontal strip of five visualizers, their relative sizes, and the distinction between historical and current displays |
| MiniMeters settings | `image(20261010-140737).png` | Visible module parameters and global settings; the screenshot shows application version 1.0.29 |
| Playback recording | `Desktop 2026.10.10 - 17.03.24.01.mp4` | The behavior of all five visualizers in the strip at the top of the screen |

The recording is approximately **34.83 seconds** long, at **1920×1080** and approximately **60 frames per second**, with a 48 kHz stereo audio track. Visual analysis covered frames throughout the recording and a sequence at 0.25-second intervals near the beginning. The recording frame rate does not establish the visualizers' actual update rate.

### 2.2. Observations Versus Design Decisions

- **Observation:** behavior or a parameter visible in an attachment. Video observations include timestamps below.
- **Design decision:** a proposed Visu@lizer algorithm, value, or behavior. It is not a claim about MiniMeters' internal implementation.
- The recording does not reliably establish the FFT window function, overlap, crossover filters, exact oscilloscope trigger, stereometer normalization, or color-map formulas. This specification defines those independently.
- The settings screenshot shows the Spectrogram and Spectrum `Main` tabs. The unopened `FFT`, `Overlay`, `Audio`, `Reference`, and `Target` tabs were not inspected; their contents are not verified requirements.
- The supplied CLASS XIX cover has a light-blue background and orange text. The product's white background and restrained monochrome typography intentionally adapt its composition to the user's requested style.
- BACK ONLINE is a static cover. Its shading suggests volume, but moving light is not observable in the image. Animated light in the product develops the user's stated preference.

## 3. First-Release Scope

### 3.1. Included

1. Import multiple local audio files through a file picker or drag-and-drop.
2. Playback, pause, seeking, volume, mute, previous/next track, repeat, shuffle, and playback speed.
3. A queue with track selection, removal, and reordering.
4. Five visualizers with individual settings, visibility controls, focus mode, and reordering.
5. Light and dark monochrome themes, adjustable decorative intensity, and reduced-motion support.
6. Local persistence for settings and user presets.
7. Responsive layouts, keyboard controls, accessibility, and error handling.

### 3.2. Excluded

System-audio capture, microphone input, a DAW/VST bridge, streaming services, accounts, server-side music uploads, a cloud library, video export, a full audio editor, and separate VU or LUFS modules. The small correlation indicator specified within Stereometer is included; it is not a separate module.

Do not add a heavy 3D engine solely for lighting effects. Achieve the atmosphere with 2D rendering and CSS.

### 3.3. Selected Approach

| Approach | Benefit | Limitation | Decision |
|---|---|---|---|
| Standard AnalyserNode only | Quick to prototype | Harder to guarantee continuous shared history and synchronized stereo samples | Acceptable for an early prototype and a limited fallback |
| Web Audio + AudioWorklet + Worker + Canvas | Shared timing, control over STFT and stereo analysis, no server required | Requires a dedicated DSP layer | **Primary approach** |
| WebGL/3D + heavyweight decoders | More decorative options and codecs | Unnecessary complexity and resource use for this minimal product | Not required for the first release |

## 4. Visual System

### 4.1. Adapting the References

**SIXTEEN:** occasional brief breaks in thin decorative layers, portions of an outline displaced by a few pixels, and faint translucent duplicates. Translate spatial fragmentation into grayscale. Do not use rainbow RGB splitting or distort measured curves.

**CLASS XIX:** large areas of empty space, disciplined typography with slightly increased tracking, and asymmetrical secondary labels. Text should not become a decorative poster competing with the visualizers.

**BLEACH:** remove unnecessary detail. The empty state should contain only the logo, a quiet import prompt, module outlines/labels, and an inactive player. Do not add an intro animation or a large hero section.

**BACK ONLINE:** subtle light gradients, very low-opacity grain, and the impression of illuminated forms against a contrasting background. Do not reuse the plants, wheels, or cover composition as website artwork.

### 4.2. Color, Typography, and Geometry

Proposed design tokens:

| Token | Light theme | Dark theme |
|---|---|---|
| Page background | `#F7F7F5` | `#0C0C0C` |
| Surface | `#FFFFFF` | `#141414` |
| Primary text | `#161616` | `#F1F1EF` |
| Primary trace | `#161616` | `#F1F1F1` |
| Secondary text | `#606060` | `#AAAAAA` |
| Divider | `#D4D4D0` | `#383838` |

Use neutral tones only: R=G=B for visualizer traces and decorative effects. A slight warm tint is allowed in the specified background/surface/text tokens. Communicate errors and selection through icons, labels, outlines, and contrast; do not depend on a colored accent.

The main typeface must be a locally served neutral grotesque with Cyrillic support. Use a monospaced typeface with tabular numerals for values and axis labels. Select an appropriately licensed font during implementation and document it in the README. UI text: 13–16 px; secondary labels: at least 11 px. Do not recreate the artists' logos.

The **Visu@lizer** logo must remain readable, with an original treatment of `@` and one subtle displaced fragment. An original SVG is acceptable. Its accessible name is always `Visu@lizer`. The main lettering remains static; a decorative duplicate may shift briefly.

Spacing scale: 4/8/12/16/24/32 px. Corner radii: 0–4 px. Dividers: 1 px. Avoid large shadows and collections of heavily framed cards. Traces should be crisp, thin, and sufficiently contrasted; the overall composition should feel spacious.

### 4.3. Glitch and Lighting

- Glitch: 1–3 decorative strips, 1–3 px thick, displaced by 1–4 px. Each event lasts 70–140 ms, with 8–18 seconds between events. No simultaneous events.
- Eligible layers: a decorative panel edge, a logo duplicate, or the background. Do not affect buttons, numerical values, the cursor, FFT traces, or audio output.
- Lighting: one or two broad soft gradients, a 12–24-second cycle, opacity 0.02–0.05. They must not reduce data readability.
- During playback, light intensity may respond slightly to a smoothed RMS envelope, with 300–600 ms smoothing. Do not flash on every beat.
- Grain is a static texture at opacity no greater than 0.025. Do not regenerate noise every frame.
- A “Decoration” setting offers Off / Subtle / Normal; default: Subtle. Provide separate glitch and lighting toggles.
- Under `prefers-reduced-motion`, disable glitch and moving light. Visualizers still reflect audio. Provide a separate action to freeze visualization without pausing playback.

## 5. Layout and User Flow

### 5.1. Main Screen

A small top bar contains the logo on the left and “Add audio,” the theme control, and “Settings” on the right. The visualizer workspace occupies the center. A compact player sits below it. Queue and settings open in a side panel; only one of these panels is open at a time.

Both side panels are modal overlays: opening them does not reduce workspace width or change the selected layout. The desktop panel is approximately 360 px wide and is constrained to the viewport. Apply the modal focus and inert-background rules in Section 15; enabled plots may continue rendering behind the overlay. On mobile, use the full-width panel described in Section 5.2.

**Default desktop layout:** a two-row composition. The first row contains wide Spectrogram and Waveform modules at an approximate 55:45 ratio. The second contains Stereometer, Oscilloscope, and Spectrum at approximately 20:35:45. This preserves the reference's relative emphasis without duplicating its narrow strip.

**Strip layout:** all five modules in one row, ordered Spectrogram → Waveform → Stereometer → Oscilloscope → Spectrum. Approximate widths: 28/22/7/16/27%. Available at viewport widths of 1440 px and above, with a minimum plot height of 160 px. This is an additional compact layout.

Each module header contains its name, an accessible settings menu, and an “Expand” action. Sliders are not permanently displayed in the workspace. Axes are visually subdued but readable; detailed values appear on hover, focus, or interaction.

Store one ordered list of all five module IDs, including hidden modules. Reordering changes this list; visibility does not remove IDs. The visible subsequence fills layout slots in order. In desktop Composition, the first two visible modules occupy the top row with slot weights 55:45; the next three occupy the second row with slot weights 20:35:45. Normalize weights over occupied slots in each row; omit empty rows and let a sole module fill the row. Weights belong to slots in Composition. In Strip, weights belong to modules (28/22/7/16/27 in reference order); normalize over enabled modules after reordering. Focus mode temporarily replaces these placements without changing stored order or visibility.

At 768–1199 px, fill a two-column grid in visible order; an odd final module spans both columns. With all modules enabled, this puts Spectrogram/Waveform in the first row, Stereometer/Oscilloscope in the second, and Spectrum across the third. Below 768 px, use the visible subsequence in one column. The default order remains the reference order at every breakpoint; a user-selected order is respected.

Store the requested layout separately from the effective layout. Strip is effective only at viewport widths of at least 1440 px; below that threshold, use responsive Composition without overwriting the requested Strip setting. Restore Strip automatically when the viewport grows. Keep the 160 px minimum plot height in Strip. A narrow header, especially Stereometer, may wrap its name and place its two actions on a second line; do not shrink touch targets or allow horizontal page overflow. Restore default layout resets order, visibility, requested layout, and focus mode, but does not change analysis settings.

Focus mode expands one module within the workspace. Other enabled modules continue analysis but suspend rendering. Escape restores the previous layout. Browser fullscreen is a separate action with a graceful fallback if the API is unavailable.

### 5.2. Responsive Behavior

| Viewport width | Behavior |
|---|---|
| ≥1200 px | Default two-row composition; player in one row |
| 768–1199 px | Two columns; Stereometer and Oscilloscope share a row; Spectrum spans both columns |
| <768 px | One column, visible modules in stored order (reference order by default); player in two compact rows |

On mobile, typical module heights are 180–240 px; Stereometer is approximately square. Render only visible modules while maintaining enabled modules' history within their allocated buffers. Avoid horizontal page scrolling. Verify 360, 390, 768, 1024, 1440, and 1920 px widths.

The player may be fixed to the viewport, provided space is reserved so it does not cover content. Account for safe-area insets. On mobile, queue and settings use a full-width panel with a limited height and internal scrolling.

### 5.3. Application States

- **Empty:** a quiet “Add audio or drop files here” area; empty plots without simulated signals.
- **Preparing:** per-file status; the interface remains responsive.
- **Ready:** the first valid track is selected and waits for Play. Import does not automatically start music.
- **Playing:** all enabled modules use the same audio stream.
- **Buffering:** playback is requested, but the media element has emitted `waiting` or lacks current playback data. Close the analysis capture gate, freeze existing history, and show “Buffering.” Do not record decoder starvation as signal silence. The `stalled` event alone does not establish interrupted playback if buffered audio is still advancing. Resume capture only after `playing`, usable media data, and a running AudioContext.
- **Audio interrupted:** the media element or system has stopped the AudioContext while playback was requested. Freeze history, close capture, preserve playback intent, and show a Resume action if a new gesture is required. Observe context state changes; handle `interrupted` where exposed and unexpected `suspended` states. Do not recreate the context solely to recover an interruption. On recovery, establish a new capture epoch and time mapping without appending interruption time to history.
- **Paused:** history and the current frame are frozen; show “Paused.” The visual timeline does not advance.
- **Silence within a playing track:** history continues; new values approach zero and residual traces decay according to persistence settings.
- **Seeking or switching tracks:** discard stale frames and accumulated spectral traces, and restart history at the new position. Retain a file overview when seeking within the same track.
- **Track ended:** apply the queue/repeat rules in Section 6.2. If there is no next track or repeat action, retain the final frame and indicate completion.
- **Error:** explain the problem beside the file and allow removal or retry. Other valid tracks and controls remain usable.

Transport intent, media readiness, context state, and plot-freeze state are separate values. Capture is allowed only when playback is requested, the media is actively playing without a seek/buffer/interruption boundary, the context is running, the page is visible, plots are not frozen, and at least one enabled module needs PCM. Hidden-page and plot-freeze gates take precedence over media events. Explicit pause freezes history; end-of-track retains the final frame unless queue rules start another track. Resume after pause or buffering retains valid history separated by a marked discontinuity; return from a hidden page and unfreezing plots clear live history. None of these states may synthesize samples or replay a missed backlog.

## 6. Files, Player, and Queue

### 6.1. Formats and Import

Required formats to verify: **MP3** and **WAV containing 16-bit or 24-bit PCM**. Also accept common **FLAC, M4A/AAC, OGG/Vorbis, OGG/Opus, and WebM/Opus** files when the browser supports the specific codec/container combination. WAV is a container; do not promise support for every codec it can contain. A filename extension alone does not guarantee playback. Consult [MDN: Audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs) for codec/container compatibility.

- Support multiple selection and dropping files onto the page. During a file drag, display a thin outline around the workspace.
- The file input's `accept` includes the listed extensions and associated MIME types. MIME may be absent; use the extension as an initial hint and actual loading as the definitive check.
- Probe files sequentially for metadata with a dedicated, never-played probe element, separate from the single audible media element. Use `canPlayType()` as a hint and actual loading as the check. Handle media `error` events and `play()` rejections. Use a 10-second timeout per probe; a timeout is a retryable preparation failure, not proof of an unsupported codec. Require finite positive duration for these local music tracks. Do not decode the entire queue into RAM.
- First-release limits: 100 tracks and 250 MiB per file. Explain rejection per file; keep accepted tracks. These are product limits and must appear in import help.
- Derive a track title from its filename without the extension. Artist/title tags are optional if they can be read inexpensively. Do not require network requests for artwork.
- Matching name/size/lastModified indicates a possible duplicate. Offer “Add again”; do not claim byte-identical content.
- Music remains on the device. Do not upload files or their contents to a server.
- For an unsupported codec: “Your browser could not open this format. Try MP3 or PCM WAV.” Use a separate corrupted-file message when the cause can be distinguished reliably.

Serialize import batches in arrival order and reserve queue slots while probing so concurrent drops cannot exceed 100 tracks. Count retained failed rows and pending rows toward the limit. Provide Cancel import: retain completed rows, abort the active metadata probe, discard unprocessed files, and release their URLs/listeners. Cancellation invalidates the batch token so late metadata events cannot add rows. Clear queue also cancels pending imports; Undo does not restart them. Duplicate matches are skipped unless “Add again” is selected; that action reserves a slot and reruns preparation. Removing or retrying a failed row remains possible.

### 6.2. Compact Player

Required controls: Previous, Play/Pause, Next, track title, elapsed/total time, seek bar, 0–100% volume, mute, repeat, shuffle, and a queue button with a count. Playback speed is available in an additional menu: 0.5×–2× in 0.25 increments, default 1×. Preserve pitch where supported (`preservesPitch`). Analyze the actual playback stream, including speed changes.

- Repeat cycles through Off → Queue → One Track. Each state has a label or tooltip.
- Previous: if the current position exceeds 3 seconds, restart the current track; otherwise select the previous track in playback history/order. At the beginning of the available history, restart the current track.
- Next selects the next track. A manual Next action bypasses repeat-one. At the end of the order, repeat-queue wraps; otherwise remain on the current track without starting a new cycle.
- Support seeking by click, drag, and keyboard. During a drag, preview the target time; commit the seek on release to avoid rebuilding history for every pixel.
- Volume affects output only. Mute does not stop visualizers: they display the signal before the output-volume control. Explain this in settings.
- **Automatic end-of-track behavior:** repeat-one restarts the current track. Otherwise, advance to the next playable track if one exists. At the end of the order, repeat-queue starts the next cycle (visible order when shuffle is Off, a new shuffled order when On); repeat-off stops. Repeat-off does not disable normal advancement through the queue.
- Selecting a different track preserves the transport state: if playback was active, play the newly selected track; if paused, load it without playing. Handle autoplay rejection and provide a visible Play action.
- Automatic crossfade is excluded from the first release. A short 10–20 ms output-gain ramp on manual transitions is acceptable to reduce clicks.

### 6.3. Queue

Each row contains its position, title, duration, status, and a remove action. Mark the active track with an outline or indicator; the playing track may have a small static or restrained animated icon. A single explicit row action selects the track; do not require a double-click.

Provide a drag handle and “Move up” / “Move down” buttons for keyboard and touch operation. “Clear queue” removes the queue and stops audio; provide Undo for 5 seconds. Keep the resources needed for Undo until that window expires. Do not revoke an object URL while the media element still needs it.

Clear retains one snapshot containing rows, active ID, committed position, shuffle cycle, and playback history. Undo restores those values and loads the former active track at its saved position **paused**, even if it was playing before Clear; Undo never automatically restarts music. Volume, mute, speed, repeat, and settings retain their current values. An additional import or another Clear finalizes the previous snapshot before starting the new operation. Detach the audible/probe elements from discarded sources and call `load()` before revoking their URLs. Revoke retained URLs only after the 5-second deadline or snapshot finalization, and only if no live queue/media owner still uses them. Expiration removes the Undo action.

Shuffle creates a separate order of track IDs without changing the visible list. Do not repeat a track until all available tracks in that cycle have been visited. Under repeat-queue, generate a new order for the next cycle. Previous uses actual playback history. A manual selection marks that track as visited in the current cycle; continue with remaining unvisited IDs. Add/remove operations update this order without losing the active ID.

Use Fisher–Yates to create the remaining order; musical samples and visualizer data are never randomized. Enabling shuffle starts a cycle with the active playable ID already visited and all other playable IDs unvisited. Disabling shuffle discards that cycle and continues forward from the active row in visible order. Repeat-one takes precedence only for automatic completion; manual Next and Previous bypass it without changing the selected repeat mode. Deliberate row selection, Previous/history replay, restarting a track, and repeat-one are exceptions to the no-repeat rule, which governs automatic shuffled selection and new forward Next selections.

Maintain a cursor in actual playback history. While shuffle is On, Previous at a position of 3 seconds or less moves backward to the nearest remaining playable history ID; manual Next and automatic normal advancement first follow existing forward history after such a backward move, then consume unvisited shuffled IDs. Replayed IDs are marked visited and removed from the current unvisited remainder. Repeat-one still applies on automatic completion during history replay. While shuffle is Off, Previous/Next use visible queue order; at its beginning Previous restarts the current track, while Next/end wrapping follows repeat-queue. Explicit row selection truncates forward history and marks the selected ID visited, without reintroducing previously visited IDs. An automatic repeat/restart of the same track does not append another history entry. Cap history at 1000 entries, discarding the oldest and preserving the cursor where possible.

Add playable IDs at random positions in the unvisited remainder; remove deleted/failed IDs from the cycle and navigable history. Visible reordering does not change an existing shuffle cycle or history. A repeat-queue cycle includes every currently playable ID, but when at least two exist its first selection must differ from the just-completed ID. With one playable ID, wrapping to that ID is allowed. At exhaustion with repeat Off, keep the active ID and stop on automatic completion; manual Next leaves the current track and transport unchanged.

Removing an inactive track must not interrupt playback. When removing the active track, select the next available track and preserve playing/paused state. If there is no next track, select the previous available one. If the queue becomes empty, stop. Automatically skip unreadable files with a notification; limit each scan to the number of queue items to prevent an infinite loop.

For active-track removal, “next/previous available” means the nearest playable successor/predecessor in **visible queue order**, without wrapping and regardless of shuffle/repeat. Mark the replacement visited when shuffle is On, truncate forward history, and record the replacement as a selection. If no playable replacement exists, stop, set active ID to null, and retain failed rows for retry/removal. A decode/playback failure marks the ID failed and excludes it from automatic selection even under repeat-one. A failure scan tries each candidate at most once; stop with a visible error when no playable ID remains. Successful retry makes the ID available again and inserts it into the unvisited shuffle remainder if applicable.

After a reload, settings persist, but local File objects and object URLs do not. Show an empty queue; do not present previous local files as available. A persistent IndexedDB music library is outside the first-release scope.

## 7. Shared Audio and Analysis Model

### 7.1. Technology Stack

React + TypeScript + Vite; CSS custom properties and CSS Grid; Web Audio API; AudioWorklet for synchronized PCM capture; Web Worker for FFT, history, and pitch detection; Canvas 2D for the visualizers. Use WebGL for dense spectrogram textures only if profiling demonstrates a rendering bottleneck. A UI component library is optional.

Pin dependencies in a lockfile. The README must list the exact Chrome/Edge, Firefox, and Safari versions tested during implementation; “modern browsers” is not a compatibility report. Production requires HTTPS; use localhost for development because AudioWorklet requires a secure context ([MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)).

Support desktop Chrome, Edge, Firefox, and Safari in their current and immediately preceding stable major versions available when implementation begins. Mobile targets are current stable Chrome on Android and Safari on the current and immediately preceding major iOS release. Freeze the exact browser/OS matrix in the README at that milestone; older versions are best effort through feature detection and the documented fallback. Mandatory MP3, PCM16 WAV, and PCM24 WAV playback plus the five-module primary path must pass on the supported matrix before release. Optional codecs may differ by browser and OS. Do not declare an untested matrix entry supported; record an unavailable test environment as outstanding verification, not a pass.

### 7.2. Data Flow

```text
File → Object URL → one HTMLAudioElement → MediaElementAudioSourceNode
    → AudioWorkletNode (unchanged stereo passthrough)
        ├─ audio output → volume/mute GainNode → AudioContext.destination
        └─ synchronized L/R PCM + sample index → Worker
               → M/S, STFT, envelopes, stereo analysis, scope
               → bounded result batches → Canvas renderers
```

Create one MediaElementAudioSourceNode for the media element; switch the element's source when changing files. Maintain exactly one audible route to the destination to avoid doubled audio. Keep HTMLAudioElement volume=1 and muted=false; control output with GainNode. Call `AudioContext.resume()` from a user gesture.

The worklet passes input samples through unchanged, without normalization or effects, and captures continuous blocks for analysis. Do not assume a fixed render-quantum length; inspect the actual input-array length. Duplicate mono as L=R. For multichannel content, use an explicitly documented Web Audio stereo downmix; do not present it as analysis of all original channels.

Configure the worklet input with `channelCount: 2`, `channelCountMode: "explicit"`, and `channelInterpretation: "speakers"`. Explicitly configure one output with two channels, for example `outputChannelCount: [2]`, and copy both input channels to the output. Verify mono duplication and multichannel downmix separately. The two post-downmix channels do not establish the source file's original channel count.

Packets contain sessionId, captureEpoch, sequence, firstSampleIndex, sampleFrameCount, and sampleRate. `firstSampleIndex` is the absolute AudioContext frame index of the first captured frame, anchored to the worklet's `currentFrame`; it is not a media-file sample index. Sequence increments for every attempted batch within an epoch, including dropped batches. Default batch size is 1024 stereo sample frames; 2048 is allowed only when the default latency target remains satisfied. Transfer TypedArray batches using pooled/recycled buffers. A stereo sample frame contains one sample per channel. Do not send a MessagePort message per sample. SharedArrayBuffer is an optional optimization, not a mandatory hosting requirement.

The Worker analyzes continuous PCM, not intermittent snapshots taken by requestAnimationFrame. Renderers use timestamps so history speed is independent of FPS. Bound all queues. Under overload, discard stale visualization work and mark a history discontinuity; never delay audible output or display increasingly stale data.

**Boundary protocol:** the main thread owns monotonically increasing sessionId and captureEpoch values and serializes transport mutations. Before committing a seek, repeat restart, or source switch, immediately reject incoming results, close the capture gate, and wait for the worklet's boundary acknowledgment containing its effective AudioContext frame. The worklet discards its partial batch before acknowledging. Then perform the media mutation, increment sessionId, clear live analysis/history, and reopen capture only after the corresponding seek/load has completed and playback is actually active. Paused mutations keep capture closed. Every reopening increments captureEpoch and acknowledges its first permitted frame; the Worker and renderers reject packets/results from any prior session or epoch. Rapid seeks/switches supersede older requests; a late media event or play promise must never reopen a superseded boundary.

Pause, buffering, context interruption, hidden-page entry, and plot freeze close the same gate without changing the source session. Discard partial PCM, STFT, pitch, and correlation windows at those boundaries. Each reopening uses a new captureEpoch. History retained through pause/buffering remains historical data, but no frame from a closed epoch may be accepted after reopening. Boundary acknowledgment has a 250 ms active-page deadline. With a suspended/interrupted context, reject old results immediately and allow the media mutation while capture remains logically closed; acknowledgment is deferred until recovery and must complete before reopening, rather than blocking paused file selection indefinitely. Do not infer a processor failure from that condition. In fallback with no operative PCM worklet, invalidate results and perform media mutations without a worklet acknowledgment. A running-context acknowledgment timeout follows Section 14.3 recovery.

**Analysis revisions:** each analysis task has an analysisRevision incremented for settings that change its numerical output, such as FFT size/window/channel, pitch channel, or filtered-band configuration. The Worker acknowledges a new configuration with its effective sample boundary, discards incompatible partial windows, and tags every result with its revision. Accept only results matching the current session, epoch, and task revision. Display-only changes do not increment numerical revisions or rebuild the audio graph. Changing one task does not reset unrelated tasks; shared STFT tasks are reused only when their full configurations match.

**Clock contract:** within an active capture epoch, AudioContext frame differences advance the visual timeline, including dropped intervals, which appear as missing-data gaps rather than silence. Paused, buffered, interrupted, hidden, and frozen intervals do not append history. Mark resumed history segments with a discontinuity, without bridging their curves. Anchor each segment to AudioContext frame/time, a media currentTime observation, and playbackRate at opening; start a new mapping segment on a rate change. Media-time tooltips are approximate because media events/observations are asynchronous. STFT history timestamps refer to window centers; amplitude buckets carry start/end frame indices. Correlation/pitch/scope results carry the analyzed interval and latest available sample index. Never use message-arrival time as signal time. Measure the Section 14.2 latency target from the latest captured sample used in a displayed result to its actual render time, separately reporting STFT window-center age and device latency.

History is measured in seconds of the played stream: at 2× speed, a 5-second plot covers approximately 10 seconds of the original track. Maintain segmented mappings between AudioContext time, media currentTime, and playbackRate for tooltips. Start a new mapping segment on a speed change. Seeking, repeat, and track switches start a new session.

On pause, stop adding analysis blocks to history: the running AudioContext may continue producing zeros, but these must not overwrite the frozen frame. On resume, continue with a new time mapping and exclude the pause duration from the visual timeline. Clear partial STFT/pitch windows at the pause boundary so analysis does not concatenate unrelated samples across a discontinuity; the existing historical image may remain. Actual zeros during active playback are track silence and must be analyzed normally.

Stereometer must receive paired L/R samples from the same block. Do not use two independent AnalyserNode polls as the primary source for phase analysis.

### 7.3. Channels and Units

Define `M=(L+R)/2` and `S=(L−R)/2`. Use these coefficients consistently across modules and tests. A visualizer's channel selector changes analysis, not audible routing.

PCM amplitudes are nominally −1…+1; amplitude 1 corresponds to 0 dBFS. Do not hide out-of-range values through automatic normalization. Amplitude level: `20·log10(max(abs(a), ε))`. Calculate RMS separately; do not call it sample peak. Below-floor silence displays as no energy, without NaN or Infinity.

The default frequency-analysis channel is **Stereo energy**: average L/R power before conversion to dB. Do not use Mid alone, because equal anti-phase signals would cancel. Left, Right, Mid, and Side remain selectable.

Frequency is limited by Nyquist, `Fs/2`; plot range: 20 Hz…min(20 kHz, Fs/2). Axes and tooltips use the AudioContext's actual sampleRate after any resampling, rather than relying solely on source-file metadata.

### 7.4. Shared Spectral Calculation — Design Decision

1. Defaults: N=4096, Hann window, hop=N/4, 75% overlap. Use periodic Hann `w[n]=0.5−0.5·cos(2πn/N)` for n=0…N−1. Alternative periodic Blackman: `w[n]=0.42−0.5·cos(2πn/N)+0.08·cos(4πn/N)`. Account for each window's actual coefficient sum during normalization.
2. Compute a real FFT for each required analysis channel, using the **unnormalized forward transform** convention. If the FFT library scales its forward output, compensate before applying the formulas below. Bin frequency: `f[k]=k·Fs/N`. At Fs=48 kHz, bin spacing is 11.71875 Hz and the window spans approximately 85.33 ms: a trade-off between frequency and time resolution.
3. For interior positive-frequency bins, normalize one-sided amplitude using the window sum: `A[k]=2·abs(X[k])/sum(w)`. Do not double DC or Nyquist. For Stereo energy, use `Pstereo[k]=(AL[k]^2+AR[k]^2)/2` and `Astereo[k]=sqrt(Pstereo[k])`.
4. Display `20·log10(max(A[k], ε))`. Label it as a spectral level in dBFS, calibrated to the peak amplitude of a bin-centered sinusoid. It is not LUFS or a power spectral density in dB/Hz.
5. Spectrum and Spectrogram share results when N/window/channel match. Otherwise, run separate STFT tasks; changing one module must not silently alter another.
6. For logarithmic or Mel coordinates, aggregate bins into pixel buckets by maximum power. If a bucket is narrower than one bin, interpolate for drawing and disclose that interpolation does not increase frequency resolution.

This is Visu@lizer's proposed analysis model. The built-in AnalyserNode follows its own standardized algorithm; do not mix its levels with custom Hann-normalized values without calibration ([Web Audio specification](https://www.w3.org/TR/webaudio/)).

## 8. Spectrogram

### 8.1. Observations from the Recording

The leftmost module stores frequency history. Between 0.00/0.25/0.50/0.75 s, structures move left and new material appears on the right. Horizontal illuminated bands correspond to sustained frequency components; broad vertical marks indicate brief changes or attacks. Lower-energy gaps are visible around 12.67 s; denser bands reappear around 15.83 and 31.67 s. The color map appears to encode spectral intensity, rather than time position.

Visible settings: Orientation Horizontal/Vertical, Speed=1.00, Loop=off, Fade=1.00, and Main/FFT/Overlay tabs. The exact meaning of Loop and Fade cannot be established from this single settings state.

### 8.2. Visu@lizer Mechanism

Each STFT window produces a frequency slice. X is time; Y is frequency increasing upward. New slices appear at the right, while older slices move left. Default visible history: 8 seconds. In vertical orientation, time progresses downward with the newest row at the bottom; X is frequency increasing to the right. Explicitly update the axes.

Convert level to normalized intensity: `u=clamp((dB−floor)/(ceiling−floor),0,1)`. In dark mode, silence is black and stronger energy is lighter. In light mode, silence is white and stronger energy is darker. Apply grayscale gamma `u^γ`; default γ=1. Values above the ceiling saturate.

Use a ring buffer of time slices and an offscreen image or texture. Position slices by sample-derived time: do not equate one FFT slice with one pixel per animation frame. Aggregate multiple slices landing in the same pixel by maximum intensity. Zooming must not imply new information.

Store pre-fade, pre-trim spectral levels independently of the current display floor/ceiling/gamma. Use unsigned 16-bit codes: 0 is an exact-silence/below-storage-floor sentinel; codes 1–65535 cover −160…+160 dBFS uniformly. Values below −160 dBFS use the sentinel and a “≤−160 dBFS” tooltip; values above +160 dBFS clamp to the highest code with a “≥+160 dBFS” tooltip. Never report a bounded code as an exact measurement. This storage precision is approximately 0.0049 dB and covers every supported display range without clipping at the selected floor. Keep sample-derived timestamps and frequency-bucket edges with the ring. Default retained frequency buckets are 1024 fixed logarithmic buckets across the plotted frequency range, independent of Canvas width; assign maximum bin power to buckets as in Section 7.4. Interpolated buckets must remain identified as interpolation. Retained bucket count may be reduced only under the explicit memory policy in Section 14.2, with the resulting resolution disclosed.

Theme, gamma, level range, global trim, orientation, fade, resize, and Scroll/Sweep changes redraw the retained raw levels without modifying them. Reproject retained frequency buckets for Log/Linear/Mel scale changes using their edges and maximum power; no new frequency detail is created. Tooltips report the actual retained bucket range, not an invented narrower range. Frequency-scale changes do not clear history. Increasing the requested history duration shows available older slices plus empty unavailable history; do not fabricate data. Newly enabled modules start with empty history.

Scrolling is the default time mode. An alternative **Sweep** mode independently develops the reference's Loop idea: a write head moves across the plot and overwrites the oldest data after wrapping. Mark the boundary between newer and older content. Do not claim that this reproduces MiniMeters Loop.

### 8.3. Settings

| Parameter | Values | Default |
|---|---|---|
| Orientation | Horizontal / Vertical | Horizontal |
| Base history duration | 2–20 s | 8 s |
| Visual scroll speed | 0.25×–4× | 1×; effective duration = base duration / speed |
| Time mode | Scroll / Sweep | Scroll |
| FFT size | 1024/2048/4096/8192/16384 | 4096 |
| Window | Hann / Blackman | Hann |
| Frequency scale | Log / Linear / Mel | Log |
| Level range | Floor −120…−40; ceiling −30…0 dBFS | −90…0 dBFS |
| Gamma contrast | 0.5–2 | 1 |
| Channel | Stereo energy/L/R/M/S | Stereo energy |
| Grid | Off/On | Off |
| Endpoint labels | Off/On | On |
| History fade | Off / 2–20 s time constant | Off |

History fade multiplies displayed intensity by `exp(−age/τ)`; τ is the time to reach 1/e of the initial intensity. This is a visual effect, not a change to the source level. Tooltips show pre-fade dB, frequency bucket, and time relative to the playback position.

Pause freezes the buffer completely. Seeking or track switching clears it. Changes to FFT size/channel/window clear incompatible history; changes to gamma/level range/theme redraw stored levels.

## 9. Waveform

### 9.1. Observations from the Recording

The second module contains two horizontal lanes. Initially the upper lane has much less amplitude than the lower; by 6.30 s, both become dense. Across successive frames, content moves left and new data appears at the right. Around 12.67 and 22.17 s, the lanes again differ markedly in density. This is amplitude history, not an FFT plot or a static whole-file overview.

Visible settings: Channel 1=Side, Channel 2=Mid, Color Mode=Multi-Band, History=Off, Speed=1.00. Therefore, the two reference lanes must not automatically be described as Left and Right. Left/Right/Mid/Side and disabling the second lane are explicitly available. `History=Off` does not eliminate the ordinary scrolling waveform, so it likely refers to an additional history feature; its exact implementation is not established.

### 9.2. Visu@lizer Mechanism

Display the latest 5 seconds of PCM, with new data at the right. For each time bucket, calculate minimum and maximum samples and draw the interval between them around the zero line. Do not directly average samples: this would erase brief peaks. An optional thin inner RMS envelope is Off by default.

The reference-inspired default preset uses Side in the upper lane and Mid in the lower lane, with persistent `S`/`M` labels. Also provide L/R and single-lane configurations. Both lanes use the same fixed ±1 scale for comparison. Visual gain defaults to 1× and does not change audio.

A separate whole-file overview may appear in the player's seek bar if it can be prepared safely. It does not replace live Waveform. Use a separate Worker and permit decodeAudioData only if the estimated decoded PCM size, `duration·sampleRate·channels·4`, is at most 128 MiB. The estimate must conservatively account for source channels and the decoding sample rate; if these cannot be established, skip the optional overview. On failure or an excessive estimate, retain a standard seek bar. Do not fully decode a long WAV solely for a decorative thumbnail.

`decodeAudioData` runs through an AudioContext on the main thread; the separate overview Worker computes summaries from decoded PCM transferred to it, and never decodes through a Worker-local AudioContext. Permit only one overview job at a time. Reserve the encoded input, decoded PCM, any channel-copy buffers, and summary storage together within the separate 128 MiB overview working-data budget before starting; the decoded-size check alone is insufficient. Do not claim that browser-internal decoder memory is included in this application-owned budget. Estimate channel copies conservatively rather than assuming AudioBuffer storage can be transferred without copying. Skip overview when reservation is unsafe. Cancel by invalidating the job token on removal/source replacement; an in-flight browser decode may finish, but its stale result is discarded and buffers released. Release the decoded PCM after summaries are ready. Retain only the current track's completed overview, and preserve it on seeks within that track.

The monochrome alternative to Multi-Band is **Frequency Layers**: Low below 200 Hz, Mid from 200 to 2000 Hz, High above 2000 Hz. Proposed crossovers: fourth-order Linkwitz–Riley, separately applied to each selected analysis channel. These filters serve supplementary visualization; the main peak envelope always comes from the original signal.

Distinguish bands through grayscale and texture: a dense dark/light layer for Low, a thin intermediate trace for Mid, and points for High. Provide a legend beside the setting. Do not sum band RMS values and treat the result as the original waveform amplitude; filtered layers are not an exact decomposition of sample peaks.

### 9.3. Settings

| Parameter | Values | Default |
|---|---|---|
| Lane 1 | L/R/M/S | S |
| Lane 2 | Off/L/R/M/S | M |
| Base history duration | 1–10 s | 5 s |
| Visual scroll speed | 0.25×–4× | 1×; effective duration = base duration / speed |
| Style | Filled / Outline / Frequency Layers | Outline |
| Visual gain | 0.5×–4× | 1× |
| RMS envelope | On/Off | Off |
| Additional band history | Off/Fast/Slow | Off |

The final setting is an independently defined counterpart to the History idea: thin Low/Mid/High RMS strips beneath the main waveform, with 2-second/8-second horizons for Fast/Slow. It does not replace the main waveform. Spectrogram/Waveform time linking is explicit and initially Off because their default horizons differ. When enabled, use one shared effective duration; adjust both plots together and show the shared value.

Linked effective duration is 0.5–40 seconds, the intersection of the independent effective-duration ranges (Spectrogram 0.5–80 seconds; Waveform 0.25–40 seconds). On enabling linking, initialize it from Waveform's current effective duration and clamp to this intersection. Retain each module's unlinked base duration and speed as separate settings; disable those controls while linked and expose one shared seconds control instead. While linked, the shared value overrides only the two main histories; auxiliary band history remains independent. Unlinking restores the retained unlinked settings. Persist the shared value, link flag, and unlinked settings, and validate all ranges on preset import. Changing linking/duration does not reset compatible existing history; history not retained is empty. Required settings and memory limits must never be silently exceeded.

For multi-resolution Waveform summaries, preserve sample count and sum of squares along with min/max. Combining buckets takes extrema and adds counts/energy, then computes `RMS=sqrt(sumSquares/sampleCount)`; do not average RMS values or extrema. Each bucket records its frame interval and discontinuity status. Filtered-band summaries remain distinct from raw peak summaries and restart their filter state after missing-data boundaries.

With visual gain above 1, mark clipped displayed peaks with short edge ticks. Tooltips show time, min/max, and RMS for the selected bucket. Do not present bucket extrema as measurements of one exact sample.

## 10. Stereometer

### 10.1. Observations from the Recording

The third module is a narrow field between Waveform and Oscilloscope. At 0.00 s, its shape is nearly vertical. By 0.75 and 6.30 s, it expands into a wider cloud or loops. At 12.67 and 22.17 s, it becomes narrow and elongated again. Width and tilt change, not just height. Do not copy the reference's colored point groups literally.

Visible controls include the `Linear` mode selector, `Color` menu, and `Point Size` button. The image does not establish Linear mode's exact formulas. Define Visu@lizer's geometry explicitly.

### 10.2. Visu@lizer Mechanism

Primary **M/S** mode: for each synchronized sample pair, use `x=S` and `y=M`. Invert screen Y so positive M is upward. The center is zero. L=R produces a vertical trace; L=−R produces a horizontal trace. Left-only and right-only signals produce opposite diagonals. Positive peaks are at positive M/positive S for Left and positive M/negative S for Right; negative peaks occupy the opposite halves. Label L/R directions and Mono unambiguously.

Draw a fine point cloud from the latest 80 ms, with a default persistence time constant of 250 ms. If the point count exceeds the rendering budget, sample evenly in time while retaining extreme-amplitude pairs. Never replace paired L/R values with independently randomized points. Default point size: 1 CSS px; antialiasing is allowed.

Define negligible channel energy as RMS below −100 dBFS over the correlation window. Display `—` when either channel is below that threshold. When both channels are negligible, insert no new Stereometer points, including no repeated origin point; retained points decay normally. Points within the configured point window have full point opacity; beyond that window, multiply opacity by `exp(−(age−pointWindow)/τ)` when τ>0, and remove a point once its opacity falls below 1/255. With τ=0, retain only the point window and never evaluate a decay division. Evaluate age from the visual timeline, not animation-frame count. A captured sample pair contributes once to the retained point set; redraws at higher FPS must not repeatedly accumulate the same points. Select rendered pairs in fixed sample-timed 1 ms buckets with a maximum of 24 pairs per bucket in desktop mode and 12 in mobile/economy mode, retaining time-distributed samples and extrema within that limit. This stays below the per-frame budgets at both 30/60 FPS and produces the same selected set at equivalent timestamps for a fixed mode.

Additional modes:

- **L/R (Lissajous):** x=L, y=R; mono produces one diagonal and equal anti-phase content the other. Update axis labels when changing modes.
- **M/S Auto Zoom:** the same geometry with one shared X/Y gain calculated from a smoothed maximum. Maximum automatic gain: 8×; attack: 100 ms; release: 500 ms. Independent axis stretching would distort width and is prohibited. Display the current multiplier. Below the silence threshold, suppress automatic amplification.

Provide a small correlation readout: `ρ=Σ(L·R)/sqrt(ΣL²·ΣR²)` over a 100 ms window, range −1…+1. This is a normalized interchannel dot product, without mean subtraction. Under silence or negligible energy in either channel, display `—`, not +1. Mono is approximately +1; equal anti-phase content approximately −1. These are signal characteristics, not a universal assessment of musical quality.

An optional width ratio is `RMS(S)/max(RMS(M),ε)`. Do not label it as a universal percentage. When M is too small, use a bounded indication such as `>10` or `—`. The correlation readout alone is sufficient by default.

### 10.3. Settings

| Parameter | Values | Default |
|---|---|---|
| Geometry | M/S / L/R / M/S Auto Zoom | M/S |
| Point window | 20–200 ms | 80 ms |
| Persistence time constant, decay to 1/e | 0–500 ms | 250 ms |
| Point size | 1–3 CSS px | 1 px |
| Visual gain | 0.5×–4× | 1× |
| Grid | Off/On | Off |
| Direction labels | Off/On | On |
| Correlation | On/Off | On |

Use monochrome points. If Frequency Layers is enabled, apply the same band definitions/textures as Waveform, filtering the paired channels consistently. This mode is Off by default. Pause freezes the display; active-playback silence lets the trace decay to an empty field; seeking clears the trace. A persistence value of zero means no retained trail and must not cause division by zero.

## 11. Oscilloscope

### 11.1. Observations from the Recording

The fourth module displays a short signal segment around a horizontal zero line, with a fine bright outline and translucent fill. At 0.00/0.50 s, small oscillations occur within a larger waveform. At 0.25 and 12.67 s, the shape approaches one smooth cycle. At 6.30 s, the outline is much less regular. There is no long scrolling history.

Visible settings: Mode=Pitch and Cycle=Single; Free and Multi are available. The shape's stability is consistent with pitch synchronization, but the exact MiniMeters detector and trigger cannot be established from the video.

### 11.2. Visu@lizer Mechanism

X represents a short time interval; Y is signed amplitude. In Free mode, use a recent 20 ms PCM display window, adjustable from 5 to 100 ms. A Rising trigger locates an upward crossing of the selected trigger level. It is specifically a zero crossing when that level is zero. Use a small hysteresis of 0.01 full scale to reduce noise-induced jitter. Retain enough PCM before the display window to find a trigger with a full window after it. If none is available, show the latest continuous window.

In Pitch mode, estimate fundamental frequency from PCM using a periodicity detector, such as YIN, rather than selecting the largest FFT bin. Working range: 40–2000 Hz; analysis buffer: 4096 sample frames at 48 kHz, scaled appropriately for the actual sample rate. Require confidence ≥0.8 and RMS above −60 dBFS. Define the detector-specific confidence measure; these thresholds are design values to validate with test signals, not recovered MiniMeters parameters.

Default detector: YIN with lag bounds corresponding to 40–2000 Hz, cumulative mean normalized difference (CMND), and confidence `clamp(1−CMND(lag),0,1)`. Select the first qualifying local trough at CMND ≤0.2 and refine its lag by parabolic interpolation; otherwise fall back to Free. Evaluate at 20 ms analysis intervals using the latest complete detector window; no confident stale estimate survives a discontinuity or failed current confidence/RMS check. The detector window is `ceil(4096·Fs/48000)` frames, with a comparison span of `windowLength−maximumLag` so each lag uses the same number of differences. Phase stabilization may select the qualifying crossing nearest the predicted phase from the previous valid frame; it must not smooth or replace the captured waveform itself.

The detector window and rendering ring are separate. Retain at least 300 ms of paired L/R PCM (`ceil(0.300·Fs)` frames); this covers the 200 ms Stereometer point window, 100 ms Free window, and four 40 Hz cycles (100 ms) with trigger-search margin. For a requested window of duration D ending no later than the latest sample at T, search crossings in [T−D−100 ms, T−D]; prefer the latest qualifying crossing in Free mode or the phase-consistent qualifying crossing in Pitch mode. Skip the search when Trigger is Off. Interpolate trigger position and fractional-period endpoints from actual samples. Falling uses the opposite crossing polarity with the same 0.01 hysteresis. For unavailable trigger crossings, use the latest full window; when f0 remains reliable, label it with the requested period count and indicate that the trigger is unlocked. A session/epoch discontinuity clears the ring, and incomplete startup windows show “Preparing analysis” without zero-padding a false waveform.

For reliable `f0`, calculate period `P=Fs/f0` and display 1/2/4 periods from a stable trigger crossing. Interpolate the fractional period length rather than truncating P to an integer sample count. Smooth phase alignment while drawing the actual recent waveform, never a synthesized sinusoid. Rising/Falling follow the chosen trigger polarity; with Trigger Off, do not force phase locking.

For noise or polyphonic material without reliable f0, fall back to Free and show “Pitch undetermined.” Do not lock onto an unreliable note or keep a stale attractive cycle. Use a reasonable fixed visual gain; do not automatically amplify silence.

Outline: 1–1.5 px. Fill between the trace and zero: opacity 0.04–0.08. Optional persistence: up to 200 ms, expressed as decay time to 1/e; zero disables the trail. Do not smooth away small oscillations that characterize the waveform. If samples exceed the plot width, preserve per-pixel min/max extrema rather than simply skipping every Nth sample.

### 11.3. Settings

| Parameter | Values | Default |
|---|---|---|
| Mode | Pitch / Free | Pitch |
| Cycles in Pitch | Single / 2 / 4 | Single |
| Free display window | 5–100 ms | 20 ms |
| Channel | L/R/M/S | M |
| Trigger | Off/Rising/Falling | Rising |
| Trigger level | −0.5…+0.5 | 0 |
| Visual gain | 0.5×–4× | 1× |
| Persistence time constant | 0–200 ms | 0 |
| Fill | On/Off | On |

Mid-channel pitch may become undetectable for anti-phase content. Explain the channel choice and allow L/R. Time labels must match the mode: milliseconds in Free, cycle count and f0 in Pitch. Oscilloscope is a short waveform display, distinct from Waveform's accumulated amplitude history.

## 12. Spectrum

### 12.1. Observations from the Recording

The rightmost module displays current frequency content: low frequencies on the left, high frequencies on the right, with reference labels around 100 Hz, 1 kHz, and 10 kHz. The outline and numerous vertical colored bars change continuously. At 0.00/0.50 s, a strong low-frequency peak is visible; at 12.67 s, the profile changes and a prominent peak appears higher in frequency. This is a current spectrum, rather than Spectrogram's time history.

A fainter second line is present. The recording does not establish whether it is a reference, an average, or another channel. In Visu@lizer, an optional second line is explicitly defined as peak hold, labeled and Off by default.

Visible settings: Style=Both (FFT/Color Bars/Both), Smoothing=90%, Tilt=4.50 dB, FFT Size=4096, FFT Scale=Log. Sizes from 1024 through 16384 and Mel/Linear scales are available. The recording shows changing dB/Hz/note/cents text over the plot. Its exact relationship to a peak or cursor cannot be established, so Visu@lizer defines its own behavior.

### 12.2. Visu@lizer Mechanism

Use the current STFT from Section 7. X is frequency, logarithmic by default; Y is spectral level from −90 to 0 dBFS. Draw a thin monochrome line. Bars mode uses neutral vertical bars; Both combines the line with subdued bars beneath it.

Smooth power before converting to dB: `Psm=α·Pprev+(1−α)·Pcurrent`. Convert the UI percentage to a fraction `s=percentage/100`. Define s as the smoothing coefficient at a reference step of 1/60 s, then use `α=s^(dt/(1/60))`, where dt is the elapsed analysis time in seconds. For s=0, set α=0 explicitly. This makes smoothing independent of hop length. The 90% default is a reference-inspired design choice, not a reconstruction of MiniMeters' formula.

Initialize smoothing to zero power on a cleared task and process raw power without a silence gate. A transition to exact silence decays according to the formula; clamp only the displayed dB to the selected floor, not the smoothing state. During pause/buffering/freeze, retain the current state without decay; after a dropped-PCM discontinuity, restart the affected smoothing and peaks from a cleared state and label the gap. “Raw dBFS” in Spectrum tooltips means the temporally smoothed spectral measurement before tilt/global trim; it is not the instantaneous unsmoothed bin value. Spectrogram retains unsmoothed STFT levels. Peak hold follows the same pre-adjustment Spectrum measurement and uses visual-time hold/decay, never wall time spent paused.

Tilt is expressed in **dB per octave** relative to 1 kHz: `displayDb=rawDb+tilt·log2(f/1000)` for f>0. Default: **0 dB/octave** for neutral analysis. A reference-inspired tilt option is +4.5 dB/octave. MiniMeters visibly shows 4.50 dB, but the per-octave unit is not confirmed by the screenshot; this specification defines that unit independently. Tilt affects display only. Tooltips show raw dBFS and a separately labeled adjusted value when tilt is enabled.

Do not directly reproduce Multi-Band brightness or hue. In Bars mode, amplitude is conveyed by height and a small change in neutral density. Pitch/note does not determine color.

Peak hold stores the maximum per bucket, holds it for 0.5 s, then falls at 12 dB/s toward the current level. Display a “Peaks” legend when enabled. Changing FFT size/channel/window resets both peak hold and smoothing.

Cursor tooltips show the bucket's frequency range, raw dBFS, and adjusted dB when tilt is active. Do not describe the frequency under the pointer as a detected note in the music. For the “Frequency note” option, calculate `m=69+12·log2(f/440)`, nearest MIDI note `round(m)`, and cents `100·(m−round(m))`. This labels a frequency mathematically; it does not detect the track's key. On touch, pin the tooltip until the next tap or dismissal.

### 12.3. Settings

| Parameter | Values | Default |
|---|---|---|
| Style | Line / Bars / Both | Both |
| Smoothing | 0–99% | 90% |
| Tilt | −6…+6 dB/octave | 0 |
| FFT size | 1024/2048/4096/8192/16384 | 4096 |
| Window | Hann / Blackman | Hann |
| Scale | Log / Linear / Mel | Log |
| Floor / ceiling | −120…−40 / −30…0 dBFS | −90 / 0 |
| Channel | Stereo energy/L/R/M/S | Stereo energy |
| Peak hold | Off/On | Off |
| Frequency/note labels | Frequency / Frequency and note | Frequency |

Mel scale: `mel(f)=2595·log10(1+f/700)`. Implement the inverse mapping for pointer coordinates. All scales show actual frequency values in Hz.

## 13. Settings and Presets

### 13.1. Independent Settings Interface

Use a side panel approximately 360 px wide on desktop, with Appearance, Layout, Analysis, Performance, and individual module groups. Opening settings from a module menu jumps directly to that group. Use one readable column of controls, a live workspace preview, and explicit units beside values.

Adopt MiniMeters' configurability, not its dark multicolumn settings table, theme names, toolbar, or system Audio Source controls. This website uses local files, so `Default Output Capture`, system routing, and output recording are absent.

### 13.2. Global Parameters

| Group | Settings |
|---|---|
| Appearance | Light/Dark, decoration, glitch, lighting; reduced-motion overrides may only reduce animation |
| Layout | Composition/Strip, module order, visibility, restore default layout |
| Analysis | Global visual trim −12…+12 dB, default 0; linked Spectrogram/Waveform time scale; units and diagnostic sample rate |
| Performance | Auto/60/30 FPS; DPR cap 1/1.5/2; economy mode |
| Presets | Built-in and user presets; save, rename, delete, JSON import/export |

Visual trim is display-only. Convert it to an amplitude multiplier `10^(trimDb/20)` for amplitude plots or add trimDb to displayed spectral levels. It must not change audio output, raw measurements, pitch detection, or correlation. Keep raw dBFS tooltips unchanged and label adjusted levels separately. Apply global trim and local visual gain in a consistent order; display any stereometer auto-zoom multiplier.

All five modules are initially enabled. Allow all to be disabled: the workspace then offers a restore action, while the player and queue remain available. A disabled module must not continue expensive dedicated analysis unless another enabled module needs the same result.

### 13.3. Built-In Presets

1. **White Silence — default:** Light, Subtle decoration, default Composition layout, S/M Waveform, Pitch Single, Log FFT=4096, tilt=0, 90% smoothing.
2. **Night Trace:** Dark; otherwise the same analysis settings, subtle lighting, Stereometer persistence 250 ms.
3. **Reference Study:** supplementary Waveform frequency layers, Spectrum tilt=+4.5 dB/octave, Log/4096/90%, Pitch Single. Remains monochrome; does not promise exact MiniMeters emulation.
4. **Clean Analysis:** decoration Off, no retained trails beyond each module's inherent time history, Spectrum smoothing=50%, tilt=0. Intended for signal inspection.

Store settings in localStorage with schemaVersion and migration logic. Invalid JSON or unsupported legacy fields fall back safely without crashing. Imported JSON must pass type/range validation and be at most 64 KiB; ignore unknown fields. Preset JSON contains no File objects, PCM, or object URLs. “Reset settings” does not clear the queue.

Fresh defaults are the complete module-table defaults plus White Silence, all modules enabled in reference order, linking Off (stored shared duration 5 seconds), plot freeze Off, glitch/lighting On subject to Subtle/reduced-motion limits, performance Auto, desktop DPR cap 2, and economy Off. Auto targets 60 FPS on desktop and 30 FPS on mobile; economy selects 30 FPS and a DPR cap of 1.5. Fresh transport is repeat Off, shuffle Off, rate 1×, volume 100%, mute Off, empty queue, and no playback intent. Persist appearance/layout/analysis/performance/presets only; transport state, queue, history, and transient panels/freeze are not restored after reload.

For performance defaults and point budgets, mobile mode means viewport width below 768 px or a primary coarse pointer; other environments use desktop mode. Explicit 30/60 FPS overrides Auto unless economy is enabled, which caps rendering at 30 FPS. Effective rendering DPR is the minimum of devicePixelRatio, the stored DPR cap, and 1.5 in mobile/economy mode (no additional mobile cap in desktop mode). Keep the stored preference when applying an effective cap and disclose the effective FPS/DPR in diagnostics. Performance-mode changes preserve playback and do not recreate the context.

All built-in presets are complete replacements in the persisted settings domain derived from these fresh defaults, with the listed overrides; applying a preset never changes the queue, position, output volume, mute, speed, playback intent, or transient plot-freeze state. Clean Analysis additionally sets Stereometer/Oscilloscope persistence to 0 ms, Spectrogram history fade Off, and auxiliary band history Off. User presets save the same settings domain as built-ins. Reject nonfinite numbers, incorrect types, invalid enum values, duplicate/missing IDs within a supplied module-order list, out-of-range values, and inconsistent linked settings. Missing supported fields receive defaults; unknown fields are ignored. Validate an imported preset before applying any part of it; failure leaves current settings unchanged. Migrate recognized older schema versions before validation; a newer unsupported schema is rejected with an explanation.

Catch localStorage read/write/quota errors. Continue with in-memory settings/presets for the current session and show a restrained “Settings could not be saved on this device” notice; playback and analysis remain usable. Do not repeatedly announce an identical storage failure. A failed save must not be presented as durable; JSON export remains available. Reset settings uses fresh defaults without clearing the queue or altering transport, and attempts persistence under the same error policy.

## 14. Architecture and Performance

### 14.1. Module Boundaries

```text
src/
  app/                  — main screen, layout, themes
  player/               — audio element, transport, queue, import
  audio/                — AudioContext, graph, lifecycle
  audio/worklets/       — stereo PCM tap and passthrough
  analysis/             — worker, FFT, envelope, pitch, correlation
  visualizers/          — five independent Canvas renderers
  settings/             — schema, defaults, presets, storage
  shared/               — units, math, message types
tests/
  dsp/                  — synthetic signals and numerical verification
  integration/          — import, transport, queue, settings
```

UI state includes queue/currentId/playback/layout/settings. Keep sample streams and FFT data out of React state. Each renderer accepts dimensions, theme, settings, and an analysis snapshot. UI components do not compute FFTs.

Separate `AnalysisSettings` from `DisplaySettings`: theme or line-opacity changes must not rebuild the audio graph. Changing FFT settings must preserve playback state, volume, and position; clearing incompatible visualization history is acceptable.

### 14.2. Resource Budgets

- Desktop target: 60 FPS with five modules, N=4096, 1920×1080 viewport, and DPR capped at 2. Identify the actual test device and browser during implementation; this is a target, not a guarantee for every device.
- Mobile/economy mode: 30 FPS and DPR cap 1–1.5. Do not silently lower FFT resolution. Reduce decorative layers, DPR, rendering frequency, and rendered point count first.
- Stereometer budget: up to 4000 new rendered points per desktop frame or 1500 on mobile, aggregated over time.
- The real-time audio path must not perform FFTs, layout work, JSON serialization, or large memory allocations. The worklet only passes audio through, copies into fixed-size buffers, and sends bounded batches.
- In an active tab, target ≤150 ms visualization delay relative to the captured analysis stream at N=4096/48 kHz. Account separately for device baseLatency/outputLatency. Do not promise sample-accurate synchronization with the physical speakers through MediaElement.
- Limit analysis buffers to 64 MiB. Optional decoded file overview has a separate 128 MiB cap. Store Spectrogram history as downsampled frequency buckets and quantized dB values, not full PCM. A 20-second base history at 0.25× visual speed implies up to 80 seconds of effective history; budget memory for that duration.
- Store long Waveform history as block min/max/RMS summaries. Scope/stereo/pitch use a short PCM ring buffer. Do not retain the whole track for live analysis.
- In a hidden tab, stop requestAnimationFrame, decorative animation, and analysis PCM messages, while maintaining audio passthrough. On return, clear live history and restart at the current position; do not replay minutes of missed frames.
- Resize/throttle changes must not recreate AudioContext. Release object URLs, listeners, buffers, and workers when their owners no longer need them. Keep shared audio infrastructure alive across queue changes; close the context when the application is destroyed. Respect the Undo window and media-element lifecycle before revoking URLs.

Use 12 reusable PCM batch buffers by default, with at most 12 outstanding batches across worklet/main-thread relay/Worker. Ownership transfers with the underlying ArrayBuffer and returns to the worklet after processing or discard; do not copy a batch at each hop. Capture must continue audio passthrough when the pool is exhausted, discard the uncaptured analysis interval, and mark the next packet discontinuous. The worklet must not block, wait for returned credits, or allocate a replacement PCM buffer in `process()`. Inspect actual quantum lengths, handle absent input channels safely, and keep passthrough processing active even when analysis capture is disabled.

Retain at most three transferable result snapshots per module and at most one pending render snapshot per module; newer matching results replace pending older ones. Discard queued PCM whose latest sample is more than 100 ms behind the running AudioContext and restart the affected continuous-analysis windows. Sequence gaps, noncontiguous sample indices, dropped results needed for time history, and explicit discontinuity flags must never be treated as adjacent PCM. Reset STFT/pitch/correlation windows, affected spectral smoothing/peaks, band filters, and scope/stereo point windows at a PCM gap; retain older long history separated by a missing-data marker. Visualization dropping has no effect on audible transport.

The 64 MiB analysis-buffer budget includes application-owned PCM pools/rings, FFT scratch/window arrays, filtered data, all retained history, result pools, and in-flight copies across the main thread and Worker; transferred ownership is counted once. Canvas backing stores, browser decoder internals, and the separately capped overview are reported separately. Reserve memory before changing settings. Spectrogram history has a 24 MiB sub-budget and at most 100 retained slices per second; combine higher-rate slices in sample-timed 10 ms buckets by maximum power, retaining their interval. Start with 1024 frequency buckets, then reduce to 512 or 256 only if necessary to fit the reserved duration; disclose the effective bucket count. Do not silently change FFT size, selected duration, or waveform extrema. If even the minimum retained resolution cannot fit, reject that settings change with an explanation and keep the previous valid configuration.

For active-page performance reporting, measure latest-sample visualization latency over a 60-second steady-state run at the default configuration and report median, 95th percentile, and maximum. The ≤150 ms target applies to the 95th percentile; report FFT window-center age separately. Report median FPS and 95th-percentile render-frame duration on the identified device. Defaults must meet these targets on the chosen desktop reference device; results for other supported devices are documented rather than assumed. A no-result Worker watchdog uses a deadline of `max(1 second, 2·longestEnabledAnalysisWindowSeconds)` only while capture is eligible and fresh PCM is being submitted; restart the deadline at initialization, a discontinuity, or a numerical configuration change. Hidden, paused, buffering, frozen, all-disabled, and interrupted states must not trip it. The window-dependent deadline prevents a large FFT at a low sample rate from being mistaken for a failed Worker during startup.

### 14.3. Fallback

If AudioWorklet is unavailable or fails to initialize, retain playback and explain the limitation. Use AnalyserNode for Spectrum/Spectrogram and single-channel Waveform/Free Oscilloscope with explicitly reduced history fidelity. Disable Stereometer with an explanation if synchronized PCM pairs cannot be guaranteed. Do not draw a simulated stereometer. Keep the selected settings intact; label any unavailable channel/pitch/history features and use the fallback's documented effective settings rather than overwriting the user's settings.

Fallback is a degraded mode. Acceptance of all five modules must occur on the supported primary path. AnalyserNode FFT sizes are restricted to powers of two; see [MDN: fftSize](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize) for the property and range. Do not apply custom-FFT normalization blindly to this fallback.

**Worklet recovery:** handle `processorerror` as well as module-load/construction failure and a running-context boundary timeout. A processor that throws can output silence for the remainder of its lifetime ([MDN: AudioWorkletNode events](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode#events)); continuing to route audio through it is not recovery. Close capture, invalidate epochs/results, disconnect the failed node's audible route, then connect the existing MediaElementAudioSourceNode directly to the existing volume/mute GainNode. Configure that GainNode for explicit two-channel speaker downmix so primary and bypass routing analyze/play the same stereo interpretation. Connect fallback analysis before output gain. Never leave primary and bypass routes connected simultaneously; a brief recovery interruption is acceptable, doubled output is not. Preserve active file, currentTime, playback intent, rate, volume, and mute; no new media source node or AudioContext is created.

Attempt one automatic replacement worklet per page lifetime after a runtime failure while bypass playback continues. Allocate its pool and confirm an initialization handshake before switching the single audible route back; start a new session with empty live history. If replacement fails, stay in fallback with a visible explanation and a manual “Retry analysis” action. Manual retry may attempt another replacement; initialization failure on first load enters fallback directly. Retire failed node listeners/ports and reclaim its pool where ownership permits. Gate and protocol timeouts during recovery leave capture closed.

**Worker recovery:** handle Worker `error`, `messageerror`, and the eligible no-result watchdog. Freeze plots with an analysis-error label, close PCM capture, terminate the failed Worker, reclaim owned buffers, and reset task revisions/pools. AudioWorklet passthrough continues unchanged. Attempt one automatic Worker restart per page lifetime, with an initialization acknowledgment within 2 seconds of active-page operation; on success, start a new session and empty histories at the current playback position. If it fails, disable PCM messaging and use the documented AnalyserNode fallback with a manual Retry action. Do not recover by repeatedly queuing PCM or restarting in an unbounded loop. Explicit page teardown terminates workers and releases every remaining resource, including Undo-owned URLs.

## 15. Accessibility and Controls

- Every button has a visible or accessible name, focus ring, and a touch target of at least 44×44 px; the icon itself may be smaller.
- Space: Play/Pause. Left/Right: seek ±5 seconds. Shift+Left/Right: seek ±15 seconds. M: mute. Q: queue. Escape: close panel/focus mode. Do not intercept typing in inputs or the normal keyboard behavior of a focused slider/control.
- Sliders expose a label, minimum, maximum, current value, and units. Volume, seeking, and settings are keyboard-accessible.
- Opening a modal panel moves focus inside; closing returns focus to its trigger. Make the background inert while modal and let Escape close the topmost layer.
- Canvas elements have a name and a short description of the displayed quantity. Provide useful textual summaries nearby. Do not update live regions 60 times per second.
- Use restrained aria-live notifications for import/errors. Announce transport-state and active-track changes, not sample updates.
- Text contrast: at least 4.5:1. Essential traces and controls: at least 3:1. Decorative grid lines may have lower contrast if they do not carry the only representation of data.
- Reduced motion disables decoration and long transitions. “Freeze plots” leaves audio running; unfreezing clears history and displays the current position without rapidly replaying accumulated animation.

The 3:1 trace requirement applies to primary outlines, symbols, and controls, not every low-energy spectrogram pixel or fading persistence point: those tones encode magnitude/age and intentionally approach the background. Provide readable axes/legends and the textual/interactive measurements already required; do not replace the specified continuous grayscale map with a contrast-thresholded binary image.

## 16. Verification and Acceptance Criteria

### 16.1. Numerical DSP Tests

Use synthetic PCM in Worker tests, independent of browser decoders. Document the generator and expected values. Verify numerical results first, then the rendered output. FFT amplitude calibration must use a frequency centered exactly on a bin.

| Signal/action | Expected result |
|---|---|
| Initial exact silence for ≥2 s after a cleared session | Current zero min/max; initialized Spectrum at the floor; Stereometer empty without an origin dot; correlation `—`; no NaN/Infinity. Existing historical Waveform/Spectrogram sound is not required to disappear within 2 s after a later transition |
| Settled bin-centered amplitude-0.5 tone, followed by exact-zero spectral power | With smoothing=90%, Spectrum raw smoothed level is approximately −60.93 dBFS at 2 s after the last nonzero-power update, tolerance ±0.5 dB plus one hop. Clamp display to its floor only when reached; no artificial silence gate. For PCM/STFT transition tests, account for the window tail before timing this decay |
| Bin-centered sinusoid, peak amplitude 0.5 | FFT peak approximately −6.02 dBFS, tolerance ±0.5 dB, at the correct bin |
| 1 kHz tone at 48 kHz/N=4096 | Spectrum peak at the nearest bin(s), frequency error within Δf; horizontal Spectrogram band. Do not apply the bin-centered amplitude tolerance to this off-bin tone |
| Chirp from 50 Hz to 10 kHz | Continuously moving spectral ridge; correct Log/Linear/Mel geometry |
| Impulses at known sample indices | Vertical spectrogram attacks; Waveform preserves impulse peaks after aggregation; history position matches their timing |
| L=R | M equals the input; S≈0; primary M/S trace vertical; ρ≈+1 |
| L=−R | M≈0; S equals the input; M/S trace horizontal; ρ≈−1; Stereo-energy FFT does not vanish |
| Left only / Right only | Opposite diagonals with correct labels; correlation `—` when the other channel has zero energy |
| Independent seeded-noise channels for ≥5 s | Mean correlation near 0, tolerance ±0.1; broad point cloud |
| 100 Hz tone, Pitch Single | One stable cycle; f0 within ±1%; no period doubling |
| 40 Hz tone, Pitch 4 cycles; 2000 Hz tone; Free 100 ms | Complete captured windows with no truncation/zero-padding; f0 within ±1% for periodic tones; triggering works for Rising/Falling and ±0.25 levels on a tone with peak amplitude 0.5 |
| Noise/nonperiodic material | Pitch falls back to Free; no false confident note |
| FPS changed from 60 to 30 | Same history duration and speed; smoothing/decay evaluated at matching timestamps agree within one analysis-hop timing tolerance |
| Output volume/mute changed | Audible output changes; raw plots and correlation do not |
| Tilt set to +3 dB/octave | Display adjustment differs by exactly 3 dB between 1 and 2 kHz; raw tooltips remain unchanged |
| PCM gap, new epoch, or obsolete task revision | No concatenation across missing PCM; filter/window state resets as specified; obsolete results rejected; long history has a discontinuity marker |
| Spectrogram floor/theme/scale changes on retained history | Pre-adjustment levels survive changes within the documented storage precision; sentinel remains silence; reprojected tooltips report actual stored frequency buckets |

For rendering tests, use deterministic input and disable decoration. Image snapshots do not replace numerical DSP verification.

For Stereometer decay, disable added points during exact silence and verify each retained point's opacity against its age and configured time constant; do not require mathematical exponential decay to become exactly zero. Points below 1/255 are removed. A 500 ms maximum time constant can retain a faint prior trace beyond 2 seconds, so transition tests use the computed threshold time. Spectrum decay tests disable peak hold or assess its separate 0.5-second/12 dB/s rule. Histories are checked at their configured horizons, not against a universal two-second clearing deadline.

### 16.2. Functional Verification

1. Single/multiple MP3, PCM16 WAV, and PCM24 WAV import and playback; drag-and-drop, limits, duplicates, corrupted files, metadata timeouts, import cancellation, and overlapping import batches.
2. Play/Pause/seek/end, file switching, playback speed, and exactly one audible output path.
3. Repeat Off/One/Queue, automatic next-track advancement, shuffle, active/inactive track removal, reordering, Undo Clear, and a queue containing only unreadable files.
4. All five modules respond to the same stream; Composition, Strip, and focus mode work.
5. Seeking/file switching clears stale history; pause freezes history, while silence during playback advances it.
6. Settings changes do not interrupt audio. Persistence/reload/reset, complete preset replacement, unsupported schema versions, invalid preset JSON, and unavailable/quota-exceeded localStorage are handled without partial application or false save confirmation.
7. Run MP3/WAV/FLAC/M4A/OGG/WebM codec smoke tests on actual target browsers. Record the codec/container of each test file in a compatibility table.
8. Verify keyboard, touch, reduced motion, and no player/content overlap at 360 px.
9. Run 10 minutes of continuous playback and 20 track switches: no accumulating application-owned buffers, leaked object URLs, or noticeable audio dropouts. After warm-up and after switches/Undo expiration, verify owned allocations remain within Section 14.2 reservations, old per-track/job/listener owners are released, and live URL counts match queue/probe/Undo ownership. Record browser heap samples where available, separately from explicit application allocation counters; do not treat temporary GC fluctuations as a leak.
10. Test hidden-tab return, plot freezing, resize, media buffering, context interruption, Worker crash/watchdog, worklet processorerror, and pool exhaustion: no stale-frame catch-up, doubled audio, unbounded retries, or decoder-starvation silence added to history.
11. Inject delayed packets/results/media events across rapid seeks, file switches, pause/resume, and FFT changes; verify session/epoch/revision rejection and acknowledged boundaries.
12. Verify shuffle with all repeat modes, backward/forward history, manual selection, enabling/disabling shuffle, additions/removals/reordering, a one-playable-track cycle, failed tracks, and bounded all-failed scans. Verify Undo restores position paused and expires/finalizes resources correctly.
13. Verify linking at 0.5 and 40 seconds, clamping on enable, restoration on unlink, reordered/hidden modules at every breakpoint, requested Strip restoration across 1440 px, and modal panels without workspace reflow.
14. Measure default FPS/latest-sample latency using Section 14.2's method. Test maximum history and FFT settings against reservations; reject unsafe allocations explicitly. Verify mono duplication and documented quad/5.1 downmix on both primary and bypass paths.

### 16.3. Visual Acceptance

Capture Light/Dark, desktop/mobile, empty/playing screenshots. Modules must differ meaningfully in both their data and appearance. No colored FFT bars or rainbow glitch. Audio graphics dominate the composition; controls remain secondary. Decoration does not overlap scales or reduce readability. The logo must clearly read Visu@lizer.

Compare against the recording by behavior: time history in the first two modules, changing stereo geometry in the third, a short stable waveform window in the fourth, and a changing frequency profile in the fifth. Pixel matching and identical MiniMeters internal DSP are not acceptance criteria.

### 16.4. Definition of Done

The project is complete when required functions work, DSP tests pass, mandatory formats are verified, performance is measured on an identified device, visual and keyboard checks pass, and another person can run the project using the README. Document actual limitations. A disabled placeholder does not count as an implemented visualizer.

## 17. Implementation Order for Codex

1. Define defaults and the settings schema. Build the base layout, readable logo, and empty state.
2. Implement import, audio graph, transport, queue, and lifecycle. Verify a single audio route and file-error handling.
3. Implement the synchronized PCM tap and Worker. Test M/S, FFT calibration, envelopes, and correlation with synthetic signals.
4. Connect Waveform and Spectrum first, then Spectrogram, Stereometer, and Pitch/Free Oscilloscope.
5. Add individual settings, presets, visibility/order/focus, persistence, and tooltips.
6. Add responsive behavior and accessibility, followed by subtle glitch and lighting.
7. Measure FPS/latency/memory; complete browser/codec smoke tests and visual acceptance.
8. Deliver README, compatibility table, and a concise verification report. Do not automatically publish the site without a separate request.

Do not begin with a decorative splash screen. The first working milestone must let a user import a track, hear it, and see real data. No server or AI API is needed: processing is deterministic and local.

## 18. Sources and Implementation Notes

The primary visual and behavioral references are the seven user attachments in Section 2. Algorithms and defaults in Sections 7–14 are design decisions for this product, not recovered MiniMeters source code.

- [MiniMeters — module descriptions](https://minimeters.app/titleclick/): explains the purposes of frequency history, waveform, and stereo analysis; Visu@lizer details are defined separately.
- [W3C — Web Audio API](https://www.w3.org/TR/webaudio/): audio graphs, channel handling, AnalyserNode, and the API's normative processing model.
- [MDN — AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet): processing on the audio-rendering thread and secure-context requirements.
- [MDN — AnalyserNode fftSize](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize): built-in FFT sizes and the resolution trade-off.
- [MDN — Audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs): codec/container distinctions and browser support.

Check current API compatibility during implementation. Preserve the monochrome direction and the functional distinctions between all five visualizers when optimizing.

### Version 1.2 — Implementation Contract Clarifications

This revision applies the technical consistency review without replacing the product concept, artistic direction, or architecture. It specifies runtime recovery, session/epoch/revision boundaries, playback interruptions, bounded buffer ownership, spectral-history storage, linked horizons, scope sizing, shuffle/history precedence, Undo/cancellation, layout placement, browser support policy, settings persistence failures, and corresponding acceptance checks. The original attachment observations remain unchanged and are not newly verified by this review. The narrowly necessary trace-token and Stereometer-toggle corrections preserve the intended monochrome appearance and defaults.

### Translation and Technical Corrections

This is a complete English translation with the following clarifications to prevent implementation errors:

- Repeat Off still advances through the queue; it stops only after the final playable track. The original wording could be read as stopping after every track.
- Smoothing percentages are explicitly converted to fractions before exponentiation.
- FFT calibration explicitly requires an unnormalized forward transform, with compensation for library scaling; stereo-energy power combination is defined mathematically.
- Nonzero oscilloscope trigger levels are described as level crossings, not zero crossings; Pitch mode respects the selected trigger polarity.
- Stereo sample frames, two-channel worklet output, pause-boundary handling, and resource ownership are explicit.
- Optional overview decoding requires a conservative PCM memory estimate, and linked waveform/spectrogram time scales have a defined shared duration.
- Numerical tests distinguish bin-centered amplitude calibration from an off-bin 1 kHz tone.

These corrections retain the original project scope. They do not claim additional observations about MiniMeters or the supplied recording.
