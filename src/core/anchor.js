// Element context: a CSS path that re-finds the target, and a short label for "Inspected …".
import { screenPath } from './model.js';

/** Classes that look generated (CSS modules, hashes) make poor selectors. */
const GENERATED = /^(css|sc|jsx|emotion|tw)-|[0-9a-f]{5,}|__[a-z0-9]{4,}$/i;

/** @param {string} s */
const esc = (s) => (globalThis.CSS?.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

/** @param {Element} el */
function stableClasses(el) {
  return [...el.classList].filter((c) => !GENERATED.test(c)).slice(0, 2);
}

/** "span.state-pill" style label. @param {Element} el */
export function labelFor(el) {
  const tag = el.tagName.toLowerCase();
  const classes = stableClasses(el);
  return classes.length ? `${tag}.${classes.join('.')}` : el.id ? `${tag}#${el.id}` : tag;
}

/** @param {Element} el @param {number} [max] */
export function textFor(el, max = 60) {
  const raw = (el instanceof HTMLElement ? el.innerText : el.textContent) ?? '';
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Shortest unique path from the element up, preferring ids, then stable classes, then nth-of-type.
 * @param {Element} el
 * @param {ParentNode} [root]
 */
export function selectorFor(el, root = document) {
  /** @type {string[]} */
  const parts = [];
  /** @type {Element | null} */
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id && !GENERATED.test(node.id)) {
      parts.unshift(`#${esc(node.id)}`);
      if (isUnique(parts.join(' > '), root)) return parts.join(' > ');
    } else {
      const tag = node.tagName.toLowerCase();
      const cls = stableClasses(node).map((c) => `.${esc(c)}`).join('');
      let part = tag + cls;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node?.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (isUnique(parts.join(' > '), root)) return parts.join(' > ');
    }
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** @param {string} sel @param {ParentNode} root */
function isUnique(sel, root) {
  try {
    return root.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
}

/** @param {import('./model.js').Anchor} anchor @returns {Element | null} */
export function resolveAnchor(anchor) {
  try {
    return document.querySelector(anchor.selector);
  } catch {
    return null;
  }
}

/**
 * @param {Element} el
 * @param {number} clientX
 * @param {number} clientY
 * @returns {import('./model.js').Anchor}
 */
export function anchorFor(el, clientX, clientY) {
  const r = el.getBoundingClientRect();
  const clamp = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
  return {
    selector: selectorFor(el),
    label: labelFor(el),
    text: textFor(el),
    fx: r.width ? clamp((clientX - r.left) / r.width) : 0.5,
    fy: r.height ? clamp((clientY - r.top) / r.height) : 0.5,
  };
}

/** @returns {import('./model.js').PageContext} */
export function currentPage() {
  return { url: location.href, path: screenPath(location.pathname + location.search), title: document.title };
}
