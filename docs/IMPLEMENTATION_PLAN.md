# Markly V1: implementation plan (clickable MVP prototype)

> **Update (30 Oct 2026, D0):** the npm registry is blocked in this environment, so D0 + D1 were built **zero-dependency**: plain ES modules with JSDoc types, an in-house vdom and GIF encoder, and `node:test`. The Stack, Architecture and Dependencies sections below describe the original plan. See [D0-findings.md](D0-findings.md) for the results and [../README.md](../README.md) for the actual layout.

## Context
The Markly V1 PRD (30 Oct 2026) describes a browser overlay for one reviewer, working alone. The reviewer pins an element on a live page, attaches a screenshot or a 10-second clip converted to GIF, picks a category (UX/UI/Content/Dev) and exports a local ledger as PDF, HTML, CSV, JSON or Markdown. There is no backend, no accounts and no tracker submission.

Agreed approach:
- **Platform:** a core that doesn't depend on the platform, plus two thin shells, a Chrome MV3 extension and an injected script. D0 picks one.
- **Target:** a clickable prototype covering journeys S1–S5. Open decisions get placeholder defaults, each one flagged in config, so stakeholders can try it and settle the OQ-* items.
- **Stack:** TypeScript, Preact and Vite. All styling comes from CSS variables, so the UI reference (to come) can re-skin it.

## Architecture
```
src/core/        model.ts · decisions.ts · ledger.ts · machine.ts (states P01–P20)
                 validate.ts · anchor.ts · export/{pdf,html,csv,json,markdown,scope}.ts
src/platform/    types.ts (adapter: mount, captureViewport, recordTab, storage, download)
                 extension/ (captureVisibleTab, tabCapture + offscreen doc)
                 injected/  (getDisplayMedia preferCurrentTab)
src/media/       gif.worker.ts (gifenc) · mask.ts (PII blur before storing)
src/storage/     idb.ts (entries + media blobs, quota checks)
src/ui/          Preact in a closed Shadow DOM: Overlay, Drawer (Empty|Creation|Ledger|Read|Edit),
                 Countdown, Recorder, GifReady, EvidenceSection, Delete/Export dialogs, aria-live Toasts, tokens.css (--mk-* values in docs/UI_SPEC.md)
shells/          extension/ (MV3 manifest, background, content) · injected/loader.ts
demo/host-pages/ dense table, long form, fixed header, PII fields
tests/           Vitest (core) · Playwright (e2e)
```
**Host isolation (C1):** the overlay renders inside one closed shadow root with its own CSS. Nothing is written to the host's styles, cookies or storage. That single mount node conflicts with the PRD's "no host DOM writes" rule. This is flagged for D0, with Chrome's side panel (`chrome.sidePanel`) as the fallback for the drawer.

## Placeholder defaults (`core/decisions.ts`, switchable in the drawer's "Prototype settings")
| Decision | Default |
|---|---|
| OQ-SEVPRI | Priority only (High/Medium/Low), optional; Severity or Both behind a flag (UI_SPEC C1) |
| Evidence / OQ-EVID-MULTI | Optional; one screenshot or one GIF; a retake replaces it only on Keep |
| Export scope | Whole ledger; the scope line says the filter is ignored |
| Reviewer name | Optional; "Unnamed reviewer" if blank |
| Reorder (BO-3) | Up/down arrows, no drag handle; order kept in all exports (UI_SPEC C2) |
| Numbering | Stable IDs; displayed numbers recompute after delete |
| OQ-STORAGE | IndexedDB per site and session; survives reload; cleared by "End session" |
| Dirty-state rule and Esc | Ask before discarding unsaved work; Esc closes, in order: dialog, then countdown, then draft, then drawer |
| Unpinned video (A1) | Not allowed |
| Drawer width | 380px per reference, overlaying the host (no reflow); classification fields stack below 360px content width (UI_SPEC C6, C10) |
| Masking (DEC-13) | Blur password fields, `[data-pii]`, `[data-phi]` and a configurable selector list; a "Media reviewed for PII/PHI" checkbox gates media exports |
| Clear all / bulk actions | Hidden behind a flag; enabling needs a confirm dialog (UI_SPEC C3) |
| Brand font | System grotesk stack; brand font via FontFace API is a D0 question (UI_SPEC F1) |

## Delivery slices
1. **D0 spike:** build both shells and test them on demo pages and on sites with strict security policies (CSP). Prove three things: screenshots exclude the overlay, a 10-second recording converts to GIF, and media storage works. Write up a shell recommendation in `docs/D0-findings.md`.
2. **D1 ledger and drawer:** data model, state machine, validation (whitespace-only text counts as empty), Creation/Ledger modes, session name, counts, "Feedback saved" toast. Tests show drafts never mix with saved entries and Save can't create duplicates.
3. **D2 pins and context:** crosshair targeting, DOM path, page title and URL. Pins stay attached to their element on scroll, resize and page changes. Pins link to ledger rows, and a row expands in place without scrolling to centre. Keyboard pinning sits behind a flag.
4. **D3 evidence:**
   - Screenshot with the overlay hidden and masking applied.
   - Video: 3-second countdown (Esc cancels), then a timer and progress bar that agree. Stop and the 10-second auto-stop can't both fire.
   - A processing state, then Keep/Retake.
   - The evidence section shows the real type, size and duration.
   - Denied, failed, oversized and storage-full states keep the text already entered.
5. **D4 management:** multi-select category chips with a no-matches state, Read vs Edit on a working copy with Save/Cancel, row actions disabled while editing, a delete dialog that names the entry, and up/down reorder.
6. **D5 export:** a scope line (count, categories, reviewer, date), five format options, and a button label that follows the chosen format. CSV shows a warning that media isn't included, and the masking checkbox gates media formats. Each export has busy, success and failure states.
   - **JSON:** schema v0, media embedded inline
   - **HTML:** one self-contained file
   - **PDF (jsPDF):** the GIF's first frame, labelled as such
   - **Markdown:** a .zip (fflate) with `review.md` and a `media/` folder
   - **CSV:** Jira columns (Summary, Description, Issue Type with Dev→Bug, Labels, Priority)
7. **D6 hardening:** WCAG 2.2 AA pass (focus return from dialogs, a drawer that doesn't trap focus, ARIA states, contextual icon names), long content, 200% zoom, pins at page edges, narrow windows. Visual design follows [UI_SPEC.md](UI_SPEC.md) from D1 onward.

## Dependencies
- **Runtime:** preact, @preact/signals, gifenc, jspdf, fflate, idb
- **Dev:** vite, @crxjs/vite-plugin, vitest, @playwright/test, typescript

## Verification
- **`npm test`:** Vitest checks validation, state transitions, ledger commands, each exporter against sample ledger data, and the CSV column order.
- **`npm run e2e`:** Playwright runs Chromium with each shell against the demo pages, through S1–S5 end to end. It parses all five export files and checks their count and order against the ledger.
- **Manual:** load the unpacked extension, run the PRD's usability tasks, try a CSV import into a Jira sandbox (Q3), and confirm the host page is still usable and unstyled.
- **Close-out:** map each PRD section 9 checklist item to either "done in the prototype" or "awaiting an owner decision".
