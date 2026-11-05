// Turn a page (its own DOM) into a bitmap, so what is printed is exactly what the
// browser lays out: text, fonts and the baked images.

import { toCanvas } from "html-to-image";

export async function renderPage(pageEl) {
  await document.fonts.ready; // fonts chosen a moment ago may still be loading
  return toCanvas(pageEl, {
    pixelRatio: 1,
    backgroundColor: "#ffffff",
    width: pageEl.offsetWidth,
    height: pageEl.offsetHeight,
  });
}
