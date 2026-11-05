import { connect, disconnect, send, onLog, onChange, isConnected, printerName } from "./ble.js";
import { init, feed, cut, concat, rasterCommand } from "./escpos.js";
import { DOTS_PER_MM, ROLL_MIN_MM, mmToDots, dotsToMm, newId } from "./units.js";
import { loadPresets, savePresets, DEFAULT_PRESETS } from "./presets.js";
import { newDocument, newPage, loadDocument, saveDocument } from "./doc.js";
import {
  TEXT_DEFAULT, renderPage, pageHeightDots, pageWidthDots, contentWidthDots,
  itemHeight, itemBox, toBlackWhite, toPrintBitmap, canvasToDataUrl, imageFileToDataUrl,
} from "./render.js";
import { readPdfPages } from "./pdf.js";

const $ = (id) => document.getElementById(id);
const PREFS_KEY = "bytecintia.prefs";

const state = {
  presets: [],
  doc: null,
  pageIndex: 0,
  selected: null, // id of the selected item on the current page
  tool: "select", // "select" | "line"
  zoom: 1,
  drag: null,
  renderSeq: 0,
  rafPending: false,
  prefs: { head: 384, cut: false },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mm = (dots) => Math.round(dotsToMm(dots) * 10) / 10;
const preset = () => state.presets.find((p) => p.id === state.doc.presetId) || state.presets[0];
const page = () => state.doc.pages[state.pageIndex];
const findItem = (id) => page().items.find((i) => i.id === id);
const selectedItem = () => (state.selected ? findItem(state.selected) : null);

function log(msg) {
  const el = $("log");
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  };
}

// ---- saved preferences ----------------------------------------------------

function loadPrefs() {
  try {
    return { ...state.prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...state.prefs };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  } catch {
    // storage unavailable: preferences last for this session only
  }
}

// ---- rendering the editor -------------------------------------------------

function scheduleRender() {
  if (state.rafPending) return;
  state.rafPending = true;
  requestAnimationFrame(() => {
    state.rafPending = false;
    render();
  });
}

async function render() {
  const seq = ++state.renderSeq;
  const p = preset();
  const gray = await renderPage(state.doc, p, state.pageIndex);
  if (seq !== state.renderSeq) return; // a newer render is already on its way
  const bw = toBlackWhite(gray, false);
  const view = $("page-canvas");
  view.width = bw.width;
  view.height = bw.height;
  view.getContext("2d").drawImage(bw, 0, 0);
  layoutSheet(bw.width, bw.height, p);
  updateSelection();
  updatePageInfo();
}

function layoutSheet(width, height, p) {
  state.zoom = clamp(($("stage").clientWidth - 48) / width, 0.2, 3);
  const z = state.zoom;
  const sheet = $("sheet");
  sheet.style.width = `${width * z}px`;
  sheet.style.height = `${height * z}px`;

  const guide = $("margin-guide").style;
  guide.left = `${mmToDots(p.margins.left) * z}px`;
  guide.right = `${mmToDots(p.margins.right) * z}px`;
  guide.top = `${mmToDots(p.margins.top) * z}px`;
  guide.bottom = `${mmToDots(p.margins.bottom) * z}px`;
}

function updateSelection() {
  const sel = $("sel");
  const item = selectedItem();
  if (!item) {
    sel.classList.add("hidden");
    return;
  }
  const b = itemBox(item);
  const z = state.zoom;
  sel.classList.remove("hidden");
  Object.assign(sel.style, {
    left: `${b.x * z}px`,
    top: `${b.y * z}px`,
    width: `${b.w * z}px`,
    height: `${b.h * z}px`,
  });
}

