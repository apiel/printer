// Canvas and bitmap helpers: black and white conversion, image preparation, and
// getting a page ready for the printer.

export function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Convert a canvas to pure black/white. With dither = true, uses Floyd-Steinberg.
 * With keepAlpha = true, pixels that are mostly transparent stay transparent.
 */
export function toBlackWhite(src, dither, keepAlpha = false) {
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
      const p = i * 4;
      if (keepAlpha && data[p + 3] < 128) continue; // stays fully transparent
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
      o[p] = o[p + 1] = o[p + 2] = v;
      o[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Prepare a rendered page for the printer: pure black and white, as wide as the page.
 * The printer needs a width that is a multiple of 8 dots, so the page is padded with
 * white on the right when it is not.
 */
export function toPrintBitmap(pageCanvas) {
  const width = Math.ceil(pageCanvas.width / 8) * 8;
  if (width === pageCanvas.width) return toBlackWhite(pageCanvas, false);
  const padded = newCanvas(width, pageCanvas.height);
  const ctx = padded.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, padded.width, padded.height);
  ctx.drawImage(pageCanvas, 0, 0);
  return toBlackWhite(padded, false);
}

// ---- images ---------------------------------------------------------------
// An image item keeps its original (a grey JPEG) and a "baked" copy: the original
// scaled to its size, rotated, and dithered to black and white. The baked copy is
// what is shown and printed, so the editor shows what the printer will produce.

const imageCache = new Map();

export function loadImage(src) {
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

/** Read an image file onto a white canvas, shrunk to at most maxWidth. */
export async function fileToCanvas(file, maxWidth) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const c = newCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

export const canvasToJpeg = (canvas) => canvas.toDataURL("image/jpeg", 0.85);

/**
 * Scale the original to w × h, rotate it by angleDeg, and dither it. Returns the
 * baked image and the size of its bounding box (bigger than w × h when rotated).
 * The corners outside the rotated picture are transparent.
 */
export async function bakeImage(orig, w, h, angleDeg) {
  const img = await loadImage(orig);
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const bw = Math.max(1, Math.round(w * cos + h * sin));
  const bh = Math.max(1, Math.round(w * sin + h * cos));
  const c = newCanvas(bw, bh);
  const ctx = c.getContext("2d");
  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(a);
  ctx.fillStyle = "#fff"; // paper under the picture, so see-through images print solid
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const baked = toBlackWhite(c, true, true);
  return { src: baked.toDataURL("image/png"), bw: baked.width, bh: baked.height };
}
