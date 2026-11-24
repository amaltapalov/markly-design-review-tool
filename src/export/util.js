// Helpers shared by the exporters. Pure; runs in the browser and in Node tests.

import { evidenceKindLabel } from '../core/model.js';

/** @typedef {import('../core/model.js').Entry} Entry */

/**
 * What every exporter receives. Media bytes are loaded by the caller (run.js) so exporters stay pure.
 * @typedef {object} ExportInput
 * @property {Entry[]} entries                 in approved (ledger) order
 * @property {ExportContext} context
 * @property {Map<string, MediaItem>} media     entry id -> original evidence bytes
 * @property {Map<string, Jpeg>} [jpegs]        entry id -> JPEG still (PDF only; first frame for clips)
 */

/**
 * @typedef {object} ExportContext
 * @property {string} reviewer      display name, "Unnamed reviewer" if blank
 * @property {Date} exportedAt
 * @property {string} scopeLabel    e.g. "4 entries · all categories"
 * @property {string} source        origin the ledger belongs to
 */

/** @typedef {{ bytes: Uint8Array, mime: string }} MediaItem */
/** @typedef {{ bytes: Uint8Array, width: number, height: number }} Jpeg */

/** @typedef {{ filename: string, mime: string, bytes: Uint8Array }} ExportFile */

/** @param {string} s */
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** @param {Uint8Array} bytes */
export function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** @param {MediaItem} m */
export const dataUrl = (m) => `data:${m.mime};base64,${base64(m.bytes)}`;

/** @param {string} s */
export const utf8 = (s) => new TextEncoder().encode(s);

/** "30 Oct 2026" (fixed English format so exports read the same everywhere). @param {Date} d */
export function formatDate(d) {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

/** 2026-10-30 in local time. @param {Date} d */
export function isoDay(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @param {ExportContext} ctx @param {string} ext */
export function filenameFor(ctx, ext) {
  let host = 'review';
  try {
    host = new URL(ctx.source).hostname.replace(/[^a-z0-9.-]/gi, '-') || 'review';
  } catch {
    // keep default
  }
  return `markly-${host}-${isoDay(ctx.exportedAt)}.${ext}`;
}

/** @param {Entry} e */
export function evidenceLabel(e) {
  const ev = e.evidence;
  if (!ev) return 'No evidence attached';
  if (ev.kind === 'upload') {
    const dims = ev.width ? ` · ${ev.width}×${ev.height}` : '';
    return `${evidenceKindLabel(ev)} · ${ev.name ?? 'file'}${dims} · not masked`;
  }
  const n = (ev.masking?.auto ?? 0) + (ev.masking?.manual ?? 0);
  const masked = n ? ` · ${n} ${n === 1 ? 'area' : 'areas'} masked` : '';
  if (ev.kind === 'gif') return `GIF clip · ${Math.round((ev.durationMs ?? 0) / 100) / 10}s · ${ev.width}×${ev.height}${masked}`;
  return `Screenshot · ${ev.width}×${ev.height}${masked}`;
}

/** File extension for an evidence mime type. @param {string} mime */
export const extFor = (mime) => (mime === 'image/gif' ? 'gif' : mime === 'image/jpeg' ? 'jpg' : 'png');

/** Zip-safe file name from a user's file name. @param {string | undefined} name */
export const safeName = (name) => (name || 'file').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+/, '').slice(0, 80) || 'file';

/** "01-screenshot.png", or "01-report.pdf" for uploads. @param {Entry} e @param {number} n @param {MediaItem} m */
export function mediaName(e, n, m) {
  const num = String(n).padStart(2, '0');
  if (e.evidence?.kind === 'upload') return `${num}-${safeName(e.evidence.name)}`;
  return `${num}-${e.evidence?.kind === 'gif' ? 'clip' : 'screenshot'}.${extFor(m.mime)}`;
}

/** Standard CRC-32 (zip). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {Uint8Array[]} parts */
export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
