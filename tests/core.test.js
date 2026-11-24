import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, isValid } from '../src/core/validate.js';
import { addEntry, countsByCategory, createDraft, displayNumber, entryFromDraft, isDirty, setReviewer, visibleEntries } from '../src/core/ledger.js';
import { emptySession, typeFor } from '../src/core/model.js';
import { escAction } from '../src/core/keys.js';

const page = { url: 'https://example.test/a', path: '/a', title: 'A' };
const anchor = { selector: 'span.state-pill', label: 'span.state-pill', text: 'Blocked', fx: 0.5, fy: 0.5 };

/** @param {Partial<import('../src/core/model.js').Draft>} over */
function draft(over = {}) {
  return { ...createDraft(page, anchor), category: 'UI', title: 'Pill contrast', description: 'Fails AA', ...over };
}

test('category derives type: Dev is a bug, others are feedback', () => {
  assert.equal(typeFor('Dev'), 'bug');
  for (const c of /** @type {const} */ (['UX', 'UI', 'Content'])) assert.equal(typeFor(c), 'feedback');
});

test('validation requires one category, title and description', () => {
  const d = createDraft(page, anchor);
  assert.deepEqual(Object.keys(validateDraft(d)).sort(), ['category', 'description', 'title']);
  assert.ok(isValid(draft()));
});

test('whitespace-only text counts as empty', () => {
  const errors = validateDraft(draft({ title: '   ', description: '\n\t' }));
  assert.ok(errors.title);
  assert.ok(errors.description);
});

test('priority is optional but must be a listed value when set', () => {
  assert.ok(isValid(draft({ priority: null })));
  assert.ok(isValid(draft({ priority: 'High' })));
  assert.ok(validateDraft(draft({ priority: /** @type {any} */ ('Critical') })).priority);
});

test('entryFromDraft refuses invalid drafts', () => {
  assert.throws(() => entryFromDraft(draft({ title: '' }), null));
});

test('entryFromDraft trims text, derives type and drops in-memory blob fields', () => {
  const blob = new Blob(['x'], { type: 'image/png' });
  const d = draft({
    category: 'Dev',
    title: '  Sort clears filter ',
    evidence: { kind: 'screenshot', mime: 'image/png', width: 10, height: 5, bytes: 1, capturedAt: '2026-10-30T10:00:00.000Z', blob, previewUrl: 'blob:x' },
  });
  const e = entryFromDraft(d, 'ev:1', new Date('2026-10-30T10:01:00Z'));
  assert.equal(e.title, 'Sort clears filter');
  assert.equal(e.type, 'bug');
  assert.equal(e.evidence?.blobKey, 'ev:1');
  assert.ok(!('blob' in /** @type {object} */ (e.evidence)));
  assert.ok(!('previewUrl' in /** @type {object} */ (e.evidence)));
  assert.equal(e.createdAt, '2026-10-30T10:01:00.000Z');
});

test('drafts stay out of the saved ledger until added; saving twice does not duplicate', () => {
  let s = emptySession();
  const d = draft();
  assert.equal(s.entries.length, 0, 'a draft alone does not count');
  const e = entryFromDraft(d, null);
  s = addEntry(s, e);
  const again = addEntry(s, entryFromDraft(d, null));
  assert.equal(again.entries.length, 1);
  assert.equal(again, s, 'second add is a no-op');
});

test('commands return new sessions and leave the input untouched', () => {
  const s0 = emptySession();
  const s1 = setReviewer(s0, 'Participant 1');
  assert.equal(s0.reviewer, '');
  assert.equal(s1.reviewer, 'Participant 1');
});

test('display numbers come from order', () => {
  let s = emptySession();
  const a = entryFromDraft(draft(), null);
  const b = entryFromDraft(draft(), null);
  s = addEntry(addEntry(s, a), b);
  assert.equal(displayNumber(s, a.id), 1);
  assert.equal(displayNumber(s, b.id), 2);
});

test('filters are multi-select, never delete, and empty means all', () => {
  let s = emptySession();
  for (const category of /** @type {const} */ (['UX', 'UI', 'Dev', 'Dev'])) s = addEntry(s, entryFromDraft(draft({ category }), null));
  assert.equal(visibleEntries(s.entries, new Set()).length, 4);
  assert.equal(visibleEntries(s.entries, new Set(['Dev'])).length, 2);
  assert.equal(visibleEntries(s.entries, new Set(['UX', 'Dev'])).length, 3);
  assert.equal(visibleEntries(s.entries, new Set(['Content'])).length, 0);
  assert.equal(s.entries.length, 4);
  assert.deepEqual(countsByCategory(s.entries), { UX: 1, UI: 1, Content: 0, Dev: 2 });
});

test('a draft is dirty once anything is entered', () => {
  const d = createDraft(page, anchor);
  assert.equal(isDirty(d), false);
  assert.equal(isDirty({ ...d, title: ' ' }), false);
  assert.equal(isDirty({ ...d, category: 'UX' }), true);
  assert.equal(isDirty(null), false);
});

test('Esc precedence: dialog > pending capture > recording > draft > exit', () => {
  const base = { dialogOpen: false, capture: null, hasDraft: false, draftDirty: false };
  assert.equal(escAction({ ...base, dialogOpen: true, capture: 'countdown', hasDraft: true }), 'close-dialog');
  assert.equal(escAction({ ...base, capture: 'countdown', hasDraft: true }), 'cancel-capture');
  assert.equal(escAction({ ...base, capture: 'requesting', hasDraft: true }), 'cancel-capture');
  assert.equal(escAction({ ...base, capture: 'recording', hasDraft: true }), 'stop-recording');
  assert.equal(escAction({ ...base, capture: 'processing', hasDraft: true }), 'ignore');
  assert.equal(escAction({ ...base, hasDraft: true, draftDirty: true }), 'confirm-discard');
  assert.equal(escAction({ ...base, hasDraft: true }), 'discard-draft');
  assert.equal(escAction(base), 'exit');
});
