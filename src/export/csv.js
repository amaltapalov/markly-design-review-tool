// CSV for Jira's CSV importer (interim hand-off, DEC-04). Carries no media (PRD-14 caveat).
// Column mapping still needs validating against a real Jira import (Q3).
import { filenameFor, formatDate, utf8 } from './util.js';

const HEADERS = ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels', 'Labels'];

/**
 * Quote per RFC 4180 and defuse spreadsheet formulas (cells starting with = + - @ tab or CR).
 * @param {string} v
 */
export function csvCell(v) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** @param {import('./util.js').ExportInput} input @returns {import('./util.js').ExportFile} */
export function toCsv({ entries, context }) {
  const rows = entries.map((e, i) => {
    const lines = [
      e.description,
      '',
      `Page: ${e.page.url}`,
      `Element: ${e.anchor.label}${e.anchor.text ? ` “${e.anchor.text}”` : ''} (${e.anchor.selector})`,
      `Category: ${e.category}`,
      e.evidence ? `Evidence: ${e.evidence.kind === 'gif' ? 'GIF clip' : e.evidence.kind === 'upload' ? 'file' : 'screenshot'} not included in CSV; it stays in Markly.` : 'Evidence: none attached.',
      `Markly entry ${i + 1} · ${context.reviewer} · ${formatDate(context.exportedAt)}`,
    ];
    return [
      e.title,
      lines.join('\n'),
      e.type === 'bug' ? 'Bug' : 'Task',
      e.priority ?? '',
      `markly-${e.category.toLowerCase()}`,
      'markly',
    ];
  });
  const text = [HEADERS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return { filename: filenameFor(context, 'csv'), mime: 'text/csv;charset=utf-8', bytes: utf8(text) };
}
