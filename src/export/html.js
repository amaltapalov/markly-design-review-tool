// HTML: the readable report as one self-contained file; media embedded so GIFs animate offline.
import { dataUrl, escapeHtml as x, evidenceLabel, filenameFor, formatDate, utf8 } from './util.js';

const CSS = `
*{box-sizing:border-box}body{margin:0;font:15px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif;color:#111;background:#fff;letter-spacing:-.01em}
main{max-width:860px;margin:0 auto;padding:48px 24px}h1{font-size:28px;margin:0 0 4px}
.scope{color:#6b6b6b;margin:0 0 8px}.note{border-left:6px solid #111;background:#f2f2f2;padding:10px 14px;margin:16px 0 32px;font-size:14px}
article{border-top:1px solid #d6d6d6;padding:24px 0}h2{font-size:18px;margin:0 0 8px;display:flex;gap:10px;align-items:baseline}
.n{flex:none;display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#111;color:#fff;font-size:12px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0 0 12px;font-size:14px}dt{font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.02em;padding-top:2px}dd{margin:0;overflow-wrap:anywhere}
.desc{white-space:pre-wrap;margin:0 0 12px}.p-High{color:#d62828}.p-Medium{color:#b35c00}.p-Low{color:#2e7d32}
figure{margin:0}img{display:block;max-width:100%;border:1px solid #d6d6d6}figcaption{color:#6b6b6b;font-size:13px;margin-top:6px}
code{font:13px ui-monospace,Menlo,monospace;background:#f2f2f2;padding:1px 4px}@media print{article{break-inside:avoid}}
`;

/** @param {import('./util.js').ExportInput} input @returns {import('./util.js').ExportFile} */
export function toHtml({ entries, context, media }) {
  const items = entries
    .map((e, i) => {
      const n = i + 1;
      const m = media.get(e.id);
      const fig =
        e.evidence && m
          ? `<figure><img src="${dataUrl(m)}" alt="${x(`${e.evidence.kind === 'gif' ? 'Clip' : 'Screenshot'} for entry ${n}: ${e.title}`)}" width="${e.evidence.width}" height="${e.evidence.height}" loading="lazy"><figcaption>${x(evidenceLabel(e))}</figcaption></figure>`
          : `<p class="scope">${x(evidenceLabel(e))}</p>`;
      return `<article id="entry-${n}">
<h2><span class="n">${n}</span><span>${x(e.title)}</span></h2>
<dl>
<dt>Category</dt><dd>${x(e.category)} (${x(e.type)})</dd>
<dt>Priority</dt><dd class="p-${x(e.priority ?? 'none')}">${x(e.priority ?? 'Not set')}</dd>
<dt>Page</dt><dd><a href="${x(e.page.url)}" rel="noreferrer noopener">${x(e.page.title || e.page.url)}</a></dd>
<dt>Element</dt><dd><code>${x(e.anchor.selector)}</code>${e.anchor.text ? ` “${x(e.anchor.text)}”` : ''}</dd>
</dl>
<p class="desc">${x(e.description)}</p>
${fig}
</article>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Markly review · ${x(formatDate(context.exportedAt))}</title><style>${CSS}</style></head>
<body><main>
<h1>Markly review</h1>
<p class="scope">${x(context.scopeLabel)} · ${x(context.reviewer)} · ${x(formatDate(context.exportedAt))} · ${x(context.source)}</p>
<p class="note">Exported from Markly. Nothing has been submitted to any tracker.</p>
${items}
</main></body></html>
`;
  return { filename: filenameFor(context, 'html'), mime: 'text/html;charset=utf-8', bytes: utf8(html) };
}
