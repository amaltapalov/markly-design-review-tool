# Markly V1 prototype

Browser overlay for capturing review findings on live pages. This is a clickable MVP prototype (slices D0–D6), not a pilot build. See:
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): slices and placeholder decisions
- [docs/UI_SPEC.md](docs/UI_SPEC.md): tokens, components, reference-vs-PRD conflicts
- [docs/D0-findings.md](docs/D0-findings.md): feasibility results and the shell recommendation
- [docs/MASKING.md](docs/MASKING.md): PII/PHI masking rules, limits and open decisions
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md): keyboard, screen-reader, zoom and recovery checks (D6)

Zero dependencies (the npm registry is blocked here): plain ES modules with JSDoc types, Node 22+.

## Run
```bash
npm run serve
```
Open http://localhost:5173/demo/ and click **Launch Markly**, or press Alt+Shift+M, or add `?review` to the URL.

The demo has three screens: Group A (`/demo/`, table), Group B (`/demo/group-b.html`, member cards and a bulk bar) and Group C (`/demo/group-c.html`, settings form). Markly stays off until you start it. In review mode, pick a screen in Markly's dropdown, or click an entry taken on another screen (it shows an ↗ arrow): that page opens and Markly reopens there, with the entry shown. The hand-off is a one-shot note in the tab's sessionStorage (`markly:handoff`), used within 30 s and removed on arrival; the extension shell can't reopen by itself, so it applies the note the next time you start it on that page.

**Screens filter:** the dropdown above the category chips shows all screens (grouped, current screen first with a **This screen** tag); choosing another screen opens it. Move up/down and drag stay within an entry's screen. Exports still contain every screen. Markly's own `review` parameter isn't part of a screen's path.

As a Chrome extension: `chrome://extensions` → Developer mode → **Load unpacked** → this folder. Then use the toolbar button or Alt+Shift+M on any page.

Bookmarklet, with the dev server running:
```
javascript:import('http://localhost:5173/shells/injected/loader.js?'+Date.now())
```

## Test
```bash
npm test
```

## What works (D1)
- Review mode: dashed frame, hover outline, hint pill, Esc to exit. Hold Alt to use the page normally.
- Click any element to create a numbered draft pin, with inspected element, DOM path, page and URL.
- Creation panel:
  - Evidence (Screenshot / Video 10s, or continue without).
  - Category (UX/UI/Content/Dev, single-select; Dev means bug).
  - Title and Description (required).
  - Optional Priority.
  - Inline errors.
- Clip flow: share prompt, 3-2-1 countdown, recording with timer and progress, Stop or auto-stop at 10 s, GIF preview, Keep/Retake.
- Save commits to IndexedDB, then shows "Feedback saved" and updates the count and pins. Double-saving can't duplicate.
- Ledger:
  - Rows show category, coloured priority and an evidence glyph.
  - A row or pin expands in place (read-only).
  - Category chips filter (multi-select), with a no-matches state.
  - Inline reviewer name.
- Discard confirmation for dirty drafts. Esc order: dialog, then pending capture, then recording, then draft, then edit, then exit.

## What works (D4)
- **Edit** (pencil) opens the entry on a working copy with Category, Title, Description and Priority. **Save changes** validates and persists; **Cancel**, Esc, collapsing the row, clicking another pin or Add never save. If there are unsaved edits, they ask first.
- While editing, every row action is disabled and the page can't be pinned. Finish or cancel the edit first.
- **Move up / Move down** swap with the neighbouring *visible* entry, so under a filter, hidden entries keep their positions. IDs are stable; display numbers and pins renumber from the new order. A screen-reader message announces the new position.
- **Delete** asks with the entry's number and title. Cancel changes nothing and returns focus to the delete button; Delete removes the entry and its stored media, renumbers, and moves focus to the next row.
- All three persist before the UI changes; a storage failure leaves the ledger as it was and says so.
- Evidence can't be replaced from Edit yet (PRD-08 retake/replace for saved entries is still open).

## What works (D5)
- **Export** opens a sheet (board 5) with:
  - A scope line: count, categories, reviewer, date.
  - The five formats, with the primary button following the choice ("Export PDF").
  - The CSV caveat.
- Scope is the **whole ledger** (placeholder default). If a category filter is on, the dialog says it doesn't apply.
- **Media gate:** until masking exists (D3/Q4), PDF, HTML, JSON and Markdown need a ticked "no PII/PHI visible" check whenever the ledger has evidence. CSV carries no media, so it isn't gated.
- Formats, all in ledger order, all saying nothing was submitted to a tracker:
  - **PDF:** A4 report written by Markly itself, with Helvetica and embedded JPEG stills. Clips show their first frame with a note.
  - **HTML:** one self-contained file. Media is inlined, so GIFs animate offline; no external requests.
  - **CSV:** Jira importer columns (Summary, Description, Issue Type Dev→Bug else Task, Priority, two Labels). Context goes in Description. Cells starting with `= + - @` are defused. No media.
  - **JSON:** `markly.export/v0`, lossless, media as data URLs, storage keys stripped.
  - **Markdown:** `review.md` plus a `media/` folder in a zip, or a single `.md` when there's no evidence.
- The file downloads through a link inside Markly's shadow root. Success is shown only after the file exists; on failure the ledger is untouched and you can retry.

## What works (D3)
- Screenshots and clips are **masked at capture**: password, email, phone and card fields, `[data-pii]`/`[data-phi]`/`[data-markly-mask]`, and visible text that looks like an email, phone, card, SSN or AHV number are painted solid black before anything is stored.
- A **review step** shows the masked result and the automatic count. Drag on the preview to mask more (applies to every frame of a clip); Undo, Keep, Retake or Discard.
- Masking counts are stored with the evidence and shown in the drawer and the exports. See [docs/MASKING.md](docs/MASKING.md) for the rules and the known gaps; names and free-text PHI need `data-pii` markup or a manual mask.

## What works (D6)
- **Keyboard-only pinning:** Add starts a picker (↑↓ ← → move, Enter pins, Esc cancels).
- **Keyboard masking** in the capture review: Enter, arrows, Shift+arrows, Enter.
- Dialogs make the background `inert` and return focus. Pins leave the Tab order (rows cover them).
- **Narrow windows:** full-width drawer with **Hide panel**; clips disabled with a reason.
- Off-screen pins stay on the top or bottom edge.
- Plain-language storage errors.
- `scripts/a11y-audit.js` runs structural checks in the browser. Details and remaining gaps are in [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Not yet
- Real Chrome checks: capture and the extension shell.
- A manual screen-reader pass.
- `forced-colors` styling.
- Data office approval of the masking baseline (Q4).
- A real Jira CSV import test (Q3).
- Replacing evidence on a saved entry.
- The prototype settings panel.

## Layout
```
src/core/      model, decisions (placeholder defaults), validation, ledger commands, Esc rules, anchors
src/platform/  injected + extension adapters (the only shell-specific code)
src/media/     capture helpers, clip recorder, GIF encoder
src/storage/   IndexedDB wrapper
src/export/    scope, csv/json/markdown/html/pdf writers, zip, browser runner (run.js)
src/ui/        controller (app.js), pure views, vdom, icons, tokens.css, markly.css
shells/        extension service worker + content script, bookmarklet loader
demo/          host page recreated from the reference boards
tests/         node:test unit tests
```
