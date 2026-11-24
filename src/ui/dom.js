// Tiny virtual-DOM: h() builds a tree, render() patches the previous one in place.
// Patching (not replacing) keeps focus, caret position and scroll inside the drawer.
// Keyed children (props.key) are matched by key; everything else by position.

/**
 * @typedef {{ tag: string, props: Record<string, any>, children: VChild[], key?: string | number }} VNode
 * @typedef {VNode | string} VChild
 */

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...any} children
 * @returns {VNode}
 */
export function h(tag, props, ...children) {
  const p = props ?? {};
  return { tag, props: p, children: flatten(children, []), key: p.key };
}

/** @param {any[]} items @param {VChild[]} out */
function flatten(items, out) {
  for (const c of items) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) flatten(c, out);
    else out.push(typeof c === 'object' ? c : String(c));
  }
  return out;
}

/** @param {VChild} v @returns {Node} */
function create(v) {
  if (typeof v === 'string') return document.createTextNode(v);
  const el = document.createElement(v.tag);
  if (!('html' in v.props)) for (const c of v.children) el.appendChild(create(c));
  // Props after children so <select value> finds its options.
  setProps(el, {}, v.props);
  v.props.ref?.(el);
  return el;
}

const SKIP = new Set(['key', 'ref']);

/** @param {any} el @param {string} k @param {any} v */
function setProp(el, k, v) {
  if (SKIP.has(k)) return;
  if (k.startsWith('on')) {
    el[k.toLowerCase()] = v ?? null;
  } else if (k === 'class') {
    el.className = v || '';
  } else if (k === 'style') {
    el.style.cssText = '';
    if (typeof v === 'string') el.style.cssText = v;
    else if (v) for (const [name, val] of Object.entries(v)) if (val != null) el.style.setProperty(name, String(val));
  } else if (k === 'html') {
    // Trusted, static markup only (icons).
    if (el.__html !== v) el.innerHTML = el.__html = v;
  } else if (k === 'value') {
    const s = v == null ? '' : String(v);
    if (el.value !== s) el.value = s;
  } else if (k === 'checked') {
    el.checked = !!v;
  } else if (v === false || v == null) {
    el.removeAttribute(k);
  } else {
    el.setAttribute(k, v === true ? '' : String(v));
  }
}

/** @param {any} el @param {Record<string, any>} oldP @param {Record<string, any>} newP */
function setProps(el, oldP, newP) {
  for (const k in oldP) if (!(k in newP)) setProp(el, k, k.startsWith('on') ? null : false);
  for (const k in newP) if (oldP[k] !== newP[k] || k === 'value' || k === 'checked') setProp(el, k, newP[k]);
}

/** @param {Node} el @param {VChild} o @param {VChild} n @returns {Node} */
function patch(el, o, n) {
  if (o === n) return el;
  if (typeof o === 'string' || typeof n === 'string') {
    if (typeof o === 'string' && typeof n === 'string') {
      if (o !== n) el.nodeValue = n;
      return el;
    }
    return replace(el, n);
  }
  if (o.tag !== n.tag || o.key !== n.key || ('html' in o.props) !== ('html' in n.props)) return replace(el, n);
  if (!('html' in n.props)) patchChildren(/** @type {Element} */ (el), o.children, n.children);
  setProps(el, o.props, n.props);
  return el;
}

/** @param {Node} el @param {VChild} n */
function replace(el, n) {
  const next = create(n);
  /** @type {ChildNode} */ (el).replaceWith(next);
  return next;
}

/** @param {VChild} v */
const keyOf = (v) => (typeof v === 'object' ? v.key : undefined);

/** @param {Element} el @param {VChild[]} oc @param {VChild[]} nc */
function patchChildren(el, oc, nc) {
  const nodes = [...el.childNodes];
  if (nc.some((v) => keyOf(v) != null)) {
    /** @type {Map<string | number, { v: VChild, node: Node }>} */
    const old = new Map();
    oc.forEach((v, i) => {
      const k = keyOf(v);
      if (k != null && nodes[i]) old.set(k, { v, node: nodes[i] });
    });
    const next = nc.map((v) => {
      const k = keyOf(v);
      const hit = k != null ? old.get(k) : undefined;
      if (hit) {
        old.delete(/** @type {string | number} */ (k));
        return patch(hit.node, hit.v, v);
      }
      return create(v);
    });
    const keep = new Set(next);
    for (const node of [...el.childNodes]) if (!keep.has(node)) node.remove();
    next.forEach((node, i) => {
      if (el.childNodes[i] !== node) el.insertBefore(node, el.childNodes[i] ?? null);
    });
    return;
  }
  const common = Math.min(oc.length, nc.length);
  for (let i = 0; i < common; i++) patch(nodes[i], oc[i], nc[i]);
  for (let i = common; i < nc.length; i++) el.appendChild(create(nc[i]));
  for (let i = common; i < oc.length; i++) nodes[i].remove();
}

/** @param {Element | ShadowRoot} container @param {VNode} vnode */
export function render(container, vnode) {
  const c = /** @type {any} */ (container);
  if (!c.__vroot || !container.firstChild) {
    container.replaceChildren(create(vnode));
  } else {
    patch(container.firstChild, c.__vroot, vnode);
  }
  c.__vroot = vnode;
}
