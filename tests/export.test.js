import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { toCsv, csvCell } from '../src/export/csv.js';
import { toJson, EXPORT_SCHEMA } from '../src/export/json.js';
import { toMarkdown } from '../src/export/markdown.js';
import { toHtml } from '../src/export/html.js';
import { toPdf, wrap } from '../src/export/pdf.js';
import { crc32 } from '../src/export/util.js';
import { exportScope } from '../src/export/scope.js';
import { addEntry, createDraft, entryFromDraft, setReviewer } from '../src/core/ledger.js';
import { emptySession } from '../src/core/model.js';

const page = { url: 'https://app.example.test/groups/a?tab=1', path: '/groups/a?tab=1', title: 'Group A' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 9]);

function fixture() {
  let s = setReviewer(emptySession(), 'Participant 1');
  const mk = (/** @type {any} */ over, /** @type {any} */ evidence = null) => {
    const d = {
      ...createDraft(page, { selector: 'span.state-pill', label: 'span.state-pill', text: 'Blocked', fx: 0.5, fy: 0.5 }),
      description: 'd',
      ...over,
      evidence: evidence && { ...evidence, blob: null, previewUrl: '' },
    };
    const e = entryFromDraft(d, evidence ? `ev:${d.id}` : null);
    s = addEntry(s, e);
    return e;
  };
  const a = mk(
    { category: 'UI', title: 'Blocked pill fails colour contrast', description: 'Measures 2.4:1.\nAA needs 4.5:1, "large" text 3:1.', priority: 'Medium' },
    { kind: 'screenshot', mime: 'image/png', width: 1600, height: 900, bytes: PNG.length, capturedAt: '2026-10-30T09:00:00.000Z' },
  );
  const b = mk(
    { category: 'Dev', title: '=HYPERLINK("http://evil")', description: 'Sort clears <b>filter</b>', priority: 'High' },
    { kind: 'gif', mime: 'image/gif', width: 640, height: 360, bytes: GIF.length, durationMs: 6200, frames: 31, capturedAt: '2026-10-30T09:01:00.000Z' },
  );
  const c = mk({ category: 'Content', title: '<script>alert(1)</script> # heading *star*', priority: null });
  const media = new Map([
    [a.id, { bytes: PNG, mime: 'image/png' }],
    [b.id, { bytes: GIF, mime: 'image/gif' }],
  ]);
  const scope = exportScope(s, new Set(), new Date('2026-10-30T12:00:00'), 'https://app.example.test');
  return { s, a, b, c, media, scope };
}

/** Minimal RFC 4180 parser. @param {string} text */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\r' && text[i + 1] === '\n') row.push(cell), rows.push(row), (row = []), (cell = ''), i++;
    else cell += ch;
  }
  return rows;
}

/** Read a store-only zip. @param {Uint8Array} b */
function unzip(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const crc = v.getUint32(p + 14, true);
    const size = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const name = new TextDecoder().decode(b.subarray(p + 30, p + 30 + nameLen));
    const data = b.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    assert.equal(crc, zlibCrc32(data) >>> 0, `crc for ${name}`);
    files.set(name, data);
    p += 30 + nameLen + size;
  }
  assert.equal(v.getUint32(b.length - 22, true), 0x06054b50, 'end of central directory');
  assert.equal(v.getUint16(b.length - 22 + 10, true), files.size, 'entry count');
  return files;
}

const text = (/** @type {Uint8Array} */ b) => new TextDecoder().decode(b);

test('crc32 matches zlib', () => {
  const data = new TextEncoder().encode('Markly review ✓');
  assert.equal(crc32(data), zlibCrc32(data) >>> 0);
});

test('scope is the whole ledger by default, and says when a filter is ignored', () => {
  const { s } = fixture();
  const sc = exportScope(s, new Set(['Dev']), new Date('2026-10-30T12:00:00'), 'https://x.test');
  assert.equal(sc.entries.length, 3);
  assert.equal(sc.filterIgnored, true);
  assert.equal(sc.line, '3 entries · all categories · Participant 1 · 30 Oct 2026');
  assert.equal(exportScope(setReviewer(s, ' '), new Set(), new Date(), 'x').context.reviewer, 'Unnamed reviewer');
});

test('CSV: Jira columns, one row per entry in order, quoting, formula defusing, no media', () => {
  const { scope, media } = fixture();
  const f = toCsv({ ...scope, media });
  assert.equal(f.filename, 'markly-app.example.test-2026-10-30.csv');
  const rows = parseCsv(text(f.bytes));
  assert.deepEqual(rows[0], ['Summary', 'Description', 'Issue Type', 'Priority', 'Labels', 'Labels']);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][0], 'Blocked pill fails colour contrast');
  assert.match(rows[1][1], /AA needs 4\.5:1, "large" text 3:1\./);
  assert.match(rows[1][1], /screenshot not included in CSV/);
  assert.equal(rows[1][2], 'Task');
  assert.equal(rows[2][0], `'=HYPERLINK("http://evil")`, 'formula is defused');
  assert.equal(rows[2][2], 'Bug', 'Dev derives Bug');
  assert.equal(rows[2][3], 'High');
  assert.equal(rows[3][3], '', 'unset priority stays empty');
  assert.deepEqual(rows[1].slice(4), ['markly-ui', 'markly']);
  assert.ok(!text(f.bytes).includes('base64'), 'no media in CSV');
  assert.equal(csvCell('@sum'), "'@sum");
});

