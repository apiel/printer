// Page layout and rendering. The editor preview and the printed output come from
// the same renderer, so what you see is what prints.

import { mmToDots } from "./units.js";

export const TEXT_DEFAULT = 26; // dots
const LINE_FACTOR = 1.3;
const measureCtx = document.createElement("canvas").getContext("2d");

export function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export const pageWidthDots = (preset) => mmToDots(preset.widthMm);
export const contentWidthDots = (preset) =>
  mmToDots(preset.widthMm - preset.margins.left - preset.margins.right);

// ---- item geometry --------------------------------------------------------

export function layoutText(item) {
  const size = item.size || TEXT_DEFAULT;
  const font = `${item.bold ? "bold " : ""}${size}px monospace`;
  measureCtx.font = font;
  const lineHeight = Math.round(size * LINE_FACTOR);
  const lines = [];
  for (const paragraph of (item.text ?? "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measureCtx.measureText(candidate).width <= item.w) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return { font, lineHeight, lines, height: lines.length * lineHeight };
}

export function itemHeight(item) {
  if (item.type === "text") return layoutText(item).height;
  if (item.type === "image") return item.h;
  return item.thickness;
}

export const itemBox = (item) => ({ x: item.x, y: item.y, w: item.w, h: Math.max(itemHeight(item), 4) });

// Fixed pages have a set length. Rolls grow to fit their content (plus the bottom
// margin), but never get shorter than page.minLength.
export function pageHeightDots(preset, page) {
  if (preset.lengthMm) return mmToDots(preset.lengthMm);
  let bottom = 0;
  for (const it of page.items) bottom = Math.max(bottom, it.y + itemHeight(it));
  return Math.max(page.minLength, bottom + mmToDots(preset.margins.bottom));
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
export async function renderPage(doc, preset, pageIndex) {
  const page = doc.pages[pageIndex];
  const width = pageWidthDots(preset);
  const height = pageHeightDots(preset, page);
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";

  for (const item of page.items) {
    if (item.type === "text") {
      const layout = layoutText(item);
      const align = item.align ?? 0;
      ctx.font = layout.font;
      ctx.textBaseline = "top";
      ctx.textAlign = ["left", "center", "right"][align];
      const x = align === 1 ? item.x + item.w / 2 : align === 2 ? item.x + item.w : item.x;
      layout.lines.forEach((line, i) => ctx.fillText(line, x, item.y + i * layout.lineHeight));
    } else if (item.type === "line") {
      ctx.fillRect(item.x, item.y, item.w, item.thickness);
    } else if (item.type === "image") {
      ctx.drawImage(await ditheredImage(item), item.x, item.y, item.w, item.h);
    }
  }
  return canvas;
}

/**
 * Prepare a rendered page for the printer: scale it to the printer head width
 * (e.g. 384 dots) and convert it to black and white.
 */
export function toPrintBitmap(pageCanvas, headDots) {
  if (pageCanvas.width === headDots) return toBlackWhite(pageCanvas, false);
  const scaled = newCanvas(headDots, (pageCanvas.height * headDots) / pageCanvas.width);
  const ctx = scaled.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(pageCanvas, 0, 0, scaled.width, scaled.height);
  return toBlackWhite(scaled, true);
}
