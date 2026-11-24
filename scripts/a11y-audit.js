// Lightweight accessibility checks for Markly's shadow root (no axe-core: the registry is blocked).
// Run in the demo page with ?test: `(await import('/scripts/a11y-audit.js')).audit(__markly.root)`.
// It catches structural mistakes; it does not replace a screen-reader pass.

/** @param {ParentNode} root @param {string | null} ids */
function resolveIds(root, ids) {
  return (ids ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => /** @type {any} */ (root).getElementById?.(id) ?? root.querySelector(`#${CSS.escape(id)}`));
}

/** @param {Element} el @param {ParentNode} root */
export function accessibleName(el, root) {
  const labelled = resolveIds(root, el.getAttribute('aria-labelledby'));
  if (labelled.length && labelled.every(Boolean)) return labelled.map((n) => n.textContent?.trim()).join(' ');
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  if (el.id) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
  }
  const wrap = el.closest('label');
  if (wrap?.textContent?.trim()) return wrap.textContent.trim();
  if (el instanceof HTMLImageElement) return el.alt;
  return (el.textContent ?? '').trim() || el.getAttribute('title')?.trim() || '';
}

/** @param {ParentNode} root @returns {{ rule: string, el: string }[]} */
export function audit(root) {
  /** @type {{ rule: string, el: string }[]} */
  const issues = [];
  const tag = (/** @type {Element} */ el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;
  const live = [...root.querySelectorAll('*')].filter((el) => !el.closest('[inert]'));

  for (const el of live) {
    const role = el.getAttribute('role');
    const interactive = /^(BUTTON|A|SELECT|TEXTAREA)$/.test(el.tagName) || (el.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (el).type !== 'hidden') || role === 'radio' || role === 'button';
    if (interactive && !accessibleName(el, root)) issues.push({ rule: 'control has no accessible name', el: tag(el) });
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      if (el.hasAttribute(attr) && resolveIds(root, el.getAttribute(attr)).some((n) => !n)) issues.push({ rule: `${attr} points at a missing id`, el: tag(el) });
    }
    if (el.tagName === 'IMG' && !el.hasAttribute('alt')) issues.push({ rule: 'img without alt', el: tag(el) });
    if ((role === 'radiogroup' || role === 'group' || role === 'dialog' || role === 'alertdialog') && !accessibleName(el, root) && !el.getAttribute('aria-labelledby')) {
      issues.push({ rule: `${role} has no name`, el: tag(el) });
    }
    if (interactive && !(/** @type {any} */ (el).disabled)) {
      const r = el.getBoundingClientRect();
      const inlineText = el.tagName === 'A' || el.classList.contains('mk-link');
      if (r.width && r.height && (r.width < 24 || r.height < 24) && !inlineText && el.tagName !== 'INPUT') {
        issues.push({ rule: `target smaller than 24×24 (${Math.round(r.width)}×${Math.round(r.height)})`, el: tag(el) });
      }
    }
  }
  /** @type {Map<string, number>} */
  const ids = new Map();
  for (const el of root.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) issues.push({ rule: `duplicate id (${n}×)`, el: `#${id}` });
  return issues;
}
