# Visu@lizer — Visual Improvement Pass Specification

Version: 1.0  
Date: 2026-10-11  
Status: Ready for implementation planning  
Document language: English

## 1. Purpose and authority

This specification defines the next visual improvement pass for Visu@lizer. It is the source of truth for the scope, implementation priorities, verification, and acceptance of this pass.

The outcome is a fully English, visually coherent, polished music tool with an improved Visu@lizer identity, more suitable typography, and corrected UI defects. Preserve the existing product structure, architecture, audio engine, visualizers, and artistic direction.

The project repository and running application were not inspected when this document was prepared. Requirements describe the intended result, not confirmed defects or confirmed component names. Codex must establish the actual UI inventory and baseline before implementation. References to queues, dialogs, settings, cards, menus, and other surfaces apply only where those features already exist. Do not create missing features to satisfy this document.

Follow applicable repository instructions and existing engineering conventions. If a requirement cannot be met within the scope boundaries, document the conflict and request a targeted decision; do not silently expand the project or remove functionality.

In this document, **must** denotes an acceptance requirement. **Should** denotes a preferred implementation choice that may be adjusted with a documented reason. **May** denotes an optional detail within scope.

## 2. Goals

1. Convert all application-owned user-facing interface text to clear, consistent English.
2. Improve the Visu@lizer logo while retaining its name and minimal monochrome glitch identity.
3. Select and implement a coherent typography system that improves readability, hierarchy, and the technical music-tool character.
4. Audit all existing UI surfaces and fix visual defects, inconsistent spacing, alignment, sizing, and interaction states.
5. Verify the result across screen sizes and input methods without introducing functional, audio, visualizer, or performance regressions.

## 3. Scope boundaries

### Included

- Application-owned interface copy, accessibility labels, tooltips, messages, and visible page metadata.
- Logo artwork, placement, sizing, and existing brand placements.
- Font selection, loading, fallbacks, weights, hierarchy, and text layout.
- Design tokens for typography, spacing, surfaces, borders, and interaction states.
- Existing component styling and small markup adjustments needed for layout or accessibility.
- Visual bug fixes across existing screens and states.
- Responsive layout corrections and UI-level motion refinements.
- Verification evidence and a concise implementation handoff.

### Excluded

- Replacing the application framework, routing architecture, state management, or component system.
- Rewriting audio loading, decoding, playback, analysis, transport, or scheduling.
- Replacing visualizer implementations or changing their audio-reactive behavior, rendering algorithms, presets, or artistic output.
- Adding product features, routes, authentication, onboarding, a language selector, or new playback capabilities.
- Renaming the product or redesigning its information architecture.
- Introducing a new theme, broad dependency migration, or unrelated refactoring.

Small technical changes are permitted only when directly necessary for a visual requirement, such as correcting a layout wrapper or resizing an existing canvas correctly. Explain those changes and verify their functional impact. Do not hide unrelated fixes inside the visual pass.

## 4. Artistic direction

Preserve the following characteristics:

- A restrained monochrome palette: black, white, and neutral grays.
- Minimal composition with intentional negative space.
- A clean, cold, modern feel appropriate to an audio-visual instrument.
- Subtle glitch accents and restrained light or highlight behavior.
- Clear controls and a strong hierarchy without excessive chrome.

The visualizer remains the primary expressive surface. Interface decoration must support its presentation and control, not compete with it.

Do not introduce neon color accents, heavy RGB separation, constant glitch animation, a gaming dashboard aesthetic, excessive glow, glossy decoration, or a generic marketing-page layout. Preserve existing visualizer artwork even when its output differs from the monochrome UI palette.

## 5. Requirements

### 5.1 English interface — EN

**EN-01 — Complete coverage.** Translate every application-owned user-facing string, including navigation, buttons, headings, settings, playback labels, menus, dialogs, tooltips, placeholders, empty states, loading states, confirmations, warnings, recoverable errors, and status messages. Include icon-only control names, accessible descriptions, document titles, and app-owned share metadata where present.

**EN-02 — Preserve external content.** Keep user-entered text, imported filenames, artist names, track titles, metadata, and other third-party content unchanged. Such content may contain any language. Preserve the exact product name **Visu@lizer**.

**EN-03 — Consistent terminology.** Use concise English and sentence case for UI text, except the brand, acronyms, and established proper names. Use one term for each concept. Where relevant, prefer: “Play,” “Pause,” “Previous track,” “Next track,” “Volume,” “Mute,” “Unmute,” “Queue,” “Visualizer,” and “Settings.” Name import actions according to their actual behavior: a local file import must not be described as an upload if no upload occurs.

