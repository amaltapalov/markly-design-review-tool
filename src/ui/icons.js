// Inline SVG icons (static, trusted strings). All are decorative; controls carry their own labels.
const svg = (/** @type {string} */ body, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  closeSmall: svg('<path d="M7 7l10 10M17 7L7 17"/>', 14),
  image: svg('<rect x="3.5" y="3.5" width="17" height="17"/><circle cx="9" cy="9" r="1.6"/><path d="M20.5 15.5l-5-5L5 21"/>'),
  imageSmall: svg('<rect x="3.5" y="3.5" width="17" height="17"/><circle cx="9" cy="9" r="1.6"/><path d="M20.5 15.5l-5-5L5 21"/>', 18),
  play: svg('<path d="M6 4l14 8-14 8z"/>'),
  playSmall: svg('<path d="M6 4l14 8-14 8z"/>', 18),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>', 18),
  chevronUp: svg('<path d="M6 15l6-6 6 6"/>', 18),
  goTo: svg('<path d="M7 17L17 7M9 7h8v8"/>', 18),
  check: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', 18),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 18),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 18),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', 18),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>', 18),
  /** Shows where the panel sits now: the filled column is the panel. */
  dockRight: svg('<rect x="3.5" y="4.5" width="17" height="15"/><rect x="14.5" y="4.5" width="6" height="15" fill="currentColor"/>', 18),
  dockLeft: svg('<rect x="3.5" y="4.5" width="17" height="15"/><rect x="3.5" y="4.5" width="6" height="15" fill="currentColor"/>', 18),
};
