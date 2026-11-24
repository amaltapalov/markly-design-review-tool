// Injected-script shell: runs in the page's own world, loaded from a bookmarklet or a <script type=module>.
import { idbDelete, idbGet, idbPut } from '../storage/idb.js';
import { afterPaint, canvasToBlob, displayMediaForTab, videoFor } from '../media/capture.js';

/** @returns {import('./types.js').Platform} */
export function createInjectedPlatform() {
  const base = new URL('../../', import.meta.url);
  return {
    name: 'injected',
    // D0 finding: this writes to the host origin's IndexedDB (database "markly").
    storage: {
      loadSession: (key) => idbGet('sessions', key).then((v) => v ?? null),
      saveSession: (key, session) => idbPut('sessions', key, session).then(() => {}),
      putBlob: (key, blob) => idbPut('blobs', key, blob).then(() => {}),
      getBlob: (key) => idbGet('blobs', key).then((v) => v ?? null),
      deleteBlob: (key) => idbDelete('blobs', key).then(() => {}),
    },
    // No extension APIs here, so a screenshot is one frame grabbed from a tab stream (prompts every time).
    async captureViewport(prepare) {
      const stream = await displayMediaForTab();
      try {
        const video = await videoFor(stream);
        await prepare();
        // The stream lags the page by a frame or two; wait so the hidden overlay is gone from it.
        await afterPaint();
        await new Promise((r) => setTimeout(r, 120));
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(video, 0, 0);
        return await canvasToBlob(canvas);
      } finally {
        stream.getTracks().forEach((t) => t.stop());
      }
    },
    requestTabStream: displayMediaForTab,
    assetUrl: (path) => new URL(path, base).href,
  };
}