**EN-04 — State-aware and accessible copy.** Labels must reflect the actual state and action. Tooltips and accessible names must agree with the visible control. Update the document language to English using the existing application convention, normally `lang="en"` on the root HTML element. Preserve valid language annotations for external content when applicable.

**EN-05 — Implementation discipline.** Reuse the existing string organization or localization mechanism. If none exists, consolidate repeated application-owned strings using a small project-appropriate approach; do not introduce a full localization framework for this English-only pass. Do not modify identifiers, API values, stored values, or behavior merely to translate their visible labels.

**EN-06 — Audit evidence.** Search source files for non-English UI strings and inspect all inventoried states in the running application. Review search results manually: a Cyrillic filename or fixture is not a translation defect. Convert app-owned error messages at the presentation boundary where possible; browser- and operating-system-owned dialogs may follow the user's system language and are excluded.

### 5.2 Logo and brand — BR

**BR-01 — Identity.** Produce a refined wordmark that clearly reads **Visu@lizer**, preserving the `@` as an intentional part of the identity. Improve letterforms, spacing, proportions, and integration with the current interface. Any custom treatment must remain recognizable and readable.

**BR-02 — Restraint.** Keep the logo monochrome. Glitch details must be subtle and must not obscure the wordmark. The default logo must be readable without animation. Any motion treatment must be brief, infrequent, and nonessential.

**BR-03 — Asset quality.** Prefer a scalable SVG as the canonical asset, with a predictable view box, no accidental clipping, and no reliance on an unavailable font. A custom wordmark may use outlined paths. Follow the repository's asset conventions and avoid introducing a new asset toolchain.

**BR-04 — Placement.** Replace existing UI logo placements consistently. Verify clear space, optical alignment, baseline relationship to adjacent controls, and contrast on the actual background. Test the logo at every displayed size, including the narrowest layout. Do not make the header substantially taller simply to accommodate the new artwork.

**BR-05 — Existing variants.** Where a favicon, compact mark, loading mark, or footer logo already exists, update it coherently. At favicon sizes, use a simplified existing compact identity rather than forcing an unreadable full wordmark. Do not create additional branding surfaces.

**BR-06 — Accessibility and rights.** Give meaningful logo images an accessible name and hide decorative duplicates from assistive technology. Preserve any existing logo navigation behavior. Deliver editable assets and record the source and license of any third-party material.

### 5.3 Typography — TY

**TY-01 — Selection.** Audit the current fonts and select one primary family with clean, modern, technical letterforms suitable for interface reading. A restrained monospace family may be used for time, numerical values, or selected technical labels. Use at most two UI font families, excluding logo artwork. Reuse a suitable existing family when it meets these requirements.

**TY-02 — Decision record.** Record the chosen family names, actual weights, intended roles, fallback stacks, asset sources, and redistribution licenses. Explain the choice in terms of the existing interface. Decorative, distressed, or excessively stylized faces must not be used for body text or interactive controls.

**TY-03 — Hierarchy.** Define reusable roles for major headings, section labels, body text, controls, secondary metadata, and numerical displays. Establish a consistent size, weight, line-height, and tracking for each role. Prefer 14–16 CSS px for normal control and body text; smaller secondary text must remain comfortably readable and should not fall below 12 CSS px at default zoom. Size major headings in proportion to the existing composition.

**TY-04 — Stable layout.** Prevent clipped glyphs, crowded lines, misaligned button labels, excessive uppercase tracking, and accidental line breaks. Avoid fixed text heights that clip content after font substitution or zoom. Use tabular numerals for changing timestamps and numerical readouts where supported, so values do not cause horizontal jitter.

**TY-05 — Font loading.** Use the project's existing loading mechanism where possible. Load only required files, subsets, and weights; prefer efficient webfont formats supported by the project. Provide reliable fallbacks and readable text while fonts load. Avoid duplicate loading, synthetic weights, and font-related shifts that move controls or change wrapping after the interface becomes usable.

**TY-06 — Failure behavior.** Test delayed or unavailable font resources. The application must remain readable, controls must remain reachable, and fallback typography must not break layout. Do not add a blocking third-party font request to a previously self-contained application.

### 5.4 UI consistency and visual defects — UI

