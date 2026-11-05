import { FONTS, SIZES, matchFont } from "./fonts.js";
import { connect, send, onLog, onChange as onBleChange, isConnected, printerName } from "./ble.js";
import { init, feed, cut, concat, rasterCommand } from "./escpos.js";
import { mmToDots, dotsToMm, newId, ROLL_MIN_MM } from "./units.js";
import { DEFAULT_PRESETS, loadPresets, savePresets, printableLengthMm, pageWidthDots } from "./presets.js";
import { loadDoc, saveDoc } from "./storage.js";
import { toPrintBitmap, fileToCanvas, canvasToJpeg } from "./bitmap.js";
import { renderPage } from "./render.js";
import { createRichText } from "./richtext.js";
import { createPages } from "./pages.js";
import { readPdfPages } from "./pdf.js";
import { hydrateIcons, icon } from "./icons.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const PREFS_KEY = "bytecintia.prefs";

const state = {
  presets: [],
  presetId: null,
  minLength: mmToDots(ROLL_MIN_MM), // a roll is never shorter than this (dots)
  prefs: { cut: false },
  lockRatio: true, // image width and height keep their proportions
  busy: false,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mm = (dots) => Math.round(dotsToMm(dots) * 10) / 10;
const preset = () => state.presets.find((p) => p.id === state.presetId) || state.presets[0];

function log(msg) {
  const el = $("log");
  el.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 4500);
}

function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      log(`Error: ${err.message}`);
      toast(err.message);
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

// ---- the document ---------------------------------------------------------

const contentWidth = () => pageWidthDots(preset()) - mmToDots(preset().padding.left + preset().padding.right);

let saveTimer = null;

function saveNow() {
  clearTimeout(saveTimer);
  const ok = saveDoc({ presetId: state.presetId, minLength: state.minLength, pages: pages.getModel() });
  if (!ok) toast("Could not save: browser storage is full (large images or PDFs).");
}

// Anything that changes the document goes through here.
function changed() {
  pages.layout();
  updateImageFields();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

const pages = createPages({
  stage,
  getPreset: preset,
  getMinLength: () => state.minLength,
  setMinLength: (v) => (state.minLength = v),
  onChange: changed,
  onSelection: (item) => updateToolbar(item),
  onDropImages: (files, pageIndex, at) => files.forEach((f) => addImageFile(f, pageIndex, at)),
});

const rich = createRichText({
  root: stage,
  getEditable: () => pages.editingContent(),
  // Formatting a box that is only selected: start editing it with all its text selected.
  onNeedEditor: () => {
    const item = pages.selectedItem();
    if (item?.type !== "text") return null;
    pages.startEdit(item, { selectAll: true });
    return pages.editingContent();
  },
  onChange: () => {
    pages.syncEditing();
    changed();
  },
  onSelection: () => updateFormatState(),
  onImageFiles: (files) => files.forEach((f) => addImageFile(f)),
});

// ---- adding things --------------------------------------------------------

function addText() {
  const p = preset();
  const i = pages.currentIndex();
  pages.addText(i, { x: mmToDots(p.padding.left), y: pages.nextFreeY(i), w: contentWidth() });
}

async function addImageFile(file, pageIndex = pages.currentIndex(), at) {
  const p = preset();
  const width = pageWidthDots(p);
  const canvas = await fileToCanvas(file, 1000);
  const w = Math.min(canvas.width, contentWidth());
  const h = Math.max(4, Math.round((canvas.height * w) / canvas.width));
  await pages.addImage(pageIndex, {
    orig: canvasToJpeg(canvas),
    w,
    h,
    x: at ? clamp(Math.round(at.x - w / 2), 0, Math.max(0, width - w)) : mmToDots(p.padding.left),
    y: at ? Math.max(0, Math.round(at.y - h / 2)) : pages.nextFreeY(pageIndex),
  });
}

// Each PDF page becomes an image. On a roll they are stacked; on a fixed size every
// PDF page gets a page of its own, scaled down to fit.
async function importPdf(file) {
  const p = preset();
  const canvases = await readPdfPages(file, contentWidth());
  log(`PDF: ${canvases.length} page(s).`);
  const left = mmToDots(p.padding.left);
  const padTop = mmToDots(p.padding.top);
  const padBottom = mmToDots(p.padding.bottom);
  const fixedHeight = p.lengthMm ? mmToDots(printableLengthMm(p)) : null;

  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i];
    let w = canvas.width;
    let h = canvas.height;
    let index;
    let y;
    if (fixedHeight) {
      const room = fixedHeight - padTop - padBottom;
      if (h > room) {
        w = Math.floor((w * room) / h);
        h = room;
      }
      const last = pages.count() - 1;
      index = i === 0 && pages.isEmpty(last) ? last : pages.addPage();
      y = padTop;
    } else {
      index = pages.currentIndex();
      y = pages.nextFreeY(index);
    }
    await pages.addImage(index, { orig: canvasToJpeg(canvas), w, h, x: left, y });
  }
}

