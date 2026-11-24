import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, createDraft, deleteEntry, editableFields, entryFromDraft, groupByScreen, isEditDirty, moveEntry, reorderEntry, updateEntry, visibleEntries } from '../src/core/ledger.js';
import { emptySession, screenPath } from '../src/core/model.js';
import { escAction } from '../src/core/keys.js';

const page = { url: 'https://example.test/a', path: '/a', title: 'A' };
const anchor = { selector: 'h1', label: 'h1', text: '', fx: 0.5, fy: 0.5 };

/** @param {import('../src/core/model.js').Category[]} cats */
function ledger(cats) {
  let s = emptySession();
  cats.forEach((category, i) => {
    const d = { ...createDraft(page, anchor), category, title: `T${i + 1}`, description: 'd' };
    s = addEntry(s, entryFromDraft(d, null));
  });
  return s;
}
const ids = (/** @type {import('../src/core/model.js').Session} */ s) => s.entries.map((e) => e.title);

test('edit works on a copy: the saved entry is untouched until updateEntry', () => {
  const s = ledger(['UX']);
  const e = s.entries[0];
  const copy = editableFields(e);
  copy.title = 'Changed';
  assert.equal(e.title, 'T1');
  assert.equal(isEditDirty(e, copy), true);
  assert.equal(isEditDirty(e, editableFields(e)), false);
});

test('updateEntry changes fields, re-derives type, keeps identity, anchor and evidence', () => {
  const s = ledger(['UX', 'UI']);
  const before = s.entries[0];
  const next = updateEntry(s, before.id, { category: 'Dev', title: ' New ', description: 'x', priority: 'High' }, new Date('2026-10-31T00:00:00Z'));
  const after = next.entries[0];
  assert.equal(after.id, before.id);
  assert.equal(after.type, 'bug');
  assert.equal(after.title, 'New');
  assert.equal(after.anchor, before.anchor);
  assert.equal(after.evidence, before.evidence);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.updatedAt, '2026-10-31T00:00:00.000Z');
  assert.equal(next.entries[1], s.entries[1], 'other entries untouched');
});

test('updateEntry rejects invalid edits', () => {
  const s = ledger(['UX']);
  assert.throws(() => updateEntry(s, s.entries[0].id, { category: 'UX', title: '  ', description: 'x', priority: null }));
});

test('delete removes only the intended entry; numbering follows order', () => {
  const s = ledger(['UX', 'UI', 'Dev']);
  const next = deleteEntry(s, s.entries[1].id);
  assert.deepEqual(ids(next), ['T1', 'T3']);
  assert.equal(deleteEntry(s, 'missing'), s);
});

test('move swaps neighbours and keeps identity', () => {
  const s = ledger(['UX', 'UI', 'Dev']);
  const id = s.entries[2].id;
  const up = moveEntry(s, id, -1);
  assert.deepEqual(ids(up), ['T1', 'T3', 'T2']);
  assert.equal(up.entries[1].id, id);
  assert.equal(moveEntry(s, s.entries[0].id, -1), s, 'first cannot move up');
  assert.equal(moveEntry(s, id, 1), s, 'last cannot move down');
});

test('move under a filter swaps with the nearest visible entry and leaves hidden ones in place', () => {
  const s = ledger(['Dev', 'UX', 'Dev', 'UI']);
  const filters = new Set(/** @type {const} */ (['Dev']));
  const next = moveEntry(s, s.entries[2].id, -1, filters);
  assert.deepEqual(ids(next), ['T3', 'T2', 'T1', 'T4']);
});

test('drag drop places the entry before or after the row it lands on, and no-op drops return the same session', () => {
  const s = ledger(['UX', 'UI', 'Dev', 'Content']);
  const [t1, t2, t3, t4] = s.entries.map((e) => e.id);
  assert.deepEqual(ids(reorderEntry(s, t1, t3, false)), ['T2', 'T1', 'T3', 'T4'], 'down, before target');
  assert.deepEqual(ids(reorderEntry(s, t1, t3, true)), ['T2', 'T3', 'T1', 'T4'], 'down, after target');
  assert.deepEqual(ids(reorderEntry(s, t4, t2, false)), ['T1', 'T4', 'T2', 'T3'], 'up, before target');
  assert.deepEqual(ids(reorderEntry(s, t4, t1, true)), ['T1', 'T4', 'T2', 'T3'], 'up, after target');
  assert.equal(reorderEntry(s, t2, t2, true), s, 'dropping on itself');
  assert.equal(reorderEntry(s, t1, t2, false), s, 'dropping right before the next row changes nothing');
  assert.deepEqual(ids(reorderEntry(s, t3, t4, true)), ['T1', 'T2', 'T4', 'T3'], 'last row after itself moves to the end');
  assert.equal(reorderEntry(s, 'missing', t2, false), s, 'unknown dragged id');
  assert.equal(reorderEntry(s, t1, 'missing', false), s, 'unknown target id');
});

