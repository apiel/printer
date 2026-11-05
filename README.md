# Bytecintia Printer (web app)

A small layout tool that prints to a Bluetooth LE thermal printer using Web Bluetooth.
Place text boxes, images and PDF pages anywhere on the page, then print. Everything prints
in black and white. Static site, no backend.

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

- **Connect / Print**: one button at the top right. It says Connect until the printer is
  connected, then Print.
- **Add** (toolbar): a text box (T), an image, a PDF, and on fixed sizes a page. The bin deletes
  the selected item. Esc deselects.
- **Toolbox** (the strip under the toolbar). It shows the tools for what is selected, and is always
  the same height, so the page never jumps:
  - **Nothing selected: the page.** Width, Roll, length and the left and right margins. The page size
    itself is picked in the top bar. Changes apply straight away and are saved.
  - **A text box:** font, size, bold, italic, underline, strikethrough, alignment, lists, undo/redo.
    Pressing a control with the box only selected formats all of its text.
  - **An image or PDF page:** width and height in mm (the lock keeps the proportions), turn left or
    right by 90°, fit to the page width, fit to the whole page.
- **Text box**: click to select, drag to move, drag the corner to resize, double-click (or Enter) to type.
- **Image**: drag to move, drag any corner to resize (the opposite corner stays put). Images are
  dithered to black and white at the size and orientation they are shown. Images can also be pasted or dropped.
- **PDF**: each page becomes an image: stacked on a roll, one per page on a fixed size.
- **Menu** (top left): printer status, cut after page, the rest of the page size settings (name, save as
  new, delete, top and bottom margins, padding, fit roll to its content, reset to the defaults), and the log.
- The document and the page sizes are saved automatically in this browser (local storage).

### Page sizes

Width and length are the paper size. **Margins** are the edge the printer cannot reach: they are not
part of the page and are not printed (a 58 mm roll with 5 mm margins gives a 48 mm page). **Padding**
is the space new items keep from the edge (the faint dashed line).

Everything is measured in printer dots (8 per mm, 203 dpi). Each page is rendered to a bitmap and sent
as a raster image at its own width (padded to a multiple of 8 dots), so set the page size to match your
paper and printer; this printer ignores ESC/POS text.

## Deploy on GitHub Pages

Build with `npm run build` and publish the `dist/` folder, or add a workflow that does it.
`vite.config.js` uses a relative base, so it works under `https://<user>.github.io/<repo>/`.

## Files

- `index.html`, `src/style.css`: layout and styles. `src/icons.js`: the icons.
- `src/main.js`: the app: toolbar and toolboxes, adding items, PDF import, printing, page sizes, menu.
- `src/pages.js`: the pages and items: layout, selection, moving, resizing, turning, editing.
- `src/richtext.js`: formatting commands, fonts and sizes for the text box being edited.
- `src/render.js`: turns a page into a bitmap (html-to-image). `src/bitmap.js`: dithering, turning images, print preparation.
- `src/fonts.js`: the bundled fonts. `src/presets.js`, `src/storage.js`: page sizes and the saved document.
- `src/ble.js`, `src/escpos.js`: Bluetooth connection and the raster print command.
- `src/pdf.js`: PDF import via PDF.js.
