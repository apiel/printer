// ESC/POS helpers. Each function returns bytes (arrays or Uint8Array).
// Most cheap thermal printers understand this set of commands.

export const ESC = 0x1b;
export const GS = 0x1d;

export function concat(...parts) {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** Reset printer to defaults. */
export const init = () => [ESC, 0x40];

/** Text as bytes. Printers usually handle plain ASCII best. */
export const text = (str) => new TextEncoder().encode(str);

/** 0 = left, 1 = center, 2 = right. */
export const align = (n) => [ESC, 0x61, n];

export const bold = (on) => [ESC, 0x45, on ? 1 : 0];

/** Feed n blank lines. */
export const feed = (n) => [ESC, 0x64, n];

/** Partial cut (ignored by printers without a cutter). */
export const cut = () => [GS, 0x56, 0x42, 0x00];

/**
 * Convert an image (ImageBitmap, HTMLImageElement, canvas...) into an
 * ESC/POS raster command (GS v 0). Uses Floyd-Steinberg dithering.
 * width must be a multiple of 8: 384 for 58 mm paper, 576 for 80 mm.
 * left/right are margins in pixels; the image is scaled to fit between them.
 */
export function imageToRaster(img, width = 384, left = 0, right = 0) {
  const contentWidth = width - left - right;
  const height = Math.round((img.height * contentWidth) / img.width);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height); // transparent pixels become white
  ctx.drawImage(img, left, 0, contentWidth, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  // Greyscale values we can push error into while dithering.
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }

  const bytesPerRow = width / 8;
  const bits = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const value = old < 128 ? 0 : 255;
      const err = old - value;
      if (value === 0) {
        // 1 bit = black on ESC/POS
        bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += err / 16;
      }
    }
  }

  const header = [
    GS, 0x76, 0x30, 0x00, // GS v 0 : print raster bit image, normal mode
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ];
  return concat(header, bits);
}
