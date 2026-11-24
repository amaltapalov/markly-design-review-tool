// Which entries an export contains, and the scope line that describes them (PRD S5, PRD-14).
import { decisions } from '../core/decisions.js';
import { visibleEntries } from '../core/ledger.js';
import { formatDate } from './util.js';

/** @typedef {import('../core/model.js').Session} Session */
/** @typedef {import('../core/model.js').Category} Category */

/**
 * @param {Session} session
 * @param {ReadonlySet<Category>} filters  the ledger's current filter
 * @param {Date} now
 * @param {string} source
 */
export function exportScope(session, filters, now, source) {
  const filtered = decisions.exportScope === 'filtered' && filters.size > 0;
  const entries = filtered ? visibleEntries(session.entries, filters) : session.entries;
  const n = entries.length;
  const cats = filtered ? [...filters].join(', ') : 'all categories';
  const reviewer = session.reviewer.trim() || 'Unnamed reviewer';
  /** @type {import('./util.js').ExportContext} */
  const context = {
    reviewer,
    exportedAt: now,
    scopeLabel: `${n} ${n === 1 ? 'entry' : 'entries'} · ${cats}`,
    source,
  };
  return {
    entries,
    context,
    /** Shown in the dialog, e.g. "4 entries · all categories · Participant 1 · 30 Oct 2026". */
    line: `${context.scopeLabel} · ${reviewer} · ${formatDate(now)}`,
    /** The filter is set but doesn't apply; say so rather than surprise the reviewer. */
    filterIgnored: !filtered && filters.size > 0,
    hasMedia: entries.some((e) => e.evidence),
  };
}