**UI-01 — Complete inventory.** Inspect every existing route and UI surface. Cover the header, visualizer viewport, playback controls, track information, file import area, visualizer selection, queue, settings, overlays, and footer where present. Include relevant empty, loading, populated, active, disabled, error, expanded, and collapsed states.

**UI-02 — Defect register.** Record each discovered visual defect with its location, reproduction steps, viewport, screenshot when useful, severity, proposed correction, and final status. Distinguish confirmed defects from optional aesthetic refinements. Fix every confirmed visual defect within this pass's scope; document any issue that requires a separate architectural or functional change.

**UI-03 — Shared tokens.** Establish or refine a small, reusable set of typography, spacing, radius, border, surface, opacity, and motion values. Prefer existing tokens and component styles. Align repeated control types and equivalent layouts; intentional differences must serve a clear hierarchy or interaction purpose.

**UI-04 — Layout correctness.** Correct unintended overlap, clipping, overflow, uneven margins, broken wrapping, inconsistent alignment, and unexplained gaps. Use optical alignment where purely geometric alignment looks incorrect. Constrain long track names and filenames without pushing controls off-screen. Preserve access to the full value through an existing detail view, accessible name, or suitable tooltip; do not depend exclusively on hover for essential information.

**UI-05 — Interaction states.** Make default, hover, focus-visible, pressed, selected, loading, and disabled states consistent wherever applicable. Hover must not change component geometry. Active states must remain identifiable through shape, outline, fill, text, or another visible cue, not a subtle brightness change alone. Disabled controls must be visually distinct and retain their existing behavior.

**UI-06 — Controls and icons.** Normalize icon scale, stroke treatment, hit area, and label alignment. Interactive touch targets must be at least 44 × 44 CSS px; the visible icon may remain smaller. Keep keyboard focus visible and unobscured. Preserve keyboard operation and give icon-only controls meaningful accessible names. Essential actions must not depend on hover or pointer precision.

**UI-07 — Contrast.** Maintain at least 4.5:1 contrast for normal text and 3:1 for large text. For this requirement, large text means at least 24 CSS px regular or approximately 18.7 CSS px bold. Essential control boundaries, state indicators, and focus indicators must achieve at least 3:1 against adjacent colors. Decorative and inactive elements are excluded, but inactive labels must still be reasonably legible.

**UI-08 — Overlays.** Where menus, dialogs, tooltips, or popovers exist, correct stacking, viewport containment, anchoring, and scroll behavior. Preserve dismissal, focus management, and interaction with the underlying content. Required dialog actions must remain reachable on short screens.

**UI-09 — Visualizer framing.** Correct surrounding spacing, aspect handling, canvas/container mismatch, and overlays without altering the visualizer's rendering or audio response. Verify that resizing produces the correct displayed dimensions and preserves existing pointer interaction. Do not reset playback or visualizer state because of a CSS/layout change.

**UI-10 — Motion.** Preserve subtle existing UI motion where appropriate. Avoid layout shifts, distracting continuous animation, and flashing effects. Honor reduced-motion preferences for UI and logo decoration with a static or simplified presentation. Preserve any existing visualizer motion controls; this pass does not introduce a new visualizer mode or change its artistic output.

## 6. Work order

### Phase 1 — Establish the baseline

1. Read repository instructions, existing design documentation, and relevant completed or ongoing QA work.
2. Identify the real application entry points, UI routes, shared components, styling conventions, font assets, branding assets, and existing verification commands.
3. Run the application and capture representative desktop and mobile screenshots, including the principal empty and active playback states.
4. Build the UI/state inventory and defect register. Mark references to absent features as not applicable with a short explanation.
5. Run existing relevant checks and a basic playback/visualizer smoke check. Record baseline failures so they cannot be mistaken for changes introduced by this pass.

### Phase 2 — Define the visual system

1. Select the final logo direction and typography roles within the existing monochrome language.
2. Define or refine shared style tokens and responsive behavior.
3. Verify one representative composition containing the logo, text hierarchy, and primary playback controls at desktop and narrow mobile widths before applying it globally.
4. Record the final design decisions. Do not stall routine choices for approval when they fit this specification.

### Phase 3 — Implement foundations and English copy

1. Implement font loading and fallbacks, typography roles, and shared tokens.
2. Replace logo assets and verify existing placements.
3. Convert application-owned copy to English and align visible and accessible labels.
4. Recheck wrapping, control sizes, and spacing using the actual English text and chosen fonts.

### Phase 4 — Correct component and responsive defects

