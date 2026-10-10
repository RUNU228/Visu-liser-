# Audio and transport review

Reviewed the original complete implementation against specification sections 5–7, 14 and 16. Existing 57-test/build results were provided by the coordinator; they were not rerun as review evidence. Browser acceptance remains separate from the code findings below. Line numbers here refer to the implementation before fixes.

## Confirmed findings

1. **P1 — Required gate acknowledgments can disappear during rapid transport mutations.** `src/audio/worklets/tap.js:7` keeps one pending gate command. `src/audio/engine.ts:63,72` does not serialize close operations: a second load sees capture already logically closed, posts another close without awaiting the first, and can commit its media mutation before the effective boundary. Two gate commands before one render quantum replace the first command, leaving its waiter to expire at 250 ms. Recovery then tears down a healthy worklet. Process every bounded pending command and share/serialize the outstanding close; token-check opening continuations.

2. **P1 — Manual Retry can leave primary analysis permanently closed or mismatched.** `src/audio/engine.ts:50,88`: installing the replacement increments the session and calls `updateGate`, then `retryAnalysis` increments the session again. When playback is eligible, the opened worklet is tagged with the earlier session; its packets are rejected indefinitely. When retry begins while primary capture is active, capture is not closed first, so the new node starts closed while the engine still thinks capture is active. Close first, assign one session, and open only after the whole recovery transaction is complete.

3. **P1 — A hung Worker exhausts the PCM pool before its watchdog can fire.** `src/audio/engine.ts:26,54`: twelve 1024-frame blocks cover 256 ms at 48 kHz. A hung Worker returns none. At the minimum one-second deadline, `lastPCM` is already older than the required 250 ms; thereafter the predicate stays false. Audio continues but plots never recover and no error appears. Track a capture-eligible outstanding-work deadline; distinguish no PCM because all buffers are Worker-owned from no PCM because media stopped.

4. **P1 — Worker restart cannot restore transferred pool ownership.** `src/audio/engine.ts:41,52,87`: terminating the Worker destroys any transferred buffers still owned by it, but successful restart retains the same worklet pool without replenishment. A fully drained pool produces no packets after restart; partial loss permanently reduces the pool. Track in-flight ownership per Worker/node generation, retire old owners, and replace exactly the lost capacity before reopening.

5. **P2 — Suspending a context after requesting a running boundary causes false processor failure.** `src/audio/engine.ts:59–60`: the context-state check occurs only when requesting the boundary. If the context then suspends before processing/acknowledging the command, the existing wall-clock timer still invokes worklet recovery. This is expressly excluded by the suspended-boundary contract. Cancel/defer the running deadline while suspended, keep capture logically closed, and acknowledge a recovery boundary before reopening.

6. **P2 — Delayed transport events are applied without validating present media state.** `src/audio/engine.ts:18–22`: waiting/pause/ended/seeking/seeked callbacks mutate transport and queue without checking the corresponding current media condition/source. In particular an obsolete ended notification can advance the newly selected queue row, and an obsolete pause notification can close newly active capture. Validate the current source and media state before applying callbacks, and prevent a superseded play continuation from pausing a newer operation.

7. **P2 — Removing an active preparation row revokes its URL before detaching the probe.** `src/app/controller.ts:29`, `src/player/importer.ts:35`: row removal releases its object URL while the dedicated probe still references it, and leaves the sequential preparation blocked until its event/timeout. Removal must cancel that specific active probe and detach/load it before releasing the URL; completed and unrelated probes remain intact.

8. **P2 — Spectrum smoothing changes retain an obsolete numerical revision.** The original `configure` increments the spectral revision only for FFT/window/channel changes, so a delayed old-smoothing result can be accepted after a new setting. Spectrum smoothing/peak configuration now invalidates Spectrum without clearing unrelated modules.

9. **P2 — Teardown during initialization can start fallback afterward.** The original Worker handshake timer remains after termination; its rejected initialization continuation invokes fallback and starts a new interval on a destroyed engine. Handshake cancellation and destroyed-state guards now prevent late resource creation.

10. **P2 — Retired worklet listeners still trigger recovery of the current node.** The original anonymous `processorerror` handler survives replacement and does not validate node ownership. A delayed error from the retired node consumes automatic retry and replaces the healthy node. Replacement/bypass now removes that handler, and current-node identity guards recovery.

The metadata probe also omitted the required advisory `canPlayType` consultation. It now consults a MIME/extension hint while retaining actual metadata loading as the decisive check; an empty hint result does not reject a playable file.

## Positive observations

The graph creates one media source and one output gain, and switches source connections between primary and bypass without deliberately leaving both destination routes connected. PCM samples are captured before gain. Worklet passthrough remains independent of pool availability. Queue selection, repeat precedence, visible-order removal, bounded history and shuffled remainder are consistent with the stated rules. Import slots are reserved immediately; explicit cancellation removes pending rows, invalidates its token and detaches the probe. Clear cancels pending imports before taking its snapshot, and Undo restores paused intent while retaining its URLs for five seconds.

## Outstanding browser verification

Code inspection/unit doubles cannot establish actual MP3/PCM16/PCM24 decoding, optional codec combinations, multi-channel speaker downmix, a single audible gain level during recovery, autoplay/gesture behavior, real context interruption, device latency, browser resource lifetime or long-duration heap behavior. The exact supported browser/OS matrix, codec fixture table, 60-second latency/FPS measurement, ten-minute playback/twenty-switch ownership test and injected browser Worker/worklet failures remain required acceptance evidence. An unavailable browser entry must remain recorded as outstanding rather than passed.

## Repair verification

Coordinator authorized repairs after the initial read-only review. Focused lifecycle/worklet regressions were observed failing before the repairs. All focused regressions now pass, including rapid mutation boundaries, retry session identity, exhausted-pool watchdog, lost ownership replenishment, suspension, obsolete media events, startup teardown, retired processor errors, smoothing revision and probe URL/codec behavior. A real Chrome acceptance scenario passed plot freeze, rapid seeks, context interruption, Worker failure, worklet processorerror and manual Retry. TypeScript and production bundle compilation passed. The concurrent full-suite run included unrelated renderer regressions under active repair; it reported 79 passes and four renderer failures, so that run is not claimed as a full-suite pass.
