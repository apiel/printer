# Bytecintia Printer (web app)

A small static web app that prints text and images to a Bluetooth LE thermal
printer using the Web Bluetooth API. No build step, no dependencies.

## Requirements

- Chrome or Edge on Android, Windows, macOS, or Linux.
  iPhone Safari does **not** support Web Bluetooth.
- The printer must be on and not connected to another phone.

## Run locally

Web Bluetooth only works on HTTPS or `localhost`:

```sh
cd /home/alex/dev/printer
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome.

## Deploy on GitHub Pages

1. Create a repository on GitHub and push these files to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**,
   choose `main` and `/ (root)`.
3. Open `https://<your-user>.github.io/<repo>/` on your phone or laptop.

## Finding the right UUIDs

The app logs every Bluetooth service and characteristic it finds after you
connect. If the app says "No writable characteristic found", or printing does
nothing, copy the service UUID from the log and add it to `OPTIONAL_SERVICES`
in `app.js`. Web Bluetooth only lets a page access services listed there.

## Files

- `index.html`: the UI.
- `app.js`: Bluetooth connection, chunked sending, and print actions.
- `escpos.js`: ESC/POS command builders and image-to-raster conversion (dithered).