1. Address defects that block interaction, obscure content, or break narrow layouts first.
2. Fix shared component patterns before isolated instances, then resolve screen-specific defects.
3. Validate interaction states, long content, overlays, visualizer framing, and layout during resize.
4. Finish subtle decorative refinements only after readability and operation are stable.

### Phase 5 — Verify and hand off

1. Execute the responsive, accessibility, and regression checks below.
2. Re-run relevant existing build, lint, type, and test checks using the project's own commands.
3. Add focused regression coverage only when a change introduces a meaningful risk and existing coverage is insufficient. Do not build a new testing framework for cosmetic edits.
4. Capture final screenshots in the same states and sizes as the baseline.
5. Deliver the implementation summary, requirement checklist, verification results, and any unresolved scope conflicts. A screenshot alone is not evidence that playback or controls still work.

## 7. Responsive and accessibility verification

Viewport dimensions below are in CSS pixels. Test real content and realistic states, not just an empty page. Preserve existing breakpoints when they work; introduce or adjust breakpoints only in response to an observed layout failure.

| Viewport | Required emphasis |
| --- | --- |
| 320 × 568 | Smallest supported baseline: logo legibility, control access, wrapping, no page-level horizontal overflow |
| 375 × 812 | Typical narrow phone: touch targets, long track name, open existing overlays |
| 390 × 844 | Typical phone: complete playback composition and populated content |
| 844 × 390 | Phone landscape: short-height behavior, reachable controls and dialog actions |
| 768 × 1024 | Tablet portrait: reflow, density, visualizer proportions |
| 1024 × 768 | Tablet landscape/small desktop: alignment and intermediate breakpoint behavior |
| 1440 × 900 | Main desktop baseline: composition, hierarchy, spacing, active playback |
| 1920 × 1080 | Wide desktop: sensible content limits, intentional negative space, logo and text scale |

Also resize continuously between these widths to catch failures at intermediate sizes. Test just below and above each changed breakpoint. Internal scrolling in an existing queue or overflow panel is acceptable when intentional and usable; unintended page-level horizontal scrolling is not.

Required cross-cutting checks:

- At 200% browser zoom, content and controls remain readable, reachable, and free of unintended overlap.
- At an effective 320 CSS px content width, the interface reflows without losing actions or information; decorative canvas content may retain its intended visual structure.
- Keyboard-only navigation exposes a logical focus order and visible focus. Existing shortcuts and dialog dismissal still work.
- Touch input can reach controls without relying on hover; pointer input retains appropriate hover states.
- Reduced-motion mode simplifies UI and logo decoration correctly.
- Long titles, filenames, and metadata, including non-English user content, do not break the layout.
- Cold load, delayed fonts, empty content, loading, active playback, paused playback, and reachable error states render correctly.
- Check Chromium and Firefox on desktop and Safari/WebKit on mobile or a supported equivalent where available. Use the repository's broader support policy if one exists. Emulation is acceptable for layout checks but does not prove real-device audio behavior.
- Record the actual browser versions and devices used. If an environment is unavailable, record that gap explicitly and leave the corresponding requirement unverified.

## 8. Regression checks

Compare behavior to the captured baseline. Run only checks for features that exist, but do not omit a feature merely because it was unaffected in the intended design.

| Area | Required regression evidence |
| --- | --- |
| Audio loading | Existing file import or source selection works; loading, success, and reachable failure states remain usable |
| Playback | Play, pause, resume, end-of-track behavior, and seek where available retain existing behavior |
| Audio controls | Volume, mute, and unmute where available retain values and operate correctly |
| Track navigation | Previous/next, queue selection/reordering/removal, repeat, and shuffle where present behave as before |
| Visualizers | Each existing selectable visualizer loads, responds to the same audio input, and preserves existing settings and controls |
| Resize | Window resize and orientation change do not interrupt audio, reset selections, produce canvas distortion, or detach controls |
| State and persistence | Existing settings and persistence survive the same navigation/reload scenarios as before |
| Interaction | Mouse, touch, keyboard, shortcuts, focus, menus, and dialog dismissal continue to work |
| Runtime health | No new console errors, unhandled failures, missing assets, or failed font requests during the checked flows |
| Performance | No new sustained audio glitches, UI stutter, or noticeable visualizer slowdown from fonts, decorative animation, or layout changes |
| Project checks | Existing relevant build, lint, type, and automated test commands complete with results recorded |

