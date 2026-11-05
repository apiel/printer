// Page presets, all in mm:
//   widthMm / lengthMm  the paper size (lengthMm null = endless roll)
//   margins             the unprintable edge of the paper. The editor page and the
//                       printed output only cover what is inside the margins.
//   padding             free space kept inside the page when placing new items
//                       (a guide only; it does not limit where you can put things)

const KEY = "bytecintia.presets";

const box = (top, right, bottom, left) => ({ top, right, bottom, left });

export const DEFAULT_PRESETS = [
  { id: "roll58", name: "58 mm roll", widthMm: 58, lengthMm: null, margins: box(0, 5, 0, 5), padding: box(2, 1, 2, 2) },
  { id: "roll80", name: "80 mm roll", widthMm: 80, lengthMm: null, margins: box(0, 4, 0, 4), padding: box(2, 1, 2, 2) },
  { id: "a4", name: "A4 page", widthMm: 210, lengthMm: 297, margins: box(10, 10, 10, 10), padding: box(5, 5, 5, 5) },
  { id: "label", name: "Label 50 × 30", widthMm: 50, lengthMm: 30, margins: box(2, 2, 2, 2), padding: box(1, 1, 1, 1) },
];

// Presets saved by an earlier version had no padding: their "margins" were placement
// guides and widthMm was the printable width. Keep that layout, as padding.
function migrate(p) {
  if (p.padding) return p;
  return { ...p, padding: { ...p.margins }, margins: box(0, 0, 0, 0) };
}

export function loadPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved) && saved.length) return saved.map(migrate);
  } catch {
    // fall through to defaults
  }
  return structuredClone(DEFAULT_PRESETS);
}

export function savePresets(presets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}
