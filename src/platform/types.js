// The platform adapter is the only seam between Markly and its delivery shell (D0 decides which).

/**
 * @typedef {object} PlatformStorage
 * @property {(key: string) => Promise<import('../core/model.js').Session | null>} loadSession
 * @property {(key: string, session: import('../core/model.js').Session) => Promise<void>} saveSession
 * @property {(key: string, blob: Blob) => Promise<void>} putBlob
 * @property {(key: string) => Promise<Blob | null>} getBlob
 * @property {(key: string) => Promise<void>} deleteBlob
 */

/**
 * @typedef {object} Platform
 * @property {'injected' | 'extension'} name
 * @property {PlatformStorage} storage
 * @property {(prepare: () => Promise<void>) => Promise<Blob>} captureViewport
 *   PNG of the visible viewport. Calls `prepare` (which hides the overlay, or throws AbortError if the
 *   reviewer cancelled) after any permission prompt and right before the frame is taken.
 * @property {() => Promise<MediaStream>} requestTabStream
 *   Live stream of the current tab, used for clips. Must be called from a user gesture.
 * @property {(path: string) => string} assetUrl
 *   Absolute URL for a file inside the Markly package (CSS, icons).
 */

export {};
