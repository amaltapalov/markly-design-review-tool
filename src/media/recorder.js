// Clip recorder: samples a tab stream onto a canvas and feeds a GifWriter frame by frame.
import { GifWriter, quantize } from './gif.js';
import { videoFor } from './capture.js';
import { toImageRects } from './mask.js';

/**
 * @typedef {object} Clip
 * @property {Blob} blob
 * @property {number} width
 * @property {number} height
 * @property {number} durationMs
 * @property {number} frames
 * @property {Uint8Array[]} indexed  palette-index frames, kept so manual masks can be re-encoded
 * @property {number} delayMs
 * @property {number} autoMasked     most masked areas seen in any one frame
 */

/**
 * @typedef {object} CropRect  CSS-pixel region of the viewport to keep (excludes Markly's drawer).
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

export class ClipRecorder {
  /**
   * @param {MediaStream} stream
   * @param {{ fps: number, maxWidth: number, maxMs: number, crop: () => CropRect, masks?: () => CropRect[], onTick?: (elapsedMs: number) => void }} opts
   */
  constructor(stream, opts) {
    this.stream = stream;
    this.opts = opts;
    /** @type {Promise<Clip> | null} */
    this.result = null;
    this.stopped = false;
    this.cancelled = false;
    /** @type {(() => void) | null} */
    this.wake = null;
  }

  /** Start sampling. Resolves when stop() is called or maxMs elapses. */
  start() {
    this.result ??= this.#run();
    return this.result;
  }

  /** Safe to call more than once and from both Stop and the timeout (single stop). */
  stop() {
    this.stopped = true;
    this.wake?.();
  }

  /** Stop without producing a clip. */
  cancel() {
    this.cancelled = true;
    this.stop();
  }

  async #run() {
    const { fps, maxWidth, maxMs, crop, masks, onTick } = this.opts;
    const video = await videoFor(this.stream);
    const frameMs = 1000 / fps;
    try {
      // The stream is in device pixels; map the CSS crop rect onto it.
      const ratio = video.videoWidth / window.innerWidth;
      const c = crop();
      const sx = Math.round(c.x * ratio);
      const sy = Math.round(c.y * ratio);
      const sw = Math.max(1, Math.min(video.videoWidth - sx, Math.round(c.width * ratio)));
      const sh = Math.max(1, Math.min(video.videoHeight - sy, Math.round(c.height * ratio)));
      const scale = Math.min(1, maxWidth / sw);
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
      const gif = new GifWriter(w, h);
      /** @type {Uint8Array[]} */
      const indexed = [];
      let autoMasked = 0;

      const t0 = performance.now();
      let last = t0;
      let elapsed = 0;
      while (!this.stopped) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
        // Mask before the pixels are read, so unmasked frames never exist outside the video element.
        if (masks) {
          const rects = toImageRects(masks(), c, ratio * scale);
          autoMasked = Math.max(autoMasked, rects.length);
          ctx.fillStyle = '#000';
          for (const r of rects) ctx.fillRect(r.x, r.y, r.width, r.height);
        }
        const now = performance.now();
        elapsed = Math.min(maxMs, now - t0);
        const indices = quantize(ctx.getImageData(0, 0, w, h).data);
        indexed.push(indices);
        // Fixed frame delay: playback runs at the sampling rate even if a sample arrives late.
        gif.addIndexedFrame(indices, frameMs);
        last = now;
        onTick?.(elapsed);
        if (elapsed >= maxMs) break;
        await new Promise((r) => {
          this.wake = () => r(undefined);
          setTimeout(r, Math.max(0, frameMs - (performance.now() - last)));
        });
        this.wake = null;
      }
      elapsed = Math.min(maxMs, performance.now() - t0);
      if (this.cancelled) throw new DOMException('Recording cancelled', 'AbortError');
      const bytes = gif.finish();
      return {
        blob: new Blob([bytes], { type: 'image/gif' }),
        width: w,
        height: h,
        durationMs: Math.round(Math.min(elapsed, gif.frames * frameMs)),
        frames: gif.frames,
        indexed,
        delayMs: frameMs,
        autoMasked,
      };
    } finally {
      this.stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }
}
