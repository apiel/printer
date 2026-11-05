// ESC/POS helpers. This printer ignores text commands but accepts raster images.

export const ESC = 0x1b;
export const GS = 0x1d;

export function concat(...parts) {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export const init = () => [ESC, 0x40];
export const feed = (n) => [ESC, 0x64, Math.max(0, Math.min(255, Math.round(n)))];

// Print density (how dark). Many thermal printers take it as the heating time: ESC 7 n1 n2 n3,
// with n1 = most heating dots at once, n2 = heating time (longer = darker, but slower) and
// n3 = heating interval. Levels 1 to 5 go around the usual default time of 80. If your printer
// uses a different command for density, this is the one place to change.
export const DENSITY_LEVELS = 5;
const HEAT_TIME = [50, 65, 80, 110, 150];
export const density = (level) => [ESC, 0x37, 7, HEAT_TIME[Math.max(1, Math.min(DENSITY_LEVELS, level)) - 1], 2];

/**
 * Pack a black and white canvas into a GS v 0 raster command.
 * Width must be a multiple of 8. Pixels darker than 128 are printed.
 */
export function rasterCommand(canvas) {
  const { width, height } = canvas;
  if (width % 8 !== 0) throw new Error(`Raster width must be a multiple of 8 (got ${width}).`);
  const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const bytesPerRow = width / 8;
  const bits = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4] < 128) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const header = [
    GS, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ];
  return concat(header, bits);
}
