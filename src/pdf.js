import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { newCanvas } from "./bitmap.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Render every page of a PDF file to a canvas that is widthDots wide. */
export async function readPdfPages(file, widthDots) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const canvases = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: widthDots / base.width });
    const canvas = newCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}