/** Entries on several screens: [category, path] pairs. @param {[import('../src/core/model.js').Category, string][]} rows */
function onScreens(rows) {
  let s = emptySession();
  rows.forEach(([category, path], i) => {
    const d = { ...createDraft({ url: `https://example.test${path}`, path, title: path }, anchor), category, title: `T${i + 1}`, description: 'd' };
    s = addEntry(s, entryFromDraft(d, null));
  });
  return s;
}

test('screenPath drops only the review launch parameter', () => {
  assert.equal(screenPath('/demo/?review'), '/demo/');
  assert.equal(screenPath('/demo/'), '/demo/');
  assert.equal(screenPath('/a?tab=2&review'), '/a?tab=2');
  assert.equal(screenPath('/a?tab=2'), '/a?tab=2');
});

test('screen filter combines with category filters; groups put the current screen first', () => {
  const s = onScreens([['Dev', '/b'], ['UX', '/a'], ['Dev', '/a?review'], ['UI', '/c'], ['Dev', '/b']]);
  assert.deepEqual(ids({ ...s, entries: visibleEntries(s.entries, new Set(), '/a') }), ['T2', 'T3']);
  assert.deepEqual(ids({ ...s, entries: visibleEntries(s.entries, new Set(['Dev']), '/b') }), ['T1', 'T5']);
  assert.equal(visibleEntries(s.entries, new Set(), null), s.entries);
  const groups = groupByScreen(s.entries, '/a');
  assert.deepEqual(groups.map((g) => [g.path, g.current, g.entries.map((e) => e.title)]), [
    ['/a', true, ['T2', 'T3']],
    ['/b', false, ['T1', 'T5']],
    ['/c', false, ['T4']],
  ]);
});

test('move and drag stay within the entry’s screen', () => {
  const s = onScreens([['Dev', '/a'], ['UX', '/b'], ['UI', '/a']]);
  const [t1, t2, t3] = s.entries.map((e) => e.id);
  assert.deepEqual(ids(moveEntry(s, t3, -1)), ['T3', 'T2', 'T1'], 'swaps with T1 across the other screen’s entry');
  assert.equal(moveEntry(s, t2, -1), s, 'only entry on its screen cannot move');
  assert.equal(reorderEntry(s, t1, t2, true), s, 'cannot drop onto another screen');
  assert.deepEqual(ids(reorderEntry(s, t1, t3, true)), ['T2', 'T3', 'T1']);
  assert.equal(reorderEntry(s, t1, t3, false), s, 'hopping only another screen’s entry changes nothing on this screen');
});

test('screen groups keep their order while entries are reordered inside one', () => {
  const s = onScreens([['Dev', '/a'], ['UX', '/b'], ['UI', '/a']]);
  const [t1, , t3] = s.entries.map((e) => e.id);
  const before = groupByScreen(s.entries, '/x').map((g) => g.path);
  const after = groupByScreen(reorderEntry(s, t1, t3, true).entries, '/x').map((g) => g.path);
  assert.deepEqual(before, ['/a', '/b']);
  assert.deepEqual(after, before);
});

test('Esc while editing cancels the edit, asking first when dirty; drafts take precedence', () => {
  const base = { dialogOpen: false, capture: null, hasDraft: false, draftDirty: false };
  assert.equal(escAction({ ...base, editing: true, editDirty: false }), 'cancel-edit');
  assert.equal(escAction({ ...base, editing: true, editDirty: true }), 'confirm-discard-edit');
  assert.equal(escAction({ ...base, dialogOpen: true, editing: true, editDirty: true }), 'close-dialog');
});
