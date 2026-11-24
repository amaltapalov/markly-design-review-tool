// MV3 service worker: launches the overlay on action click and owns storage + screenshots,
// so the host page's origin storage is never touched.
import { idbDelete, idbGet, idbPut } from '../../src/storage/idb.js';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shells/extension/content.js'] });
  } catch (err) {
    // chrome://, the Web Store and PDF viewers refuse injection.
    console.warn('[Markly] cannot run on this page', err);
  }
});

/**
 * @param {any} msg
 * @param {chrome.runtime.MessageSender} sender
 */
async function handle(msg, sender) {
  switch (msg?.type) {
    case 'capture':
      if (!sender.tab?.windowId) throw new Error('No tab to capture');
      return chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
    case 'session:get':
      return (await idbGet('sessions', msg.key)) ?? null;
    case 'session:put':
      await idbPut('sessions', msg.key, msg.value);
      return true;
    case 'blob:put':
      await idbPut('blobs', msg.key, msg.value);
      return true;
    case 'blob:get':
      return (await idbGet('blobs', msg.key)) ?? null;
    case 'blob:delete':
      await idbDelete('blobs', msg.key);
      return true;
    default:
      throw new Error(`Unknown message ${msg?.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(
    (value) => sendResponse({ value }),
    (err) => sendResponse({ error: String(err?.message ?? err) }),
  );
  return true; // async response
});