// ---- the toolbox: what you see depends on what is selected -----------------

function setSizeSelect(px) {
  const select = $("size");
  select.querySelector("[data-temp]")?.remove();
  if (!SIZES.includes(px)) {
    const option = new Option(String(px), px);
    option.dataset.temp = "1";
    select.append(option);
  }
  select.value = String(px);
}

function updateToolbar(item) {
  const context = !item ? "page" : item.type === "text" ? "text" : "image";
  document.querySelectorAll(".tools").forEach((t) => t.classList.toggle("active", t.dataset.ctx === context));
  $("delete-item").disabled = !item;
  updateFormatState();
  updateImageFields();
}

function updateFormatState() {
  const s = rich.state();
  document.querySelectorAll("[data-cmd]").forEach((b) => b.classList.toggle("active", !!s?.active[b.dataset.cmd]));
  if (!s) return;
  $("font").value = matchFont(s.family)?.family ?? "";
  setSizeSelect(s.size);
}

// Show the selected image's size on the page (not while the box is being typed in).
function updateImageFields() {
  const item = pages.selectedItem();
  if (item?.type !== "image") return;
  for (const [id, dots] of [["img-w", item.bw], ["img-h", item.bh]]) {
    if (document.activeElement !== $(id)) $(id).value = mm(dots);
  }
}

function bindToolbar() {
  // Keep the text selection when a toolbar button is pressed.
  document.querySelector(".toolbar").addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  // text
  for (const f of FONTS) {
    const option = new Option(f.label, f.family);
    option.style.fontFamily = f.family;
    $("font").append(option);
  }
  for (const s of SIZES) $("size").append(new Option(String(s), s));
  $("font").addEventListener("change", (e) => rich.setFont(e.target.value));
  $("size").addEventListener("change", (e) => rich.setSize(Number(e.target.value)));
  $("size-down").addEventListener("click", () => rich.stepSize(-1));
  $("size-up").addEventListener("click", () => rich.stepSize(1));
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => rich.command(b.dataset.cmd)));

  // image
  const setLock = (on) => {
    state.lockRatio = on;
    $("img-lock").classList.toggle("active", on);
    $("img-lock").innerHTML = icon(on ? "lock" : "unlock");
  };
  $("img-lock").addEventListener("click", () => setLock(!state.lockRatio));
  $("img-w").addEventListener("change", (e) => pages.setImageSize("w", mmToDots(Number(e.target.value)), state.lockRatio));
  $("img-h").addEventListener("change", (e) => pages.setImageSize("h", mmToDots(Number(e.target.value)), state.lockRatio));
  $("img-rot-l").addEventListener("click", () => pages.rotateSelected(-90));
  $("img-rot-r").addEventListener("click", () => pages.rotateSelected(90));
  $("img-fit-w").addEventListener("click", () => pages.fitSelected("width"));
  $("img-fit-p").addEventListener("click", () => pages.fitSelected("page"));

  // adding and removing
  $("add-text").addEventListener("click", addText);
  $("add-image").addEventListener("click", () => $("file-image").click());
  $("import-pdf").addEventListener("click", () => $("file-pdf").click());
  $("add-page").addEventListener("click", () => pages.addPage());
  $("delete-item").addEventListener("click", () => pages.deleteSelected());

  $("file-image").addEventListener("change", guard(async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    for (const f of files) await addImageFile(f);
  }));
  $("file-pdf").addEventListener("change", guard(async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) await importPdf(file);
  }));

  $("action").addEventListener("click", guard(async () => {
    if (state.busy) return;
    state.busy = true;
    refreshAction();
    try {
      if (isConnected()) await printDocument();
      else await connect();
    } finally {
      state.busy = false;
      refreshAction();
    }
  }));

  // Text typed or changed inside a text box.
  stage.addEventListener("input", () => {
    rich.afterInput();
    pages.syncEditing();
    changed();
  });
}

