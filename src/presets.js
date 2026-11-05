// Page sizes, all in mm:
//   widthMm / lengthMm  the page you design on (lengthMm null = endless roll)
//   margins             blank space added around the page when printing: the first dot of
//                       the page is printed this far in. Not shown on screen.
//   padding             space new items keep from the page edge (the dashed line)
// So width 210 with a 10 mm left margin prints 10 mm of blank, then the 210 mm page.

import { mmToDots } from "./units.js";

const KEY = "bytecintia.presets.v2";
const V1_KEY = "bytecintia.presets"; // margins used to be taken out of the page

export const pageWidthDots = (p) => mmToDots(p.widthMm);
export const pageLengthMm = (p) => p.lengthMm || null;

const box = (top, right, bottom, left) => ({ top, right, bottom, left });

export const DEFAULT_PRESETS = [
  { id: "roll58", name: "58 mm roll", widthMm: 48, lengthMm: null, margins: box(0, 0, 0, 0), padding: box(2, 1, 2, 2) },
  { id: "roll80", name: "80 mm roll", widthMm: 72, lengthMm: null, margins: box(0, 0, 0, 0), padding: box(2, 1, 2, 2) },
  { id: "a4", name: "A4 page", widthMm: 210, lengthMm: 297, margins: box(0, 0, 0, 0), padding: box(5, 5, 5, 5) },
  { id: "label", name: "Label 50 × 30", widthMm: 50, lengthMm: 30, margins: box(0, 0, 0, 0), padding: box(1, 1, 1, 1) },
];

// Presets saved by earlier versions: first ones without padding (their "margins" were
// placement guides), then ones where the margins were taken out of the width. Keep what
// was printed: the page becomes the old printable area, with no extra margin.
function fromOld(p) {
  let q = p;
  if (!q.padding) q = { ...q, padding: { ...q.margins }, margins: box(0, 0, 0, 0) };
  const m = q.margins;
  return {
    ...q,
    widthMm: Math.max(10, q.widthMm - m.left - m.right),
    lengthMm: q.lengthMm ? Math.max(10, q.lengthMm - m.top - m.bottom) : null,
    margins: box(0, 0, 0, 0),
  };
}

const read = (key) => {
  try {
    const list = JSON.parse(localStorage.getItem(key));
    return Array.isArray(list) && list.length ? list : null;
  } catch {
    return null;
  }
};

export function loadPresets() {
  const current = read(KEY);
  if (current) return current;
  const old = read(V1_KEY);
  if (old) return old.map(fromOld);
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
