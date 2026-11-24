// PDF: formatted report for stakeholders. Minimal PDF 1.4 writer: standard Helvetica fonts
// (WinAnsi), JPEG images via DCTDecode, A4 pages. Clips appear as their first frame (PRD §6:
// PDF can't be assumed to play animation).
import { concat, evidenceLabel, filenameFor, formatDate } from './util.js';

/** Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard AFM. */
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

/** Unicode → WinAnsi for the characters findings commonly contain. Anything else prints as "?". */
const WINANSI = /** @type {Record<string, number>} */ ({
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
});

/** @param {string} s @returns {number[]} WinAnsi byte codes */
function encode(s) {
  const out = [];
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 63;
    if (WINANSI[ch]) out.push(WINANSI[ch]);
    else if (c === 9) out.push(32);
    else if (c >= 32 && c < 127) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else out.push(63);
  }
  return out;
}

/** @param {number[]} codes @param {number} size @param {boolean} bold */
function widthOf(codes, size, bold) {
  let w = 0;
  for (const c of codes) w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
  return (w * size * (bold ? 1.06 : 1)) / 1000; // bold is ~6% wider; wrap conservatively
}

/** PDF string literal from byte codes. @param {number[]} codes */
function pdfString(codes) {
  let s = '(';
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += `\\${String.fromCharCode(c)}`;
    else if (c < 32 || c > 126) s += `\\${c.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(c);
  }
  return `${s})`;
}

/** Word-wrap to maxWidth; breaks over-long words. @param {string} text @param {number} size @param {boolean} bold @param {number} maxWidth */
export function wrap(text, size, bold, maxWidth) {
  /** @type {number[][]} */
  const lines = [];
  for (const para of text.split('\n')) {
    let line = /** @type {number[]} */ ([]);
    for (const word of para.split(/ +/)) {
      let w = encode(word);
      const candidate = line.length ? [...line, 32, ...w] : w;
      if (widthOf(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.length) lines.push(line);
      while (widthOf(w, size, bold) > maxWidth) {
        let cut = w.length - 1;
        while (cut > 1 && widthOf(w.slice(0, cut), size, bold) > maxWidth) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines;
}

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const INK = '0.067 0.067 0.067';
const MUTED = '0.42 0.42 0.42';

/** @param {import('./util.js').ExportInput} input @returns {import('./util.js').ExportFile} */
export function toPdf({ entries, context, jpegs = new Map() }) {
  const contentW = A4.w - 2 * M;
  /** @type {string[][]} */
  const pages = [];
  /** @type {string[]} */
  let ops = [];
  let y = 0;
  /** @type {{ name: string, jpeg: import('./util.js').Jpeg }[]} */
  const images = [];

  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = A4.h - M;
  };
  const need = (/** @type {number} */ h) => {
    if (y - h < M + 24) newPage();
  };
  /** @param {string} text @param {{ size?: number, bold?: boolean, color?: string, gap?: number, x?: number, width?: number }} [o] */
  const text = (text, o = {}) => {
    const size = o.size ?? 10.5;
    const lead = size * 1.35;
    const x = o.x ?? M;
    for (const line of wrap(text, size, !!o.bold, o.width ?? contentW - (x - M))) {
      need(lead);
      y -= lead;
      ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${o.color ?? INK} rg 1 0 0 1 ${x.toFixed(2)} ${(y + size * 0.25).toFixed(2)} Tm ${pdfString(line)} Tj ET`);
    }
    y -= o.gap ?? 0;
  };
  const rule = () => {
    need(12);
    y -= 6;
    ops.push(`0.84 0.84 0.84 RG 0.6 w ${M} ${y.toFixed(2)} m ${(A4.w - M).toFixed(2)} ${y.toFixed(2)} l S`);
    y -= 14;
  };

  newPage();
  text('Markly review', { size: 22, bold: true, gap: 4 });
  text(`${context.scopeLabel} · ${context.reviewer} · ${formatDate(context.exportedAt)}`, { color: MUTED });
  text(context.source, { color: MUTED, size: 9, gap: 6 });
  text('Exported from Markly. Nothing has been submitted to any tracker.', { size: 9, color: MUTED, gap: 8 });

  entries.forEach((e, i) => {
    const n = i + 1;
    rule();
    need(80); // keep a heading with at least its first lines
    text(`${n}. ${e.title}`, { size: 13, bold: true, gap: 2 });
    text(`${e.category} (${e.type})  ·  Priority: ${e.priority ?? 'Not set'}`, { size: 9.5, color: MUTED });
    text(`Page: ${e.page.url}`, { size: 9, color: MUTED });
    text(`Element: ${e.anchor.selector}${e.anchor.text ? `  “${e.anchor.text}”` : ''}`, { size: 9, color: MUTED, gap: 6 });
    text(e.description, { gap: 8 });
    const jpeg = jpegs.get(e.id);
    if (e.evidence && jpeg) {
      const scale = Math.min(contentW / jpeg.width, 300 / jpeg.height, 1);
      const w = jpeg.width * scale;
      const h = jpeg.height * scale;
      need(h + 24);
      const name = `Im${images.length + 1}`;
      images.push({ name, jpeg });
      y -= h;
      ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${M} ${y.toFixed(2)} cm /${name} Do Q`);
      ops.push(`0.84 0.84 0.84 RG 0.5 w ${M} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
      y -= 4;
      text(e.evidence.kind === 'gif' ? `${evidenceLabel(e)} (first frame shown; the clip plays in the HTML export)` : evidenceLabel(e), { size: 9, color: MUTED, gap: 4 });
    } else {
      text(evidenceLabel(e), { size: 9, color: MUTED, gap: 4 });
    }
  });

  // Footer page numbers now that the count is known.
  pages.forEach((p, i) => {
    const label = encode(`Page ${i + 1} of ${pages.length}`);
    const x = A4.w - M - widthOf(label, 8.5, false);
    p.push(`BT /F1 8.5 Tf ${MUTED} rg 1 0 0 1 ${x.toFixed(2)} ${M - 20} Tm ${pdfString(label)} Tj ET`);
  });

  // ---- serialise ----
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {number[]} */
  const offsets = [];
  let pos = 0;
  const latin1 = (/** @type {string} */ s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const push = (/** @type {Uint8Array} */ b) => {
    chunks.push(b);
    pos += b.length;
  };
  /** @param {number} id @param {string} body @param {Uint8Array} [stream] */
  const obj = (id, body, stream) => {
    offsets[id] = pos;
    if (stream) {
      push(latin1(`${id} 0 obj\n${body.replace('>>', ` /Length ${stream.length} >>`)}\nstream\n`));
      push(stream);
      push(latin1('\nendstream\nendobj\n'));
    } else {
      push(latin1(`${id} 0 obj\n${body}\nendobj\n`));
    }
  };

  push(latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  const FONT1 = 3;
  const FONT2 = 4;
  const firstImage = 5;
  const firstPage = firstImage + images.length;
  const pageIds = pages.map((_, i) => firstPage + i * 2);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(FONT1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(FONT2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  images.forEach((im, i) =>
    obj(
      firstImage + i,
      `<< /Type /XObject /Subtype /Image /Width ${im.jpeg.width} /Height ${im.jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`,
      im.jpeg.bytes,
    ),
  );
  const xobjects = images.length ? ` /XObject << ${images.map((im, i) => `/${im.name} ${firstImage + i} 0 R`).join(' ')} >>` : '';
  pages.forEach((p, i) => {
    const pageId = pageIds[i];
    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${FONT1} 0 R /F2 ${FONT2} 0 R >>${xobjects} >> /Contents ${pageId + 1} 0 R >>`,
    );
    obj(pageId + 1, '<< >>', latin1(p.join('\n')));
  });
  const count = firstPage + pages.length * 2;
  const xref = pos;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(latin1(`${table}trailer\n<< /Size ${count} /Root 1 0 R /Info << /Producer (Markly prototype) /Title (Markly review) >> >>\nstartxref\n${xref}\n%%EOF\n`));
  return { filename: filenameFor(context, 'pdf'), mime: 'application/pdf', bytes: concat(chunks) };
}
