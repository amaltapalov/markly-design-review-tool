// Browser side of export: load evidence bytes, make JPEG stills for PDF, run the exporter, download.
import { toCsv } from './csv.js';
import { toHtml } from './html.js';
import { toJson } from './json.js';
import { toMarkdown } from './markdown.js';
import { toPdf } from './pdf.js';

/** @typedef {'pdf' | 'html' | 'csv' | 'json' | 'markdown'} ExportFormat */

export const FORMATS = /** @type {const} */ ([
  { id: 'pdf', label: 'PDF', hint: 'Formatted report for stakeholders', media: true },
  { id: 'html', label: 'HTML', hint: 'Same report, media embedded, one file', media: true },
  { id: 'csv', label: 'CSV', hint: 'Rows for Jira import', media: false },
  { id: 'json', label: 'JSON', hint: 'Structured record for agents and scripts', media: true },
  { id: 'markdown', label: 'Markdown', hint: 'Structured and human-legible', media: true },
]);

const WRITERS = { pdf: toPdf, html: toHtml, csv: toCsv, json: toJson, markdown: toMarkdown };

/**
 * @param {Blob} blob
 * @returns {Promise<import('./util.js').Jpeg>} white-backed JPEG; for a GIF, the first frame
 */
async function toJpeg(blob, maxWidth = 1400) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encode failed'))), 'image/jpeg', 0.85));
  return { bytes: new Uint8Array(await /** @type {Blob} */ (out).arrayBuffer()), width: canvas.width, height: canvas.height };
}

/**
 * @param {ExportFormat} format
 * @param {{ entries: import('../core/model.js').Entry[], context: import('./util.js').ExportContext }} scope
 * @param {import('../platform/types.js').PlatformStorage} storage
 * @returns {Promise<import('./util.js').ExportFile>}
 */
export async function buildExport(format, scope, storage) {
  const spec = FORMATS.find((f) => f.id === format);
  if (!spec) throw new Error(`Unknown format ${format}`);
  /** @type {Map<string, import('./util.js').MediaItem>} */
  const media = new Map();
  /** @type {Map<string, import('./util.js').Jpeg>} */
  const jpegs = new Map();
  if (spec.media) {
    for (const e of scope.entries) {
      if (!e.evidence?.blobKey) continue;
      const blob = await storage.getBlob(e.evidence.blobKey);
      if (!blob) throw new Error(`Evidence for “${e.title}” is missing from storage`);
      media.set(e.id, { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || e.evidence.mime });
      if (format === 'pdf') jpegs.set(e.id, await toJpeg(blob));
    }
  }
  return WRITERS[format]({ ...scope, media, jpegs });
}

/** Hand the file to the browser's download flow. @param {import('./util.js').ExportFile} file @param {ParentNode} root */
export function download(file, root) {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  // Lives in Markly's shadow root, so nothing is added to the host document.
  root.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