For performance, compare before and after on the same device, browser, audio track, visualizer, and viewport over a repeatable playback session of at least 60 seconds. Record load behavior and rendering responsiveness; where the project already exposes metrics, use those metrics as well. Investigate any consistent degradation and remove or simplify the responsible UI change. Do not invent numerical performance gains without measurement.

Pre-existing functional failures must be recorded with their baseline evidence. They are not silently included in this pass, and they do not justify an unqualified claim that all checks passed. Any regression caused by this implementation must be fixed before acceptance.

## 9. Deliverables

1. Updated source code and application-owned English copy.
2. Final logo assets and any updated existing compact variants, following repository conventions.
3. Implemented typography and shared style tokens, with font sources and licenses documented.
4. A completed UI/state inventory and visual defect register with resolved statuses and supporting evidence.
5. Before/after screenshots at matching viewports, covering desktop, narrow mobile, active playback, and representative overlays where present.
6. A concise verification report listing tested environments, checks performed, command results, regressions addressed, baseline failures, and any unverified checks.
7. An acceptance checklist mapped to the requirements below, plus a brief explanation of any technical changes beyond styling and copy.

Use the repository's existing documentation and evidence locations. Avoid committing unnecessary generated artifacts or large media files. Do not claim implementation is complete solely because the document has been followed structurally.

## 10. Acceptance criteria

The pass is accepted only when all applicable requirements are verified and all of the following criteria are satisfied:

- [ ] **AC-01 — English:** Every inventoried application-owned visible and accessible string is English. Source search and runtime inspection are complete. User and third-party content remains unchanged. Covers EN-01 through EN-06.
- [ ] **AC-02 — Brand:** The logo clearly reads Visu@lizer, fits the monochrome glitch direction, remains legible at every displayed size, and is applied consistently to existing placements. Assets and rights information are delivered. Covers BR-01 through BR-06.
- [ ] **AC-03 — Typography:** A documented typography system is implemented with consistent hierarchy, dependable fallback behavior, readable text, stable numerical displays, and no font-related clipping or control movement. Covers TY-01 through TY-06.
- [ ] **AC-04 — UI polish:** Every existing UI surface and relevant state has been audited. All confirmed visual defects within scope are resolved. Shared component states, spacing, alignment, icons, and overlays are consistent. Covers UI-01 through UI-05 and UI-08.
- [ ] **AC-05 — Usability:** Required contrast, focus visibility, keyboard operation, accessible control names, and touch target sizes are verified. UI/logo reduced-motion behavior works. Covers UI-06, UI-07, and UI-10.
- [ ] **AC-06 — Responsive:** All required viewport checks, intermediate resize checks, changed breakpoint boundaries, 200% zoom, and long-content scenarios pass without unintended overflow, overlap, hidden actions, or broken visualizer framing. Covers UI-04, UI-08, UI-09, and Section 7.
- [ ] **AC-07 — Functional integrity:** No audio, visualizer, playback, state, persistence, or interaction regression introduced by this pass remains. Existing relevant project checks pass, or unchanged baseline failures are explicitly evidenced. Covers Section 8.
- [ ] **AC-08 — Performance:** Matched before/after playback verification shows no new sustained audio glitches, UI stutter, noticeable rendering slowdown, or font-loading failure. Covers TY-05, TY-06, UI-10, and Section 8.
- [ ] **AC-09 — Scope:** The architecture, audio engine, visualizer algorithms, product structure, and artistic direction are preserved. Any necessary technical adjustment is minimal, explained, and regression-checked. Covers Sections 3 and 4.
- [ ] **AC-10 — Evidence:** All deliverables are supplied. Each applicable requirement has a result and supporting evidence. Unavailable environments and outstanding scope conflicts are explicitly marked unverified or unresolved, not passed. Covers Section 9.

An existing feature's absence may be marked **not applicable** after the inventory confirms it. An unavailable test environment must be marked **unverified**, not not applicable. Outstanding acceptance gaps require an explicit user decision before the pass can be reported as accepted; implementation and evidence gathering should continue for all unaffected work.

## 11. Completion report format

The final implementation report must state:

- What changed in English copy, branding, typography, and UI styling.
- Which confirmed visual defects were fixed and where the evidence is stored.
- Which responsive environments and functional flows were verified.
- Which project checks were run and their actual results.
- Whether any baseline failures, unavailable environments, or unresolved acceptance gaps remain.
- Whether any small technical adjustment was needed and why it stayed within this pass's scope.

Report verified outcomes, not expected outcomes. The user must be able to judge the final interface and its regression evidence without reconstructing the implementation conversation.
