# Bytecintia Printer (web app)

A small page editor that prints black and white text, images, lines and PDFs to a
Bluetooth LE thermal printer using Web Bluetooth. Static site, no backend.

## Requirements

- Chrome or Edge on Android, Windows, macOS, or Linux.
  iPhone Safari does **not** support Web Bluetooth.
- The page must be served over HTTPS or from `localhost`.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Using it

- **Page** menu: pick a page size (rolls grow with content, fixed pages have a set length).
  Sizes and margins are edited in the **Page sizes** panel and saved in the browser.
- Toolbar: add text, add an image, draw a line (drag on the page), import a PDF.
- Click an item to move it, drag its corner to resize, and edit it in the side panel.
- Rolls: drag the bar under the page to set the minimum length.
- Fixed pages: use **+ Page** to add more.
- Your document and page sizes are saved automatically in this browser (local storage).

Everything is measured in printer dots (8 per mm, 203 dpi). The page is drawn as a
black and white bitmap and sent as a raster image; this printer ignores ESC/POS text.
Pages wider than the printer head (384 dots on a 58 mm printer) are scaled to fit.

## Deploy on GitHub Pages

Build with `npm run build` and publish the `dist/` folder, or add a workflow that does it.
`vite.config.js` uses a relative base, so it works under `https://<user>.github.io/<repo>/`.

## Files

- `index.html`, `src/style.css`: layout and styles.
- `src/main.js`: the editor (toolbar, page interaction, inspector, presets, printing).
- `src/render.js`: layout, rendering, dithering; shared by preview and print.
- `src/doc.js`, `src/presets.js`: document model and page size presets, saved to local storage.
- `src/ble.js`, `src/escpos.js`: Bluetooth connection and the raster print command.
- `src/pdf.js`: PDF import via PDF.js.
