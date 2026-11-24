import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSensitiveText, luhn, maskIndices, mergeRects, toImageRects } from '../src/media/mask.js';
import { GifWriter, MASK_INDEX, quantize } from '../src/media/gif.js';

const kinds = (/** @type {string} */ s) => findSensitiveText(s).map((m) => [m.kind, s.slice(m.start, m.end)]);

/** Build a Luhn-valid digit string from a prefix (synthetic, not a real card). @param {string} prefix @param {number} len */
function luhnNumber(prefix, len) {
  let base = prefix.padEnd(len - 1, '0');
  for (let d = 0; d <= 9; d++) if (luhn(base + d)) return base + d;
  throw new Error('unreachable');
}

test('emails are found', () => {
  assert.deepEqual(kinds('Owner jane.example@example.test today'), [['email', 'jane.example@example.test']]);
});

test('phone numbers need 9 to 15 digits; dates and small numbers are left alone', () => {
  assert.deepEqual(kinds('Call +41 61 000 00 00 now'), [['phone', '+41 61 000 00 00']]);
  assert.deepEqual(kinds('Updated 2026-10-30, metric 512, version 1.2.3'), []);
});

test('card-like numbers are masked only when they pass Luhn', () => {
  const valid = luhnNumber('4', 16);
  const spaced = valid.replace(/(\d{4})(?=\d)/g, '$1 ');
  assert.equal(kinds(`Card ${spaced} on file`)[0][0], 'card');
  const invalid = valid.slice(0, -1) + ((Number(valid.at(-1)) + 1) % 10);
  assert.ok(!kinds(`Ref ${invalid}`).some(([k]) => k === 'card'));
});

test('SSN and AHV shapes are found (synthetic zero values)', () => {
  assert.equal(kinds('SSN 000-00-0000')[0][0], 'ssn');
  assert.equal(kinds('AHV 756.0000.0000.00')[0][0], 'ahv');
});

test('overlapping matches merge into one span', () => {
  const m = findSensitiveText('x 756.0000.0000.00 y');
  assert.equal(m.length, 1);
});

test('mergeRects joins overlaps and keeps separate areas apart', () => {
  const r = mergeRects([
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 5, y: 5, width: 10, height: 10 },
    { x: 100, y: 100, width: 5, height: 5 },
  ]);
  assert.deepEqual(r, [
    { x: 0, y: 0, width: 15, height: 15 },
    { x: 100, y: 100, width: 5, height: 5 },
  ]);
});

test('toImageRects maps CSS rects into image pixels, rounding outward and clipping to the crop', () => {
  const crop = { x: 0, y: 0, width: 1000, height: 500 };
  const out = toImageRects(
    [
      { x: 10.4, y: 20.6, width: 50.2, height: 10.1 },
      { x: 1200, y: 10, width: 20, height: 20 }, // outside the crop (e.g. under the drawer)
      { x: -30, y: -5, width: 40, height: 10 }, // partly off-screen
    ],
    crop,
    2,
  );
  assert.deepEqual(out[0], { x: 20, y: 41, width: 102, height: 21 });
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { x: 0, y: 0, width: 20, height: 10 });
});

test('maskIndices paints exactly the rect into indexed frames', () => {
  const w = 6;
  const frame = new Uint8Array(w * 4).fill(7);
  maskIndices(frame, w, [{ x: 1, y: 1, width: 3, height: 2 }], MASK_INDEX);
  const rows = Array.from({ length: 4 }, (_, y) => [...frame.subarray(y * w, y * w + w)].join(''));
  assert.deepEqual(rows, ['777777', '700077', '700077', '777777']);
});

test('MASK_INDEX is pure black in the palette', () => {
  assert.equal(quantize(new Uint8Array([0, 0, 0, 255]))[0], MASK_INDEX);
});

test('addIndexedFrame(quantize(x)) encodes the same bytes as addFrame(x)', () => {
  const px = new Uint8ClampedArray(8 * 8 * 4).map((_, i) => (i * 37) % 256);
  const a = new GifWriter(8, 8);
  a.addFrame(px, 100);
  const b = new GifWriter(8, 8);
  b.addIndexedFrame(quantize(px), 100);
  assert.deepEqual(a.finish(), b.finish());
});
