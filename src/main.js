// Entry point shared by every shell: toggle review mode on the current page.
import { Markly } from './ui/app.js';
import { hasHandoff } from './ui/handoff.js';

/** @type {Markly | null} */
let instance = null;

/** @param {import('./platform/types.js').Platform} platform */
export async function toggle(platform) {
  if (instance) {
    instance.requestExit();
    return;
  }
  instance = new Markly(platform, () => {
    instance = null;
  });
  // Test hook: the shadow root is closed, so demo pages opt in to expose the instance.
  if (/** @type {any} */ (globalThis).__MARKLY_TEST__) /** @type {any} */ (globalThis).__markly = instance;
  try {
    await instance.start();
  } catch (err) {
    console.error('[Markly] could not start', err);
    instance?.teardown();
  }
}

/**
 * Page load: reopen Markly only if it just sent the reviewer here (screens dropdown, or an entry on
 * another screen). Otherwise it stays off until the reviewer starts it.
 * @param {import('./platform/types.js').Platform} platform
 */
export function resume(platform) {
  if (!instance && hasHandoff()) toggle(platform);
}
