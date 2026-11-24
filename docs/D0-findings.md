# D0 spike findings (30 Oct 2026)

**Status:** partly verified. Items marked **Verified** were run in this session; items marked **Needs a manual run** depend on a real Chrome window and the user's own clicks. The embedded preview browser can't grant screen capture or load extensions.

## Build constraint found in D0
The npm registry is blocked by policy in the build environment, so the plan's Preact/Vite/TypeScript stack couldn't be installed. The prototype is therefore **zero-dependency**:
- plain ES modules with JSDoc types
- a 150-line virtual DOM (`src/ui/dom.js`)
- an in-house GIF encoder (`src/media/gif.js`)
- Node's built-in test runner

Nothing needs building: the same files load in the demo page, as a bookmarklet and as an unpacked extension. Moving to Preact later stays possible, because the views are pure functions of state.

## Results
| Question | Result | Evidence |
|---|---|---|
| Overlay mounts without touching host styles | **Verified (demo page).** One `<markly-root>` element with a closed shadow root and constructable stylesheets. The host's aggressive `button { border-radius: 999px }` doesn't reach Markly (0px). The host's stylesheet count and `<html>` attributes are unchanged. | browser check on `demo/index.html` |
| Host page stays usable | **Verified.** While targeting, Markly blocks pointer and click events on the page. Holding Alt passes them through (the host's click handler fired). While a draft is open, the page is fully interactive. | browser check |
| Strict CSP pages | **Not yet tested.** The design avoids `style` attributes (uses CSSOM) and inline scripts. Expectations: the injected shell is blocked by `script-src`/`connect-src` on strict sites (bookmarklet import and CSS fetch), but the extension shell isn't affected, because content scripts bypass page CSP. | to run in a real browser |
| Screenshot excludes the overlay | **Built, needs a manual run.** Both shells hide the overlay, wait two paints and then grab the frame. The injected shell asks for the browser's share prompt *before* hiding, so the reviewer sees context while choosing (changed during D0 after a hidden-overlay hang). | `src/ui/app.js` `screenshot()` |
| Screenshot permission (injected) | **Verified failure path.** Without a real user gesture, Chrome rejects `getDisplayMedia`. The draft survives and a recovery notice explains the options. The injected shell **prompts on every screenshot**, a real usability cost. | browser check |
| Screenshot (extension) | **Built, needs a manual run.** `chrome.tabs.captureVisibleTab` through the service worker, using `activeTab` only. No prompt, no host permissions. | `shells/extension/background.js` |
| 10-second clip to GIF | **Encoder verified; capture needs a manual run.** A streaming encoder (fixed 252-colour palette with LZW) round-trips through a reference decoder, including LZW table resets. Frames are compressed as they arrive, so memory stays small (about 640×N at 5 fps). The drawer is cropped out of the clip and the overlay is hidden while recording. | `tests/gif.test.js`, `src/media/recorder.js` |
| Stop / 10 s race | **Built.** `stop()` is idempotent and the loop exits once; Stop and the 10-second limit can't both produce a clip. Ending the share from Chrome's bar stops the recording cleanly. | `ClipRecorder` |
| Local storage of entries and media | **Verified (injected).** Ledger and blobs live in IndexedDB, survive reload and re-anchor their pins. Saving is commit-then-show: no success message or count change until storage confirms. | browser check |
| Storage isolation | **Finding.** The injected shell's IndexedDB belongs to the **host origin**, which conflicts with the PRD's "no host storage" rule (C1). The extension shell stores everything in the extension's own IndexedDB through the service worker, so the host origin is untouched. | `src/platform/*.js` |
| Brand font | **Finding.** `@font-face` doesn't apply inside a shadow root, so a brand font would need a document-level font load (a host write). The extension can do it with the `FontFace` API and a packaged font; the injected shell can't without a host write. | UI_SPEC F1 |
| Crosshair cursor | **Finding.** A crosshair over the host page needs either a host style write or a full-screen capture layer, which breaks scrolling inside host scroll areas. Kept a hover outline instead. | `.mk-hover` |
| Fingerprinting | **Finding.** The extension exposes `src/*` as web-accessible resources (needed for dynamic import from the content script), so pages could detect that it's installed. `use_dynamic_url` or a bundled content script would fix this; it's a packaging task. | `manifest.json` |

## Recommendation
**Use the Chrome MV3 extension shell for the pilot.** It's the only shell that:
- meets C1 (no host storage)
- takes screenshots without a prompt every time
- works on CSP-strict pages

Keep the injected shell for demos and local development only. Next steps for the extension:
- Use `chrome.tabCapture` with an offscreen document for clips, to drop the share prompt there too.
- Bundle or dynamically map the content script.

This needs Q1/Q2 owner sign-off. Extension distribution (enterprise policy install) is a Novartis IT question.

## Manual checks still needed (about 10 minutes in real Chrome)
1. `npm run serve`, then open `http://localhost:5173/demo/` and click **Launch Markly**.
2. Pin the "Blocked" pill, click **Screenshot**, choose this tab and Share. The screenshot should show no red frame, pins or drawer.
3. **Video 10s**: share, watch the 3-2-1 countdown, wait for the auto-stop at 10s, play the GIF preview, click Keep, then save. Expand the row: the GIF should animate.
4. Load the unpacked extension (`chrome://extensions` → Developer mode → Load unpacked → this folder) and repeat steps 2 and 3 on any https site using the toolbar button or Alt+Shift+M. The screenshot should need no prompt.
5. Repeat on a CSP-strict site (for example github.com) with both shells and record the results here.
