// Evidence in its own tab: the stored bytes, with the feedback pin drawn at its capture position.
import { escapeHtml as x } from '../export/util.js';
import { evidenceKindLabel, isVideoEvidence } from '../core/model.js';

/** @typedef {import('../core/model.js').Entry} Entry */
/** @typedef {import('../core/model.js').Evidence} Evidence */

const STYLE = `
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif}
figure{position:relative;margin:0;line-height:0}
img,video{display:block;max-width:100vw;max-height:calc(100vh - 56px)}
.pin{position:absolute;transform:translate(-50%,-50%);box-sizing:border-box;width:32px;height:32px;border-radius:50%;background:#111;color:#fff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,0,0,.45);font:700 14px/26px system-ui,sans-serif;text-align:center}
.caption{position:fixed;left:0;right:0;bottom:0;margin:0;padding:12px 16px;background:#111}`;

/** @param {number} f */
const percent = (f) => `${(Math.min(1, Math.max(0, f)) * 100).toFixed(2)}%`;

/**
 * @param {{ src: string, number: number, title: string, evidence: Evidence }} v
 * @returns {string}
 */
export function viewerDocument(v) {
  const ev = v.evidence;
  const label = `Feedback ${v.number}: ${v.title}`;
  const media = isVideoEvidence(ev)
    ? `<video src="${x(v.src)}" controls aria-label="${x(label)}"></video>`
    : `<img src="${x(v.src)}" alt="${x(label)}">`;
  const pin = ev.pin ? `<span class="pin" style="left:${percent(ev.pin.fx)};top:${percent(ev.pin.fy)}" aria-hidden="true">${v.number}</span>` : '';
  const note = ev.kind === 'upload' ? ` · ${evidenceKindLabel(ev)} not masked` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${x(label)} · Markly</title><style>${STYLE}</style></head><body><figure>${media}${pin}</figure><p class="caption">${x(label)}${x(note)}</p></body></html>`;
}

/**
 * Opens the evidence in a new tab. Keep the call synchronous until `window.open`, or the browser blocks the tab.
 * @param {{ getBlob: (key: string) => Promise<Blob | null> }} storage
 * @param {Entry} entry
 * @param {number} number
 * @returns {Promise<'ok' | 'blocked' | 'missing'>}
 */
export async function openEvidenceTab(storage, entry, number) {
  const ev = entry.evidence;
  if (!ev?.blobKey) return 'missing';
  const tab = window.open('about:blank', '_blank');
  if (!tab) return 'blocked';
  tab.opener = null;
  const blob = await storage.getBlob(ev.blobKey);
  if (!blob) {
    tab.close();
    return 'missing';
  }
  const src = URL.createObjectURL(blob);
  tab.document.open();
  tab.document.write(viewerDocument({ src, number, title: entry.title, evidence: ev }));
  tab.document.close();
  // The tab has loaded the bytes by then; the URL is only needed for the first paint.
  setTimeout(() => URL.revokeObjectURL(src), 60000);
  return 'ok';
}
