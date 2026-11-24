// Chrome MV3 shell: this module runs in the content script's isolated world.
// Storage and screenshots go through the service worker so nothing lands in the host origin.
import { displayMediaForTab } from '../media/capture.js';

/** @param {Record<string, unknown>} msg @returns {Promise<any>} */
async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (!res || res.error) throw new Error(res?.error ?? 'Markly background did not respond');
  return res.value;
}

/** @param {Blob} blob @returns {Promise<string>} */
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(/** @type {string} */ (r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** @param {string} dataUrl */
const fromDataUrl = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

/** @returns {import('./types.js').Platform} */
export function createExtensionPlatform() {
  return {
    name: 'extension',
    // Messages are JSON, so media travels as data URLs and is stored that way in the extension's own IndexedDB.
    storage: {
      loadSession: (key) => send({ type: 'session:get', key }),
      saveSession: (key, session) => send({ type: 'session:put', key, value: session }),
      putBlob: async (key, blob) => send({ type: 'blob:put', key, value: await toDataUrl(blob) }),
      getBlob: async (key) => {
        const v = await send({ type: 'blob:get', key });
        return v ? fromDataUrl(v) : null;
      },
      deleteBlob: (key) => send({ type: 'blob:delete', key }),
    },
    async captureViewport(prepare) {
      await prepare();
      return fromDataUrl(await send({ type: 'capture' }));
    },
    // D0: tabCapture needs an offscreen document; getDisplayMedia from the content script is the spike path.
    requestTabStream: displayMediaForTab,
    assetUrl: (path) => chrome.runtime.getURL(path),
  };
}
