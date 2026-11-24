import { CATEGORIES, PRIORITIES } from './model.js';

/** @typedef {import('./model.js').Draft} Draft */

/**
 * Field errors for a draft. Whitespace-only text counts as empty.
 * @param {Pick<Draft, 'category' | 'title' | 'description' | 'priority'>} draft
 * @returns {Partial<Record<'category' | 'title' | 'description' | 'priority', string>>}
 */
export function validateDraft(draft) {
  /** @type {Partial<Record<'category' | 'title' | 'description' | 'priority', string>>} */
  const errors = {};
  if (!draft.category || !CATEGORIES.includes(draft.category)) {
    errors.category = 'Choose one category.';
  }
  if (!draft.title.trim()) errors.title = 'Add a title.';
  if (!draft.description.trim()) errors.description = 'Describe what you found.';
  if (draft.priority !== null && !PRIORITIES.includes(draft.priority)) {
    errors.priority = 'Choose a listed priority or leave it unset.';
  }
  return errors;
}

/** @param {Parameters<typeof validateDraft>[0]} draft */
export function isValid(draft) {
  return Object.keys(validateDraft(draft)).length === 0;
}
