// Masked evidence in review: the auto-masked base plus the reviewer's manual masks.
// The unmasked capture is never kept: the base already has automatic masks painted in.
import { GifWriter, MASK_INDEX } from './gif.js';
import { maskIndices, toImageRects } from './mask.js';
import { canvasToBlob } from './capture.js';

/** @typedef {import('./mask.js').Rect} Rect */

/**
 * Evidence awaiting Keep. `manual` rects are in image pixels.
 * @typedef {object} PendingMedia
 * @property {'screenshot' | 'gif'} kind
 * @property {number} width
 * @property {number} height
 * @property {number} autoMasked
 * @property {Rect[]} manual
 * @property {Blob} blob            current rendering (auto + manual masks)
 * @property {{ fx: number, fy: number } | null} [pin]  feedback pin at capture time, as fractions of the viewport
 * @property {string} previewUrl
 * @property {HTMLCanvasElement} [base]    screenshot: auto-masked pixels
 * @property {Uint8Array[]} [indexed]      clip: auto-masked palette frames
 * @property {Blob} [baseBlob]             clip: encoding of `indexed` with no manual masks
 * @property {number} [delayMs]
 * @property {number} [durationMs]
 * @property {number} [frames]
 */

/**
 * Downscale a viewport capture and paint automatic masks into it.
 * @param {Blob} blob          full-viewport capture (device pixels)
 * @param {Rect[]} rects       sensitive areas in viewport CSS pixels, measured at capture time
 * @param {number} viewportWidth
 * @param {number} maxWidth
 */
export async function maskedScreenshot(blob, rects, viewportWidth, maxWidth) {
  const bmp = await createImageBitmap(blob);
  const down = Math.min(1, maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * down);
  canvas.height = Math.round(bmp.height * down);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const scale = canvas.width / viewportWidth;
  const img = toImageRects(rects, { x: 0, y: 0, width: viewportWidth, height: canvas.height / scale }, scale);
  ctx.fillStyle = '#000';
  for (const r of img) ctx.fillRect(r.x, r.y, r.width, r.height);
  return { base: canvas, width: canvas.width, height: canvas.height, autoMasked: img.length };
}

/** Re-render with manual masks. @param {PendingMedia} m @returns {Promise<Blob>} */
export async function renderPending(m) {
  if (m.kind === 'screenshot') {
    const base = /** @type {HTMLCanvasElement} */ (m.base);
    const out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = '#000';
    for (const r of m.manual) ctx.fillRect(r.x, r.y, r.width, r.height);
    return canvasToBlob(out);
  }
  if (!m.manual.length && m.baseBlob) return m.baseBlob;
  const frames = /** @type {Uint8Array[]} */ (m.indexed);
  const gif = new GifWriter(m.width, m.height);
  for (let i = 0; i < frames.length; i++) {
    gif.addIndexedFrame(maskIndices(frames[i].slice(), m.width, m.manual, MASK_INDEX), m.delayMs ?? 200);
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0)); // keep the drawer responsive
  }
  return new Blob([gif.finish()], { type: 'image/gif' });
}
