import { init, align, feed, cut, imageToRaster, concat } from "./escpos.js";

// Bluetooth services we are allowed to access. Web Bluetooth only lets a page
// touch services listed here, so add any your printer exposes (see the log).
const OPTIONAL_SERVICES = [
  0xff00, 0xff01, 0xffe0, 0xfff0, 0xae30, 0x18f0, 0x1800, 0x1801, 0x180a,
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip transparent UART
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

const CHUNK_SIZE = 100; // bytes per BLE write
const CHUNK_DELAY_MS = 20; // pause between writes so the printer buffer doesn't overflow

const SETTINGS_KEY = "bytecintia-settings";
const DEFAULT_SETTINGS = { paper: 384, marginLeft: 16, marginRight: 8 };

let device = null;
let target = null; // { characteristic, withoutResponse }

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const time = new Date().toLocaleTimeString();
  const el = $("log");
  el.textContent += `[${time}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

// ---- settings (remembered in this browser) -------------------------------

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private window, blocked site data): settings last for this session only
  }
}

const settings = loadSettings();

function clampMargin(value) {
  return Math.max(0, Math.min(200, Math.round(Number(value) || 0)));
}

// ---- connection -----------------------------------------------------------

function setConnected(connected) {
  $("status").textContent = connected
    ? `Connected: ${device.name || "unnamed printer"}`
    : "Not connected";
  $("connect").textContent = connected ? "Disconnect" : "Connect";
  document.querySelectorAll("[data-needs-printer]").forEach((b) => (b.disabled = !connected));
}

async function connect() {
  if (!navigator.bluetooth) {
    log("Web Bluetooth is not available here. Use Chrome or Edge (not iPhone Safari).");
    return;
  }
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: OPTIONAL_SERVICES,
  });
  device.addEventListener("gattserverdisconnected", () => {
    log("Printer disconnected.");
    target = null;
    setConnected(false);
  });

  log(`Connecting to ${device.name || device.id}...`);
  const server = await device.gatt.connect();
  target = await findWritableCharacteristic(server);
  log(`Ready. Writing to ${target.characteristic.uuid}`);
  setConnected(true);
}

// Walk every service and characteristic, log them, and pick one we can write to.
async function findWritableCharacteristic(server) {
  const candidates = [];
  const services = await server.getPrimaryServices();
  for (const service of services) {
    log(`Service ${service.uuid}`);
    const characteristics = await service.getCharacteristics();
    for (const c of characteristics) {
      const p = c.properties;
      log(`  characteristic ${c.uuid} write=${p.write} writeWithoutResponse=${p.writeWithoutResponse}`);
      if (p.writeWithoutResponse) candidates.push({ characteristic: c, withoutResponse: true });
      else if (p.write) candidates.push({ characteristic: c, withoutResponse: false });
    }
  }
  if (candidates.length === 0) {
    await device.gatt.disconnect();
    throw new Error("No writable characteristic found. Check the log for the service list.");
  }
  // Prefer write-without-response, which is what most printers expect.
  return candidates.find((c) => c.withoutResponse) ?? candidates[0];
}

async function disconnect() {
  if (device?.gatt?.connected) device.gatt.disconnect();
}

async function send(bytes) {
  if (!target) throw new Error("Not connected to a printer.");
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (target.withoutResponse) await target.characteristic.writeValueWithoutResponse(chunk);
    else await target.characteristic.writeValueWithResponse(chunk);
    await sleep(CHUNK_DELAY_MS);
  }
}

// ---- printing -------------------------------------------------------------

// This printer ignores ESC/POS text commands, so we draw the text on a canvas
// (with wrapping, alignment, bold and margins) and send it as a raster image.
function renderText(content, { alignment = 0, isBold = false } = {}) {
  const width = settings.paper;
  const left = settings.marginLeft;
  const right = settings.marginRight;
  const contentWidth = width - left - right;
  const fontSize = 26;
  const lineHeight = Math.round(fontSize * 1.3);
  const padding = 8; // vertical padding
  const font = `${isBold ? "bold " : ""}${fontSize}px monospace`;

  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;

  // Word-wrap each paragraph to the printable width.
  const lines = [];
  for (const paragraph of content.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure.measureText(candidate).width <= contentWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = lines.length * lineHeight + padding * 2;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.textAlign = alignment === 1 ? "center" : alignment === 2 ? "right" : "left";
  const x = alignment === 1 ? left + contentWidth / 2 : alignment === 2 ? width - right : left;
  lines.forEach((l, i) => ctx.fillText(l, x, padding + i * lineHeight));
  return canvas;
}

async function printText(content) {
  const canvas = renderText(content, {
    alignment: Number($("align").value),
    isBold: $("bold").checked,
  });
  const parts = [init(), imageToRaster(canvas, settings.paper), feed(3)];
  if ($("cut").checked) parts.push(cut());
  await send(concat(...parts));
}

// Draw a test label on a canvas and print it as a raster image.
async function printRasterTest() {
  const canvas = document.createElement("canvas");
  canvas.width = settings.paper;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = "#000";
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("RASTER OK", canvas.width / 2, 80);
  ctx.font = "24px sans-serif";
  ctx.fillText("graphics path", canvas.width / 2, 130);

  await send(concat(init(), align(1), imageToRaster(canvas, settings.paper), feed(3)));
  log("Raster test sent.");
}

async function printImage(file) {
  const bitmap = await createImageBitmap(file);
  const raster = imageToRaster(bitmap, settings.paper, settings.marginLeft, settings.marginRight);
  const parts = [init(), raster, feed(3)];
  if ($("cut").checked) parts.push(cut());
  await send(concat(...parts));
}

// ---- UI -------------------------------------------------------------------

function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      log(`Error: ${err.message}`);
    }
  };
}

function initUi() {
  log(`Page: ${location.href}`);
  log(`Secure context: ${window.isSecureContext}`);
  if (!navigator.bluetooth) {
    if (!window.isSecureContext) {
      log("Web Bluetooth needs a secure page. Open the app at http://localhost:5173 (not file:// or a LAN IP), or use HTTPS.");
    } else {
      log("This browser does not expose Web Bluetooth. Use Chrome or Edge on desktop or Android.");
    }
  }

  // Settings
  $("paper").value = settings.paper;
  $("margin-left").value = settings.marginLeft;
  $("margin-right").value = settings.marginRight;
  $("paper").addEventListener("change", () => {
    settings.paper = Number($("paper").value);
    saveSettings();
  });
  $("margin-left").addEventListener("change", (e) => {
    settings.marginLeft = clampMargin(e.target.value);
    e.target.value = settings.marginLeft;
    saveSettings();
  });
  $("margin-right").addEventListener("change", (e) => {
    settings.marginRight = clampMargin(e.target.value);
    e.target.value = settings.marginRight;
    saveSettings();
  });

  $("connect").addEventListener("click", guard(async () => {
    if (target) await disconnect();
    else await connect();
  }));

  $("print-text").addEventListener("click", guard(() => printText($("message").value)));
  $("print-test").addEventListener("click", guard(() =>
    printText("Hello from my web printer!\nIf you can read this, it works.")
  ));
  $("print-raster").addEventListener("click", guard(() => printRasterTest()));
  $("print-image").addEventListener("click", guard(() => {
    const file = $("image").files[0];
    if (!file) throw new Error("Choose an image first.");
    return printImage(file);
  }));
  $("clear-log").addEventListener("click", () => ($("log").textContent = ""));
}

initUi();
