# Accessibility and hardening (D6), 30 Oct 2026

Target: WCAG 2.2 AA for the overlay (PRD §11, *proposed*; needs team approval). Everything below was checked in the demo page with the injected shell. **No real screen-reader pass has been done yet.**

## Keyboard
| Task | How | Verified |
|---|---|---|
| Pin an element | **Add** starts the picker: ↑/↓ step through elements in page order, ← parent, → first child, **Enter** pins, **Esc** cancels. The current target is outlined and announced ("td, “Blocked”. Enter to pin."). Clicking still works. | yes |
| Fill in a finding | Focus moves to Screenshot after pinning, then to Category, then to Title. Category is a radio group with arrow keys. | yes |
| Mask a capture | Focus the preview: **Enter** places a box, arrows move it, **Shift+arrows** resize it, **Enter** applies, **Esc** cancels the box only. | yes |
| Manage entries | Row toggle, edit, move up/down and delete are buttons with contextual names ("Delete feedback 2"). Focus returns to the invoking control after dialogs, edits and moves. | yes |
| Dialogs | Focus goes to Cancel (delete/discard) or the selected format (export). The drawer and the page overlay behind them are `inert`. The drawer itself never traps focus. | yes |
| Esc | dialog, then keyboard mask, then pending capture, then recording, then draft, then edit, then picker, then exit review mode (`src/core/keys.js`, unit-tested) | yes |

Pins on the page are `tabindex="-1"`: they're a pointer shortcut, and every pin has a keyboard-reachable row. This keeps Tab from stepping through N pins before reaching the drawer.

## Screen readers (structure only)
- Named controls throughout. Selected, expanded and pressed states are exposed (`aria-pressed` on chips and Add, `aria-expanded` on rows, `aria-checked` on category radios).
- Required fields use `aria-required`; errors are linked with `aria-describedby`; Save explains why it's unavailable.
- **Polite announcements:** saved, updated and deleted (toast); moved to position N; capture ready with mask count; picker target; keyboard-mask steps. The countdown is assertive (three numbers). Recording progress isn't announced every tick.

## Layout
- **200% zoom** (720×450 CSS px): drawer and form reflow, footer reachable. *Verified.*
- **400% / 360 px wide:** drawer goes full width with no horizontal scroll. A **Hide panel** button collapses it to a floating "Show Markly panel (N)" so the page stays usable; pinning reopens it. Clips are disabled with an explanation when less than 320 px of page would remain. *Verified.*
- **Long titles, URLs, unbroken words and long reviewer names:** rows truncate with an ellipsis; details wrap. *Verified.*
- **Off-screen targets:** their pins stay on the top or bottom edge with an ↑/↓ marker. Clicking one scrolls the target into view. *Verified.*
- **Target size:** all controls are at least 24×24 CSS px (inline text links use the 24 px minimum height). *Verified by the audit script.*

## Errors and recovery
Storage failures are worded for people, not as raw DOM errors ("browser storage is full; export your feedback and delete entries with large clips…"; private-mode storage). On a failed save, the draft is kept with no false success, and a retry works. *Verified with a simulated QuotaExceededError.* Capture-denied, oversized-media, GIF-failure and export-failure states were covered in earlier slices.

## Audit script
`scripts/a11y-audit.js` checks Markly's shadow root for:
- controls without accessible names
- broken `aria-labelledby`/`describedby`/`controls` references
- images without `alt`
- unnamed groups and dialogs
- duplicate ids
- targets under 24×24.

It ignores inert content. It returned **no issues** in the ledger, expanded, editing, delete, export, creation and capture-review states after the fixes below. Run it on `demo/?review&test`:
```js
(await import('/scripts/a11y-audit.js')).audit(__markly.root)
```

### Fixed during D6
- Collapsed rows pointed `aria-controls` at detail panels that weren't rendered.
- Pins stayed tabbable behind open dialogs.
- Edge pins shrank below 24 px.
- At full-width drawer sizes the page was unreachable (now Hide panel).

## Not done / needs people
- **Manual screen-reader pass** (VoiceOver + Safari/Chrome, NVDA + Chrome) and a keyboard-only usability session.
- **Windows High Contrast / `forced-colors`:** pins, mask boxes and the review frame aren't yet tuned for it.
- **Token contrast** was checked against the hex values in UI_SPEC, which are read from screenshots; recheck once the real Figma values are available.
- **The extension shell** hasn't been checked in a real Chrome, and neither has real capture.
- WCAG target approval and supported browsers/viewports are owner decisions (PRD §11 and §12).
