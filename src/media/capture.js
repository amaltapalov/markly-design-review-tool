// Helpers shared by both shells for turning streams and images into pixels.

/**
 * Ask for the current tab as a stream. Chrome shows its own picker; preferCurrentTab pre-selects this tab.
 * @returns {Promise<MediaStream>}
 */
export function displayMediaForTab() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 15 },
    audio: false,
    // Chrome-only hints; ignored elsewhere.
    // @ts-ignore
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
  });
}

/** @param {MediaStream} stream @returns {Promise<HTMLVideoElement>} */
export async function videoFor(stream) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return video;
}

/** @param {HTMLCanvasElement} canvas @param {string} [type] @returns {Promise<Blob>} */
export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type),
  );
}

/**
 * Scale an image source down to maxWidth.
 * @param {CanvasImageSource} src
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {number} maxWidth
 */
export function scaledCanvas(src, sw, sh, maxWidth) {
  const scale = Math.min(1, maxWidth / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** @param {Blob} blob @returns {Promise<{ width: number, height: number }>} */
export async function imageSize(blob) {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

/**
 * Wait for the browser to paint twice, so a hidden overlay is really gone from the frame.
 * Falls back to a timer when the tab isn't painting (rAF paused), rather than hanging.
 */
export function afterPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve(undefined);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(finish, 30)));
    setTimeout(finish, 300);
  });
}
