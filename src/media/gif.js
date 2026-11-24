// Streaming GIF89a encoder with a fixed 252-colour palette (6×7×6 RGB cube) and LZW compression.
// Frames are quantised and compressed as they arrive, so a 10 s clip never holds raw RGBA in memory.
// LZW follows omggif's encoder (MIT) so code-size changes line up with standard decoders.

const R_LEVELS = 6;
const G_LEVELS = 7;
const B_LEVELS = 6;

/** 256-entry RGB palette; the last 4 entries are unused black. */
export const PALETTE = (() => {
  const p = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < R_LEVELS; r++)
    for (let g = 0; g < G_LEVELS; g++)
      for (let b = 0; b < B_LEVELS; b++) {
        p[i++] = Math.round((r * 255) / (R_LEVELS - 1));
        p[i++] = Math.round((g * 255) / (G_LEVELS - 1));
        p[i++] = Math.round((b * 255) / (B_LEVELS - 1));
      }
  return p;
})();

/** Palette index of pure black, used to paint masks into indexed frames. */
export const MASK_INDEX = 0;

/** @param {Uint8ClampedArray | Uint8Array} rgba @returns {Uint8Array} palette indices */
export function quantize(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const r = ((rgba[i] * (R_LEVELS - 1) + 127) / 255) | 0;
    const g = ((rgba[i + 1] * (G_LEVELS - 1) + 127) / 255) | 0;
    const b = ((rgba[i + 2] * (B_LEVELS - 1) + 127) / 255) | 0;
    out[j] = r * G_LEVELS * B_LEVELS + g * B_LEVELS + b;
  }
  return out;
}

/** Growable byte buffer. */
class Bytes {
  constructor() {
    this.buf = new Uint8Array(1 << 16);
    this.len = 0;
  }
  /** @param {number} n */
  reserve(n) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  /** @param {number} b */
  byte(b) {
    this.reserve(1);
    this.buf[this.len++] = b & 0xff;
  }
  /** @param {number} v */
  u16(v) {
    this.byte(v);
    this.byte(v >> 8);
  }
  /** @param {ArrayLike<number>} arr */
  bytes(arr) {
    this.reserve(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
  }
  /** @param {string} s */
  ascii(s) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  result() {
    return this.buf.slice(0, this.len);
  }
}

/**
 * LZW-compress indices and write them as GIF sub-blocks.
 * @param {Bytes} out
 * @param {number} minCodeSize
 * @param {Uint8Array} indices
 */
function writeLzw(out, minCodeSize, indices) {
  out.byte(minCodeSize);
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;
  /** @type {Map<number, number>} */
  let table = new Map();

  const block = new Uint8Array(255);
  let blockLen = 0;
  let cur = 0;
  let shift = 0;
  const flushBlock = () => {
    out.byte(blockLen);
    out.bytes(block.subarray(0, blockLen));
    blockLen = 0;
  };
  /** @param {number} code */
  const emit = (code) => {
    cur |= code << shift;
    shift += codeSize;
    while (shift >= 8) {
      block[blockLen++] = cur & 0xff;
      if (blockLen === 255) flushBlock();
      cur >>>= 8;
      shift -= 8;
    }
  };

  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
      table = new Map();
    } else {
      if (nextCode >= 1 << codeSize) codeSize++;
      table.set(key, nextCode++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (shift > 0) {
    block[blockLen++] = cur & 0xff;
    if (blockLen === 255) flushBlock();
  }
  if (blockLen > 0) flushBlock();
  out.byte(0); // block terminator
}

export class GifWriter {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.frames = 0;
    this.out = new Bytes();
    const o = this.out;
    o.ascii('GIF89a');
    o.u16(width);
    o.u16(height);
    o.byte(0xf7); // global colour table, 8-bit colour resolution, 256 entries
    o.byte(0); // background index
    o.byte(0); // pixel aspect
    o.bytes(PALETTE);
    // NETSCAPE2.0: loop forever
    o.byte(0x21);
    o.byte(0xff);
    o.byte(11);
    o.ascii('NETSCAPE2.0');
    o.byte(3);
    o.byte(1);
    o.u16(0);
    o.byte(0);
  }

  /**
   * @param {Uint8ClampedArray | Uint8Array} rgba  width*height*4 pixels
   * @param {number} delayMs
   */
  addFrame(rgba, delayMs) {
    this.addIndexedFrame(quantize(rgba), delayMs);
  }

  /**
   * @param {Uint8Array} indices  width*height palette indices (from quantize)
   * @param {number} delayMs
   */
  addIndexedFrame(indices, delayMs) {
    const o = this.out;
    o.byte(0x21); // graphic control extension
    o.byte(0xf9);
    o.byte(4);
    o.byte(0x04); // disposal: do not dispose
    o.u16(Math.max(2, Math.round(delayMs / 10)));
    o.byte(0); // transparent index (unused)
    o.byte(0);
    o.byte(0x2c); // image descriptor
    o.u16(0);
    o.u16(0);
    o.u16(this.width);
    o.u16(this.height);
    o.byte(0); // no local colour table, not interlaced
    writeLzw(o, 8, indices);
    this.frames++;
  }

  /** @returns {Uint8Array} */
  finish() {
    this.out.byte(0x3b);
    return this.out.result();
  }
}