// ---- printer --------------------------------------------------------------

// One button: Connect until the printer is connected, then Print.
function refreshAction() {
  const connected = isConnected();
  const button = $("action");
  const label = state.busy ? (connected ? "Printing…" : "Connecting…") : connected ? "Print" : "Connect";
  button.innerHTML = `${icon(connected ? "printer" : "bluetooth")}<span>${label}</span>`;
  button.title = connected ? "Print" : "Connect to the printer";
  button.disabled = state.busy;
  $("printer-status").textContent = connected ? `Connected: ${printerName() || "printer"}` : "Not connected";
}

// Every page is printed at its own width, so the page size should match the paper.
async function printDocument() {
  pages.stopEdit();
  const model = pages.getModel();
  if (!model.some((pg) => pg.items.length)) throw new Error("Nothing to print yet.");

  const elements = pages.pageElements();
  for (let i = 0; i < elements.length; i++) {
    const canvas = await renderPage(elements[i]);
    const parts = [init(), rasterCommand(toPrintBitmap(canvas)), feed(3)];
    if (state.prefs.cut) parts.push(cut());
    await send(concat(...parts));
    log(`Printed page ${i + 1} of ${elements.length} (${canvas.width} × ${canvas.height} dots).`);
  }
}

// ---- page sizes (the toolbox shown when nothing is selected) ----------------

function fillPresetSelect() {
  const select = $("pg-preset");
  select.replaceChildren();
  for (const p of state.presets) select.append(new Option(p.name, p.id));
  select.value = preset().id;
}

function fillPresetForm(p) {
  const set = (id, value) => {
    if (document.activeElement !== $(id)) $(id).value = value;
  };
  set("pg-name", p.name);
  set("pg-width", p.widthMm);
  $("pg-roll").checked = !p.lengthMm;
  set("pg-length", p.lengthMm ?? 297);
  set("pg-ml", p.margins.left);
  set("pg-mr", p.margins.right);
  set("pg-mt", p.margins.top);
  set("pg-mb", p.margins.bottom);
  set("pg-pl", p.padding.left);
  set("pg-pr", p.padding.right);
  set("pg-pt", p.padding.top);
  set("pg-pb", p.padding.bottom);
  syncRollFields();
}

// A roll has no length and no top or bottom edge, so those fields do not apply.
function syncRollFields() {
  const roll = $("pg-roll").checked;
  $("pg-length").disabled = roll;
  $("pg-mt").disabled = roll;
  $("pg-mb").disabled = roll;
  $("pg-fit").disabled = !roll;
}

function readPresetForm() {
  const num = (id) => Math.max(0, Number($(id).value) || 0);
  const roll = $("pg-roll").checked;
  return {
    name: $("pg-name").value.trim() || "Untitled",
    widthMm: Math.max(10, num("pg-width")),
    lengthMm: roll ? null : Math.max(10, num("pg-length")),
    margins: { left: num("pg-ml"), right: num("pg-mr"), top: roll ? 0 : num("pg-mt"), bottom: roll ? 0 : num("pg-mb") },
    padding: { left: num("pg-pl"), right: num("pg-pr"), top: num("pg-pt"), bottom: num("pg-pb") },
  };
}

function persistPresets() {
  if (!savePresets(state.presets)) toast("Could not save page sizes: browser storage is full.");
}

