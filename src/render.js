// Page layout and rendering. The editor preview and the printed output come from
// the same renderer, so what you see is what prints.

import { mmToDots, TEXT_DEFAULT } from "./units.js";

export const LINE_FACTOR = 1.3; // line height as a multiple of the text size
export const LIST_INDENT = 1.4; // list indent as a multiple of the text size
const measureCtx = document.createElement("canvas").getContext("2d");

export function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// The page is the printable area: the paper minus its unprintable margins.
export const printableWidthMm = (p) => Math.max(1, p.widthMm - p.margins.left - p.margins.right);
export const printableLengthMm = (p) =>
  p.lengthMm ? Math.max(1, p.lengthMm - p.margins.top - p.margins.bottom) : null;

export const pageWidthDots = (p) => mmToDots(printableWidthMm(p));
// Width available for new items: the page minus its padding.
export const contentWidthDots = (p) =>
  Math.max(8, mmToDots(printableWidthMm(p) - p.padding.left - p.padding.right));

// ---- item geometry --------------------------------------------------------

// Word-wrap one paragraph (measureCtx.font must already be set).
function wrap(paragraph, available) {
  const out = [];
  let line = "";
  for (const word of paragraph.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measureCtx.measureText(candidate).width <= available) {
      line = candidate;
    } else {
      out.push(line);
      line = word;
    }
  }
  out.push(line);
  return out;
}

/**
 * Lay out a text item. item.blocks is a list of paragraphs:
 *   { text, size, bold, align (0 left, 1 center, 2 right), list: null | "bullet" | "number" }
 * Returns one entry per printed line, plus the total height.
 */
export function layoutText(item) {
  const lines = [];
  let number = 0;
  for (const block of item.blocks) {
    const size = block.size || TEXT_DEFAULT;
    const font = `${block.bold ? "bold " : ""}${size}px monospace`;
    const lineHeight = Math.round(size * LINE_FACTOR);
    const indent = block.list ? Math.round(size * LIST_INDENT) : 0;
    if (block.list === "number") number += 1;
    else number = 0;
    const marker = block.list === "bullet" ? "•" : block.list === "number" ? `${number}.` : "";

    measureCtx.font = font;
    let first = true;
    for (const paragraph of (block.text ?? "").split("\n")) {
      for (const text of wrap(paragraph, Math.max(1, item.w - indent))) {
        lines.push({ text, font, lineHeight, indent, align: block.align ?? 0, marker: first ? marker : "" });
        first = false;
      }
    }
  }
  return { lines, height: lines.reduce((h, l) => h + l.lineHeight, 0) };
}

export function itemHeight(item) {
  if (item.type === "text") return layoutText(item).height;
  if (item.type === "image") return item.h;
  return item.thickness;
}

export const itemBox = (item) => ({ x: item.x, y: item.y, w: item.w, h: Math.max(itemHeight(item), 4) });

// Fixed pages have a set printable length. Rolls grow to fit their content (plus the
// bottom padding), but never get shorter than page.minLength.
export function pageHeightDots(preset, page) {
  if (preset.lengthMm) return mmToDots(printableLengthMm(preset));
  let bottom = 0;
  for (const it of page.items) bottom = Math.max(bottom, it.y + itemHeight(it));
  return Math.max(8, page.minLength, bottom + mmToDots(preset.padding.bottom));
}

// ---- black and white conversion -------------------------------------------

/** Convert a canvas to pure black/white. With dither = true, uses Floyd-Steinberg. */
export function toBlackWhite(src, dither) {
  const { width: w, height: h } = src;
  const data = src.getContext("2d").getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  const out = newCanvas(w, h);
  const octx = out.getContext("2d");
  const img = octx.createImageData(w, h);
  const o = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const v = old < 128 ? 0 : 255;
      if (dither) {
        const err = old - v;
        if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) gray[i + w - 1] += (err * 3) / 16;
          gray[i + w] += (err * 5) / 16;
          if (x + 1 < w) gray[i + w + 1] += err / 16;
        }
      }
      const p = i * 4;
      o[p] = o[p + 1] = o[p + 2] = v;
      o[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export const canvasToDataUrl = (canvas, dither) => toBlackWhite(canvas, dither).toDataURL("image/png");

/** Read an image file, shrink it to at most maxWidth, and store it as 1-bit black and white. */
export async function imageFileToDataUrl(file, maxWidth) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const c = newCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const bw = toBlackWhite(c, true);
  return { src: bw.toDataURL("image/png"), width: bw.width, height: bw.height };
}

// ---- images ---------------------------------------------------------------

const imageCache = new Map(); // src -> Promise<HTMLImageElement>
const ditherCache = new Map(); // item id -> { src, w, h, canvas }

function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

async function ditheredImage(item) {
  const hit = ditherCache.get(item.id);
  if (hit && hit.src === item.src && hit.w === item.w && hit.h === item.h) return hit.canvas;
  const img = await loadImage(item.src);
  const c = newCanvas(item.w, item.h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const canvas = toBlackWhite(c, true);
  ditherCache.set(item.id, { src: item.src, w: item.w, h: item.h, canvas });
  return canvas;
}

// ---- rendering ------------------------------------------------------------

/** Draw one page at full resolution (1 dot = 1 pixel). Returns an opaque canvas. */
export async function renderPage(doc, preset, pageIndex, hideId = null) {
  const page = doc.pages[pageIndex];
  const width = pageWidthDots(preset);
  const height = pageHeightDots(preset, page);
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";

  for (const item of page.items) {
    if (item.id === hideId) continue; // being edited on screen right now
    if (item.type === "text") {
      let y = item.y;
      ctx.textBaseline = "top";
      for (const line of layoutText(item).lines) {
        const available = item.w - line.indent;
        ctx.font = line.font;
        if (line.marker) {
          ctx.textAlign = "left";
          ctx.fillText(line.marker, item.x, y);
        }
        ctx.textAlign = ["left", "center", "right"][line.align];
        const x = line.align === 1 ? item.x + line.indent + available / 2
          : line.align === 2 ? item.x + item.w
          : item.x + line.indent;
        ctx.fillText(line.text, x, y);
        y += line.lineHeight;
      }
    } else if (item.type === "line") {
      ctx.fillRect(item.x, item.y, item.w, item.thickness);
    } else if (item.type === "image") {
      ctx.drawImage(await ditheredImage(item), item.x, item.y, item.w, item.h);
    }
  }
  return canvas;
}

/**
 * Prepare a rendered page for the printer, whose head is headDots wide (e.g. 384):
 * a page as wide as the head prints as is, a narrower one prints at real size,
 * centred, and a wider one is scaled down to fit.
 */
export function toPrintBitmap(pageCanvas, headDots) {
  if (pageCanvas.width === headDots) return toBlackWhite(pageCanvas, false);
  if (pageCanvas.width < headDots) {
    const padded = newCanvas(headDots, pageCanvas.height);
    const pctx = padded.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, padded.width, padded.height);
    pctx.drawImage(pageCanvas, Math.floor((headDots - pageCanvas.width) / 2), 0);
    return toBlackWhite(padded, false);
  }
  const scaled = newCanvas(headDots, (pageCanvas.height * headDots) / pageCanvas.width);
  const ctx = scaled.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(pageCanvas, 0, 0, scaled.width, scaled.height);
  return toBlackWhite(scaled, true);
}
