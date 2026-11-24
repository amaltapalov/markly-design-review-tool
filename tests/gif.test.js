import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GifWriter, PALETTE, quantize } from '../src/media/gif.js';

/**
 * Minimal GIF decoder for tests: returns each frame's palette indices and delay.
 * @param {Uint8Array} b
 */
function decode(b) {
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => b[p++] | (b[p++] << 8);
  const ascii = (n) => String.fromCharCode(...b.subarray(p, (p += n)));
  assert.equal(ascii(6), 'GIF89a');
  const width = u16();
  const height = u16();
  const packed = u8();
  p += 2;
  const gct = packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0;
  const palette = b.subarray(p, (p += gct));
  /** @type {{ indices: Uint8Array, delayCs: number }[]} */
  const frames = [];
  let delayCs = 0;
  let loop = false;
  const subBlocks = () => {
    const parts = [];
    for (let n = u8(); n; n = u8()) parts.push(b.subarray(p, (p += n)));
    const out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
    let o = 0;
    for (const x of parts) out.set(x, (o += x.length) - x.length);
    return out;
  };
  for (;;) {
    const tag = u8();
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      const label = u8();
      const data = subBlocks();
      if (label === 0xf9) delayCs = data[1] | (data[2] << 8);
      if (label === 0xff) loop = true;
      continue;
    }
    assert.equal(tag, 0x2c, `unexpected block 0x${tag.toString(16)} at ${p - 1}`);
    p += 8;
    assert.equal(u8() & 0x80, 0, 'no local colour table');
    const minCode = u8();
    frames.push({ indices: lzwDecode(subBlocks(), minCode, width * height), delayCs });
  }
  return { width, height, palette, frames, loop, trailerAt: p };
}

/** @param {Uint8Array} data @param {number} minCode @param {number} count */
function lzwDecode(data, minCode, count) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  /** @type {number[][]} */
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = [];
    size = minCode + 1;
  };
  reset();
  const out = [];
  let bit = 0;
  /** @type {number[] | null} */
  let prev = null;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
    return code;
  };
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    /** @type {number[]} */
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code} (dict ${dict.length})`);
    out.push(...entry);
    if (prev && dict.length < 4096) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  assert.equal(out.length, count, 'decoded pixel count');
  return Uint8Array.from(out);
}

/** Deterministic noisy RGBA so the LZW table fills and resets. */
function noise(w, h, seed) {
  const px = new Uint8ClampedArray(w * h * 4);
  let x = seed;
  for (let i = 0; i < px.length; i += 4) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    px[i] = x & 0xff;
    px[i + 1] = (x >> 8) & 0xff;
    px[i + 2] = (x >> 16) & 0xff;
    px[i + 3] = 255;
  }
  return px;
}

test('palette maps pure colours to themselves', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255]);
  const idx = quantize(rgba);
  for (let i = 0; i < 3; i++) {
    const at = idx[i] * 3;
    assert.deepEqual([...PALETTE.subarray(at, at + 3)], [...rgba.subarray(i * 4, i * 4 + 3)]);
  }
});

test('GIF round-trips through a reference decoder, including LZW table resets', () => {
  const w = 120;
  const h = 90;
  const frames = [noise(w, h, 1), noise(w, h, 2), new Uint8ClampedArray(w * h * 4).fill(255)];
  const gif = new GifWriter(w, h);
  for (const f of frames) gif.addFrame(f, 200);
  const bytes = gif.finish();
  const out = decode(bytes);
  assert.equal(out.width, w);
  assert.equal(out.height, h);
  assert.equal(out.loop, true);
  assert.equal(out.frames.length, 3);
  assert.equal(out.trailerAt, bytes.length, 'trailer is the last byte');
  out.frames.forEach((f, i) => {
    assert.equal(f.delayCs, 20);
    assert.deepEqual(f.indices, quantize(frames[i]), `frame ${i} pixels`);
  });
});

test('tiny and flat frames encode', () => {
  const gif = new GifWriter(1, 1);
  gif.addFrame(new Uint8ClampedArray([10, 20, 30, 255]), 100);
  const out = decode(gif.finish());
  assert.equal(out.frames[0].indices.length, 1);
});