function updatePageInfo() {
  const p = preset();
  const roll = !p.lengthMm;
  const count = state.doc.pages.length;
  $("page-nav").classList.toggle("hidden", roll);
  $("len-handle").classList.toggle("hidden", !roll);
  $("page-label").textContent = `Page ${state.pageIndex + 1} / ${count}`;
  $("prev-page").disabled = state.pageIndex === 0;
  $("next-page").disabled = state.pageIndex >= count - 1;
  $("remove-page").disabled = count <= 1;
  $("page-info").textContent = roll
    ? `Current: ${p.name}, endless roll (grows with content, minimum ${mm(page().minLength)} mm).`
    : `Current: ${p.name}, fixed ${p.widthMm} × ${p.lengthMm} mm.`;
}

function commit() {
  if (!saveDocument(state.doc)) log("Could not save the document: browser storage is full.");
  scheduleRender();
  updateSelection();
}

// ---- inspector ------------------------------------------------------------

function renderPanel() {
  const item = selectedItem();
  $("no-selection").classList.toggle("hidden", !!item);
  $("fields").classList.toggle("hidden", !item);
  updateSelection();
  if (!item) return;

  document.querySelectorAll("[data-for]").forEach((row) => {
    row.classList.toggle("hidden", !row.dataset.for.split(" ").includes(item.type));
  });
  $("p-x").value = mm(item.x);
  $("p-y").value = mm(item.y);
  $("p-w").value = mm(item.w);
  $("p-h").value = mm(item.h ?? 0);
  $("p-thick").value = item.thickness ?? 3;
  $("p-text").value = item.text ?? "";
  $("p-size").value = item.size ?? TEXT_DEFAULT;
  $("p-bold").checked = !!item.bold;
  $("p-align").value = item.align ?? 0;
}

function setWidth(item, w) {
  if (item.type === "image" && item.w) item.h = Math.round((item.h * w) / item.w);
  item.w = w;
}

function bindInspector() {
  const onNumber = (id, apply) =>
    $(id).addEventListener("change", (e) => {
      const item = selectedItem();
      if (!item) return;
      apply(item, Number(e.target.value));
      commit();
    });
  onNumber("p-x", (it, v) => { it.x = clamp(mmToDots(v), 0, pageWidthDots(preset()) - 4); });
  onNumber("p-y", (it, v) => { it.y = Math.max(0, mmToDots(v)); });
  onNumber("p-w", (it, v) => setWidth(it, clamp(mmToDots(v), 8, pageWidthDots(preset()))));
  onNumber("p-h", (it, v) => { if (it.type === "image") it.h = clamp(mmToDots(v), 8, 8000); });
  onNumber("p-thick", (it, v) => { it.thickness = clamp(Math.round(v), 1, 60); });
  onNumber("p-size", (it, v) => { it.size = clamp(Math.round(v), 8, 200); });

  $("p-text").addEventListener("input", (e) => {
    const item = selectedItem();
    if (!item) return;
    item.text = e.target.value;
    commit();
  });
  $("p-bold").addEventListener("change", (e) => {
    const item = selectedItem();
    if (!item) return;
    item.bold = e.target.checked;
    commit();
  });
  $("p-align").addEventListener("change", (e) => {
    const item = selectedItem();
    if (!item) return;
    item.align = Number(e.target.value);
    commit();
  });
  $("p-delete").addEventListener("click", deleteSelected);
}

// ---- adding and removing content ------------------------------------------

function nextFreeY() {
  let y = mmToDots(preset().margins.top);
  for (const it of page().items) y = Math.max(y, it.y + itemHeight(it) + 4);
  return y;
}

function addItem(item) {
  const full = { id: newId(), ...item };
  page().items.push(full);
  state.selected = full.id;
  renderPanel();
  commit();
}

function addText() {
  const p = preset();
  addItem({
    type: "text",
    x: mmToDots(p.margins.left),
    y: nextFreeY(),
    w: contentWidthDots(p),
    text: "Text",
    size: TEXT_DEFAULT,
    bold: false,
    align: 0,
  });
}

