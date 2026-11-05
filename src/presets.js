// Page presets: the print width, length (null = endless roll) and margins, all in mm.
// widthMm is the printable width, e.g. 48 mm for a 58 mm paper roll.

const KEY = "bytecintia.presets";

export const DEFAULT_PRESETS = [
  { id: "roll58", name: "58 mm roll", widthMm: 48, lengthMm: null, margins: { top: 2, right: 1, bottom: 2, left: 2 } },
  { id: "roll80", name: "80 mm roll", widthMm: 72, lengthMm: null, margins: { top: 2, right: 1, bottom: 2, left: 2 } },
  { id: "a4", name: "A4 page", widthMm: 210, lengthMm: 297, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
  { id: "label", name: "Label 50 × 30", widthMm: 50, lengthMm: 30, margins: { top: 2, right: 2, bottom: 2, left: 2 } },
];

export function loadPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved) && saved.length) return saved;
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
