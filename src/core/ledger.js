// Pure ledger commands. Each returns a new session; nothing here touches storage or the DOM.
import { newId, screenPath, typeFor } from './model.js';
import { validateDraft } from './validate.js';

/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Draft} Draft */
/** @typedef {import('./model.js').Category} Category */

/**
 * @param {import('./model.js').PageContext} page
 * @param {import('./model.js').Anchor} anchor
 * @returns {Draft}
 */
export function createDraft(page, anchor) {
  return {
    id: newId(),
    page,
    anchor,
    category: null,
    title: '',
    description: '',
    priority: null,
    evidence: null,
    evidenceSkipped: false,
  };
}

/** A draft is dirty once the reviewer has put anything into it. @param {Draft | null} draft */
export function isDirty(draft) {
  return !!draft && !!(draft.evidence || draft.category || draft.title.trim() || draft.description.trim() || draft.priority);
}

/**
 * Turn a valid draft into an entry. Throws on invalid input so a caller can't commit by accident.
 * @param {Draft} draft
 * @param {string | null} blobKey  storage key of the committed evidence bytes
 * @param {Date} [now]
 * @returns {Entry}
 */
export function entryFromDraft(draft, blobKey, now = new Date()) {
  const errors = validateDraft(draft);
  if (Object.keys(errors).length) throw new Error(`Draft is invalid: ${Object.values(errors).join(' ')}`);
  const category = /** @type {Category} */ (draft.category);
  const at = now.toISOString();
  /** @type {Entry['evidence']} */
  let evidence = null;
  if (draft.evidence) {
    const { blob: _blob, previewUrl: _url, ...meta } = draft.evidence;
    evidence = { ...meta, blobKey: blobKey ?? undefined };
  }
  return {
    id: draft.id,
    createdAt: at,
    updatedAt: at,
    page: draft.page,
    anchor: draft.anchor,
    category,
    type: typeFor(category),
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
    evidence,
  };
}

/**
 * Append an entry. Saving the same draft twice is a no-op (no duplicate commits).
 * @param {Session} session
 * @param {Entry} entry
 * @returns {Session}
 */
export function addEntry(session, entry) {
  if (session.entries.some((e) => e.id === entry.id)) return session;
  return { ...session, entries: [...session.entries, entry] };
}

/**
 * Editable fields of a saved entry. Identity, anchor, page and evidence don't change on edit.
 * @typedef {Pick<Entry, 'category' | 'title' | 'description' | 'priority'>} EntryFields
 */

/** Working copy for the edit state, so Cancel can restore saved values. @param {Entry} e @returns {EntryFields} */
export function editableFields(e) {
  return { category: e.category, title: e.title, description: e.description, priority: e.priority };
}

/** @param {Entry} e @param {EntryFields} copy */
export function isEditDirty(e, copy) {
  return (
    copy.category !== e.category ||
    copy.title !== e.title ||
    copy.description !== e.description ||
    copy.priority !== e.priority
  );
}

/**
 * Commit an edit. Throws on invalid fields; unknown ids leave the session unchanged.
 * @param {Session} session
 * @param {string} id
 * @param {EntryFields} fields
 * @param {Date} [now]
 * @returns {Session}
 */
export function updateEntry(session, id, fields, now = new Date()) {
  const errors = validateDraft(fields);
  if (Object.keys(errors).length) throw new Error(`Edit is invalid: ${Object.values(errors).join(' ')}`);
  if (!session.entries.some((e) => e.id === id)) return session;
  return {
    ...session,
    entries: session.entries.map((e) =>
      e.id === id
        ? {
            ...e,
            category: fields.category,
            type: typeFor(fields.category),
            title: fields.title.trim(),
            description: fields.description.trim(),
            priority: fields.priority,
            updatedAt: now.toISOString(),
          }
        : e,
    ),
  };
}

/** @param {Session} session @param {string} id @returns {Session} */
export function deleteEntry(session, id) {
  if (!session.entries.some((e) => e.id === id)) return session;
  return { ...session, entries: session.entries.filter((e) => e.id !== id) };
}

/**
 * Swap an entry with its neighbour among the visible entries (plan default for reorder under
 * filters: the move you see is the move you get; hidden entries keep their positions).
 * Identity never changes. Returns the same session when there is no neighbour.
 * @param {Session} session
 * @param {string} id
 * @param {-1 | 1} dir
 * @param {ReadonlySet<Category>} [filters]
 * @returns {Session}
 */
