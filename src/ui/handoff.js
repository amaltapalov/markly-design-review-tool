// Markly can move the reviewer to another screen (the screens dropdown, or an entry taken on another
// screen). The page reloads, so it leaves a one-shot note in the tab's sessionStorage that the next
// page reads once. Markly never starts on a page without one, unless the reviewer starts it.
import { screenPath } from '../core/model.js';

const KEY = 'markly:handoff';
/** A note older than this is from a navigation that didn't happen; ignore it. */
const MAX_AGE_MS = 30_000;

/**
 * @typedef {object} Handoff
 * @property {string} path            screen the reviewer is being sent to
 * @property {string | null} screen   screen filter to restore (null: all screens)
 * @property {string | null} open     entry to open on arrival
 * @property {'left' | 'right'} side  panel side to keep
 * @property {number} at
 */

/** @param {Omit<Handoff, 'at'>} h */
export function leaveHandoff(h) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() }));
  } catch {
    // Storage blocked: the reviewer lands on the page and starts Markly themselves.
  }
}

/** @returns {Handoff | null} the note, if it is fresh and meant for this page */
function read() {
  try {
    const h = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (!h || Date.now() - h.at > MAX_AGE_MS) return null;
    return h.path === screenPath(location.pathname + location.search) ? h : null;
  } catch {
    return null;
  }
}

/** Is there a note for this page? Doesn't use it up. */
export function hasHandoff() {
  return read() !== null;
}

/** Read the note for this page and remove it, so a reload doesn't reopen Markly. */
export function takeHandoff() {
  const h = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clean up
  }
  return h;
}
