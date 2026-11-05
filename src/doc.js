// The document model, saved in the browser so it is still there at next start.
//
// doc  = { presetId, pages: [page, ...] }
// page = { minLength (dots, used by rolls), items: [item, ...] }
// item = { id, type: "text" | "image" | "line", x, y, w, ...type specific }
//   text:  blocks: [{ text, size, bold, align (0 left, 1 center, 2 right), list (null | "bullet" | "number") }]
//   image: h, src (black and white PNG data URL)
//   line:  thickness

import { mmToDots, ROLL_MIN_MM, TEXT_DEFAULT } from "./units.js";

const KEY = "bytecintia.doc";

export const newPage = () => ({ items: [], minLength: mmToDots(ROLL_MIN_MM) });
export const newDocument = (presetId) => ({ presetId, pages: [newPage()] });

// Older documents stored a text item as one string with one style. Convert them
// to paragraphs (blocks).
function migrate(doc) {
  for (const page of doc.pages) {
    for (const it of page.items) {
      if (it.type !== "text" || it.blocks) continue;
      it.blocks = String(it.text ?? "").split("\n").map((text) => ({
        text,
        size: it.size || TEXT_DEFAULT,
        bold: !!it.bold,
        align: it.align || 0,
        list: null,
      }));
      delete it.text;
      delete it.size;
      delete it.bold;
      delete it.align;
    }
  }
  return doc;
}

export function loadDocument() {
  try {
    const doc = JSON.parse(localStorage.getItem(KEY));
    if (doc && Array.isArray(doc.pages) && doc.pages.length) return migrate(doc);
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
