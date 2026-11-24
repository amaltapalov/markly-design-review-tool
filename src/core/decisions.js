// Placeholder answers to open PRD decisions (docs/IMPLEMENTATION_PLAN.md, docs/UI_SPEC.md).
// Every value here is a prototype default, not approved scope. Change it here, not in components.

export const decisions = Object.freeze({
  /** OQ-SEVPRI / UI_SPEC C1: 'priority' | 'severity' | 'both'. Only 'priority' is built in D1. */
  classification: 'priority',
  /** Evidence is optional; the reviewer can skip it explicitly. */
  evidenceRequired: false,
  /** OQ-EVID-MULTI: one screenshot or one clip per entry. */
  maxEvidence: 1,
  /** Video needs a pin (A1). */
  allowUnpinnedVideo: false,
  /** DEC-07 */
  countdownSeconds: 3,
  maxClipSeconds: 10,
  /** GIF sampling; tuned in D0 for memory, not quality. */
  gifFps: 5,
  gifMaxWidth: 640,
  screenshotMaxWidth: 1600,
  /** OQ-STORAGE size contract is open; reject larger media rather than fail on save. */
  maxEvidenceBytes: 15 * 1024 * 1024,
  /** UI_SPEC C3: hidden until a confirmation is designed. */
  showClearAll: false,
  /** UI_SPEC C2: up/down only. Row actions arrive in D4. */
  reorder: 'buttons',
  /** UI_SPEC C6 */
  drawerWidth: 380,
  /** Where the panel starts. 'left' | 'right'; the reviewer can swap it from the panel header. */
  drawerSide: 'right',
  /** Export filter scope (unassigned): 'all' exports the whole ledger whatever the filter. */
  exportScope: 'all',
  /** DEC-13 stand-in until the Data office baseline (Q4) is approved: media formats need an explicit check. */
  requireMediaReview: true,
  /** D3 masking (prototype baseline): also mask text that looks like emails, phone, card, SSN or AHV numbers. */
  maskTextPatterns: true,
  /** Site-specific additions to MASK_SELECTORS (src/media/mask.js). */
  extraMaskSelectors: /** @type {string[]} */ ([]),
  /** OQ-STORAGE: one ledger per site origin, survives reload. */
  storageScope: 'origin',
  /** Unsaved draft: ask before discarding. */
  confirmDiscard: true,
  /** Hold Alt while targeting to use the host page normally. */
  altPassthrough: true,
});