async function onImageChosen(file) {
  const p = preset();
  const maxW = contentWidthDots(p);
  const img = await imageFileToDataUrl(file, maxW);
  const w = Math.min(maxW, img.width);
  addItem({
    type: "image",
    x: mmToDots(p.margins.left),
    y: nextFreeY(),
    w,
    h: Math.round((img.height * w) / img.width),
    src: img.src,
  });
}

// Rolls: PDF pages are stacked on the one endless page.
// Fixed pages: each PDF page gets its own page, scaled down to fit if needed.
async function onPdfChosen(file) {
  const p = preset();
  const canvases = await readPdfPages(file, contentWidthDots(p));
  log(`PDF: ${canvases.length} page(s).`);
  const left = mmToDots(p.margins.left);
  const roll = !p.lengthMm;

  canvases.forEach((canvas, i) => {
    const item = {
      id: newId(),
      type: "image",
      x: left,
      y: 0,
      w: canvas.width,
      h: canvas.height,
      src: canvasToDataUrl(canvas, true),
    };
    if (roll) {
      item.y = nextFreeY();
    } else {
      if (i > 0 || page().items.length) {
        state.doc.pages.push(newPage());
        state.pageIndex = state.doc.pages.length - 1;
      }
      const available = pageHeightDots(p, page()) - mmToDots(p.margins.top) - mmToDots(p.margins.bottom);
      const scale = Math.min(1, available / canvas.height);
      item.w = Math.round(canvas.width * scale);
      item.h = Math.round(canvas.height * scale);
      item.y = mmToDots(p.margins.top);
    }
    page().items.push(item);
  });

  state.selected = null;
  renderPanel();
  commit();
}

function deleteSelected() {
  if (!state.selected) return;
  page().items = page().items.filter((i) => i.id !== state.selected);
  state.selected = null;
  renderPanel();
  commit();
}

function gotoPage(index) {
  state.pageIndex = clamp(index, 0, state.doc.pages.length - 1);
  state.selected = null;
  renderPanel();
  commit();
}

function addPage() {
  state.doc.pages.push(newPage());
  gotoPage(state.doc.pages.length - 1);
}

function removePage() {
  if (state.doc.pages.length <= 1) return;
  state.doc.pages.splice(state.pageIndex, 1);
  gotoPage(state.pageIndex);
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  $("sheet").classList.toggle("crosshair", tool === "line");
}

// ---- mouse / touch interaction on the page --------------------------------

function dotsFromEvent(e) {
  const r = $("sheet").getBoundingClientRect();
  return { x: (e.clientX - r.left) / state.zoom, y: (e.clientY - r.top) / state.zoom };
}

function hitTest(p) {
  const items = page().items;
  for (let i = items.length - 1; i >= 0; i--) {
    const b = itemBox(items[i]);
    if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return items[i];
  }
  return null;
}