// Adding pages only makes sense on fixed sizes.
function refreshPresetUi() {
  const roll = !preset().lengthMm;
  $("add-page").classList.toggle("hidden", roll);
  $("img-fit-p").classList.toggle("hidden", roll); // on a roll, fitting the page is fitting the width
}

// Switch to a page size (or apply changes made to the current one).
function applyPreset(id) {
  state.presetId = id;
  fillPresetSelect();
  fillPresetForm(preset());
  refreshPresetUi();
  pages.fitToWidth(pageWidthDots(preset()));
  changed();
}

function bindPresets() {
  $("pg-preset").addEventListener("change", (e) => applyPreset(e.target.value));

  // Edits change the current page size straight away.
  const fields = ["pg-name", "pg-width", "pg-length", "pg-ml", "pg-mt", "pg-mr", "pg-mb", "pg-pl", "pg-pt", "pg-pr", "pg-pb"];
  const commit = () => {
    syncRollFields();
    Object.assign(preset(), readPresetForm());
    persistPresets();
    applyPreset(state.presetId);
  };
  for (const id of fields) $(id).addEventListener("change", commit);
  $("pg-roll").addEventListener("change", commit);

  $("pg-new").addEventListener("click", () => {
    const form = readPresetForm();
    const p = { id: newId(), ...form, name: `${form.name} copy` };
    state.presets.push(p);
    persistPresets();
    applyPreset(p.id);
  });
  $("pg-delete").addEventListener("click", () => {
    if (state.presets.length <= 1) {
      toast("Keep at least one page size.");
      return;
    }
    state.presets = state.presets.filter((p) => p.id !== state.presetId);
    persistPresets();
    applyPreset(state.presets[0].id);
  });
  $("pg-fit").addEventListener("click", () => {
    state.minLength = 0;
    changed();
  });
  $("pr-reset").addEventListener("click", () => {
    state.presets = structuredClone(DEFAULT_PRESETS);
    persistPresets();
    applyPreset(state.presets[0].id);
    setDrawer(false);
  });
}

// ---- the menu --------------------------------------------------------------

function setDrawer(open) {
  $("drawer").classList.toggle("open", open);
  $("scrim").classList.toggle("hidden", !open);
}

// ---- start ----------------------------------------------------------------

function boot() {
  state.prefs = loadPrefs();
  state.presets = loadPresets();
  const saved = loadDoc();
  state.presetId = saved && state.presets.some((p) => p.id === saved.presetId) ? saved.presetId : state.presets[0].id;
  state.minLength = saved?.minLength ?? state.minLength;

  const model = saved?.pages?.length ? saved.pages : [{ items: [] }];
  // Text boxes converted from an older version have no width yet: let them fill the page.
  for (const pg of model) {
    for (const it of pg.items) {
      if (it.type === "text" && !(it.w > 0)) {
        it.w = contentWidth();
        it.x = mmToDots(preset().padding.left);
        it.y = mmToDots(preset().padding.top);
      }
    }
  }

  hydrateIcons();
  fillPresetSelect();
  fillPresetForm(preset());
  refreshPresetUi();
  $("cut").checked = !!state.prefs.cut;

  bindToolbar();
  bindPresets();

  $("menu-btn").addEventListener("click", () => setDrawer(true));
  $("drawer-close").addEventListener("click", () => setDrawer(false));
  $("scrim").addEventListener("click", () => setDrawer(false));
  $("cut").addEventListener("change", (e) => {
    state.prefs.cut = e.target.checked;
    savePrefs();
  });
  $("clear-log").addEventListener("click", () => ($("log").textContent = ""));

  onLog(log);
  onBleChange(refreshAction);
  refreshAction();
  log(`Page: ${location.href} (secure context: ${window.isSecureContext})`);
  if (!navigator.bluetooth) log("Web Bluetooth is not available in this browser or page.");

  window.addEventListener("resize", () => pages.layout());
  window.addEventListener("pagehide", saveNow);
  pages.load(model);
  updateToolbar(null);
}

boot();
