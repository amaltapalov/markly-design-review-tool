// PII/PHI masking for evidence (PRD-15, DEC-13). Prototype baseline, NOT the Data office policy (Q4):
// known-sensitive fields and text patterns are painted over with solid ink before media is stored.
// Masked pixels are replaced, not blurred, so nothing can be recovered from the stored image.
import { decisions } from '../core/decisions.js';

export const MASK_RULES_VERSION = 'prototype-v0';

/** Elements whose whole box is masked. Extend via decisions.extraMaskSelectors. */
export const MASK_SELECTORS = [
  'input[type="password"]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[autocomplete^="cc-"]',
  '[data-pii]',
  '[data-phi]',
  '[data-markly-mask]',
];

/** Luhn check, so only plausible card numbers are treated as cards. @param {string} digits */
export function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** @typedef {{ start: number, end: number, kind: string }} TextMatch */

const PATTERNS = /** @type {const} */ ([
  { kind: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ok: () => true },
  // Swiss AHV/AVS social security number (756.xxxx.xxxx.xx).
  { kind: 'ahv', re: /\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/g, ok: () => true },
  { kind: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g, ok: () => true },
  { kind: 'card', re: /\b\d(?:[ -]?\d){12,18}\b/g, ok: (/** @type {string} */ m) => luhn(m.replace(/\D/g, '')) },
  // Phone-like: 9 to 15 digits with common separators. Dates (8 digits) don't qualify.
  {
    kind: 'phone',
    re: /\+?\(?\d[\d ()./-]{7,}\d/g,
    ok: (/** @type {string} */ m) => {
      const n = m.replace(/\D/g, '').length;
      return n >= 9 && n <= 15 && !/^\d{4}-\d{2}-\d{2}/.test(m);
    },
  },
]);

/**
 * Sensitive spans in a string. Overlapping matches are merged; earlier kinds win the label.
 * @param {string} text
 * @returns {TextMatch[]}
 */
export function findSensitiveText(text) {
  /** @type {TextMatch[]} */
  const found = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      if (p.ok(m[0])) found.push({ start: /** @type {number} */ (m.index), end: /** @type {number} */ (m.index) + m[0].length, kind: p.kind });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {TextMatch[]} */
  const merged = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start <= last.end) last.end = Math.max(last.end, f.end);
    else merged.push({ ...f });
  }
  return merged;
}

/** @typedef {{ x: number, y: number, width: number, height: number }} Rect */

/** @param {Rect} a @param {Rect} b */
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Merge overlapping rects into their bounding boxes, so the count reflects distinct areas.
 * @param {Rect[]} rects
 */
export function mergeRects(rects) {
  const out = rects.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++)
      for (let j = i + 1; j < out.length; j++) {
        if (!overlaps(out[i], out[j])) continue;
        const a = out[i];
        const b = out[j];
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        out[i] = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
        out.splice(j, 1);
        changed = true;
        break;
      }
  }
  return out;
}

/**
 * Map CSS-pixel rects onto an image region.
 * @param {Rect[]} rects  viewport CSS pixels
 * @param {Rect} crop     viewport region the image shows (CSS pixels)
 * @param {number} scale  image pixels per CSS pixel
 */
export function toImageRects(rects, crop, scale) {
  return rects
    .map((r) => ({ x: (r.x - crop.x) * scale, y: (r.y - crop.y) * scale, width: r.width * scale, height: r.height * scale }))
    .map((r) => {
      const x = Math.max(0, Math.floor(r.x));
      const y = Math.max(0, Math.floor(r.y));
      return { x, y, width: Math.ceil(r.x + r.width) - x, height: Math.ceil(r.y + r.height) - y };
    })
    .filter((r) => r.width > 0 && r.height > 0 && r.x < crop.width * scale && r.y < crop.height * scale);
}

/**
 * Paint rects into palette-index frames (GIF). Mutates and returns `indices`.
 * @param {Uint8Array} indices  width*height palette indices
 * @param {number} width
 * @param {Rect[]} rects        image pixels
 * @param {number} colour       palette index
 */
export function maskIndices(indices, width, rects, colour) {
  const height = indices.length / width;
  for (const r of rects) {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(width, r.x + r.width);
    const y1 = Math.min(height, r.y + r.height);
    for (let y = y0; y < y1; y++) indices.fill(colour, y * width + x0, y * width + x1);
  }
  return indices;
}

/* ---------------- DOM scanning (browser only) ---------------- */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
const PAD = 4;

/**
 * Laid out but not painted (closed <details>, visibility:hidden, display:none ancestors) means
 * nothing to mask, and masking its box would hide visible content painted there.
 * @param {Element} el
 */
const painted = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true);

/**
 * Finds sensitive areas on the host page. Text is rescanned at most once a second (clips call
 * rects() every frame); element and text positions are re-measured on every call.
 */
export class MaskScanner {
  /** @param {Element | null} ignore Markly's own host element */
  constructor(ignore) {
    this.ignore = ignore;
    /** @type {{ node: Text, start: number, end: number }[]} */
    this.textHits = [];
    this.scannedAt = -Infinity;
    /** @type {Rect[]} */
    this.previous = [];
  }

  selectors() {
    return [...MASK_SELECTORS, ...(decisions.extraMaskSelectors ?? [])].join(',');
  }

  scanText() {
    this.textHits = [];
    if (!decisions.maskTextPatterns || !document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName) || (this.ignore && this.ignore.contains(p))) return NodeFilter.FILTER_REJECT;
        return /\d|@/.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = /** @type {Text} */ (n);
      for (const m of findSensitiveText(t.nodeValue ?? '')) this.textHits.push({ node: t, start: m.start, end: m.end });
    }
    this.scannedAt = performance.now();
  }

  /** @returns {Rect[]} viewport CSS-pixel rects, padded */
  measure() {
    if (performance.now() - this.scannedAt > 1000) this.scanText();
    /** @type {Rect[]} */
    const rects = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const add = (/** @type {DOMRect} */ r) => {
      if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return;
      rects.push({ x: r.left - PAD, y: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });
    };
    for (const el of document.querySelectorAll(this.selectors())) {
      if (this.ignore?.contains(el) || !painted(el)) continue;
      add(el.getBoundingClientRect());
    }
    // Field values aren't text nodes; mask the whole field when its value looks sensitive.
    if (decisions.maskTextPatterns) {
      for (const el of document.querySelectorAll('input, textarea')) {
        const v = /** @type {HTMLInputElement} */ (el).value;
        if (v && painted(el) && findSensitiveText(v).length) add(el.getBoundingClientRect());
      }
    }
    for (const hit of this.textHits) {
      if (!hit.node.isConnected || (hit.node.parentElement && !painted(hit.node.parentElement))) continue;
      const range = document.createRange();
      try {
        range.setStart(hit.node, Math.min(hit.start, hit.node.length));
        range.setEnd(hit.node, Math.min(hit.end, hit.node.length));
        for (const r of range.getClientRects()) add(r);
      } catch {
        // Text changed since the scan; the next rescan picks it up.
      }
    }
    return mergeRects(rects);
  }

  /**
   * For clips: this frame's rects plus last frame's, so a mask still covers content that
   * moved between the DOM measurement and the (slightly older) video frame.
   */
  rectsForFrame() {
    const now = this.measure();
    const both = mergeRects([...now, ...this.previous]);
    this.previous = now;
    return both;
  }
}
