# Markly V1: UI spec (from reference boards, 30 Oct 2026)

Source: five screenshots shared in chat.
- Boards 1–4: full-page flow on the demo "Workspace / Group A" host.
- Board 5: list, expanded, export and delete specimens.

Values below are **read from screenshots, not Figma**, so treat hex values and px sizes as approximate. Confirm them once the Figma connector is available (file `ooiAlv2jqTU7PFrfLM7VeX`, node `109-198`).

## Visual language
- Monochrome and flat. Black is the primary action colour, there are white surfaces, light-grey bands for context rows, and red is used only for draft pins and destructive actions.
- Buttons, inputs, toggle groups and dialogs have **square corners**. Only filter chips (pill shape) and pins/number badges (circles) are rounded.
- No shadows, except a faint one under the creation panel's sticky top section (board 2).
- Grotesk sans with tight letter-spacing. Weights: bold for headings, titles and buttons; regular for body.

## Tokens (`src/ui/tokens.css`, all `--mk-*`)
| Token | Value (approx.) | Used for |
|---|---|---|
| `--mk-ink` | `#111111` | primary buttons, selected toggles, saved pins, number badges, headings |
| `--mk-surface` | `#ffffff` | drawer, inputs, dialogs, toast |
| `--mk-band` | `#f2f2f2` | "Reviewing as…" row, "Inspected…" row, evidence line |
| `--mk-border` | `#d6d6d6` | inputs, row dividers, panel separators |
| `--mk-border-strong` | `#111111` | outline buttons, chips, secondary Cancel |
| `--mk-text` | `#111111` | |
| `--mk-text-muted` | `#6b6b6b` | subtitle, placeholders, scope line, descriptions |
| `--mk-disabled-bg` / `--mk-disabled-fg` | `#c8c8c8` / `#ffffff` | disabled Save, Export 0 |
| `--mk-danger` | `#e0262b` | draft pin, draft badge, trash icon, Delete button |
| `--mk-success` | `#2e8b3a` | toast left rule and check icon |
| `--mk-warning` | `#f08c00` | CSV caveat left rule |
| `--mk-prio-high` / `-medium` / `-low` | `#d62828` / `#e67e00` / `#2e8b3a` | priority text in rows |
| `--mk-review-frame` | `#e0262b`, 2px dashed | review-mode frame around the viewport |
| `--mk-radius` / `--mk-radius-pill` | `0` / `999px` | |
| `--mk-drawer-w` | `380px` (board 1–4 ratio) | see conflict C6 |
| `--mk-font` | system grotesk stack: `"Helvetica Neue", Helvetica, Arial, sans-serif` | see note F1 |
| Type scale | header 16/bold · row title 14/regular · body 14 · field label 12/semibold uppercase, +0.02em · meta 12 | |
| Spacing | 4-pt grid; panel padding 16, section gap 16, row padding 12/16 | |
| Controls | button and input height 36; icon buttons 28 | |

**F1 (font):** `@font-face` declared inside a shadow root doesn't load in Chrome. Loading a brand font would mean adding a stylesheet to the host document, which C1 forbids. The prototype therefore uses a system grotesk stack. A brand font is a D0 question; the extension could load it via `chrome.runtime.getURL` plus the `FontFace` API.

## Surfaces and components
**Review-mode overlay (host)**
- A red dashed frame marks the viewport. Pointer events pass through to the host page.
- Hint pill at bottom centre: black, white bold 14px text. In review: "Click anywhere to add feedback · Esc to exit". While drafting: "Esc to exit review mode".
- **Draft pin:** red filled circle (~24px) with a white number and a dashed red ring (~44px).
- **Saved pin:** black filled circle with no ring. Placed at the target's top-right edge, offset outward, so it doesn't cover the label (fixes the occlusion in board 2; see C5).
- **Toast:** top-right of the host area, white, 1px green border with a 6px green left rule, green check icon, "Feedback saved". Uses `aria-live="polite"`.

**Drawer header (ledger)**
- "Review & Submit Feedback" plus " (N)" once N > 0. Black **Add** button, then a close ✕.
- Band row: "Reviewing as {name}". Clicking the name edits it inline.
- Filter chips: pill outline UX / UI / Content / Dev, multi-select. Selected = black fill with white text (needs `aria-pressed`).

**Empty state**
- Centred bold "No feedback yet", then muted text: "Click anything on the page to describe it. The first click places a pin and opens this panel to write in."
- Footer: Export button disabled with label "Export 0".