function bindSheet() {
  const sheet = $("sheet");

  sheet.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".handle, .len-handle")) return;
    const p = dotsFromEvent(e);
    if (state.tool === "line") {
      const item = { id: newId(), type: "line", x: Math.round(p.x), y: Math.round(p.y), w: 1, thickness: 3 };
      page().items.push(item);
      state.selected = item.id;
      state.drag = { kind: "newline", id: item.id, startX: p.x };
    } else {
      const hit = hitTest(p);
      state.selected = hit ? hit.id : null;
      state.drag = hit ? { kind: "move", id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y } : null;
      renderPanel();
    }
    sheet.setPointerCapture(e.pointerId);
  });

  sheet.addEventListener("pointermove", (e) => {
    const d = state.drag;
    if (!d) return;
    const p = dotsFromEvent(e);
    const W = pageWidthDots(preset());
    if (d.kind === "length") {
      page().minLength = Math.max(mmToDots(ROLL_MIN_MM), d.startMin + Math.round((e.clientY - d.startY) / state.zoom));
    } else {
      const item = d.kind === "resize" ? selectedItem() : findItem(d.id);
      if (!item) return;
      if (d.kind === "move") {
        item.x = clamp(Math.round(p.x - d.dx), 0, Math.max(0, W - item.w));
        item.y = Math.max(0, Math.round(p.y - d.dy));
      } else if (d.kind === "newline") {
        item.x = Math.round(clamp(Math.min(d.startX, p.x), 0, W));
        item.w = Math.max(1, Math.round(Math.abs(p.x - d.startX)));
      } else if (d.kind === "resize") {
        setWidth(item, clamp(Math.round(p.x - item.x), 8, W - item.x));
      }
    }
    scheduleRender();
    updateSelection();
  });

  const endDrag = () => {
    const d = state.drag;
    if (!d) return;
    state.drag = null;
    if (d.kind === "newline") setTool("select");
    renderPanel();
    commit();
  };
  sheet.addEventListener("pointerup", endDrag);
  sheet.addEventListener("pointercancel", endDrag);

  $("handle-se").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    state.drag = { kind: "resize" };
    $("handle-se").setPointerCapture(e.pointerId);
  });

  $("len-handle").addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    state.drag = { kind: "length", startY: e.clientY, startMin: page().minLength };
    $("len-handle").setPointerCapture(e.pointerId);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelected();
      e.preventDefault();
    } else if (e.key === "Escape") {
      state.selected = null;
      setTool("select");
      renderPanel();
    }
  });
}

// ---- page size presets ----------------------------------------------------

function fillPresetSelect() {
  const sel = $("preset");
  sel.replaceChildren();
  for (const p of state.presets) {
    const size = `${p.widthMm} mm × ${p.lengthMm ? `${p.lengthMm} mm` : "roll"}`;
    sel.append(new Option(`${p.name} (${size})`, p.id));
  }
  sel.value = preset().id;
}

function fillPresetForm(p) {
  $("pr-name").value = p.name;
  $("pr-width").value = p.widthMm;
  $("pr-roll").checked = !p.lengthMm;
  $("pr-length").value = p.lengthMm ?? 297;
  $("pr-length").disabled = !p.lengthMm;
  $("pr-ml").value = p.margins.left;
  $("pr-mr").value = p.margins.right;
  $("pr-mt").value = p.margins.top;
  $("pr-mb").value = p.margins.bottom;
}

function readPresetForm() {
  const num = (id) => Math.max(0, Number($(id).value) || 0);
  return {
    name: $("pr-name").value.trim() || "Untitled",
    widthMm: Math.max(10, num("pr-width")),
    lengthMm: $("pr-roll").checked ? null : Math.max(10, num("pr-length")),
    margins: { left: num("pr-ml"), right: num("pr-mr"), top: num("pr-mt"), bottom: num("pr-mb") },
  };
}

function persistPresets() {
  if (!savePresets(state.presets)) log("Could not save page sizes: browser storage is full.");
}

// Switch the document to a preset, keeping every item inside the new page width.
function applyPreset(id) {
  state.doc.presetId = id;
  const width = pageWidthDots(preset());
  for (const pg of state.doc.pages) {
    for (const it of pg.items) {
      if (it.w > width) setWidth(it, width);
      it.x = clamp(it.x, 0, Math.max(0, width - it.w));
    }
  }
  state.selected = null;
  fillPresetSelect();
  fillPresetForm(preset());
  renderPanel();
  commit();
}

