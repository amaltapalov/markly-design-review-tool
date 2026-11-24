// Keyboard element picker: pinning without a pointer (PRD §11, keyboard-only pinning).
// ↑/↓ step through pinnable elements in document order, ← goes to the parent, → to the first child.

const SKIP = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR']);
const SELF_PINNABLE = new Set([
  'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'SVG', 'VIDEO', 'CANVAS', 'LABEL', 'TH', 'TD', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SUMMARY', 'FIGURE', 'TABLE', 'NAV', 'FORM',
]);

/** @param {Element} el */
function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true;
}

/** Elements a reviewer would plausibly want to describe. @param {Element} el @param {Element | null} ignore */
export function isPinnable(el, ignore) {
  if (SKIP.has(el.tagName) || (ignore && (el === ignore || ignore.contains(el)))) return false;
  if (!visible(el)) return false;
  if (SELF_PINNABLE.has(el.tagName.toUpperCase()) || el.hasAttribute('role')) return true;
  // Otherwise only elements with their own text (not just text in descendants).
  for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue?.trim()) return true;
  return false;
}

/** @param {Element | null} ignore */
function all(ignore) {
  /** @type {Element[]} */
  const out = [];
  if (!document.body) return out;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) =>
      ignore && n === ignore ? NodeFilter.FILTER_REJECT : isPinnable(/** @type {Element} */ (n), ignore) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(/** @type {Element} */ (n));
  return out;
}

/** Where to start: the first pinnable element in <main>, else on the page. @param {Element | null} ignore */
export function firstPinnable(ignore) {
  const list = all(ignore);
  const main = document.querySelector('main, [role="main"]');
  return (main && list.find((el) => main.contains(el))) ?? list[0] ?? null;
}

/**
 * @param {Element | null} from
 * @param {'next' | 'prev' | 'parent' | 'child'} dir
 * @param {Element | null} ignore
 * @returns {Element | null} the new target, or `from` when there's nowhere to go
 */
export function stepPinnable(from, dir, ignore) {
  if (!from) return firstPinnable(ignore);
  if (dir === 'parent') {
    for (let p = from.parentElement; p; p = p.parentElement) if (isPinnable(p, ignore)) return p;
    return from;
  }
  if (dir === 'child') {
    for (const el of from.querySelectorAll('*')) if (isPinnable(el, ignore)) return el;
    return from;
  }
  const list = all(ignore);
  const i = list.indexOf(from);
  if (i < 0) return list[0] ?? from;
  return list[Math.min(list.length - 1, Math.max(0, i + (dir === 'next' ? 1 : -1)))];
}
