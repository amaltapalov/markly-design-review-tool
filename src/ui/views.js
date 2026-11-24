// Pure view functions: (state, actions) -> vnode. No state lives here.
import { h } from './dom.js';
import { icons } from './icons.js';
import { CATEGORIES, PRIORITIES, evidenceKindLabel, isImageEvidence, isVideoEvidence } from '../core/model.js';
import { countsByCategory, groupByScreen, reorderEntry, screenOf, visibleEntries } from '../core/ledger.js';
import { validateDraft } from '../core/validate.js';
import { decisions } from '../core/decisions.js';
import { FORMATS } from '../export/run.js';
import { exportScope } from '../export/scope.js';

/** @typedef {import('./app.js').AppState} AppState */
/** @typedef {import('./app.js').Actions} Actions */
/** @typedef {import('../core/model.js').Entry} Entry */

/** Clips crop the drawer out, so they need some page beside it. */
const MIN_CLIP_WIDTH = 320;

const icon = (/** @type {string} */ svg) => h('span', { class: 'mk-icon', html: svg });

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** @param {string} iso @param {number} now */
export function formatAgo(iso, now) {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** @param {number} ms */
const secs = (ms) => `${Math.round(ms / 100) / 10}s`;

/** "2 areas masked" or null. @param {{ auto: number, manual: number } | undefined} m */
export function maskSummary(m) {
  const n = (m?.auto ?? 0) + (m?.manual ?? 0);
  return n ? `${n} ${n === 1 ? 'area' : 'areas'} masked` : null;
}

/** @param {import('../core/model.js').Evidence} ev @param {number} now */
export function evidenceSummary(ev, now) {
  const masked = maskSummary(ev.masking);
  const tail = `${formatBytes(ev.bytes)} · ${formatAgo(ev.capturedAt, now)}${masked ? ` · ${masked}` : ''}`;
  if (ev.kind === 'gif') return `Clip attached · GIF · ${secs(ev.durationMs ?? 0)} · ${tail}`;
  if (ev.kind === 'upload') return `${evidenceKindLabel(ev)} attached · ${ev.name ?? 'file'} · ${tail} · not masked`;
  return `Screenshot attached · ${ev.width}×${ev.height} · ${tail}`;
}

/** @param {import('../core/model.js').Evidence} ev */
const evidenceGlyph = (ev) => (ev.kind === 'gif' || isVideoEvidence(ev) ? icons.playSmall : isImageEvidence(ev) ? icons.imageSmall : icons.fileSmall);

/** Inline preview: image, video, or a download link for other files. */
function attachmentPreview(/** @type {import('../core/model.js').Evidence} */ ev, /** @type {string} */ url, /** @type {string} */ cls, /** @type {string} */ label) {
  if (isImageEvidence(ev)) return h('img', { class: cls, src: url, alt: label });
  if (isVideoEvidence(ev)) return h('video', { class: cls, src: url, controls: true, 'aria-label': label });
  return h('a', { class: cls, href: url, download: ev.name ?? 'file' }, `Download ${ev.name ?? 'file'}`);
}

/** @param {AppState} s @param {Actions} a */
export function view(s, a) {
  return h(
    'div',
    {
      class: 'mk-root',
      'data-hidden': s.hidden || null,
      'data-recording': s.capture?.phase === 'recording' || null,
      'data-collapsed': (s.collapsed && s.mode === 'ledger') || null,
      'data-side': s.side,
      'data-dragging': s.drag?.moved || null,
    },
    h('div', { class: 'mk-chrome', inert: s.dialog || s.exporting ? '' : null }, overlay(s, a)),
    toasts(s),
    drawer(s, a),
    s.mode === 'ledger' ? launcher(s, a) : null,
    dragGhost(s),
  );
}

/** While dragging, the list shows the order a drop would make. @param {AppState} s */
function previewSession(s) {
  const t = s.drag?.target;
  return s.drag && t ? reorderEntry(s.session, s.drag.id, t.id, t.after) : s.session;
}

/** The row being dragged, floating under the pointer. Decorative: the list and announcements carry the meaning. @param {AppState} s */
function dragGhost(s) {
  const d = s.drag;
  if (!d?.moved) return null;
  const entries = previewSession(s).entries;
  const e = entries.find((x) => x.id === d.id);
  if (!e) return null;
  return h(
    'div',
    { class: 'mk-ghost', 'aria-hidden': 'true', style: { left: `${d.left}px`, top: `${d.y - d.offset}px`, width: `${d.width}px` } },
    h(
      'div',
      { class: 'mk-item-head' },
      h('span', { class: 'mk-grip', html: icons.grip }),
      h(
        'div',
        { class: 'mk-item-toggle' },
        h('span', { class: 'mk-badge' }, String(entries.indexOf(e) + 1)),
        h('span', { class: 'mk-item-title' }, e.title),
        h('span', { class: 'mk-glyph', html: icons.chevronDown }),
      ),
      h(
        'div',
        { class: 'mk-item-meta' },
        h('span', { class: 'mk-cat' }, e.category),
        e.priority ? h('span', { class: 'mk-prio', 'data-p': e.priority }, e.priority) : null,
        e.evidence ? h('span', { class: 'mk-glyph', html: evidenceGlyph(e.evidence) }) : null,
      ),
    ),
  );
}

/** Floating Markly button, bottom right: shows or hides the panel at any window width. @param {AppState} s @param {Actions} a */
function launcher(s, a) {
  const n = s.session.entries.length;
  const open = !s.collapsed;
  return h(
    'button',
    {
      class: 'mk-btn mk-btn--primary mk-fab',
      'aria-expanded': String(open),
      'aria-label': `Markly, ${n} ${n === 1 ? 'entry' : 'entries'}. ${open ? 'Hide' : 'Show'} the panel`,
      inert: s.dialog || s.exporting ? '' : null,
      onClick: open ? a.collapse : a.reopen,
    },
    'Markly',
    n ? h('span', { class: 'mk-count' }, ` ${n}`) : null,
  );
}

/* ---------------- Overlay ---------------- */

/** @param {AppState} s @param {Actions} a */
function overlay(s, a) {
  const targeting = s.mode === 'ledger' && !s.dialog && !s.exporting && !s.editing;
  return [
    h('div', { class: 'mk-frame', 'aria-hidden': 'true' }),
    targeting && s.hover
      ? h('div', {
          class: 'mk-hover',
          'aria-hidden': 'true',
          style: { left: `${s.hover.left}px`, top: `${s.hover.top}px`, width: `${s.hover.width}px`, height: `${s.hover.height}px` },
        })
      : null,
    s.pins.map((p) =>
      p.draft
        ? h('div', { key: 'draft', class: 'mk-pin', 'data-draft': '', style: { left: `${p.x}px`, top: `${p.y}px` }, 'aria-hidden': 'true' }, String(p.number))
        : h(
            'button',
            {
              key: p.id,
              class: 'mk-pin',
              // Mouse shortcut: keyboard users reach the same entry through its row.
              tabindex: '-1',
              'data-edge': p.edge ?? null,
              style: { left: `${p.x}px`, top: `${p.y}px` },
              'aria-label': `Feedback ${p.number}: ${p.title}${p.edge ? ` (${p.edge === 'up' ? 'above' : 'below'} the visible area)` : ''}`,
              'aria-expanded': String(s.expanded === p.id),
              onClick: () => a.openEntry(p.id),
            },
            String(p.number),
          ),
    ),
    s.capture?.phase === 'recording' || s.dialog || s.exporting
      ? null
      : h(
          'div',
          { class: 'mk-hint', 'aria-hidden': 'true' },
          s.mode === 'create'
            ? 'Esc to cancel this feedback'
            : s.editing
              ? 'Save or cancel your edit to add feedback'
              : s.picking
                ? '↑↓ move · ← parent · → child · Enter to pin · Esc to cancel'
                : 'Click anywhere to add feedback · Esc to exit',
        ),
  ];
}

/* ---------------- Toast ---------------- */

/** @param {AppState} s */
function toasts(s) {
  const t = s.toast;
  return h(
    'div',
    { class: 'mk-toasts', role: 'status', 'aria-live': 'polite' },
    t
      ? h(
          'div',
          { key: t.id, class: 'mk-toast', 'data-kind': t.kind },
          icon(t.kind === 'success' ? icons.check : icons.alert),
          h('span', null, t.text),
        )
      : null,
  );
}

/* ---------------- Drawer ---------------- */

/** @param {AppState} s @param {Actions} a */
function drawer(s, a) {
  // Collapsed: the floating Markly button (launcher) brings it back.
  if (s.collapsed && s.mode === 'ledger') return null;
  return h(
    'aside',
    { class: 'mk-drawer', 'aria-label': 'Markly review', ref: a.drawerRef },
    // While a dialog is open the panel behind it is inert, so Tab can't wander under the scrim.
    h('div', { class: 'mk-pane', inert: s.dialog || s.exporting ? '' : null }, s.mode === 'create' && s.draft ? creation(s, a) : ledger(s, a)),
    s.exporting ? exportDialog(s, a) : null,
    s.dialog ? dialog(s, a) : null,
    h('div', { class: 'mk-sr', role: 'status', 'aria-live': 'polite' }, s.announce),
  );
}

/** @param {AppState} s @param {Actions} a */
function ledger(s, a) {
  const { entries } = previewSession(s);
  const shown = visibleEntries(entries, s.filters, s.screen);
  // Chips count what the screen filter leaves; the dropdown counts every entry per screen.
  const counts = countsByCategory(visibleEntries(entries, new Set(), s.screen));
  const screens = groupByScreen(entries, s.path);
  /** @param {Entry[]} list @param {string} label */
  const rows = (list, label) =>
    h(
      'ul',
      { class: 'mk-list', 'aria-label': label },
      list.map((e) => row(s, a, e, entries.indexOf(e) + 1)),
    );
  return [
    h(
      'header',
      { class: 'mk-header' },
      h('h2', null, entries.length ? `Review & Submit Feedback (${entries.length})` : 'Review & Submit Feedback'),
      h(
        'button',
        { class: 'mk-btn mk-btn--primary', 'aria-pressed': s.picking ? 'true' : 'false', 'aria-describedby': 'mk-add-help', onClick: a.add },
        'Add',
      ),
      h('span', { id: 'mk-add-help', class: 'mk-sr' }, 'Click an element on the page, or use the arrow keys to choose one and Enter to pin it.'),
      s.hostWidth < MIN_CLIP_WIDTH ? h('button', { class: 'mk-btn mk-btn--text mk-hide', onClick: a.collapse }, 'Hide panel') : null,
      h('button', { class: 'mk-icon-btn', 'aria-label': 'Exit review mode', onClick: a.exit, html: icons.close }),
    ),
    h(
      'div',
      { class: 'mk-band mk-reviewer' },
      h('label', { for: 'mk-reviewer' }, 'Reviewing as'),
      h('input', {
        id: 'mk-reviewer',
        value: s.session.reviewer,
        placeholder: 'add your name',
        'aria-describedby': 'mk-reviewer-note',
        autocomplete: 'off',
        onInput: (/** @type {InputEvent} */ e) => a.setReviewer(/** @type {HTMLInputElement} */ (e.target).value),
      }),
      h('span', { id: 'mk-reviewer-note', class: 'mk-sr' }, 'A display name for exports, not a login.'),
    ),
    h(
      'div',
      { class: 'mk-screens' },
      h('label', { for: 'mk-screen', class: 'mk-sr' }, 'Show feedback from'),
      h(
        'select',
        {
          id: 'mk-screen',
          class: 'mk-select',
          value: s.screen ?? '',
          disabled: screens.length === 0,
          onChange: (/** @type {Event} */ ev) => a.setScreen(/** @type {HTMLSelectElement} */ (ev.target).value || null),
        },
        h('option', { value: '' }, `All screens (${entries.length})`),
        screens.map((g) => h('option', { key: g.path, value: g.path }, `${g.current ? 'This screen · ' : ''}${g.path} (${g.entries.length})`)),
      ),
    ),
    h(
      'div',
      { class: 'mk-chips', role: 'group', 'aria-label': 'Filter by category' },
      CATEGORIES.map((c) =>
        h(
          'button',
          { key: c, class: 'mk-chip', 'aria-pressed': String(s.filters.has(c)), onClick: () => a.toggleFilter(c) },
          c,
          counts[c] ? h('span', { class: 'mk-count' }, ` (${counts[c]})`) : null,
        ),
      ),
    ),
    h(
      'div',
      { class: 'mk-body' },
      !s.loaded
        ? h('div', { class: 'mk-empty' }, h('p', null, 'Loading your ledger…'))
        : s.notice
          ? notice(s.notice)
          : entries.length === 0
            ? h(
                'div',
                { class: 'mk-empty' },
                h('h3', null, 'No feedback yet'),
                h('p', null, 'Click anything on the page to describe it. The first click places a pin and opens this panel to write in.'),
              )
            : shown.length === 0
              ? h(
                  'div',
                  { class: 'mk-empty' },
                  h('h3', null, 'No feedback matches these filters'),
                  h('p', null, `${entries.length} saved ${entries.length === 1 ? 'entry is' : 'entries are'} hidden, not deleted.`),
                  h('p', null, h('button', { class: 'mk-link', onClick: a.clearFilters }, 'Clear filters')),
                )
              : [
                  h('p', { class: 'mk-shown' }, `${shown.length} of ${entries.length} shown`),
                  // All screens: one group per screen, this screen first. A single screen needs no headings.
                  s.screen == null
                    ? h(
                        'div',
                        { class: 'mk-groups' },
                        groupByScreen(shown, s.path).map((g, i) =>
                          h(
                            'section',
                            { key: g.path, class: 'mk-screen', 'aria-labelledby': `mk-scr-${i}` },
                            h(
                              'h3',
                              { id: `mk-scr-${i}`, class: 'mk-screen-head', title: g.title || g.path },
                              g.current ? h('span', { class: 'mk-tag' }, 'This screen') : null,
                              h('span', { class: 'mk-path' }, g.path),
                              h('span', { class: 'mk-screen-count' }, String(g.entries.length), h('span', { class: 'mk-sr' }, ' shown')),
                            ),
                            rows(g.entries, `Feedback on ${g.current ? 'this screen' : g.path}`),
                          ),
                        ),
                      )
                    : rows(shown, 'Saved feedback'),
                ],
    ),
    h(
      'footer',
      { class: 'mk-footer' },
      decisions.showClearAll ? h('button', { class: 'mk-btn mk-btn--text' }, 'Clear all') : null,
      h(
        'div',
        { class: 'mk-dock', role: 'group', 'aria-label': 'Panel side' },
        ['left', 'right'].map((side) =>
          h('button', {
            key: side,
            class: 'mk-icon-btn',
            'aria-pressed': String(s.side === side),
            'aria-label': `Panel on the ${side} side`,
            title: `Panel on the ${side} side`,
            onClick: () => a.setSide(/** @type {'left' | 'right'} */ (side)),
            html: side === 'left' ? icons.dockLeft : icons.dockRight,
          }),
        ),
      ),
      h('span', { class: 'mk-spacer' }),
      entries.length === 0
        ? h('button', { class: 'mk-btn mk-btn--primary', disabled: true }, 'Export 0')
        : h('button', { class: 'mk-btn mk-btn--primary', onClick: a.openExport }, 'Export'),
    ),
  ];
}

/** @param {AppState} s @param {Actions} a @param {Entry} e @param {number} n */
function row(s, a, e, n) {
  const open = s.expanded === e.id;
  const editing = s.editing?.id === e.id;
  const locked = !!s.editing; // resolve the edit before move/delete (PRD §11)
  const ev = e.evidence;
  const elsewhere = screenOf(e) !== s.path;
  const dragging = s.drag?.id === e.id && s.drag.moved; // this row is the placeholder where the drop lands
  const actionBtn = (/** @type {string} */ action, /** @type {string} */ label, /** @type {string} */ svg, /** @type {boolean} */ disabled, /** @type {() => void} */ fn, extra = '') =>
    h('button', {
      class: `mk-icon-btn mk-action${extra}`,
      'data-action': action,
      'aria-label': `${label} ${n}`,
      title: label,
      disabled,
      onClick: fn,
      html: svg,
    });
  return h(
    'li',
    {
      key: e.id,
      class: 'mk-item',
      'data-expanded': open || null,
      'data-editing': editing || null,
      'data-entry': e.id,
      'data-screen': screenOf(e),
      'data-dragging': dragging || null,
    },
    h(
      'div',
      { class: 'mk-item-head' },
      h('span', {
        class: 'mk-grip',
        'aria-hidden': 'true',
        title: 'Drag to reorder',
        html: icons.grip,
        onPointerDown: (/** @type {PointerEvent} */ ev) => a.dragStart(e.id, ev),
      }),
      h(
        'button',
        elsewhere
          ? // Taken on another screen: the click opens that page and shows the entry there.
            { class: 'mk-item-toggle', title: `Open ${screenOf(e)}`, 'aria-describedby': `mk-go-${e.id}`, onClick: () => a.toggleEntry(e.id) }
          : { class: 'mk-item-toggle', 'aria-expanded': String(open), 'aria-controls': open ? `mk-d-${e.id}` : null, onClick: () => a.toggleEntry(e.id) },
        h('span', { class: 'mk-badge', 'aria-label': `Entry ${n}` }, String(n)),
        h('span', { class: 'mk-item-title' }, e.title),
        h('span', { class: 'mk-glyph', html: elsewhere ? icons.goTo : open ? icons.chevronUp : icons.chevronDown }),
        elsewhere ? h('span', { id: `mk-go-${e.id}`, class: 'mk-sr' }, `Opens ${screenOf(e)}`) : null,
      ),
      h(
        'div',
        { class: 'mk-item-meta' },
        h('span', { class: 'mk-cat' }, e.category),
        e.priority ? h('span', { class: 'mk-prio', 'data-p': e.priority }, e.priority) : null,
        ev
          ? h('span', {
              class: 'mk-glyph',
              role: 'img',
              'aria-label': `${evidenceKindLabel(ev)} attached`,
              html: evidenceGlyph(ev),
            })
          : null,
        h('span', { class: 'mk-spacer' }),
        h(
          'span',
          { class: 'mk-actions', role: 'group', 'aria-label': `Actions for entry ${n}` },
          actionBtn('edit', 'Edit feedback', icons.edit, locked, () => a.startEdit(e.id)),
          actionBtn('delete', 'Delete feedback', icons.trash, locked, () => a.requestDelete(e.id), ' mk-action--danger'),
        ),
      ),
    ),
    open ? (editing ? editForm(s, a, e) : detail(s, a, e)) : null,
  );
}

/** Edit state: a working copy with explicit Save/Cancel (PRD-11). @param {AppState} s @param {Actions} a @param {Entry} e */
function editForm(s, a, e) {
  const ed = /** @type {NonNullable<AppState['editing']>} */ (s.editing);
  const c = ed.copy;
  const errors = ed.showErrors ? validateDraft(c) : {};
  const preview = s.previews.get(e.id);
  return h(
    'div',
    { class: 'mk-detail mk-edit', id: `mk-d-${e.id}`, role: 'group', 'aria-label': `Editing entry ${s.session.entries.indexOf(e) + 1}` },
    h(
      'div',
      null,
      h('span', { class: 'mk-label', id: 'mk-ecat-l' }, 'Category'),
      h(
        'div',
        { class: 'mk-segmented', role: 'radiogroup', 'aria-labelledby': 'mk-ecat-l', onKeyDown: a.editCategoryKeys },
        CATEGORIES.map((cat) =>
          h(
            'button',
            {
              key: cat,
              role: 'radio',
              'aria-checked': String(c.category === cat),
              tabindex: c.category === cat ? '0' : '-1',
              'data-ecat': cat,
              onClick: () => a.setEditField('category', cat),
            },
            cat,
          ),
        ),
      ),
    ),
    h(
      'div',
      null,
      h('label', { class: 'mk-label', for: 'mk-e-title' }, 'Title'),
      h('input', {
        id: 'mk-e-title',
        class: 'mk-input',
        value: c.title,
        'aria-required': 'true',
        'aria-invalid': errors.title ? 'true' : null,
        'aria-describedby': errors.title ? 'mk-e-title-e' : null,
        onInput: (/** @type {InputEvent} */ ev) => a.setEditField('title', /** @type {HTMLInputElement} */ (ev.target).value),
      }),
      errors.title ? h('p', { class: 'mk-error', id: 'mk-e-title-e' }, errors.title) : null,
    ),
    h(
      'div',
      null,
      h('label', { class: 'mk-label', for: 'mk-e-desc' }, 'Description'),
      h('textarea', {
        id: 'mk-e-desc',
        class: 'mk-textarea',
        value: c.description,
        rows: 3,
        'aria-required': 'true',
        'aria-invalid': errors.description ? 'true' : null,
        'aria-describedby': errors.description ? 'mk-e-desc-e' : null,
        onInput: (/** @type {InputEvent} */ ev) => a.setEditField('description', /** @type {HTMLTextAreaElement} */ (ev.target).value),
      }),
      errors.description ? h('p', { class: 'mk-error', id: 'mk-e-desc-e' }, errors.description) : null,
    ),
    decisions.classification !== 'severity'
      ? h(
          'div',
          null,
          h('label', { class: 'mk-label', for: 'mk-e-prio' }, 'Priority', h('span', { class: 'mk-req' }, ' (optional)')),
          h(
            'select',
            {
              id: 'mk-e-prio',
              class: 'mk-select',
              value: c.priority ?? '',
              'data-unset': c.priority ? null : '',
              onChange: (/** @type {Event} */ ev) => a.setEditField('priority', /** @type {HTMLSelectElement} */ (ev.target).value || null),
            },
            h('option', { value: '' }, 'Not set'),
            PRIORITIES.map((p) => h('option', { key: p, value: p }, p)),
          ),
        )
      : null,
    h(
      'div',
      { class: 'mk-band' },
      e.evidence ? evidenceSummary(e.evidence, s.now) : 'No evidence attached',
      ' · Inspected: ',
      h('strong', null, e.anchor.label),
    ),
    e.evidence && preview ? attachmentPreview(e.evidence, preview, 'mk-preview', `${evidenceKindLabel(e.evidence)} for entry: ${e.title}`) : null,
    h(
      'div',
      { class: 'mk-row mk-edit-actions' },
      h('button', { class: 'mk-btn mk-btn--secondary', onClick: a.cancelEdit }, 'Cancel'),
      h('button', { class: 'mk-btn mk-btn--primary', 'aria-disabled': String(ed.saving), onClick: a.saveEdit }, ed.saving ? 'Saving…' : 'Save changes'),
    ),
  );
}

/** Read state: plain text, nothing that looks editable (UI_SPEC C4). @param {AppState} s @param {Actions} a @param {Entry} e */
function detail(s, a, e) {
  const preview = s.previews.get(e.id);
  return h(
    'div',
    { class: 'mk-detail', id: `mk-d-${e.id}` },
    h(
      'dl',
      null,
      h('div', null, h('dt', null, 'Title'), h('dd', null, e.title)),
      h('div', null, h('dt', null, 'Description'), h('dd', null, e.description)),
      decisions.classification !== 'severity'
        ? h('div', null, h('dt', null, 'Priority'), h('dd', null, e.priority ?? 'Not set'))
        : null,
    ),
    h(
      'div',
      { class: 'mk-band' },
      e.evidence ? evidenceSummary(e.evidence, s.now) : 'No evidence attached',
      ' · Inspected: ',
      h('strong', null, e.anchor.label),
      screenOf(e) !== s.path ? ` · on ${screenOf(e)}` : null,
    ),
    e.evidence && preview
      ? openablePreview(e.evidence, preview, `${evidenceKindLabel(e.evidence)} for entry: ${e.title}`, () => a.openEvidenceTab(e.id))
      : null,
  );
}

/** Image or video preview with a badge that opens it in a new tab; other files stay plain downloads. */
function openablePreview(/** @type {import('../core/model.js').Evidence} */ ev, /** @type {string} */ url, /** @type {string} */ label, /** @type {() => void} */ onOpen) {
  if (!isImageEvidence(ev) && !isVideoEvidence(ev)) return attachmentPreview(ev, url, 'mk-preview', label);
  if (isImageEvidence(ev)) {
    return h(
      'button',
      { class: 'mk-preview-frame mk-preview-open', type: 'button', 'aria-label': `Open ${label} in a new tab`, onClick: onOpen },
      attachmentPreview(ev, url, 'mk-preview', label),
      h('span', { class: 'mk-open-badge', 'aria-hidden': 'true', html: icons.goTo }),
    );
  }
  return h(
    'div',
    { class: 'mk-preview-frame' },
    attachmentPreview(ev, url, 'mk-preview', label),
    h('button', { class: 'mk-open-badge', type: 'button', 'aria-label': `Open ${label} in a new tab`, onClick: onOpen, html: icons.goTo }),
  );
}

/** @param {{ text: string }} n */
function notice(n) {
  return h('div', { class: 'mk-notice', role: 'alert' }, icon(icons.alert), h('span', null, n.text));
}

/* ---------------- Creation ---------------- */

/** @param {AppState} s @param {Actions} a */
function creation(s, a) {
  const d = /** @type {import('../core/model.js').Draft} */ (s.draft);
  const number = s.session.entries.length + 1;
  const errors = s.showErrors ? validateDraft(d) : {};
  const valid = Object.keys(validateDraft(d)).length === 0;
  const busy = !!s.capture && s.capture.phase !== 'ready';
  const showCategory = !!d.evidence || d.evidenceSkipped;
  const showDetails = showCategory && !!d.category;
  return [
    h(
      'header',
      { class: 'mk-header' },
      h('h2', null, h('span', { class: 'mk-badge', 'data-draft': '' }, String(number)), 'New feedback'),
      h('button', { class: 'mk-icon-btn', 'aria-label': 'Cancel new feedback', onClick: a.cancelDraft, html: icons.close }),
    ),
    h('div', { class: 'mk-band' }, 'Inspected ', h('strong', null, d.anchor.label), d.anchor.text ? ` · “${d.anchor.text}”` : null),
    h(
      'div',
      { class: 'mk-body' },
      s.notice ? notice(s.notice) : null,
      evidenceSection(s, a, d, busy),
      showCategory
        ? h(
            'div',
            { class: 'mk-section' },
            h('span', { class: 'mk-label', id: 'mk-cat-l' }, 'Category'),
            h(
              'div',
              { class: 'mk-segmented', role: 'radiogroup', 'aria-labelledby': 'mk-cat-l', 'aria-describedby': errors.category ? 'mk-cat-e' : null, onKeyDown: a.categoryKeys },
              CATEGORIES.map((c) =>
                h(
                  'button',
                  {
                    key: c,
                    role: 'radio',
                    'aria-checked': String(d.category === c),
                    tabindex: d.category === c || (!d.category && c === 'UX') ? '0' : '-1',
                    'data-cat': c,
                    onClick: () => a.setCategory(c),
                  },
                  c,
                ),
              ),
            ),
            errors.category ? h('p', { class: 'mk-error', id: 'mk-cat-e' }, errors.category) : null,
          )
        : null,
      showDetails ? details(d, a, errors) : null,
      showDetails && d.evidence
        ? h(
            'div',
            { class: 'mk-section' },
            h(
              'div',
              { class: 'mk-band mk-evidence-band' },
              isImageEvidence(d.evidence)
                ? h('img', { class: 'mk-thumb', src: d.evidence.previewUrl, alt: '' })
                : h('span', { class: 'mk-glyph', html: evidenceGlyph(d.evidence) }),
              h('span', null, evidenceSummary(d.evidence, s.now)),
            ),
          )
        : null,
      h('div', { style: 'height:16px' }),
    ),
    h(
      'footer',
      { class: 'mk-footer' },
      h('button', { class: 'mk-btn mk-btn--secondary', onClick: a.cancelDraft }, 'Cancel'),
      h(
        'button',
        {
          class: 'mk-btn mk-btn--primary',
          'aria-disabled': String(!valid || busy || s.saving),
          'aria-describedby': !valid ? 'mk-save-why' : null,
          onClick: a.save,
        },
        s.saving ? 'Saving…' : 'Save',
      ),
      !valid ? h('span', { id: 'mk-save-why', class: 'mk-sr' }, 'Needs a category, title and description.') : null,
    ),
  ];
}

/**
 * @param {AppState} s @param {Actions} a
 * @param {import('../core/model.js').Draft} d @param {boolean} busy
 */
function evidenceSection(s, a, d, busy) {
  const c = s.capture;
  const kind = d.evidence?.kind;
  return h(
    'div',
    { class: 'mk-section' },
    h('span', { class: 'mk-label', id: 'mk-ev-l' }, 'Evidence', h('span', { class: 'mk-req' }, ' (optional)')),
    c && c.phase !== 'shooting'
      ? captureState(s, a)
      : [
          h(
            'div',
            { class: 'mk-row mk-evidence-row', role: 'group', 'aria-labelledby': 'mk-ev-l' },
            h(
              'button',
              { class: 'mk-btn mk-btn--secondary', 'aria-pressed': String(kind === 'screenshot'), disabled: busy, onClick: a.screenshot },
              icon(icons.image),
              c?.phase === 'shooting' ? 'Capturing…' : kind === 'screenshot' ? 'Retake screenshot' : 'Screenshot',
            ),
            h(
              'button',
              {
                class: 'mk-btn mk-btn--secondary',
                'aria-pressed': String(kind === 'gif'),
                disabled: busy || s.hostWidth < MIN_CLIP_WIDTH,
                'aria-describedby': s.hostWidth < MIN_CLIP_WIDTH ? 'mk-narrow' : null,
                onClick: a.video,
              },
              icon(icons.play),
              kind === 'gif' ? 'Retake video' : `Video ${decisions.maxClipSeconds}s`,
            ),
            h(
              'button',
              { class: 'mk-btn mk-btn--secondary', 'aria-pressed': String(kind === 'upload'), disabled: busy, onClick: a.upload },
              icon(icons.upload),
              kind === 'upload' ? 'Replace file' : 'Upload file',
            ),
          ),
          s.hostWidth < MIN_CLIP_WIDTH
            ? h('p', { id: 'mk-narrow', class: 'mk-meta', style: 'margin:8px 0 0' }, 'Widen the window to record a clip: the panel would cover the page.')
            : null,
          kind === 'upload'
            ? h('p', { class: 'mk-meta', style: 'margin:8px 0 0' }, 'Uploaded files are not masked. Check them for personal or patient data. ', h('button', { class: 'mk-link', onClick: a.removeUpload }, 'Remove file'))
            : null,
          !d.evidence && !d.evidenceSkipped
            ? h('p', { style: 'margin:8px 0 0' }, h('button', { class: 'mk-link', onClick: a.skipEvidence }, 'Continue without evidence'))
            : null,
        ],
  );
}

/** @param {AppState} s @param {Actions} a */
function captureState(s, a) {
  const c = /** @type {NonNullable<AppState['capture']>} */ (s.capture);
  const max = decisions.maxClipSeconds * 1000;
  if (c.phase === 'requesting') {
    return h(
      'div',
      { class: 'mk-capture', role: 'status' },
      h('div', null, h('strong', null, 'Waiting for the browser’s share prompt')),
      h('div', { class: 'mk-meta' }, 'Choose this tab and select Share. Markly only uses it for this capture.'),
      h('div', { class: 'mk-row' }, h('button', { class: 'mk-btn mk-btn--secondary', onClick: a.cancelCapture }, 'Cancel')),
    );
  }
  if (c.phase === 'countdown') {
    return h(
      'div',
      { class: 'mk-capture', role: 'timer', 'aria-live': 'assertive' },
      h('div', { class: 'mk-countdown' }, String(c.count)),
      h('div', { class: 'mk-meta' }, 'Recording starts soon. Press Esc to cancel.'),
      h('div', { class: 'mk-row' }, h('button', { class: 'mk-btn mk-btn--secondary', onClick: a.cancelCapture }, 'Cancel')),
    );
  }
  if (c.phase === 'recording') {
    const pct = Math.min(100, Math.round(((c.elapsed ?? 0) / max) * 100));
    return h(
      'div',
      { class: 'mk-capture' },
      h('div', { class: 'mk-rec' }, `Recording ${secs(c.elapsed ?? 0)} / ${decisions.maxClipSeconds}s`),
      h(
        'div',
        { class: 'mk-progress', role: 'progressbar', 'aria-label': 'Recording progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        h('div', { style: { width: `${pct}%` } }),
      ),
      h('div', { class: 'mk-meta' }, 'The panel is left out of the clip. Stops by itself at 10 seconds.'),
      h('div', { class: 'mk-row' }, h('button', { class: 'mk-btn mk-btn--primary', onClick: a.stopRecording }, 'Stop')),
    );
  }
  if (c.phase === 'processing') {
    return h('div', { class: 'mk-capture', role: 'status' }, h('div', { class: 'mk-meta' }, 'Preparing GIF…'));
  }
  return review(c, a);
}

/**
 * Review step for a capture: automatic masks are already painted in; drag on the preview to mask
 * more. Pointer only for now (keyboard masking is a D6 gap).
 * @param {NonNullable<AppState['capture']>} c @param {Actions} a
 */
function review(c, a) {
  const m = /** @type {import('../media/evidence.js').PendingMedia} */ (c.media);
  const isClip = m.kind === 'gif';
  const pct = (/** @type {number} */ v, /** @type {number} */ total) => `${(v / total) * 100}%`;
  const box = (/** @type {{ x: number, y: number, width: number, height: number }} */ r, /** @type {string} */ cls, /** @type {string | number} */ key) =>
    h('div', { key, class: cls, style: { left: pct(r.x, m.width), top: pct(r.y, m.height), width: pct(r.width, m.width), height: pct(r.height, m.height) } });
  const d = c.drag;
  const auto = m.autoMasked;
  return h(
    'div',
    { class: 'mk-capture' },
    h(
      'div',
      {
        class: 'mk-maskable',
        tabindex: '0',
        role: 'group',
        'aria-label': 'Mask editor',
        'aria-describedby': 'mk-mask-help',
        'data-busy': c.rendering || null,
        'data-kbd': c.kbd ? '' : null,
        onKeyDown: a.maskKeys,
        onPointerDown: a.maskDown,
        onPointerMove: a.maskMove,
        onPointerUp: a.maskUp,
        onPointerCancel: a.maskUp,
      },
      h('img', { class: 'mk-preview', src: m.previewUrl, alt: isClip ? 'Recorded clip preview, masks applied' : 'Screenshot preview, masks applied', draggable: 'false' }),
      d ? box({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) }, 'mk-mask-drag', 'drag') : null,
      c.kbd ? box(c.kbd, 'mk-mask-drag', 'kbd') : null,
    ),
    h(
      'div',
      { class: 'mk-meta' },
      isClip ? `GIF · ${secs(m.durationMs ?? 0)} · ` : '',
      `${formatBytes(m.blob.size)} · ${m.width}×${m.height}`,
    ),
    h(
      'div',
      { class: 'mk-mask-note' },
      h('strong', null, auto ? `${auto} sensitive ${auto === 1 ? 'area was' : 'areas were'} masked automatically.` : 'Nothing sensitive was detected automatically.'),
      ' ',
      m.manual.length ? `${m.manual.length} added by you. ` : '',
      'Drag on the image to hide anything else (names, patient details, IDs).',
      h(
        'span',
        { id: 'mk-mask-help', class: 'mk-sr' },
        'To mask with the keyboard, focus the image and press Enter to place a box, arrow keys to move it, Shift plus arrow keys to resize, Enter to apply, Escape to cancel.',
      ),
    ),
    h(
      'div',
      { class: 'mk-row' },
      h('button', { class: 'mk-btn mk-btn--primary', 'aria-disabled': String(!!c.rendering), onClick: a.keepMedia }, c.rendering ? 'Applying mask…' : 'Keep'),
      h('button', { class: 'mk-btn mk-btn--secondary', disabled: !m.manual.length || !!c.rendering, onClick: a.undoMask }, 'Undo mask'),
      h('button', { class: 'mk-btn mk-btn--secondary', onClick: isClip ? a.video : a.screenshot }, 'Retake'),
      h('button', { class: 'mk-link', onClick: a.cancelCapture }, isClip ? 'Discard clip' : 'Discard screenshot'),
    ),
  );
}

/**
 * @param {import('../core/model.js').Draft} d @param {Actions} a
 * @param {ReturnType<typeof validateDraft>} errors
 */
function details(d, a, errors) {
  return [
    h(
      'div',
      { class: 'mk-section' },
      h('label', { class: 'mk-label', for: 'mk-title' }, 'Title'),
      h('input', {
        id: 'mk-title',
        class: 'mk-input',
        value: d.title,
        required: true,
        'aria-required': 'true',
        'aria-invalid': errors.title ? 'true' : null,
        'aria-describedby': errors.title ? 'mk-title-e' : null,
        onInput: (/** @type {InputEvent} */ e) => a.setField('title', /** @type {HTMLInputElement} */ (e.target).value),
      }),
      errors.title ? h('p', { class: 'mk-error', id: 'mk-title-e' }, errors.title) : null,
    ),
    h(
      'div',
      { class: 'mk-section' },
      h('label', { class: 'mk-label', for: 'mk-desc' }, 'Description'),
      h('textarea', {
        id: 'mk-desc',
        class: 'mk-textarea',
        value: d.description,
        rows: 3,
        required: true,
        'aria-required': 'true',
        'aria-invalid': errors.description ? 'true' : null,
        'aria-describedby': errors.description ? 'mk-desc-e' : null,
        onInput: (/** @type {InputEvent} */ e) => a.setField('description', /** @type {HTMLTextAreaElement} */ (e.target).value),
      }),
      errors.description ? h('p', { class: 'mk-error', id: 'mk-desc-e' }, errors.description) : null,
    ),
    decisions.classification !== 'severity'
      ? h(
          'div',
          { class: 'mk-section' },
          h('label', { class: 'mk-label', for: 'mk-prio' }, 'Priority', h('span', { class: 'mk-req' }, ' (optional)')),
          h(
            'select',
            {
              id: 'mk-prio',
              class: 'mk-select',
              value: d.priority ?? '',
              'data-unset': d.priority ? null : '',
              onChange: (/** @type {Event} */ e) => a.setField('priority', /** @type {HTMLSelectElement} */ (e.target).value || null),
            },
            h('option', { value: '' }, 'Not set'),
            PRIORITIES.map((p) => h('option', { key: p, value: p }, p)),
          ),
        )
      : null,
  ];
}

/* ---------------- Dialog ---------------- */

/** @param {AppState} s @param {Actions} a */
function dialog(s, a) {
  const d = /** @type {NonNullable<AppState['dialog']>} */ (s.dialog);
  return h(
    'div',
    { class: 'mk-scrim', onClick: (/** @type {MouseEvent} */ e) => e.target === e.currentTarget && a.closeDialog() },
    h(
      'div',
      { class: 'mk-sheet', role: 'alertdialog', 'aria-modal': 'false', 'aria-labelledby': 'mk-dlg-t', 'aria-describedby': 'mk-dlg-d' },
      h('h3', { id: 'mk-dlg-t' }, d.title),
      h('p', { id: 'mk-dlg-d' }, d.body),
      h(
        'div',
        { class: 'mk-row' },
        h('button', { class: 'mk-btn mk-btn--secondary', 'data-autofocus': '', onClick: a.closeDialog }, 'Cancel'),
        h('button', { class: 'mk-btn mk-btn--danger', onClick: a.confirmDialog }, d.confirm),
      ),
    ),
  );
}

/* ---------------- Export dialog (D5) ---------------- */

/** @param {AppState} s @param {Actions} a */
function exportDialog(s, a) {
  const ex = /** @type {NonNullable<AppState['exporting']>} */ (s.exporting);
  const scope = exportScope(s.session, s.filters, new Date(s.now), location.origin);
  const spec = FORMATS.find((f) => f.id === ex.format) ?? FORMATS[0];
  const needsCheck = spec.media && scope.hasMedia && decisions.requireMediaReview;
  const blocked = needsCheck && !ex.reviewed;
  return h(
    'div',
    { class: 'mk-scrim', onClick: (/** @type {MouseEvent} */ e) => e.target === e.currentTarget && a.cancelExport() },
    h(
      'div',
      { class: 'mk-sheet mk-export', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'mk-x-t', 'aria-describedby': 'mk-x-scope', 'aria-busy': ex.busy ? 'true' : null },
      h('h3', { id: 'mk-x-t' }, 'Export feedback'),
      h('p', { id: 'mk-x-scope' }, scope.line),
      scope.filterIgnored || s.screen
        ? h('p', { class: 'mk-meta' }, `Filters don’t apply: all ${scope.entries.length} entries are exported, from every screen.`)
        : null,
      h(
        'fieldset',
        { class: 'mk-formats', disabled: ex.busy },
        h('legend', { class: 'mk-sr' }, 'Format'),
        FORMATS.map((f) =>
          h(
            'label',
            { key: f.id, class: 'mk-format' },
            h('input', {
              type: 'radio',
              name: 'mk-format',
              value: f.id,
              checked: ex.format === f.id,
              onChange: () => a.setExportFormat(f.id),
            }),
            h('span', null, h('strong', null, f.label), h('span', { class: 'mk-meta' }, f.hint)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'mk-caveat', 'data-active': ex.format === 'csv' || null },
        h('strong', null, 'CSV does not carry evidence'),
        h('span', null, 'Screenshots and clips stay in the tool until a real Jira integration exists.'),
      ),
      needsCheck
        ? h(
            'label',
            { class: 'mk-check' },
            h('input', {
              id: 'mk-x-reviewed',
              type: 'checkbox',
              checked: ex.reviewed,
              'aria-invalid': ex.tried && blocked ? 'true' : null,
              'aria-describedby': 'mk-x-check-why',
              onChange: (/** @type {Event} */ e) => a.setReviewed(/** @type {HTMLInputElement} */ (e.target).checked),
            }),
            h(
              'span',
              null,
              'I’ve checked the screenshots and clips: no personal or patient data (PII/PHI) is visible.',
              h(
                'span',
                { id: 'mk-x-check-why', class: 'mk-meta' },
                ex.tried && blocked
                  ? ' Confirm this before exporting media.'
                  : ' Markly masks known sensitive fields and patterns; check for anything it missed.',
              ),
            ),
          )
        : null,
      ex.error ? notice({ text: ex.error }) : null,
      h(
        'div',
        { class: 'mk-row' },
        h('button', { class: 'mk-btn mk-btn--secondary', disabled: ex.busy, onClick: a.cancelExport }, 'Cancel'),
        h(
          'button',
          { class: 'mk-btn mk-btn--primary', 'data-autofocus': '', 'aria-disabled': String(blocked || ex.busy), onClick: a.runExport },
          ex.busy ? `Exporting ${spec.label}…` : `Export ${spec.label}`,
        ),
      ),
    ),
  );
}
