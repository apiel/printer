# Thermal Printer (web app)

A small layout tool that prints to a Bluetooth LE thermal printer using Web Bluetooth.
Place text boxes, images and PDF pages anywhere on the page, then print. Everything prints
in black and white. Static site, no backend.

## Requirements

- Chrome or Edge on Android, Windows, macOS, or Linux.
  iPhone Safari does **not** support Web Bluetooth.
- The page must be served over HTTPS or from `localhost`.

## Install it as an app

The site is a PWA. In Chrome or Edge (Android, Windows, macOS, Linux) use the install button in the address
bar, or the browser menu → **Install app** / **Add to Home screen**. It then opens in its own window with its
own icon, and it works offline: after the first visit everything (fonts, PDF import, printing over Bluetooth)
is cached, and updates arrive by themselves on the next visit after a new deploy.

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
    itself is picked in the top bar. Changes apply straight away and are saved. (All the page size
    values, including the top and bottom margins and the padding, are in the menu too, and the two stay in sync.)
  - **A text box:** font, size, bold, italic, underline, strikethrough, alignment, lists, undo/redo.
    Pressing a control with the box only selected formats all of its text.
  - **An image or PDF page:** width and height in mm (the lock keeps the proportions), turn left or
    right by 90°, fit to the page width, fit to the whole page.
- **Text box**: click to select, drag to move, drag the corner to resize, double-click (or Enter) to type.
- **Image**: drag to move, drag any corner to resize (the opposite corner stays put). Images are
  dithered to black and white at the size and orientation they are shown. Images can also be pasted or dropped.
- **PDF**: each page becomes an image: stacked on a roll, one per page on a fixed size.
- **Menu** (top left): every page size value (name, save as new, delete, width, roll, length, margins,
  padding, fit roll to its content, reset to the defaults), printer status, and the log.
- The document and the page sizes are saved automatically in this browser (local storage).

### Page sizes

**Width** and **length** are the page you design on, exactly as typed. **Margins** are blank space
printed around the page, so printing starts that far in: with a width of 210 and a left margin of 10,
the first dot of the page is printed 10 mm from the edge, and the print is 210 + margins wide. Margins
are not shown on screen. **Padding** is the space new items keep from the page edge (the faint dashed line).

**The page follows its content.** After anything is added, moved, resized, edited or deleted, the page
becomes as long as its content needs: empty space under it goes, and it grows to include anything moved
out of bounds. A length you set by hand (typing it, or dragging a roll's end, which can cut content off)
applies once; the next change hands control back to the automatic fit. With several pages the length is
shared and is only ever made longer.

Everything is measured in printer dots (8 per mm, 203 dpi). Each page is rendered to a bitmap, the
margins are added around it, and it is sent as a raster image (padded to a multiple of 8 dots wide), so
match the width and margins to your paper and printer; this printer ignores ESC/POS text.

## Deploy on GitHub Pages

The site is published by a GitHub Actions workflow (`.github/workflows/pages.yml`): every push to
`main` builds it and deploys it to GitHub Pages. To publish your own copy, fork or push this repo to
GitHub, then in **Settings → Pages** set **Source** to **GitHub Actions**. It will be at
`https://<user>.github.io/<repo>/`.

`vite.config.js` uses a relative base, so the same build also works from any sub-path or a local folder
server. Web Bluetooth needs HTTPS, which GitHub Pages provides.

## Files

- `index.html`, `src/style.css`: layout and styles. `src/icons.js`: the toolbar icons.
- `vite.config.js`: the build, including the PWA manifest and offline cache. `public/`: the app icons.
- `src/main.js`: the app: toolbar and toolboxes, adding items, PDF import, printing, page sizes, menu.
- `src/pages.js`: the pages and items: layout, selection, moving, resizing, turning, editing.
- `src/richtext.js`: formatting commands, fonts and sizes for the text box being edited.
- `src/render.js`: turns a page into a bitmap (html-to-image). `src/bitmap.js`: dithering, turning images, print preparation.
- `src/fonts.js`: the bundled fonts. `src/presets.js`, `src/storage.js`: page sizes and the saved document.
- `src/ble.js`, `src/escpos.js`: Bluetooth connection and the raster print command.
- `src/pdf.js`: PDF import via PDF.js.