test('JSON: lossless, ordered, media inlined, storage keys not leaked', () => {
  const { scope, media, a, b, c } = fixture();
  const doc = JSON.parse(text(toJson({ ...scope, media }).bytes));
  assert.equal(doc.schema, EXPORT_SCHEMA);
  assert.equal(doc.count, 3);
  assert.deepEqual(doc.entries.map((/** @type {any} */ e) => e.id), [a.id, b.id, c.id]);
  assert.deepEqual(doc.entries.map((/** @type {any} */ e) => e.number), [1, 2, 3]);
  assert.equal(doc.entries[0].description, a.description);
  assert.equal(doc.entries[0].evidence.data, `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
  assert.equal(doc.entries[1].evidence.durationMs, 6200);
  assert.ok(!('blobKey' in doc.entries[0].evidence));
  assert.equal(doc.entries[2].evidence, null);
  assert.equal(doc.reviewer, 'Participant 1');
});

test('Markdown: zip with review.md and media files; text is escaped; order kept', () => {
  const { scope, media } = fixture();
  const f = toMarkdown({ ...scope, media });
  assert.equal(f.filename, 'markly-app.example.test-2026-10-30.zip');
  const files = unzip(f.bytes);
  assert.deepEqual([...files.keys()], ['review.md', 'media/01-screenshot.png', 'media/02-clip.gif']);
  assert.deepEqual(files.get('media/02-clip.gif'), GIF);
  const md = text(/** @type {Uint8Array} */ (files.get('review.md')));
  const headings = md.split('\n').filter((l) => l.startsWith('## '));
  assert.equal(headings.length, 3);
  assert.ok(headings[0].startsWith('## 1. Blocked pill'));
  assert.ok(headings[2].includes('\\<script\\>'), 'HTML is escaped');
  assert.ok(headings[2].includes('\\# heading \\*star\\*'));
  assert.ok(md.includes('![Screenshot for entry 1](media/01-screenshot.png)'));
});

test('Markdown without media is a single .md file', () => {
  const { scope } = fixture();
  const f = toMarkdown({ ...scope, entries: [scope.entries[2]], media: new Map() });
  assert.ok(f.filename.endsWith('.md'));
  assert.ok(text(f.bytes).startsWith('# Markly review'));
});

test('HTML: self-contained, escaped, media embedded, one article per entry', () => {
  const { scope, media } = fixture();
  const html = text(toHtml({ ...scope, media }).bytes);
  assert.equal((html.match(/<article /g) ?? []).length, 3);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Sort clears &lt;b&gt;filter&lt;/b&gt;'));
  assert.ok(html.includes('src="data:image/gif;base64,'));
  assert.ok(!/src="https?:/.test(html), 'no external resources');
  assert.ok(html.indexOf('entry-1') < html.indexOf('entry-2'));
});

/** Check every xref offset points at its object and return page and image counts. @param {Uint8Array} bytes */
function checkPdf(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  assert.ok(s.slice(startxref).startsWith('xref'), 'startxref points at xref');
  const [, first, count] = /xref\n(\d+) (\d+)/.exec(s.slice(startxref)) ?? [];
  const rows = s.slice(startxref).split('\n').slice(2, 2 + Number(count));
  rows.slice(1).forEach((row, i) => {
    const off = Number(row.slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${Number(first) + i + 1} 0 obj`), `object ${i + 1} offset`);
  });
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = /** @type {number} */ (m.index) + m[0].length;
    assert.ok(s.slice(start + Number(m[1])).startsWith('\nendstream'), 'stream length matches');
  }
  return { pages: Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)?.[1]), images: (s.match(/\/Subtype \/Image/g) ?? []).length, s };
}

test('PDF: valid structure, stills for media, clips labelled as first frame', () => {
  const { scope, media, a, b } = fixture();
  const fakeJpeg = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1600, height: 900 };
  const jpegs = new Map([
    [a.id, fakeJpeg],
    [b.id, { ...fakeJpeg, width: 640, height: 360 }],
  ]);
  const f = toPdf({ ...scope, media, jpegs });
  assert.equal(f.mime, 'application/pdf');
  const { pages, images, s } = checkPdf(f.bytes);
  assert.ok(pages >= 1);
  assert.equal(images, 2);
  assert.ok(s.includes('(1. Blocked pill fails colour contrast)'));
  assert.ok(s.includes('first frame shown'));
  assert.ok(s.includes('\\(') || s.includes('\\)'), 'parentheses are escaped');
  assert.ok(s.indexOf('(1. Blocked') < s.indexOf('(2. =HYPERLINK'), 'order kept');
});

test('PDF paginates long ledgers and numbers pages', () => {
  const { s } = fixture();
  let big = s;
  for (let i = 0; i < 40; i++) {
    const d = { ...createDraft(page, s.entries[0].anchor), category: /** @type {const} */ ('UX'), title: `Finding ${i}`, description: 'Long text. '.repeat(40) };
    big = addEntry(big, entryFromDraft(d, null));
  }
  const sc = exportScope(big, new Set(), new Date('2026-10-30T12:00:00'), 'https://x.test');
  const { pages, s: pdf } = checkPdf(toPdf({ ...sc, media: new Map() }).bytes);
  assert.ok(pages > 3, `expected several pages, got ${pages}`);
  assert.ok(pdf.includes(`(Page ${pages} of ${pages})`));
});

test('PDF text wrapping respects width and breaks long words', () => {
  const lines = wrap('word '.repeat(60), 10, false, 200);
  assert.ok(lines.length > 5);
  const long = wrap('x'.repeat(500), 10, false, 100);
  assert.ok(long.length > 3);
  assert.deepEqual(wrap('a\n\nb', 10, false, 100).length, 3, 'blank lines kept');
});
