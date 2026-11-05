// Fonts available in the editor. The web fonts are bundled with the app (open source,
// latin subset), so the printout looks the same on any device.

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/merriweather/latin-400.css";
import "@fontsource/merriweather/latin-700.css";
import "@fontsource/roboto-mono/latin-400.css";
import "@fontsource/roboto-mono/latin-700.css";
import "@fontsource/oswald/latin-400.css";
import "@fontsource/oswald/latin-700.css";
import "@fontsource/special-elite/latin-400.css";
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-700.css";
import "@fontsource/lobster/latin-400.css";
import "@fontsource/bebas-neue/latin-400.css";

export const FONTS = [
  { label: "Monospace", family: "monospace" },
  { label: "Inter", family: "Inter, sans-serif" },
  { label: "Merriweather", family: "Merriweather, serif" },
  { label: "Roboto Mono", family: "'Roboto Mono', monospace" },
  { label: "Oswald", family: "Oswald, sans-serif" },
  { label: "Bebas Neue", family: "'Bebas Neue', sans-serif" },
  { label: "Special Elite", family: "'Special Elite', monospace" },
  { label: "Caveat", family: "Caveat, cursive" },
  { label: "Lobster", family: "Lobster, cursive" },
];

// Sizes are in printer dots (about 8 per mm).
export const SIZES = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 68, 80, 96];
export const DEFAULT_SIZE = 26;

/** The FONTS entry for a computed font-family value, or null. */
export function matchFont(computedFamily) {
  const first = computedFamily.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  return FONTS.find((f) => f.family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase() === first) ?? null;
}
