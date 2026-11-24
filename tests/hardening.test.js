import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escAction } from '../src/core/keys.js';
import { storageReason } from '../src/core/errors.js';

const base = { dialogOpen: false, capture: null, hasDraft: false, draftDirty: false };

test('Esc cancels a keyboard mask before discarding the draft under it', () => {
  assert.equal(escAction({ ...base, capture: 'ready', hasDraft: true, draftDirty: true, maskEditing: true }), 'cancel-mask');
  assert.equal(escAction({ ...base, dialogOpen: true, maskEditing: true }), 'close-dialog');
});

test('Esc cancels keyboard picking instead of exiting review mode', () => {
  assert.equal(escAction({ ...base, picking: true }), 'cancel-pick');
  assert.equal(escAction(base), 'exit');
});

test('storage failures are explained in plain language', () => {
  assert.match(storageReason(new DOMException('x', 'QuotaExceededError')), /storage is full/);
  assert.match(storageReason(new Error('The quota has been exceeded.')), /storage is full/);
  assert.match(storageReason(new DOMException('x', 'InvalidStateError')), /private mode/);
  assert.equal(storageReason(new Error('disk on fire')), 'disk on fire');
  assert.equal(storageReason(undefined), 'unknown storage error');
});
