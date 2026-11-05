import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base "./" makes the built app work under a GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) as well as at the root.
export default defineConfig({
  base: "./",
  plugins: [
    // Makes the app installable and lets it open offline: a manifest plus a service worker
    // that caches every file of the build (and refreshes the cache on each deploy).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Thermal Printer",
        short_name: "Printer",
        description: "Lay out text, images and PDFs and print them on a Bluetooth thermal printer.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#dcdce1",
        theme_color: "#2563eb",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // woff2 only: every browser that can install the app reads it, and the older woff
        // copies would only double the download.
        globPatterns: ["**/*.{js,mjs,css,html,woff2,png,svg}"],
        // The PDF.js worker is about 2 MB; it has to be cached for PDF import to work offline.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
