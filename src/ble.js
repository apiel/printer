// Web Bluetooth connection to the printer.

// Web Bluetooth only lets a page touch services listed here. Add any your printer
// exposes (the log shows them after connecting).
const OPTIONAL_SERVICES = [
  0xff00, 0xff01, 0xffe0, 0xfff0, 0xae30, 0x18f0, 0x1800, 0x1801, 0x180a,
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip transparent UART
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

const CHUNK_SIZE = 100; // bytes per BLE write
const CHUNK_DELAY_MS = 20; // pause so the printer buffer doesn't overflow

let device = null;
let target = null; // { characteristic, withoutResponse }
let logFn = () => {};
let changeFn = () => {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const onLog = (fn) => (logFn = fn);
export const onChange = (fn) => (changeFn = fn);
export const isConnected = () => !!target;
export const printerName = () => device?.name || null;

export async function connect() {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is not available here. Use Chrome or Edge (not iPhone Safari).");
  }
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: OPTIONAL_SERVICES,
  });
  device.addEventListener("gattserverdisconnected", () => {
    logFn("Printer disconnected.");
    target = null;
    changeFn(false);
  });

  logFn(`Connecting to ${device.name || device.id}...`);
  const server = await device.gatt.connect();
  target = await findWritableCharacteristic(server);
  logFn(`Ready. Writing to ${target.characteristic.uuid}`);
  changeFn(true);
}

// Walk every service and characteristic, log them, and pick one we can write to.
async function findWritableCharacteristic(server) {
  const candidates = [];
  for (const service of await server.getPrimaryServices()) {
    logFn(`Service ${service.uuid}`);
    for (const c of await service.getCharacteristics()) {
      const p = c.properties;
      logFn(`  characteristic ${c.uuid} write=${p.write} writeWithoutResponse=${p.writeWithoutResponse}`);
      if (p.writeWithoutResponse) candidates.push({ characteristic: c, withoutResponse: true });
      else if (p.write) candidates.push({ characteristic: c, withoutResponse: false });
    }
  }
  if (candidates.length === 0) {
    device.gatt.disconnect();
    throw new Error("No writable characteristic found. Check the log for the service list.");
  }
  // Prefer write-without-response, which is what most printers expect.
  return candidates.find((c) => c.withoutResponse) ?? candidates[0];
}

export function disconnect() {
  if (device?.gatt?.connected) device.gatt.disconnect();
}

export async function send(bytes) {
  if (!target) throw new Error("Not connected to a printer.");
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (target.withoutResponse) await target.characteristic.writeValueWithoutResponse(chunk);
    else await target.characteristic.writeValueWithResponse(chunk);
    await sleep(CHUNK_DELAY_MS);
  }
}
