# Evidence masking (D3), prototype baseline `prototype-v0`

**Status:** built and verified in the demo page (30 Oct 2026). **This is not the Data office's PII/PHI baseline (Q4).** It's a starting point to review against that baseline; wider sharing stays blocked until Q4 is approved (PRD-15).

## What happens
1. **At capture**, Markly finds sensitive areas on the page and paints them **solid black into the pixels** before anything is stored. Nothing is blurred, so nothing can be recovered.
   - The unmasked screenshot is dropped straight away.
   - Clip frames are masked one by one, before their pixels are read.
2. **Review step.** The reviewer sees the masked result and how many areas were masked automatically, then can:
   - drag on the preview to mask anything else
   - Undo the last manual mask
   - Keep, Retake or Discard.

   For clips, a manual mask applies to every frame (the GIF is re-encoded: about 0.2 s for 10 frames).
3. **Stored metadata:** each piece of evidence records `masking: { auto, manual, rules: "prototype-v0" }`. It shows in the drawer ("5 areas masked") and in every media-bearing export (PDF/HTML captions, the JSON field, Markdown evidence line).
4. **Export gate:** media formats still need the reviewer's "no PII/PHI visible" check (`decisions.requireMediaReview`).

## What is detected automatically
| Rule | Detects |
|---|---|
| Fields | `input[type=password]`, `input[type=email]`, `input[type=tel]`, `input[autocomplete^=cc-]` |
| Markup | `[data-pii]`, `[data-phi]`, `[data-markly-mask]`, plus `decisions.extraMaskSelectors` |
| Text patterns (visible text and field values) | email addresses; phone-like numbers (9–15 digits); card-like numbers that pass the Luhn check; US SSN shape; Swiss AHV/AVS shape (`756.xxxx.xxxx.xx`) |

Only things the browser actually paints count: content in a closed `<details>`, `visibility:hidden` or `display:none` is skipped. Masking its layout box would have hidden visible content; this bug was found and fixed during D3. Masks are padded by 4 CSS px. For clips, each frame uses the union of this frame's and the previous frame's areas, so content that moves between the page measurement and the slightly older video frame stays covered.

## Known limits (decisions for Q4 / D6)
- **Names, patient details and free-text PHI aren't recognisable by pattern.** They're caught only if the host marks them (`data-pii`/`data-phi`) or the reviewer masks them by hand. This is the main gap; pilot applications should be asked to add `data-pii`/`data-phi` (BO-2 consent conversation).
- Content inside **iframes** (especially cross-origin), **canvas/images/video**, and **closed shadow roots** is invisible to Markly's page scan.
- **Fast scrolling or animation during a clip** can outrun the one-frame safety margin at 5 fps sampling. The reviewer should check the clip before Keep.
- Over-masking: long digit runs (order numbers, timestamps) can look like phone numbers. This is a deliberate trade-off.
- Manual masking is **pointer-only**; there's no keyboard way to draw a mask yet (D6 accessibility gap).
- The review step (preview with Keep/Retake for screenshots) **isn't in the design boards**; PRD S2 says "no crop/confirmation stage is drawn". It was added because masking needs a place for the reviewer to check. Design should confirm or redesign it.

## Where it lives
- `src/media/mask.js`: rules, pattern matching, rect maths, page scanner.
- `src/media/evidence.js`: masked screenshot base and re-rendering with manual masks.
- `src/media/recorder.js`: per-frame masking for clips.
- `tests/mask.test.js`: pattern, rect and frame-masking tests. Synthetic values only; card numbers are generated, not written out.