export function moveEntry(session, id, dir, filters = new Set()) {
  // Rows are grouped by screen, so the neighbour is the nearest visible entry on the same screen.
  const self = session.entries.find((e) => e.id === id);
  const visible = self ? visibleEntries(session.entries, filters, screenOf(self)) : [];
  const at = visible.findIndex((e) => e.id === id);
  const other = visible[at + dir];
  if (at < 0 || !other) return session;
  const entries = [...session.entries];
  const i = entries.findIndex((e) => e.id === id);
  const j = entries.findIndex((e) => e.id === other.id);
  [entries[i], entries[j]] = [entries[j], entries[i]];
  return { ...session, entries };
}

/**
 * Drag and drop: place `id` before or after `overId`. Works on the full ledger, so hidden entries keep their places.
 * Drops only land on the same screen: rows are grouped by screen. A drop that leaves the screen's own order as it
 * was is a no-op, so the ledger never changes in a way the grouped list can't show.
 * @param {Session} session @param {string} id @param {string} overId @param {boolean} after
 * @returns {Session}
 */
export function reorderEntry(session, id, overId, after) {
  const entries = [...session.entries];
  const from = entries.findIndex((e) => e.id === id);
  const over = entries.find((e) => e.id === overId);
  if (from < 0 || id === overId || !over || screenOf(over) !== screenOf(entries[from])) return session;
  const [moved] = entries.splice(from, 1);
  const at = entries.findIndex((e) => e.id === overId) + (after ? 1 : 0);
  entries.splice(at, 0, moved);
  const screen = screenOf(moved);
  const order = (/** @type {Entry[]} */ list) => list.filter((e) => screenOf(e) === screen).map((e) => e.id).join('\n');
  return order(entries) === order(session.entries) ? session : { ...session, entries };
}

/** @param {Session} session @param {string} reviewer @returns {Session} */
export function setReviewer(session, reviewer) {
  return { ...session, reviewer };
}

/** 1-based display number from order. @param {Session} session @param {string} id */
export function displayNumber(session, id) {
  return session.entries.findIndex((e) => e.id === id) + 1;
}

/** The screen an entry was taken on. @param {Entry} e */
export function screenOf(e) {
  return screenPath(e.page.path);
}

/**
 * Filtering never changes records. An empty filter shows everything; a null screen means all screens.
 * @param {Entry[]} entries
 * @param {ReadonlySet<Category>} filters
 * @param {string | null} [screen]
 */
export function visibleEntries(entries, filters, screen = null) {
  if (filters.size === 0 && screen == null) return entries;
  return entries.filter((e) => (filters.size === 0 || filters.has(e.category)) && (screen == null || screenOf(e) === screen));
}

/**
 * Screens with feedback: the current one first, then in the order they were first reviewed (earliest entry), so
 * reordering inside a screen never moves the groups. Entries keep ledger order within a screen.
 * @param {Entry[]} entries
 * @param {string} current  screen path of the page being reviewed
 * @returns {{ path: string, title: string, current: boolean, entries: Entry[] }[]}
 */
export function groupByScreen(entries, current) {
  /** @type {Map<string, { path: string, title: string, current: boolean, entries: Entry[], first: string }>} */
  const groups = new Map();
  for (const e of entries) {
    const path = screenOf(e);
    if (!groups.has(path)) groups.set(path, { path, title: e.page.title, current: path === current, entries: [], first: e.createdAt });
    const g = /** @type {NonNullable<ReturnType<typeof groups.get>>} */ (groups.get(path));
    g.entries.push(e);
    if (e.createdAt < g.first) g.first = e.createdAt;
  }
  return [...groups.values()]
    .sort((a, b) => Number(b.current) - Number(a.current) || a.first.localeCompare(b.first) || a.path.localeCompare(b.path))
    .map(({ first: _first, ...g }) => g);
}

/** @param {Entry[]} entries @returns {Record<Category, number>} */
export function countsByCategory(entries) {
  /** @type {Record<Category, number>} */
  const counts = { UX: 0, UI: 0, Content: 0, Dev: 0 };
  for (const e of entries) counts[e.category] += 1;
  return counts;
}
