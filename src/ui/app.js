// Markly controller: owns state, host listeners and the shadow root. Views stay pure (views.js).
import { render } from './dom.js';
import { view } from './views.js';
import { decisions } from '../core/decisions.js';
import { emptySession, CATEGORIES } from '../core/model.js';
import {
  addEntry,
  createDraft,
  deleteEntry,
  editableFields,
  entryFromDraft,
  isDirty,
  isEditDirty,
  groupByScreen,
  moveEntry,
  reorderEntry,
  screenOf,
  setReviewer,
  updateEntry,
  visibleEntries,
} from '../core/ledger.js';
import { validateDraft } from '../core/validate.js';
import { escAction } from '../core/keys.js';
import { anchorFor, currentPage, resolveAnchor } from '../core/anchor.js';
import { afterPaint } from '../media/capture.js';
import { ClipRecorder } from '../media/recorder.js';
import { MASK_RULES_VERSION, MaskScanner } from '../media/mask.js';
import { maskedScreenshot, renderPending } from '../media/evidence.js';
import { firstPinnable, stepPinnable } from './picker.js';
import { storageReason } from '../core/errors.js';
import { labelFor, textFor } from '../core/anchor.js';
import { exportScope } from '../export/scope.js';
import { FORMATS, buildExport, download } from '../export/run.js';
import { openEvidenceTab } from './viewer.js';
import { leaveHandoff, takeHandoff } from './handoff.js';

/** @typedef {import('../core/model.js').Session} Session */
/** @typedef {import('../core/model.js').Draft} Draft */
/** @typedef {import('../core/model.js').Category} Category */
/** @typedef {import('../media/evidence.js').PendingMedia} PendingMedia */

/**
 * @typedef {object} AppState
 * @property {Session} session      committed ledger (mirrors storage)
 * @property {boolean} loaded
 * @property {boolean} hidden       overlay hidden for a screenshot
 * @property {'ledger' | 'create'} mode
 * @property {Draft | null} draft
 * @property {null | { phase: 'shooting' | 'requesting' | 'countdown' | 'recording' | 'processing' | 'ready', count?: number, elapsed?: number, media?: PendingMedia, drag?: { x0: number, y0: number, x1: number, y1: number } | null, kbd?: import('../media/mask.js').Rect | null, rendering?: boolean }} capture
 *   'ready' is the review step: preview, automatic masks applied, manual masks, Keep/Retake
 * @property {boolean} showErrors
 * @property {boolean} saving
 * @property {Set<Category>} filters
 * @property {string | null} screen  screen filter (a screen path); null shows all screens, grouped
 * @property {string | null} expanded
 * @property {null | { id: string, copy: import('../core/ledger.js').EntryFields, showErrors: boolean, saving: boolean }} editing
 *   working copy of a saved entry; Cancel restores the saved values
 * @property {string} announce     polite screen-reader message for actions with no visible toast
 * @property {boolean} picking      keyboard element picker is active (Add)
 * @property {number} hostWidth     CSS px of page visible beside the drawer
 * @property {boolean} collapsed    narrow windows: drawer hidden behind a floating button so the page is usable
 * @property {'left' | 'right'} side  which edge the drawer sits on; the page is the rest of the window
 * @property {null | { id: string, target: { id: string, after: boolean } | null, moved: boolean, startY: number, y: number, offset: number, left: number, width: number }} drag
 *   drag-to-reorder in progress; target is null when a drop would change nothing. The list previews the drop;
 *   y/offset/left/width place the floating copy under the pointer.
 * @property {null | { format: import('../export/run.js').ExportFormat, reviewed: boolean, busy: boolean, error: string | null, tried: boolean }} exporting
 * @property {{ left: number, top: number, width: number, height: number } | null} hover
 * @property {{ id: number, kind: 'success' | 'info' | 'error', text: string } | null} toast
 * @property {{ title: string, body: string, confirm: string, onConfirm: () => void } | null} dialog
 * @property {{ text: string } | null} notice
 * @property {{ id: string, number: number, title: string, x: number, y: number, draft?: boolean, edge?: 'up' | 'down' }[]} pins
 * @property {Map<string, string>} previews   entry id -> object URL
 * @property {number} now
 * @property {string} path
 */

/** @typedef {ReturnType<Markly['actions']>} Actions */

const SESSION_KEY = () => `origin:${location.origin}`;
const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];

/** @param {unknown} err */
function captureMessage(err) {
  const name = /** @type {any} */ (err)?.name;
  if (name === 'NotAllowedError') return 'Screen capture was blocked or cancelled. Your draft is unchanged. Try again and allow this tab, or continue without evidence.';
  if (name === 'NotFoundError' || name === 'NotSupportedError') return 'This browser cannot capture the tab here. Continue without evidence.';
  return `Capture failed (${/** @type {any} */ (err)?.message ?? 'unknown error'}). Your draft is unchanged.`;
}

export class Markly {
  /**
   * @param {import('../platform/types.js').Platform} platform
   * @param {() => void} onExit
   */
  constructor(platform, onExit) {
    this.platform = platform;
    this.onExit = onExit;
    /** @type {AppState} */
    this.state = {
      session: emptySession(),
      loaded: false,
      hidden: false,
      mode: 'ledger',
      draft: null,
      capture: null,
      showErrors: false,
      saving: false,
      filters: new Set(),
      screen: null,
      expanded: null,
      editing: null,
      announce: '',
      picking: false,
      hostWidth: 0,
      collapsed: false,
      side: decisions.drawerSide,
      drag: null,
      exporting: null,
      hover: null,
      toast: null,
      dialog: null,
      notice: null,
      pins: [],
      previews: new Map(),
      now: Date.now(),
      path: location.pathname + location.search,
    };
    /** @type {HTMLElement | null} */
    this.host = null;
    /** @type {ShadowRoot | null} */
    this.root = null;
    /** @type {Element | null} element under the draft pin */
    this.draftEl = null;
    /** @type {Element | null} current keyboard-picker target */
    this.pickEl = null;
    /** @type {Map<string, WeakRef<Element>>} */
    this.elCache = new Map();
    /** @type {ClipRecorder | null} */
    this.recorder = null;
    /** @type {MediaStream | null} */
    this.stream = null;
    this.countdownTimer = 0;
    /** Bumped on every capture start/cancel so late results from a cancelled prompt are dropped. */
    this.captureToken = 0;
    this.toastTimer = 0;
    this.reviewerTimer = 0;
    this.frame = 0;
    this.frameTimer = 0;
    /** @type {string | null} */
    this.focusNext = null;
    /** @type {HTMLElement | null} */
    this.returnFocus = null;
    /** @type {string | null} */
    this.returnSel = null;
    /** Animate rows into place on the next render (after a drop or a cancelled drag). */
    this.settle = false;
    /** Removes the drag listeners from the drawer. */
    this.dragOff = () => {};
    this.a = this.actions();
    this.listeners = this.hostListeners();
  }

  /* ---------------- lifecycle ---------------- */

  async start() {
    const css = await Promise.all(
      ['src/ui/tokens.css', 'src/ui/markly.css'].map((p) => fetch(this.platform.assetUrl(p)).then((r) => r.text())),
    );
    const host = document.createElement('markly-root');
    // CSSOM, not a style attribute, so strict style-src CSP doesn't block it.
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;';
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css.join('\n'));
    root.adoptedStyleSheets = [sheet];
    document.documentElement.appendChild(host);
    this.host = host;
    this.root = root;
    for (const [type, fn, opts] of this.listeners) window.addEventListener(type, fn, opts);
    // Arrived from another screen through Markly: keep the panel's side and filter, open the entry.
    const handoff = takeHandoff();
    if (handoff) {
      this.state.side = handoff.side;
      this.state.screen = handoff.screen;
    }
    this.renderNow();