function bindPresets() {
  $("preset").addEventListener("change", (e) => applyPreset(e.target.value));
  $("pr-roll").addEventListener("change", (e) => ($("pr-length").disabled = e.target.checked));

  $("pr-new").addEventListener("click", () => {
    const p = { id: newId(), ...readPresetForm() };
    state.presets.push(p);
    persistPresets();
    applyPreset(p.id);
  });
  $("pr-update").addEventListener("click", () => {
    const p = preset();
    Object.assign(p, readPresetForm());
    persistPresets();
    applyPreset(p.id);
  });
  $("pr-delete").addEventListener("click", () => {
    if (state.presets.length <= 1) {
      log("Keep at least one page size.");
      return;
    }
    state.presets = state.presets.filter((p) => p.id !== state.doc.presetId);
    persistPresets();
    applyPreset(state.presets[0].id);
  });
  $("pr-a4").addEventListener("click", () => {
    fillPresetForm({ name: "A4 page", widthMm: 210, lengthMm: 297, margins: { top: 10, right: 10, bottom: 10, left: 10 } });
  });
  $("pr-reset").addEventListener("click", () => {
    state.presets = structuredClone(DEFAULT_PRESETS);
    persistPresets();
    applyPreset(state.presets[0].id);
  });
}

// ---- printer --------------------------------------------------------------

function refreshConnection(connected) {
  $("status").textContent = connected ? `Connected: ${printerName() || "printer"}` : "Not connected";
  $("connect").textContent = connected ? "Disconnect" : "Connect";
  document.querySelectorAll("[data-needs-printer]").forEach((b) => (b.disabled = !connected));
}

async function printDocument() {
  if (!isConnected()) throw new Error("Connect to the printer first.");
  const p = preset();
  const head = state.prefs.head;
  const width = pageWidthDots(p);
  if (width !== head) log(`Page is ${width} dots wide, printer head is ${head}: scaling to ${Math.round((head / width) * 100)}%.`);

  const count = state.doc.pages.length;
  for (let i = 0; i < count; i++) {
    const gray = await renderPage(state.doc, p, i);
    const parts = [init(), rasterCommand(toPrintBitmap(gray, head)), feed(3)];
    if (state.prefs.cut) parts.push(cut());
    await send(concat(...parts));
    log(`Printed page ${i + 1} of ${count}.`);
  }
}

// ---- start ----------------------------------------------------------------

function boot() {
  state.prefs = loadPrefs();
  state.presets = loadPresets();
  state.doc = loadDocument() || newDocument(state.presets[0].id);
  if (!state.presets.some((p) => p.id === state.doc.presetId)) state.doc.presetId = state.presets[0].id;

  fillPresetSelect();
  fillPresetForm(preset());
  $("head").value = state.prefs.head;
  $("cut").checked = !!state.prefs.cut;

  bindSheet();
  bindInspector();
  bindPresets();

  $("connect").addEventListener("click", guard(async () => {
    if (isConnected()) disconnect();
    else await connect();
  }));
  $("print").addEventListener("click", guard(printDocument));
  $("add-text").addEventListener("click", addText);
  $("add-image").addEventListener("click", () => $("file-image").click());
  $("import-pdf").addEventListener("click", () => $("file-pdf").click());
  $("delete-item").addEventListener("click", deleteSelected);
  $("prev-page").addEventListener("click", () => gotoPage(state.pageIndex - 1));
  $("next-page").addEventListener("click", () => gotoPage(state.pageIndex + 1));
  $("add-page").addEventListener("click", addPage);
  $("remove-page").addEventListener("click", removePage);
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));

  $("file-image").addEventListener("change", guard(async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await onImageChosen(file);
  }));
  $("file-pdf").addEventListener("change", guard(async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await onPdfChosen(file);
  }));

  $("head").addEventListener("change", (e) => {
    state.prefs.head = Number(e.target.value);
    savePrefs();
  });
  $("cut").addEventListener("change", (e) => {
    state.prefs.cut = e.target.checked;
    savePrefs();
  });
  $("clear-log").addEventListener("click", () => ($("log").textContent = ""));

  onLog(log);
  onChange(refreshConnection);
  refreshConnection(false);

  log(`Page: ${location.href} (secure context: ${window.isSecureContext})`);
  if (!navigator.bluetooth) log("Web Bluetooth is not available in this browser or page.");

  window.addEventListener("resize", scheduleRender);
  render();
}

boot();
