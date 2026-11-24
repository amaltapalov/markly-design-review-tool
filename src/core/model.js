// Markly ledger data model, schema v0. Conceptual contract from PRD §6; not a final schema.

export const SCHEMA_VERSION = 0;

/** @typedef {'UX' | 'UI' | 'Content' | 'Dev'} Category */
/** @typedef {'bug' | 'feedback'} EntryType */
/** @typedef {'High' | 'Medium' | 'Low'} Priority */

/** @type {readonly Category[]} */
export const CATEGORIES = Object.freeze(['UX', 'UI', 'Content', 'Dev']);

/** @type {readonly Priority[]} */
export const PRIORITIES = Object.freeze(['High', 'Medium', 'Low']);

/**
 * Where a finding is anchored. The stored anchor is independent of where the pin renders (PRD-02).
 * @typedef {object} Anchor
 * @property {string} selector  CSS path that re-finds the element
 * @property {string} label     short "tag.class" label shown as "Inspected …"
 * @property {string} text      trimmed visible text of the element, may be empty
 * @property {number} fx        click position within the element box, 0..1
 * @property {number} fy
 */

/**
 * @typedef {object} PageContext
 * @property {string} url
 * @property {string} path      pathname + search, used to decide which pins render on this page
 * @property {string} title
 */

/**
 * Metadata for an attachment. The bytes live in storage under `blobKey`.
 * @typedef {object} Evidence
 * @property {'screenshot' | 'gif'} kind
 * @property {string} mime
 * @property {number} width
 * @property {number} height
 * @property {number} bytes
 * @property {string} capturedAt   ISO timestamp
 * @property {number} [durationMs] clips only
 * @property {number} [frames]     clips only
 * @property {string} [blobKey]    set once committed to storage
 * @property {{ auto: number, manual: number, rules: string }} [masking]
 *   areas painted over before storage: automatic (fields and patterns) and drawn by the reviewer
 */

/**
 * A committed ledger entry. Display number is its position in `entries`, not stored.
 * @typedef {object} Entry
 * @property {string} id
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {PageContext} page
 * @property {Anchor} anchor
 * @property {Category} category
 * @property {EntryType} type
 * @property {string} title
 * @property {string} description
 * @property {Priority | null} priority
 * @property {Evidence | null} evidence
 */

/**
 * Work in progress. Never counted, filtered or exported until saved.
 * @typedef {object} Draft
 * @property {string} id
 * @property {PageContext} page
 * @property {Anchor} anchor
 * @property {Category | null} category
 * @property {string} title
 * @property {string} description
 * @property {Priority | null} priority
 * @property {(Evidence & { blob: Blob, previewUrl: string }) | null} evidence
 * @property {boolean} evidenceSkipped
 */

/**
 * @typedef {object} Session
 * @property {number} schema
 * @property {string} reviewer
 * @property {Entry[]} entries
 */

/** Category derives type; Dev means bug (DEC-02/06). @param {Category} category @returns {EntryType} */
export function typeFor(category) {
  return category === 'Dev' ? 'bug' : 'feedback';
}

/** @returns {string} */
export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The screen a path belongs to: Markly's own `review` launch parameter isn't part of it,
 * so `/a?review` and `/a` are the same screen.
 * @param {string} path  pathname + search
 */
export function screenPath(path) {
  const at = path.indexOf('?');
  if (at < 0) return path;
  const params = new URLSearchParams(path.slice(at + 1));
  params.delete('review');
  const query = params.toString();
  return query ? `${path.slice(0, at)}?${query}` : path.slice(0, at);
}

/** @returns {Session} */
export function emptySession() {
  return { schema: SCHEMA_VERSION, reviewer: '', entries: [] };
}