    try {
      const saved = await this.platform.storage.loadSession(SESSION_KEY());
      this.state.session = saved ?? emptySession();
    } catch (err) {
      this.state.notice = { text: `Couldn't open saved feedback (${storageReason(err)}). New feedback can't be saved until storage works.` };
    }
    this.state.loaded = true;
    const open = handoff?.open && this.state.session.entries.some((e) => e.id === handoff.open) ? handoff.open : null;
    if (open) {
      this.renderNow(); // places pins, so openEntry can find and scroll to the element
      this.a.openEntry(open);
    } else {
      this.schedule();
    }
  }

  /**
   * Open another screen. The page reloads; Markly reopens there from the handoff note.
   * @param {string} path  screen path
   * @param {{ screen: string | null, open: string | null }} opts
   */
  async goTo(path, { screen, open }) {
    const s = this.state;
    const entry = s.session.entries.find((e) => screenOf(e) === path);
    if (!entry || path === s.path) return;
    // Keep the URL the feedback was taken on (hash included), minus Markly's launch parameter.
    const url = new URL(entry.page.url, location.href);
    url.searchParams.delete('review');
    if (this.reviewerTimer) {
      clearTimeout(this.reviewerTimer);
      this.reviewerTimer = 0;
      await this.platform.storage.saveSession(SESSION_KEY(), s.session).catch(() => {});
    }
    leaveHandoff({ path, screen, open, side: s.side });
    s.announce = `Opening ${path}.`;
    this.schedule();
    location.assign(url.href);
  }

  /** Exit review mode, asking first if a draft or an edit would be lost. */
  requestExit() {
    if (this.editDirty()) {
      this.guardEdit(() => this.teardown());
      return;
    }
    if (isDirty(this.state.draft)) {
      this.openDialog({
        title: 'Discard this feedback and exit?',
        body: 'The draft, its evidence and text will be lost. Saved feedback stays.',
        confirm: 'Discard and exit',
        onConfirm: () => this.teardown(),
      });
      return;
    }
    this.teardown();
  }

  teardown() {
    this.stopCapture();
    for (const [type, fn, opts] of this.listeners) window.removeEventListener(type, fn, opts);
    cancelAnimationFrame(this.frame);
    clearTimeout(this.frameTimer);
    this.frame = 0;
    clearTimeout(this.toastTimer);
    if (this.reviewerTimer) {
      clearTimeout(this.reviewerTimer);
      this.persistReviewer();
    }
    this.revokeDraftUrls();
    for (const url of this.state.previews.values()) URL.revokeObjectURL(url);
    this.host?.remove();
    this.host = null;
    this.onExit();
  }

  /* ---------------- rendering ---------------- */

  /** Coalesce renders to one per frame. The timer covers tabs that aren't painting (rAF paused). */
  schedule() {
    if (this.frame || !this.root) return;
    const run = () => {
      if (!this.frame) return;
      cancelAnimationFrame(this.frame);
      clearTimeout(this.frameTimer);
      this.frame = 0;
      this.renderNow();
    };
    this.frame = requestAnimationFrame(run);
    this.frameTimer = window.setTimeout(run, 50);
  }

  renderNow() {
    if (!this.root) return;
    const s = this.state;
    s.now = Date.now();
    s.path = currentPage().path;
    // The filtered screen lost its last entry: fall back to all screens.
    if (s.loaded && s.screen && !s.session.entries.some((e) => screenOf(e) === s.screen)) s.screen = null;
    s.hostWidth = window.innerWidth - this.drawerWidth();
    if (s.picking && this.pickEl?.isConnected) {
      const r = this.pickEl.getBoundingClientRect();
      s.hover = { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    s.pins = this.computePins();
    // While dragging (and once after), rows slide to their new places instead of jumping.
    const tops = s.drag?.moved || this.settle ? this.rowTops() : null;
    this.settle = false;
    render(this.root, view(s, this.a));
    if (tops) this.slideRows(tops);
    if (this.focusNext) {
      const el = /** @type {HTMLElement | null} */ (this.root.querySelector(this.focusNext));
      if (el) {
        el.focus({ preventScroll: true });
        this.focusNext = null;
      }
    }
  }

  /**
   * Pins sit on a small target's top-right corner so they don't cover its label (UI_SPEC C5).
   * Wide targets (headings, rows) use the stored click point, or the pin lands far from the content.
   */
  computePins() {
    const s = this.state;
    const page = this.pageBounds();
    const minX = page.left + 14;
    const maxX = Math.max(minX, page.right - 14);
    const maxY = window.innerHeight - 14;
    const WIDE = 240;
    /**
     * Off-screen targets keep a pin on the top or bottom edge (edge: 'up' | 'down') so the reviewer
     * can still see and reach them.
     * @param {Element | null} el @param {import('../core/model.js').Anchor} anchor
     */
    const place = (el, anchor) => {
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      const x = Math.min(maxX, Math.max(minX, r.width > WIDE ? r.left + anchor.fx * r.width : r.right));
      if (r.bottom < 0) return { x, y: 14, edge: /** @type {const} */ ('up') };
      if (r.top > window.innerHeight) return { x, y: maxY, edge: /** @type {const} */ ('down') };
      const y = r.width > WIDE ? r.top + anchor.fy * r.height : r.top;
      return { x, y: Math.min(maxY, Math.max(14, y)) };
    };
    /** @type {AppState['pins']} */
    const pins = [];
    s.session.entries.forEach((e, i) => {
      if (screenOf(e) !== s.path) return;
      let el = this.elCache.get(e.id)?.deref() ?? null;
      if (!el || !el.isConnected) {
        el = resolveAnchor(e.anchor);
        if (el) this.elCache.set(e.id, new WeakRef(el));
      }
      const at = place(el, e.anchor);
      if (at) pins.push({ id: e.id, number: i + 1, title: e.title, ...at });
    });
    if (s.draft) {
      const at = place(this.draftEl, s.draft.anchor);
      if (at) pins.push({ id: 'draft', number: s.session.entries.length + 1, title: 'New feedback', draft: true, ...at });
    }
    return pins;
  }

  /* ---------------- host listeners ---------------- */

  /** @returns {[string, (e: any) => void, AddEventListenerOptions][]} */
  hostListeners() {
    const capture = { capture: true };
    /** Is this event aimed at the host page (not Markly) while we're picking a target? @param {MouseEvent} e */
    const isTargetingHost = (/** @type {MouseEvent} */ e) =>
      this.state.mode === 'ledger' &&
      !this.state.dialog &&
      !this.state.exporting &&
      !this.state.editing &&
      e.target !== this.host &&
      e.target instanceof Element &&
      !(decisions.altPassthrough && e.altKey);

    /** @param {MouseEvent} e */
    const block = (e) => {
      if (!isTargetingHost(e) || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'click') this.createDraftAt(/** @type {Element} */ (e.target), e.clientX, e.clientY);
    };

    /** @param {PointerEvent} e */
    const move = (e) => {
      if (this.state.picking && isTargetingHost(e)) this.pickEl = /** @type {Element} */ (e.target);
      const next = isTargetingHost(e) ? /** @type {Element} */ (e.target).getBoundingClientRect() : null;
      const cur = this.state.hover;
      if (!next && !cur) return;
      this.state.hover = next && { left: next.left, top: next.top, width: next.width, height: next.height };
      this.schedule();
    };

    /** @param {KeyboardEvent} e */
    const key = (e) => {
      if (e.key === 'Escape' && this.state.drag) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.dragCancel();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.handleEsc();
        return;
      }
      if (this.state.picking && this.pickKey(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    /** @param {BeforeUnloadEvent} e */
    const unload = (e) => {
      if (isDirty(this.state.draft)) e.preventDefault();
    };

    return [
      ...BLOCKED_EVENTS.map((t) => /** @type {[string, (e: any) => void, AddEventListenerOptions]} */ ([t, block, capture])),
      ['pointermove', move, { capture: true, passive: true }],
      ['keydown', key, capture],
      ['scroll', () => this.schedule(), { capture: true, passive: true }],
      ['resize', () => this.schedule(), { passive: true }],
      ['beforeunload', unload, {}],
    ];
  }

  handleEsc() {
    const s = this.state;
    const action = escAction({
      dialogOpen: !!s.dialog || !!s.exporting,
      capture: s.capture?.phase ?? null,
      hasDraft: !!s.draft,
      draftDirty: isDirty(s.draft),
      editing: !!s.editing,
      editDirty: this.editDirty(),
      maskEditing: !!s.capture?.kbd,
      picking: s.picking,
    });
    switch (action) {
      case 'close-dialog':
        if (s.dialog) return this.closeDialog();
        return this.a.cancelExport();
      case 'cancel-capture':
        return this.a.cancelCapture();
      case 'stop-recording':
        return this.a.stopRecording();
      case 'confirm-discard':
      case 'discard-draft':
        return this.a.cancelDraft();
      case 'confirm-discard-edit':
      case 'cancel-edit':
        return this.a.cancelEdit();
      case 'cancel-mask':
        return this.a.maskKeyCancel();
      case 'cancel-pick':
        return this.stopPicking('Picking cancelled.');
      case 'exit':
        return this.requestExit();
      default:
        return undefined;
    }
  }

  /* ---------------- draft ---------------- */

  /** Visible drawer width (full width on narrow windows). */
  drawerWidth() {
    return this.state.collapsed ? 0 : Math.min(decisions.drawerWidth, window.innerWidth);
  }

  /** The part of the window the drawer doesn't cover: the drawer is on the side the reviewer chose. */
  pageBounds() {
    const drawer = this.drawerWidth();
    return this.state.side === 'left' ? { left: drawer, right: window.innerWidth } : { left: 0, right: window.innerWidth - drawer };
  }

  /* ---------------- keyboard picking ---------------- */

  startPicking() {
    const s = this.state;
    s.expanded = null;
    s.picking = true;
    this.pickEl = firstPinnable(this.host);
    this.announcePick();
    this.schedule();
  }

  /** @param {string} [message] */
  stopPicking(message) {
    this.state.picking = false;
    this.state.hover = null;
    this.pickEl = null;
    if (message) this.state.announce = message;
    this.schedule();
  }

  announcePick() {
    const el = this.pickEl;
    if (!el) {
      this.state.announce = 'Nothing on this page can be pinned.';
      return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const text = textFor(el, 50);
    this.state.announce = `${labelFor(el)}${text ? `, “${text}”` : ''}. Enter to pin.`;
  }

  /** @param {KeyboardEvent} e @returns {boolean} handled */
  pickKey(e) {
    const t = /** @type {HTMLElement | undefined} */ (e.composedPath()[0]);
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
    /** @type {Record<string, 'next' | 'prev' | 'parent' | 'child'>} */
    const dirs = { ArrowDown: 'next', ArrowUp: 'prev', ArrowLeft: 'parent', ArrowRight: 'child' };
    if (dirs[e.key]) {
      this.pickEl = stepPinnable(this.pickEl, dirs[e.key], this.host);
      this.announcePick();
      this.schedule();
      return true;
    }
    if (e.key === 'Enter' && this.pickEl && !e.repeat) {
      const r = this.pickEl.getBoundingClientRect();
      this.createDraftAt(this.pickEl, r.left + r.width / 2, r.top + r.height / 2);
      return true;
    }
    return false;
  }

  /** @param {Element} el @param {number} x @param {number} y */
  createDraftAt(el, x, y) {
    if (!this.state.loaded) return;
    this.state.picking = false;
    this.pickEl = null;
    this.state.collapsed = false;
    this.draftEl = el;
    this.state.draft = createDraft(currentPage(), anchorFor(el, x, y));
    this.state.mode = 'create';
    this.state.hover = null;
    this.state.showErrors = false;
    this.state.notice = null;
    this.state.expanded = null;
    this.focusNext = '[aria-pressed]';
    this.schedule();
  }

  discardDraft() {
    this.stopCapture();
    this.revokeDraftUrls();
    this.state.draft = null;
    this.draftEl = null;
    this.state.mode = 'ledger';
    this.state.notice = null;
    this.state.showErrors = false;
    this.focusNext = '.mk-header .mk-btn--primary';
    this.schedule();
  }

  revokeDraftUrls() {
    const ev = this.state.draft?.evidence;
    if (ev) URL.revokeObjectURL(ev.previewUrl);
    const media = this.state.capture?.media;
    if (media) URL.revokeObjectURL(media.previewUrl);
  }

  async save() {
    const s = this.state;
    const d = s.draft;
    if (!d || s.saving || (s.capture && s.capture.phase !== 'ready')) return;
    const errors = validateDraft(d);
    if (Object.keys(errors).length) {
      s.showErrors = true;
      this.focusNext = errors.category ? '[role=radio]' : errors.title ? '#mk-title' : '#mk-desc';
      this.schedule();
      return;
    }
    s.saving = true;
    s.notice = null;
    this.schedule();
    const store = this.platform.storage;
    const blobKey = d.evidence ? `ev:${d.id}` : null;
    try {
      if (d.evidence && blobKey) await store.putBlob(blobKey, d.evidence.blob);
      const entry = entryFromDraft(d, blobKey);
      const next = addEntry(s.session, entry);
      await store.saveSession(SESSION_KEY(), next);
      // Commit to memory only after storage confirms (no premature success or count change).
      s.session = next;
      // A filter for another screen would hide what was just saved.
      if (s.screen && s.screen !== s.path) s.screen = null;
      if (d.evidence) s.previews.set(entry.id, d.evidence.previewUrl);
      if (this.draftEl) this.elCache.set(entry.id, new WeakRef(this.draftEl));
      s.draft = null;
      this.draftEl = null;
      s.mode = 'ledger';
      s.showErrors = false;
      this.toast('success', 'Feedback saved');
      this.focusNext = '.mk-header .mk-btn--primary';
    } catch (err) {
      if (blobKey) store.deleteBlob(blobKey).catch(() => {});
      s.notice = { text: `Couldn't save (${storageReason(err)}). Your draft is still here; try Save again.` };
    } finally {
      s.saving = false;
      this.schedule();
    }
  }

  /* ---------------- capture ---------------- */

  async screenshot() {
    const s = this.state;
    if (!s.draft || (s.capture && s.capture.phase !== 'ready')) return;
    // Retake from review: drop the unkept capture; kept evidence stays until a new one is kept.
    if (s.capture?.media) URL.revokeObjectURL(s.capture.media.previewUrl);
    const token = ++this.captureToken;
    // The injected shell shows Chrome's share prompt first; keep the overlay visible until it's answered.
    s.capture = { phase: this.platform.name === 'injected' ? 'requesting' : 'shooting' };
    s.notice = null;
    s.toast = null;
    this.renderNow();
    const scanner = new MaskScanner(this.host);
    /** @type {import('../media/mask.js').Rect[]} */
    let rects = [];
    let viewportWidth = window.innerWidth;
    /** @type {{ fx: number, fy: number } | null} */
    let pinAt = null;
    const prepare = async () => {
      if (token !== this.captureToken) throw new DOMException('Capture cancelled', 'AbortError');
      s.capture = { phase: 'shooting' };
      s.hidden = true;
      this.renderNow();
      await afterPaint();
      // Measure sensitive areas at the moment of capture; the page doesn't move in between.
      rects = scanner.measure();
      viewportWidth = window.innerWidth;
      const draftPin = this.computePins().find((p) => p.draft && !p.edge);
      pinAt = draftPin ? { fx: draftPin.x / viewportWidth, fy: draftPin.y / window.innerHeight } : null;
    };
    /** @type {Blob | null} */
    let blob = null;
    try {
      blob = await this.platform.captureViewport(prepare);
    } catch (err) {
      if (token === this.captureToken && /** @type {any} */ (err)?.name !== 'AbortError') s.notice = { text: captureMessage(err) };
    } finally {
      if (token === this.captureToken) {
        s.hidden = false;
        s.capture = null;
      }
    }
    if (token !== this.captureToken) return;
    if (blob && s.draft) {
      try {
        const shot = await maskedScreenshot(blob, rects, viewportWidth, decisions.screenshotMaxWidth);
        blob = null; // drop the unmasked capture
        /** @type {PendingMedia} */
        const media = { kind: 'screenshot', ...shot, manual: [], blob: new Blob(), previewUrl: '', pin: pinAt };
        media.blob = await renderPending(media);
        media.previewUrl = URL.createObjectURL(media.blob);
        s.capture = { phase: 'ready', media };
        s.announce = `Screenshot captured. ${media.autoMasked} ${media.autoMasked === 1 ? 'area' : 'areas'} masked automatically. Review it, then Keep.`;
        this.focusNext = '.mk-capture .mk-btn--primary';
      } catch (err) {
        s.notice = { text: `Couldn't use that screenshot (${/** @type {Error} */ (err).message}). Your draft is unchanged.` };
      }
    }
    this.schedule();
  }

  /** Opens the system file picker. Any file type is accepted; the size limit is checked when it's chosen. */
  upload() {
    const s = this.state;
    if (!s.draft || !this.root || (s.capture && s.capture.phase !== 'ready')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) this.attachFile(file);
    });
    input.addEventListener('cancel', () => input.remove());
    this.root.append(input);
    input.click();
  }

  /** @param {File} file */
  async attachFile(file) {
    const s = this.state;
    const d = s.draft;
    if (!d) return;
    if (file.size === 0) {
      s.notice = { text: `${file.name} is empty. Choose another file.` };
      this.schedule();
      return;
    }
    if (file.size > decisions.maxEvidenceBytes) {
      s.notice = { text: `${file.name} is ${(file.size / 1048576).toFixed(1)} MB, over the ${decisions.maxEvidenceBytes / 1048576} MB limit. Choose a smaller file.` };
      this.schedule();
      return;
    }
    const mime = file.type || 'application/octet-stream';
    let width = 0;
    let height = 0;
    if (mime.startsWith('image/')) {
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        // SVG and other non-raster images have no pixel size; the file is still kept.
      }
    }
    // The draft may have been closed while the file was read.
    if (s.draft !== d) return;
    if (d.evidence) URL.revokeObjectURL(d.evidence.previewUrl);
    d.evidence = {
      kind: 'upload',
      name: file.name,
      mime,
      width,
      height,
      bytes: file.size,
      capturedAt: new Date().toISOString(),
      masking: { auto: 0, manual: 0, rules: 'none' },
      blob: file,
      previewUrl: URL.createObjectURL(file),
    };
    s.announce = `${file.name} attached. Uploaded files are not masked; check them before saving.`;
    this.focusNext = d.category ? null : '[role=radio]';
    this.schedule();
  }

  removeUpload() {
    const d = this.state.draft;
    if (!d?.evidence || d.evidence.kind !== 'upload') return;
    URL.revokeObjectURL(d.evidence.previewUrl);
    d.evidence = null;
    this.focusNext = '[aria-pressed]';
    this.schedule();
  }

  async video() {
    const s = this.state;
    if (!s.draft || (s.capture && s.capture.phase !== 'ready')) return;
    // Retake: drop the unkept capture; kept evidence stays until a new one is kept.
    if (s.capture?.media) URL.revokeObjectURL(s.capture.media.previewUrl);
    const token = ++this.captureToken;
    s.capture = { phase: 'requesting' };
    s.notice = null;
    this.renderNow();
    /** @type {MediaStream} */
    let stream;
    try {
      stream = await this.platform.requestTabStream();
    } catch (err) {
      if (token !== this.captureToken) return;
      s.capture = null;
      s.notice = { text: captureMessage(err) };
      this.schedule();
      return;
    }
    if (token !== this.captureToken) {
      // Cancelled while the prompt was open.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (this.state.capture?.phase === 'countdown') this.a.cancelCapture();
      else if (this.state.capture?.phase === 'recording') this.a.stopRecording();
    });
    s.capture = { phase: 'countdown', count: decisions.countdownSeconds };
    this.schedule();
    this.countdownTimer = window.setInterval(() => {
      const c = this.state.capture;
      if (!c || c.phase !== 'countdown') return clearInterval(this.countdownTimer);
      c.count = (c.count ?? 1) - 1;
      if (c.count <= 0) {
        clearInterval(this.countdownTimer);
        this.record(stream);
      }
      this.schedule();
    }, 1000);
  }

  /** @param {MediaStream} stream */
  async record(stream) {
    const s = this.state;
    s.capture = { phase: 'recording', elapsed: 0 };
    s.toast = null;
    this.schedule();
    const scanner = new MaskScanner(this.host);
    const recorder = new ClipRecorder(stream, {
      fps: decisions.gifFps,
      maxWidth: decisions.gifMaxWidth,
      maxMs: decisions.maxClipSeconds * 1000,
      // Leave the drawer out of the clip; the rest of Markly's chrome is hidden while recording.
      crop: () => {
        const { left, right } = this.pageBounds();
        return { x: left, y: 0, width: Math.max(1, right - left), height: window.innerHeight };
      },
      masks: () => scanner.rectsForFrame(),
      onTick: (elapsed) => {
        if (this.state.capture?.phase === 'recording') {
          this.state.capture.elapsed = elapsed;
          this.schedule();
        }
      },
    });
    this.recorder = recorder;
    try {
      const clip = await recorder.start();
      if (clip.blob.size > decisions.maxEvidenceBytes) {
        s.capture = null;
        s.notice = { text: `That clip is ${(clip.blob.size / 1048576).toFixed(1)} MB, over the ${decisions.maxEvidenceBytes / 1048576} MB limit. Record a shorter clip.` };
      } else {
        s.capture = {
          phase: 'ready',
          media: {
            kind: 'gif',
            width: clip.width,
            height: clip.height,
            autoMasked: clip.autoMasked,
            manual: [],
            blob: clip.blob,
            baseBlob: clip.blob,
            previewUrl: URL.createObjectURL(clip.blob),
            indexed: clip.indexed,
            delayMs: clip.delayMs,
            durationMs: clip.durationMs,
            frames: clip.frames,
          },
        };
        s.announce = `Clip ready, ${Math.round(clip.durationMs / 1000)} seconds. ${clip.autoMasked} ${clip.autoMasked === 1 ? 'area' : 'areas'} masked automatically. Review it, then Keep.`;
        this.focusNext = '.mk-capture .mk-btn--primary';
      }
    } catch (err) {
      s.capture = null;
      if (/** @type {any} */ (err)?.name !== 'AbortError') {
        s.notice = { text: `Couldn't make the GIF (${/** @type {Error} */ (err).message}). Your draft is unchanged.` };
      }
    } finally {
      this.recorder = null;
      this.stream = null;
      this.schedule();
    }
  }

  stopCapture() {
    this.captureToken++;
    this.state.hidden = false;
    clearInterval(this.countdownTimer);
    this.recorder?.cancel();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /* ---------------- misc ---------------- */

  /** @param {'success' | 'info' | 'error'} kind @param {string} text */
  toast(kind, text) {
    clearTimeout(this.toastTimer);
    this.state.toast = { id: Date.now(), kind, text };
    this.toastTimer = window.setTimeout(() => {
      this.state.toast = null;
      this.schedule();
    }, 3500);
  }

  /**
   * @param {NonNullable<AppState['dialog']>} d
   * @param {string} [returnTo] selector to focus on Cancel; defaults to whatever had focus
   */
  openDialog(d, returnTo) {
    this.returnFocus = /** @type {HTMLElement | null} */ (this.root?.activeElement ?? null);
    this.returnSel = returnTo ?? null;
    this.state.dialog = d;
    this.focusNext = '[data-autofocus]';
    this.schedule();
  }

  closeDialog() {
    this.state.dialog = null;
    const back = this.returnFocus;
    this.returnFocus = null;
    if (this.returnSel) this.focusNext = this.returnSel;
    else if (back?.isConnected) requestAnimationFrame(() => back.focus());
    this.returnSel = null;
    this.schedule();
  }

  persistReviewer() {
    this.reviewerTimer = 0;
    this.platform.storage.saveSession(SESSION_KEY(), this.state.session).catch((err) => {
      this.toast('error', `Couldn't save your name (${storageReason(err)}).`);
      this.schedule();
    });
  }

  /** @param {string} id */
  async loadPreview(id) {
    const s = this.state;
    const e = s.session.entries.find((x) => x.id === id);
    if (!e?.evidence?.blobKey || s.previews.has(id)) return;
    try {
      const blob = await this.platform.storage.getBlob(e.evidence.blobKey);
      if (blob) s.previews.set(id, URL.createObjectURL(blob));
    } catch {
      // Preview is optional; metadata still shows what's attached.
    }
    this.schedule();
  }

  /** @param {string} id */
  showEvidenceTab(id) {
    const i = this.state.session.entries.findIndex((x) => x.id === id);
    const e = this.state.session.entries[i];
    if (!e) return;
    openEvidenceTab(this.platform.storage, e, i + 1).then((result) => {
      if (result === 'blocked') this.state.notice = { text: 'Your browser blocked the new tab. Allow pop-ups for this site and try again.' };
      if (result === 'missing') this.state.notice = { text: 'That evidence is missing from storage.' };
      this.schedule();
    });
  }

  /* ---------------- manage saved entries (D4) ---------------- */

  editDirty() {
    const ed = this.state.editing;
    const e = ed && this.state.session.entries.find((x) => x.id === ed.id);
    return !!(ed && e && isEditDirty(e, ed.copy));
  }

  /** @param {string} id */
  numberOf(id) {
    return this.state.session.entries.findIndex((e) => e.id === id) + 1;
  }

  /**
   * Run `then` once any edit in progress is resolved: clean edits close silently, dirty edits ask
   * first. Closing never implies saving (PRD-11).
   * @param {() => void} then
   */
  guardEdit(then) {
    const ed = this.state.editing;
    if (!ed) return then();
    if (!this.editDirty()) {
      this.state.editing = null;
      return then();
    }
    this.openDialog({
      title: `Discard changes to entry ${this.numberOf(ed.id)}?`,
      body: 'Your edits will be lost. The saved version stays as it was.',
      confirm: 'Discard changes',
      onConfirm: () => {
        this.state.editing = null;
        then();
      },
    }, '#mk-e-title');
  }

  /** @param {string} id */
  startEdit(id) {
    this.guardEdit(() => {
      const e = this.state.session.entries.find((x) => x.id === id);
      if (!e) return;
      this.state.editing = { id, copy: editableFields(e), showErrors: false, saving: false };
      this.state.expanded = id;
      this.loadPreview(id);
      this.focusNext = '#mk-e-title';
      this.schedule();
    });
  }

  async saveEdit() {
    const s = this.state;
    const ed = s.editing;
    if (!ed || ed.saving) return;
    const errors = validateDraft(ed.copy);
    if (Object.keys(errors).length) {
      ed.showErrors = true;
      this.focusNext = errors.category ? '[data-ecat][aria-checked="true"], [data-ecat]' : errors.title ? '#mk-e-title' : '#mk-e-desc';
      this.schedule();
      return;
    }
    const id = ed.id;
    if (!this.editDirty()) {
      s.editing = null;
      this.focusNext = `[data-entry="${id}"] [data-action="edit"]`;
      this.schedule();
      return;
    }
    ed.saving = true;
    this.schedule();
    try {
      const next = updateEntry(s.session, id, ed.copy);
      await this.platform.storage.saveSession(SESSION_KEY(), next);
      s.session = next;
      s.editing = null;
      this.toast('success', 'Feedback updated');
      this.focusNext = `[data-entry="${id}"] [data-action="edit"]`;
    } catch (err) {
      ed.saving = false;
      this.toast('error', `Couldn't save changes (${storageReason(err)}). Your edits are still here.`);
    }
    this.schedule();
  }

  /** @param {string} id */
  requestDelete(id) {
    const e = this.state.session.entries.find((x) => x.id === id);
    if (!e || this.state.editing) return;
    this.openDialog({
      title: `Delete entry ${this.numberOf(id)}?`,
      body: `“${e.title}”${e.evidence ? ' and its evidence' : ''} will be removed from this ledger. This can’t be undone.`,
      confirm: 'Delete',
      onConfirm: () => this.deleteNow(id),
    }, `[data-entry="${id}"] [data-action="delete"]`);
  }

  /** @param {string} id */
  async deleteNow(id) {
    const s = this.state;
    const e = s.session.entries.find((x) => x.id === id);
    if (!e) return;
    const shownBefore = groupByScreen(visibleEntries(s.session.entries, s.filters, s.screen), s.path).flatMap((g) => g.entries);
    const at = shownBefore.findIndex((x) => x.id === id);
    const next = deleteEntry(s.session, id);
    try {
      await this.platform.storage.saveSession(SESSION_KEY(), next);
    } catch (err) {
      this.toast('error', `Couldn't delete (${storageReason(err)}). Nothing was removed.`);
      this.schedule();
      return;
    }
    s.session = next;
    if (e.evidence?.blobKey) this.platform.storage.deleteBlob(e.evidence.blobKey).catch(() => {});
    const url = s.previews.get(id);
    if (url) URL.revokeObjectURL(url);
    s.previews.delete(id);
    this.elCache.delete(id);
    if (s.expanded === id) s.expanded = null;
    // Focus the row that took its place, else the one above, else Add.
    const remaining = shownBefore.filter((x) => x.id !== id);
    const neighbour = remaining[Math.min(at, remaining.length - 1)];
    this.focusNext = neighbour ? `[data-entry="${neighbour.id}"] .mk-item-toggle` : '.mk-header .mk-btn--primary';
    this.toast('success', 'Feedback deleted');
    this.schedule();
  }

  /** @param {string} id @param {-1 | 1} dir */
  async move(id, dir) {
    const s = this.state;
    if (s.editing) return;
    const next = moveEntry(s.session, id, dir, s.filters);
    if (next === s.session) return;
    try {
      await this.platform.storage.saveSession(SESSION_KEY(), next);
    } catch (err) {
      this.toast('error', `Couldn't reorder (${storageReason(err)}).`);
      this.schedule();
      return;
    }
    s.session = next;
    const n = this.numberOf(id);
    s.announce = `Moved to position ${n} of ${next.entries.length}.`;
    // Re-inserting the row drops focus; put it back on the same control (or its sibling at an end).
    const here = dir < 0 ? 'up' : 'down';
    const there = dir < 0 ? 'down' : 'up';
    this.focusNext = `[data-entry="${id}"] [data-action="${here}"]:not([disabled]), [data-entry="${id}"] [data-action="${there}"]`;
    this.schedule();
  }

  /**
   * Drag handle pressed. The drawer, not the handle, holds the pointer: rows move in the DOM while the
   * list previews the new order, and a moved node would lose the capture.
   * @param {string} id @param {PointerEvent} ev
   */
  dragStart(id, ev) {
    const s = this.state;
    if (ev.button !== 0 || s.editing || s.drag || !this.root) return;
    const drawer = /** @type {HTMLElement | null} */ (this.root.querySelector('.mk-drawer'));
    const row = /** @type {HTMLElement} */ (ev.currentTarget).closest('.mk-item');
    if (!drawer || !row) return;
    ev.preventDefault(); // no text selection while dragging
    const r = row.getBoundingClientRect();
    s.drag = { id, target: null, moved: false, startY: ev.clientY, y: ev.clientY, offset: ev.clientY - r.top, left: r.left, width: r.width };
    try {
      drawer.setPointerCapture(ev.pointerId);
    } catch {
      // Pointer already gone: the listeners below still end the drag on the next pointerup.
    }
    const move = (/** @type {PointerEvent} */ e) => this.dragMove(e);
    const up = () => this.dragEnd();
    const cancel = () => this.dragCancel();
    drawer.addEventListener('pointermove', move);
    drawer.addEventListener('pointerup', up);
    drawer.addEventListener('pointercancel', cancel);
    drawer.addEventListener('lostpointercapture', cancel);
    this.dragOff = () => {
      drawer.removeEventListener('pointermove', move);
      drawer.removeEventListener('pointerup', up);
      drawer.removeEventListener('pointercancel', cancel);
      drawer.removeEventListener('lostpointercapture', cancel);
      if (drawer.hasPointerCapture(ev.pointerId)) drawer.releasePointerCapture(ev.pointerId);
    };
    this.schedule();
  }

  /**
   * The drop point is the row the pointer is above (its top half), or after the last row.
   * Rows are measured at their layout position (offsetTop), so the shifting animation can't make the target flicker.
   * @param {PointerEvent} ev
   */
  dragMove(ev) {
    const s = this.state;
    const d = s.drag;
    if (!d || !this.root) return;
    d.y = ev.clientY;
    if (!d.moved && Math.abs(d.y - d.startY) < 4) return; // a press, not a drag yet
    d.moved = true;
    const body = /** @type {HTMLElement | null} */ (this.root.querySelector('.mk-body'));
    if (!body) return;
    // Near the top or bottom edge, scroll the list so far rows can be reached.
    const b = body.getBoundingClientRect();
    if (d.y < b.top + 40) body.scrollTop -= 14;
    else if (d.y > b.bottom - 40) body.scrollTop += 14;
    // Only rows on the dragged entry's screen are drop targets; the dragged row is the placeholder.
    const screen = /** @type {HTMLElement | null} */ (this.root.querySelector(`[data-entry="${d.id}"]`))?.dataset.screen;
    const rows = /** @type {HTMLElement[]} */ ([...this.root.querySelectorAll('.mk-item[data-entry]')]).filter(
      (r) => r.dataset.screen === screen && r.dataset.entry !== d.id,
    );
    const top = b.top - body.scrollTop;
    /** @type {{ id: string, after: boolean } | null} */
    let target = null;
    for (const row of rows) {
      if (d.y < top + row.offsetTop + row.offsetHeight / 2) {
        target = { id: row.dataset.entry ?? '', after: false };
        break;
      }
    }
    const last = rows.at(-1);
    target ??= last ? { id: last.dataset.entry ?? '', after: true } : null;
    const moves = !!target && reorderEntry(s.session, d.id, target.id, target.after) !== s.session;
    d.target = moves ? target : null;
    this.schedule();
  }

  /** Commit the drop if it changed the order. Save first, like move(). */
  async dragEnd() {
    const s = this.state;
    const d = s.drag;
    if (!d) return;
    this.dragOff();
    s.drag = null;
    this.settle = true;
    const next = d.target ? reorderEntry(s.session, d.id, d.target.id, d.target.after) : s.session;
    if (next === s.session) {
      this.schedule();
      return;
    }
    // Show the new order straight away (it is what the preview showed); undo it if storage fails.
    const before = s.session;
    s.session = next;
    this.renderNow();
    try {
      await this.platform.storage.saveSession(SESSION_KEY(), next);
    } catch (err) {
      if (s.session === next) s.session = before;
      this.settle = true;
      this.toast('error', `Couldn't reorder (${storageReason(err)}). The order is unchanged.`);
      this.schedule();
      return;
    }
    s.announce = `Moved to position ${this.numberOf(d.id)} of ${next.entries.length}.`;
    this.focusNext = `[data-entry="${d.id}"] .mk-item-toggle`;
    this.schedule();
  }

  dragCancel() {
    if (!this.state.drag) return;
    this.dragOff();
    this.state.drag = null;
    this.settle = true; // rows glide back to where they were
    this.schedule();
  }

  /** Row positions before a render, for the shifting animation. @returns {Map<string, number> | null} */
  rowTops() {
    if (!this.root || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const tops = new Map();
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (this.root.querySelectorAll('.mk-item[data-entry]'))) {
      tops.set(row.dataset.entry, row.getBoundingClientRect().top);
    }
    return tops;
  }

  /** Slide rows from where they were to where they are now (FLIP). @param {Map<string, number>} before */
  slideRows(before) {
    if (!this.root) return;
    for (const row of /** @type {NodeListOf<HTMLElement>} */ (this.root.querySelectorAll('.mk-item[data-entry]'))) {
      const was = before.get(row.dataset.entry);
      if (was == null) continue;
      const dy = was - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  }

  /**
   * Pointer position on the review preview, in image pixels.
   * @param {PointerEvent} e @param {PendingMedia} m
   */
  imagePoint(e, m) {
    const img = /** @type {Element} */ (e.currentTarget).querySelector('img');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const clamp = (/** @type {number} */ v, /** @type {number} */ max) => Math.min(max, Math.max(0, v));
    return { x: clamp(((e.clientX - r.left) / r.width) * m.width, m.width), y: clamp(((e.clientY - r.top) / r.height) * m.height, m.height) };
  }

  async rerenderPending() {
    const c = this.state.capture;
    const m = c?.media;
    if (!c || !m) return;
    c.rendering = true;
    this.schedule();
    try {
      const blob = await renderPending(m);
      if (this.state.capture?.media !== m) return; // discarded meanwhile
      URL.revokeObjectURL(m.previewUrl);
      m.blob = blob;
      m.previewUrl = URL.createObjectURL(blob);
      this.state.announce = `${m.manual.length} manual ${m.manual.length === 1 ? 'mask' : 'masks'} applied.`;
    } catch (err) {
      this.state.notice = { text: `Couldn't apply the mask (${/** @type {Error} */ (err).message}).` };
    } finally {
      c.rendering = false;
      this.schedule();
    }
  }

  /* ---------------- export (D5) ---------------- */

  scope() {
    return exportScope(this.state.session, this.state.filters, new Date(), location.origin);
  }

  async runExport() {
    const s = this.state;
    const ex = s.exporting;
    if (!ex || ex.busy) return;
    const scope = this.scope();
    const spec = FORMATS.find((f) => f.id === ex.format);
    ex.tried = true;
    if (!scope.entries.length) return;
    if (spec?.media && scope.hasMedia && decisions.requireMediaReview && !ex.reviewed) {
      this.focusNext = '#mk-x-reviewed';
      this.schedule();
      return;
    }
    ex.busy = true;
    ex.error = null;
    this.schedule();
    try {
      const file = await buildExport(ex.format, scope, this.platform.storage);
      download(file, /** @type {ShadowRoot} */ (this.root));
      s.exporting = null;
      // Confirms the file was produced; Markly never submits anywhere (PRD §11).
      this.toast('success', `${spec?.label} exported · ${file.filename}`);
      this.focusNext = '.mk-footer .mk-btn--primary';
    } catch (err) {
      ex.busy = false;
      ex.error = `Export failed (${/** @type {Error} */ (err).message}). Your ledger is unchanged; try again or pick another format.`;
    }
    this.schedule();
  }

  actions() {
    const s = () => this.state;
    return {
      /** @param {Element | null} _el */
      drawerRef: (_el) => {},
      /** Add starts the keyboard picker; clicking an element still works as before. */
      add: () => this.guardEdit(() => (s().picking ? this.stopPicking('Picking cancelled.') : this.startPicking())),
      exit: () => this.requestExit(),
      /** @param {string} id */
      openEvidenceTab: (id) => this.showEvidenceTab(id),
      /** @param {string} name */
      setReviewer: (name) => {
        s().session = setReviewer(s().session, name);
        clearTimeout(this.reviewerTimer);
        this.reviewerTimer = window.setTimeout(() => this.persistReviewer(), 400);
        this.schedule();
      },
      /** @param {Category} c */
      toggleFilter: (c) => {
        const f = new Set(s().filters);
        f.has(c) ? f.delete(c) : f.add(c);
        s().filters = f;
        this.schedule();
      },
      clearFilters: () => {
        s().filters = new Set();
        s().screen = null;
        this.schedule();
      },
      /** Another screen opens that page, filtered to it; this screen or all screens just filter. @param {string | null} screen */
      setScreen: (screen) => {
        if (screen && screen !== s().path) {
          const back = s().screen;
          s().screen = screen;
          this.guardEdit(() => this.goTo(screen, { screen, open: null }));
          // Cancelled (unsaved edit kept): put the dropdown back.
          if (s().editing) s().screen = back;
          this.schedule();
          return;
        }
        s().screen = screen;
        this.schedule();
      },
      openExport: () =>
        this.guardEdit(() => {
          if (!s().session.entries.length) return;
          this.returnFocus = /** @type {HTMLElement | null} */ (this.root?.activeElement ?? null);
          s().exporting = { format: 'pdf', reviewed: false, busy: false, error: null, tried: false };
          this.focusNext = 'input[name="mk-format"]:checked';
          this.schedule();
        }),
      /** @param {import('../export/run.js').ExportFormat} format */
      setExportFormat: (format) => {
        const ex = s().exporting;
        if (!ex || ex.busy) return;
        ex.format = format;
        ex.error = null;
        this.schedule();
      },
      /** @param {boolean} v */
      setReviewed: (v) => {
        const ex = s().exporting;
        if (!ex) return;
        ex.reviewed = v;
        this.schedule();
      },
      cancelExport: () => {
        if (!s().exporting || s().exporting?.busy) return;
        s().exporting = null;
        this.focusNext = '.mk-footer .mk-btn--primary';
        this.schedule();
      },
      runExport: () => this.runExport(),
      /** Narrow windows only: hide the drawer to use the page, then bring it back. */
      collapse: () => {
        s().collapsed = true;
        s().expanded = null;
        this.focusNext = '.mk-fab';
        this.schedule();
      },
      reopen: () => {
        s().collapsed = false;
        this.focusNext = '.mk-header .mk-btn--primary';
        this.schedule();
      },
      /** @param {string} id */
      toggleEntry: (id) =>
        this.guardEdit(() => {
          // An entry from another screen opens that screen, with the entry shown there.
          const e = s().session.entries.find((x) => x.id === id);
          if (e && screenOf(e) !== s().path) {
            this.goTo(screenOf(e), { screen: s().screen, open: id });
            return;
          }
          s().expanded = s().expanded === id ? null : id;
          if (s().expanded) this.loadPreview(id);
          this.schedule();
        }),
      /** Pin click: show that entry, expanded in place, without centring it (PRD S4). @param {string} id */
      openEntry: (id) => {
        const st = s();
        if (st.mode === 'create') return;
        if (st.editing && st.editing.id !== id) return this.guardEdit(() => this.a.openEntry(id));
        st.expanded = id;
        if (st.filters.size && !st.filters.has(/** @type {Category} */ (st.session.entries.find((e) => e.id === id)?.category))) {
          st.filters = new Set();
        }
        // Pins are on this screen; a filter for another screen would hide the entry.
        if (st.screen && st.screen !== st.path) st.screen = null;
        this.loadPreview(id);
        const target = this.elCache.get(id)?.deref();
        if (target?.isConnected) {
          const r = target.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) target.scrollIntoView({ block: 'nearest' });
        }
        this.renderNow();
        const row = /** @type {HTMLElement | null} */ (this.root?.querySelector(`[data-entry="${id}"]`));
        row?.scrollIntoView({ block: 'nearest' });
        /** @type {HTMLElement | null | undefined} */ (row?.querySelector('.mk-item-toggle'))?.focus({ preventScroll: true });
      },
      cancelDraft: () => {
        if (isDirty(s().draft) && decisions.confirmDiscard) {
          this.openDialog({
            title: `Discard feedback ${s().session.entries.length + 1}?`,
            body: 'The evidence and text in this draft will be lost. Saved feedback is not affected.',
            confirm: 'Discard',
            onConfirm: () => this.discardDraft(),
          }, '.mk-body [aria-pressed], .mk-body [role=radio]');
        } else {
          this.discardDraft();
        }
      },
      /** Arrow keys move between category radios. @param {KeyboardEvent} e */
      categoryKeys: (e) => {
        const d = s().draft;
        if (!d || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const i = d.category ? CATEGORIES.indexOf(d.category) : 0;
        const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        const next = CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length];
        d.category = next;
        this.focusNext = `[data-cat="${next}"]`;
        this.schedule();
      },
      /** @param {Category} c */
      setCategory: (c) => {
        const d = s().draft;
        if (!d) return;
        const first = !d.category;
        d.category = c;
        if (first) this.focusNext = '#mk-title';
        this.schedule();
      },
      /** @param {'title' | 'description' | 'priority'} field @param {any} value */
      setField: (field, value) => {
        const d = s().draft;
        if (!d) return;
        d[field] = value;
        this.schedule();
      },
      save: () => this.save(),
      screenshot: () => this.screenshot(),
      video: () => this.video(),
      upload: () => this.upload(),
      removeUpload: () => this.removeUpload(),
      skipEvidence: () => {
        const d = s().draft;
        if (!d) return;
        d.evidenceSkipped = true;
        this.focusNext = '[role=radio]';
        this.schedule();
      },
      cancelCapture: () => {
        const c = s().capture;
        if (!c) return;
        if (c.media) URL.revokeObjectURL(c.media.previewUrl);
        this.stopCapture();
        s().capture = null;
        this.focusNext = '[aria-pressed]';
        this.schedule();
      },
      stopRecording: () => {
        const c = s().capture;
        if (c?.phase !== 'recording') return;
        s().capture = { phase: 'processing' };
        this.recorder?.stop();
        this.schedule();
      },
      keepMedia: () => {
        const st = s();
        const m = st.capture?.media;
        if (!m || !st.draft || st.capture?.rendering) return;
        if (m.blob.size > decisions.maxEvidenceBytes) {
          st.notice = { text: `That ${m.kind === 'gif' ? 'clip' : 'screenshot'} is ${(m.blob.size / 1048576).toFixed(1)} MB, over the ${decisions.maxEvidenceBytes / 1048576} MB limit. Retake it smaller.` };
          this.schedule();
          return;
        }
        if (st.draft.evidence) URL.revokeObjectURL(st.draft.evidence.previewUrl);
        if (m.baseBlob && m.baseBlob !== m.blob) m.baseBlob = undefined;
        st.draft.evidence = {
          kind: m.kind,
          mime: m.kind === 'gif' ? 'image/gif' : 'image/png',
          width: m.width,
          height: m.height,
          bytes: m.blob.size,
          ...(m.kind === 'gif' ? { durationMs: m.durationMs, frames: m.frames } : {}),
          ...(m.pin ? { pin: m.pin } : {}),
          capturedAt: new Date().toISOString(),
          masking: { auto: m.autoMasked, manual: m.manual.length, rules: MASK_RULES_VERSION },
          blob: m.blob,
          previewUrl: m.previewUrl,
        };
        st.capture = null;
        this.focusNext = st.draft.category ? null : '[role=radio]';
        this.schedule();
      },
      /** Manual masks: drag on the review preview. Coordinates are image pixels. @param {PointerEvent} e */
      maskDown: (e) => {
        const c = s().capture;
        if (c?.phase !== 'ready' || !c.media || c.rendering || e.button !== 0) return;
        const p = this.imagePoint(e, c.media);
        if (!p) return;
        e.preventDefault();
        /** @type {Element} */ (e.currentTarget).setPointerCapture(e.pointerId);
        c.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        this.schedule();
      },
      /** @param {PointerEvent} e */
      maskMove: (e) => {
        const c = s().capture;
        if (!c?.drag || !c.media) return;
        const p = this.imagePoint(e, c.media);
        if (!p) return;
        c.drag.x1 = p.x;
        c.drag.y1 = p.y;
        this.schedule();
      },
      /** @param {PointerEvent} _e */
      maskUp: async (_e) => {
        const c = s().capture;
        const d = c?.drag;
        if (!c || !d || !c.media) return;
        c.drag = null;
        const r = { x: Math.round(Math.min(d.x0, d.x1)), y: Math.round(Math.min(d.y0, d.y1)), width: Math.round(Math.abs(d.x1 - d.x0)), height: Math.round(Math.abs(d.y1 - d.y0)) };
        if (r.width < 4 || r.height < 4) return this.schedule();
        c.media.manual = [...c.media.manual, r];
        await this.rerenderPending();
      },
      /**
       * Keyboard masking on the focused preview: Enter places a box (or applies it), arrows move it,
       * Shift+arrows resize it. Esc is handled globally (cancel-mask).
       * @param {KeyboardEvent} e
       */
      maskKeys: async (e) => {
        const c = s().capture;
        const m = c?.media;
        if (!c || !m || c.rendering) return;
        const stepX = Math.max(2, Math.round(m.width * 0.02));
        const stepY = Math.max(2, Math.round(m.height * 0.02));
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!c.kbd) {
            c.kbd = { x: Math.round(m.width * 0.4), y: Math.round(m.height * 0.42), width: Math.round(m.width * 0.2), height: Math.round(m.height * 0.16) };
            s().announce = 'Mask placed in the centre. Arrow keys move it, Shift plus arrow keys resize it, Enter applies, Escape cancels.';
            this.schedule();
            return;
          }
          const r = c.kbd;
          c.kbd = null;
          m.manual = [...m.manual, r];
          await this.rerenderPending();
          return;
        }
        if (!c.kbd || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const r = { ...c.kbd };
        const dx = e.key === 'ArrowLeft' ? -stepX : e.key === 'ArrowRight' ? stepX : 0;
        const dy = e.key === 'ArrowUp' ? -stepY : e.key === 'ArrowDown' ? stepY : 0;
        if (e.shiftKey) {
          r.width = Math.max(stepX, Math.min(m.width - r.x, r.width + dx));
          r.height = Math.max(stepY, Math.min(m.height - r.y, r.height + dy));
        } else {
          r.x = Math.max(0, Math.min(m.width - r.width, r.x + dx));
          r.y = Math.max(0, Math.min(m.height - r.height, r.y + dy));
        }
        c.kbd = r;
        this.schedule();
      },
      maskKeyCancel: () => {
        const c = s().capture;
        if (!c?.kbd) return;
        c.kbd = null;
        s().announce = 'Mask cancelled.';
        this.schedule();
      },
      undoMask: async () => {
        const c = s().capture;
        if (!c?.media?.manual.length || c.rendering) return;
        c.media.manual = c.media.manual.slice(0, -1);
        await this.rerenderPending();
      },
      /** @param {string} id */
      startEdit: (id) => this.startEdit(id),
      /** @param {'category' | 'title' | 'description' | 'priority'} field @param {any} value */
      setEditField: (field, value) => {
        const ed = s().editing;
        if (!ed) return;
        /** @type {any} */ (ed.copy)[field] = value;
        this.schedule();
      },
      /** Arrow keys move between category radios in the edit form. @param {KeyboardEvent} e */
      editCategoryKeys: (e) => {
        const ed = s().editing;
        if (!ed || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const i = CATEGORIES.indexOf(ed.copy.category);
        const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        ed.copy.category = CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length];
        this.focusNext = `[data-ecat="${ed.copy.category}"]`;
        this.schedule();
      },
      saveEdit: () => this.saveEdit(),
      cancelEdit: () => {
        const ed = s().editing;
        if (!ed) return;
        const id = ed.id;
        this.guardEdit(() => {
          this.focusNext = `[data-entry="${id}"] [data-action="edit"]`;
          this.schedule();
        });
      },
      /** @param {string} id */
      requestDelete: (id) => this.requestDelete(id),
      /** @param {string} id @param {-1 | 1} dir */
      move: (id, dir) => this.move(id, dir),
      /** @param {string} id @param {PointerEvent} ev */
      dragStart: (id, ev) => this.dragStart(id, ev),
      /** @param {'left' | 'right'} side */
      setSide: (side) => {
        const st = s();
        if (st.side === side) return;
        st.side = side;
        st.announce = `Panel moved to the ${side} side.`;
        this.schedule();
      },
      closeDialog: () => this.closeDialog(),
      confirmDialog: () => {
        const d = s().dialog;
        s().dialog = null;
        this.returnFocus = null;
        d?.onConfirm();
        this.schedule();
      },
    };
  }
}