**Footer (ledger):** "Clear all" text button on the left (hidden by default; see C3), black **Export** on the right.

**Creation panel ("New feedback")**
1. Header: red number badge, "New feedback", small ✕.
2. Band: `Inspected {tag.class} · "{text}"`.
3. EVIDENCE: two outline buttons with icons, "Screenshot" and "Video 10s". The chosen one turns black.
4. CATEGORY: square segmented group UX | UI | Content | Dev, single-select (`role="radiogroup"`). Appears after evidence.
5. TITLE input, DESCRIPTION textarea (auto-grow), then classification (see C1).
6. Evidence band: e.g. "Clip attached · GIF · 6s · just now" or "Screenshot attached", using real values.
7. Sticky footer: Cancel (outline) and Save (black; disabled grey until valid, with an inline reason).

**Ledger row (collapsed)**
- Line 1: black number badge, title (single line, ellipsis), chevron.
- Line 2: category (plain text) · priority (coloured text) · evidence glyph (▷ clip, 🖼 screenshot, with `aria-label`) · then on the right: trash (red), edit (pencil), up, down.

**Ledger row (expanded)**
- Read state: TITLE / DESCRIPTION / PRIORITY as plain text with no borders or chevrons. The board shows inputs; see C4.
- Evidence band: "Screenshot attached · Inspected: h1.custom-h1", with a thumbnail or GIF preview below.
- Edit state: the same fields as inputs, with a Save/Cancel footer.

**Dialogs (bottom sheets inside the drawer)**
- A scrim dims the drawer only; the host page stays usable. Square corners, padding 16, Cancel (outline) and primary action buttons.
- **Export feedback:**
  - Scope line, e.g. "6 entries · all categories · Participant 1 · 25 Sep 2026".
  - Five radios with descriptions:
    - PDF: "Formatted report for stakeholders"
    - HTML: "Same report, media embedded, zippable"
    - CSV: "Rows for Jira import"
    - JSON: "Structured record for agents and scripts"
    - Markdown: "Structured and human-legible"
  - CSV caveat box (orange left rule): "CSV does not carry evidence / Screenshots and clips stay in the tool until a real Jira integration exists."
  - The primary button reads "Export {FORMAT}".
- **Delete entry N?** "Do you want to proceed deleting this entry?" with Cancel and a red Delete button. Copy should name the title too; see C7.

## Conflicts between the reference and the PRD, with prototype choice
| # | Reference shows | PRD says | Prototype choice |
|---|---|---|---|
| C1 | Creation form has SEVERITY + PRIORITY two-up (board 3); rows and expanded view show one coloured value, labelled PRIORITY | OQ-SEVPRI open; newer forms show priority only | **Priority only**, optional, values High/Medium/Low. Severity is behind a flag. |
| C2 | Drag handle ⋮⋮ (board 5) and ↑/↓ arrows (board 4) | Up/down; "drag-and-drop not implied" | **↑/↓ only**, no drag handle |
| C3 | "Clear all" visible in every footer | Not a V1 story; confirmation undrawn | **Hidden** behind a flag; enabling it requires a confirm dialog |
| C4 | Expanded read state uses input borders and chevrons | Read styling should not look editable | **Plain-text read**; inputs only in Edit |
| C5 | Draft pin covers the target's text ("E①d") | OQ-PIN-OCCL open | Pin at the target's top-right corner, offset outward |
| C6 | Drawer ≈380px | 380 design vs min(440px, 92vw) shipped | **380px**, matching the reference. Classification fields stack below 360px of content width |
| C7 | Delete dialog names only "entry 1" | Confirmation must identify the entry | Add the entry title under the heading |
| C8 | Orange "Medium" text on white (≈2.6:1) | WCAG 2.2 AA target | Darken to about `#b35c00` (≥4.5:1) and keep the text label |
| C9 | Export button reads "Export 0" when empty and "Export" otherwise | Count should describe scope | Follow the reference |
| C10 | Host content appears to end at the drawer edge | No host DOM writes | Drawer **overlays** the host's right edge and doesn't push the layout. Pins under the drawer get an edge indicator |

## States the reference doesn't draw (built from these tokens)
Countdown (large number in the drawer, "Esc to cancel"), recording (elapsed/10s, progress bar, Stop), GIF processing (busy indicator), GIF ready (preview, real duration and size, Keep/Retake), no filter matches (with "Clear filters"), capture denied, conversion failed, storage full, export busy/success/failure, and the dirty-state discard confirmation.
