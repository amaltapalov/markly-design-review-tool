# Markly: project context

Quick orientation for anyone (human or agent) picking up this codebase. For feature status see [README.md](README.md); for scope and open decisions see [docs/](docs/).

## What it is
Markly V1 is a **clickable MVP prototype** of a browser overlay for capturing review findings on live web pages. A reviewer pins an element, adds a category, title, description, optional priority and optional evidence (a masked screenshot or a 10 s GIF clip), and builds an ordered **ledger** that can be exported as PDF, HTML, CSV (Jira), JSON or Markdown. It is not a pilot build and is not approved for sensitive content.

Built in slices D0 to D6 (see [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)).

## Hard constraints
- **Zero dependencies.** The npm registry is blocked here. Don't add packages; write small, focused modules instead (the GIF encoder, zip writer and PDF writer are all hand-rolled).
- Plain **ES modules + JSDoc types** (checked via [jsconfig.json](jsconfig.json)), no build step, no TypeScript compile.
- **Node 22+** for the dev server and tests.
- Runs in two shells (injected script/bookmarklet and Chrome MV3 extension), so code under `src/` must not assume either one.

## Commands
| Task | Command |
|---|---|
| Dev server | `npm run serve`, then open http://localhost:5173/demo/ |
| Tests | `npm test` (`node --test`, files in `tests/`) |
| A11y audit | [scripts/a11y-audit.js](scripts/a11y-audit.js), run in the browser |
| Extension | `chrome://extensions` → Developer mode → Load unpacked → project root |

Launch Markly on a page with **Launch Markly**, Alt+Shift+M, or `?review` in the URL.

## Architecture
```
shells/ (extension, bookmarklet loader)
   └─> src/platform/ (adapter: storage, capture, tab stream, asset URLs)
          └─> src/main.js  toggle() / resume()
                 └─> src/ui/app.js  controller (state, listeners, closed shadow root)
                        ├─> src/ui/views.js   pure (state, actions) -> vnode
                        ├─> src/ui/dom.js     tiny vdom, patches in place to keep focus
                        ├─> src/core/         pure model + ledger commands
                        ├─> src/media/        capture, masking, recorder, GIF encoder
                        ├─> src/storage/      IndexedDB (sessions + blobs)
                        └─> src/export/       scope + format writers + browser runner
```

| Folder | Role |
|---|---|
| [src/core/](src/core/) | Data model (schema v0), placeholder decisions, validation, pure ledger commands, Esc precedence, anchors, user-facing error text. No DOM or storage. |
| [src/platform/](src/platform/) | The **only** shell-specific code. Contract in [types.js](src/platform/types.js). |
| [src/media/](src/media/) | Screenshot/clip capture, PII/PHI masking, evidence review, streaming GIF89a encoder. |
| [src/storage/](src/storage/) | Minimal IndexedDB KV: `sessions` and `blobs` stores. |
| [src/export/](src/export/) | Export scope, CSV/JSON/Markdown/HTML/PDF writers, store-only zip, download runner. Writers are pure and testable in Node. |
| [src/ui/](src/ui/) | Controller, views, vdom, keyboard picker, cross-screen hand-off, icons, CSS tokens. |
| [shells/](shells/) | Extension service worker + content script; bookmarklet loader. |
| [demo/](demo/) | Host pages (Groups A, B, C) recreated from the reference boards. |
| [tests/](tests/) | `node:test` unit tests. |

## Key concepts
- **Entry**: a committed finding (`id`, `page`, `anchor`, `category`, `type`, `title`, `description`, `priority`, `evidence`). Display number is its position in the ledger, not stored. See [src/core/model.js](src/core/model.js).
- **Draft**: work in progress; never counted, filtered or exported until saved.
- **Session**: `{ schema, reviewer, entries }`, one per site origin, persisted in IndexedDB.
- **Category** `UX | UI | Content | Dev`; `Dev` derives type `bug`, others `feedback`.
- **Anchor**: CSS path + label + text + relative click position; independent of where the pin renders.
- **Screen**: a page path with Markly's own `review` param stripped (`screenPath()`).
- **Hand-off**: one-shot `markly:handoff` note in sessionStorage (used within 30 s) that reopens Markly after navigating to another screen.

## Conventions
- **Placeholder decisions live in [src/core/decisions.js](src/core/decisions.js).** Change defaults there, never in components. Every value is a prototype default, not approved scope.
- Ledger commands are **pure** and return a new session; persist first, then update the UI. A storage failure must leave the ledger unchanged.
- Views are **pure**; state lives in the controller.
- User-facing errors use plain language from [src/core/errors.js](src/core/errors.js), never raw exceptions.
- File header comments state the module's purpose and cite PRD/decision IDs (`PRD-xx`, `DEC-xx`, `OQ-xx`, `Q#`, `UI_SPEC Cx`). Keep this style.
- UI is rendered in a **closed shadow root**; demo pages expose the instance only via `globalThis.__MARKLY_TEST__`.
- Accessibility is a requirement: keyboard-only paths, `inert` backgrounds for dialogs, focus return, screen-reader announcements. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Privacy and security
- Evidence is **masked at capture**: sensitive fields, `[data-pii]` / `[data-phi]` / `[data-markly-mask]`, and text matching email/phone/card/SSN/AHV patterns are painted solid black. The unmasked capture is never stored. Rules and gaps: [docs/MASKING.md](docs/MASKING.md).
- Media exports require an explicit "no PII/PHI visible" confirmation until the Data office baseline (Q4) is approved.
- CSV cells starting with `= + - @` are defused (formula injection).
- The extension routes storage and screenshots through the service worker so nothing lands in the host origin's storage.

## Open items
Real Chrome checks of capture and the extension shell, a manual screen-reader pass, `forced-colors` styling, Data office approval of masking (Q4), a real Jira CSV import test (Q3), replacing evidence on saved entries, and the prototype settings panel.

## Docs
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): slices and placeholder decisions
- [docs/UI_SPEC.md](docs/UI_SPEC.md): tokens, components, reference-vs-PRD conflicts
- [docs/D0-findings.md](docs/D0-findings.md): feasibility results and shell recommendation
- [docs/MASKING.md](docs/MASKING.md): masking rules, limits, open decisions
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md): keyboard, screen-reader, zoom and recovery checks
