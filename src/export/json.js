// JSON: lossless structured hand-off for scripts and agents. Media is inlined as data URLs.
// Schema is v0 and provisional (PRD §6: final schema and media encoding unresolved).
import { dataUrl, filenameFor, utf8 } from './util.js';

export const EXPORT_SCHEMA = 'markly.export/v0';

/** @param {import('./util.js').ExportInput} input @returns {import('./util.js').ExportFile} */
export function toJson({ entries, context, media }) {
  const doc = {
    schema: EXPORT_SCHEMA,
    exportedAt: context.exportedAt.toISOString(),
    source: context.source,
    reviewer: context.reviewer,
    scope: context.scopeLabel,
    count: entries.length,
    entries: entries.map((e, i) => {
      const m = media.get(e.id);
      const { blobKey: _key, ...evidence } = e.evidence ?? {};
      return {
        number: i + 1,
        id: e.id,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        category: e.category,
        type: e.type,
        title: e.title,
        description: e.description,
        priority: e.priority,
        page: e.page,
        anchor: e.anchor,
        evidence: e.evidence ? { ...evidence, data: m ? dataUrl(m) : null } : null,
      };
    }),
  };
  return { filename: filenameFor(context, 'json'), mime: 'application/json', bytes: utf8(JSON.stringify(doc, null, 2) + '\n') };
}
