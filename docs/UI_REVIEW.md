# UI, settings, and queue review

Reviewed `src/app/App.tsx`, `Panels.tsx`, `Plot.tsx`, `styles.css`, `controller.ts`, `src/settings/*`, and `src/player/queue.ts` against specification sections 4–6, 13, 15, and the corresponding acceptance requirements. This was an independent, read-only implementation review; existing tests were inspected without rerunning them. Audio and rendering internals are reviewed separately.

## Important findings

1. **P2 — Saved presets beyond the first 100 disappear after reload.** `src/settings/storage.ts:11` loads only `data.presets.slice(0,100)`, while `src/app/controller.ts:20` appends and successfully saves any number of presets. Saving preset 101 displays a success confirmation and writes it to storage; reloading omits it, and the next settings save permanently rewrites storage without it. Section 13 requires persistent user presets and forbids false save confirmation. Preserve all accepted presets, or enforce and explain a limit before accepting a save.

2. **P2 — Settings rejection and persistence errors are outside the active modal.** `src/app/Panels.tsx:29` routes invalid JSON/newer schema/oversize import errors to `c.notify`; settings validation and storage failures use the same route. The only notification output is `src/app/App.tsx:41`, outside the native modal opened at `src/app/Panels.tsx:9`. The required inert background consequently excludes that feedback from the modal's accessible content, and the panel/backdrop can conceal it visually. Importing `{ "schemaVersion": 2 }` keeps settings unchanged but gives a screen-reader user no reason why. Render current relevant feedback with a polite live region inside the open panel, including save failures.

3. **P2 — Transport and active-track changes are never announced.** The changing transport label at `src/app/App.tsx:26` and active title at line 35 are ordinary text. The sole main live region at line 41 renders `c.message`, which play/pause, automatic advancement, ordinary selection, and completion do not update. Section 15 explicitly requires announcements of transport state and active-track changes. Add a restrained announcement keyed to those changes, without elapsed-time or sample-driven updates; it must remain available when a modal is open.

4. **P2 — Persisted storage envelope versions bypass validation.** `src/settings/storage.ts:10` validates `data.settings ?? data` and never validates the enclosing persisted `schemaVersion`, although `save` writes one at line 15. A stored value `{ "schemaVersion": 99, "settings": { "schemaVersion": 1, "appearance": { "theme": "dark" } } }` is accepted and applied. This bypasses the section 13 schema-version/migration contract and can interpret an incompatible future storage format as the current format. Validate/migrate the envelope before reading its settings/presets, retaining the explicitly supported legacy bare-settings path.

## Other reviewed behavior

## Final repair verification

All four original findings were repaired: every accepted preset restores, the stored envelope version is validated, modal feedback is visible and announced, and transport/title changes are announced inside and outside panels. A final read-only review found duplicate settings control IDs and mobile Add/Freeze labels hidden with their visible text. Fields now use React `useId()` and those icon buttons have explicit accessible names. A browser regression first reproduced 13 duplicate IDs; the same regression checks unique label targets and visible mobile accessible names after repair. Final browser/build results are in `VERIFICATION.md`.

The inspected queue implements visible-order active removal, repeat-one precedence only for automatic advancement, shuffle remainder visitation, backward/forward history replay, selection truncation, bounded history, and stable shuffle order during visible reordering. Presets are complete settings replacements; layout placement preserves hidden module IDs and requested Strip across width changes. No further important defects were identified in those inspected paths.
