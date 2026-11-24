// Markdown: structured and human-readable. With media it's a zip (review.md + media/), else a single .md.
import { evidenceLabel, filenameFor, formatDate, mediaName, utf8 } from './util.js';
import { evidenceKindLabel, isImageEvidence } from '../core/model.js';
import { zip } from './zip.js';

/** Escape Markdown syntax so findings render literally. @param {string} s */
export const mdEscape = (s) => s.replace(/([\\`*_{}[\]<>#|!])/g, '\\$1');

/** @param {import('./util.js').ExportInput} input @returns {import('./util.js').ExportFile} */
export function toMarkdown({ entries, context, media }) {
  /** @type {{ name: string, bytes: Uint8Array }[]} */
  const files = [];
  const out = [
    '# Markly review',
    '',
    `**Scope:** ${mdEscape(context.scopeLabel)} · ${mdEscape(context.reviewer)} · ${formatDate(context.exportedAt)}  `,
    `**Source:** ${mdEscape(context.source)}`,
    '',
    '> Exported from Markly. Nothing has been submitted to any tracker.',
    '',
  ];
  entries.forEach((e, i) => {
    const n = i + 1;
    const m = media.get(e.id);
    out.push(
      `## ${n}. ${mdEscape(e.title)}`,
      '',
      `- **Category:** ${e.category} (${e.type})`,
      `- **Priority:** ${e.priority ?? 'Not set'}`,
      `- **Page:** <${e.page.url}>`,
      `- **Element:** \`${e.anchor.selector.replace(/`/g, "'")}\`${e.anchor.text ? ` “${mdEscape(e.anchor.text)}”` : ''}`,
      `- **Evidence:** ${mdEscape(evidenceLabel(e))}`,
      '',
      ...e.description.split('\n').map(mdEscape),
      '',
    );
    if (e.evidence && m) {
      const name = mediaName(e, n, m);
      files.push({ name: `media/${name}`, bytes: m.bytes });
      const label = `${evidenceKindLabel(e.evidence)} for entry ${n}`;
      out.push(isImageEvidence(e.evidence) ? `![${label}](media/${name})` : `[${label}: ${mdEscape(e.evidence.name ?? 'file')}](media/${name})`, '');
    }
  });
  const md = utf8(out.join('\n'));
  if (!files.length) return { filename: filenameFor(context, 'md'), mime: 'text/markdown;charset=utf-8', bytes: md };
  const base = filenameFor(context, 'md').replace(/\.md$/, '');
  return {
    filename: `${base}.zip`,
    mime: 'application/zip',
    bytes: zip([{ name: 'review.md', bytes: md }, ...files], context.exportedAt),
  };
}
