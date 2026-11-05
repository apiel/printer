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
export const feed = (n) => [ESC, 0x64, n];

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
