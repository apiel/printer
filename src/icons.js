// Small inline icons (24px grid, drawn with strokes) so buttons can be icon-only.

const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  text: svg('<path d="M5 7V4h14v3M12 4v16M9 20h6"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-9 9"/>'),
  pdf: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><text x="12" y="18" text-anchor="middle" font-size="6.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">PDF</text>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  pagePlus: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
  left: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  justify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  bullets: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  numbers: svg('<path d="M10 6h10M10 12h10M10 18h10"/><text x="1" y="8" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">1</text><text x="1" y="14" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">2</text><text x="1" y="20" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">3</text>'),
  bluetooth: svg('<path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11"/>'),
  printer: svg('<path d="M6 9V3h12v6"/><path d="M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2"/><path d="M6 14h12v7H6z"/>'),
  clearAll: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-1.5"/>'),
  rotateLeft: svg('<path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 102.1-9.4L1 10"/>'),
  rotateRight: svg('<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 11-2.1-9.4L23 10"/>'),
  fitWidth: svg('<path d="M3 5v14M21 5v14M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>'),
  fitPage: svg('<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8"/>'),
  fitHeight: svg('<path d="M5 3h14M5 21h14M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>'),
  // Letters rather than drawings, which read better at this size.
  bold: '<b class="glyph">B</b>',
  italic: '<i class="glyph">I</i>',
  underline: '<u class="glyph">U</u>',
  strike: '<s class="glyph">S</s>',
};

export const icon = (name) => ICONS[name] ?? "";

/** Fill every element that has a data-icon attribute with its icon. */
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon) + (el.dataset.label ? `<span>${el.dataset.label}</span>` : "");
  });
}
