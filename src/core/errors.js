// User-facing wording for failures (PRD §12: contextual explanation, not raw technical errors).

/**
 * Plain-language reason for a storage failure (PRD §7: no raw technical errors).
 * @param {unknown} err
 */
export function storageReason(err) {
  const e = /** @type {any} */ (err);
  if (e?.name === 'QuotaExceededError' || /quota/i.test(e?.message ?? '')) {
    return 'browser storage is full; export your feedback and delete entries with large clips, then try again';
  }
  if (e?.name === 'InvalidStateError' || /private|denied/i.test(e?.message ?? '')) {
    return 'this browser window doesn’t allow local storage (private mode or blocked by settings)';
  }
  return e?.message ?? 'unknown storage error';
}
