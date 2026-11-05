// The document model, saved in the browser so it is still there at next start.
//
// doc  = { presetId, pages: [page, ...] }
// page = { minLength (dots, used by rolls), items: [item, ...] }
// item = { id, type: "text" | "image" | "line", x, y, w, ...type specific }
//   text:  text, size, bold, align (0 left, 1 center, 2 right)
//   image: h, src (black and white PNG data URL)
//   line:  thickness

import { mmToDots, ROLL_MIN_MM } from "./units.js";

const KEY = "bytecintia.doc";

export const newPage = () => ({ items: [], minLength: mmToDots(ROLL_MIN_MM) });
export const newDocument = (presetId) => ({ presetId, pages: [newPage()] });

export function loadDocument() {
  try {
    const doc = JSON.parse(localStorage.getItem(KEY));
    if (doc && Array.isArray(doc.pages) && doc.pages.length) return doc;
  } catch {
    // ignore, start fresh
  }
  return null;
}

export function saveDocument(doc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
