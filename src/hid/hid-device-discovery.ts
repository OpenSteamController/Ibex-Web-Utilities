import { VALVE_VID, HID_PIDS, OPCODE_GET_NUMERIC_ATTRS, OPCODE_GET_STRING_ATTR, OPCODE_GET_STRING_ATTR_V1 } from "../constants.js";
import { DeviceType, DeviceClass, AttributeTag } from "../types.js";
import type { ValveHidDevice, ConnectedController } from "../types.js";
import { UserCancelledError } from "../errors.js";
import { openHidDevice, sendFeatureReport, receiveFeatureReport } from "./hid-transport.js";
import { debug } from "../debug.js";

const PID_TO_DEVICE_TYPE: Record<number, DeviceType> = {
  [HID_PIDS.TRITON_USB]: DeviceType.TritonUSB,
  [HID_PIDS.TRITON_BLE]: DeviceType.TritonBLE,
  [HID_PIDS.PROTEUS_USB]: DeviceType.ProteusUSB,
  [HID_PIDS.NEREID_USB]: DeviceType.NereidUSB,
};

const DONGLE_PIDS = new Set<number>([HID_PIDS.PROTEUS_USB, HID_PIDS.NEREID_USB]);

const DONGLE_DEVICE_TYPES = new Set([
  DeviceType.ProteusUSB,
  DeviceType.NereidUSB,
]);

/**
 * Vendor usage codes for dongle HID interfaces:
 * - usage=0x1: Controller slot (reads connected Triton via report ID 1)
 * - usage=0x2: Dongle's own interface (reads Puck info via report ID 2)
 */
const DONGLE_SELF_USAGE = 0x02;
const CONTROLLER_SLOT_USAGE = 0x01;

function getAllHidFilters(): HIDDeviceFilter[] {
  return Object.values(HID_PIDS).map((productId) => ({
    vendorId: VALVE_VID,
    productId,
  }));
}

/**
 * Detect bcdVersion by probing report ID 2 with a numeric attribute read.
 * If report ID 2 returns a valid response (reportType matches the opcode),
 * the device is v2. Otherwise it's v1.
 * Only relevant for dongle devices (Proteus/Nereid).
 */
async function detectBcdVersion(device: HIDDevice): Promise<number> {
  debug("detectBcdVersion: probing report ID 2...");
  try {
    await sendFeatureReport(device, 2, new Uint8Array([OPCODE_GET_NUMERIC_ATTRS]));
    const { reportType, reportLength } = await receiveFeatureReport(device, 2);
    debug(`detectBcdVersion: report ID 2 response: type=0x${reportType.toString(16)}, len=${reportLength}`);
    if (reportType === OPCODE_GET_NUMERIC_ATTRS && reportLength > 0 && reportLength % 5 === 0) {
      debug("detectBcdVersion: v2 detected");
      return 2;
    }
    debug("detectBcdVersion: report ID 2 returned unexpected data, falling back to v1");
  } catch (e) {
    debug("detectBcdVersion: report ID 2 probe failed, falling back to v1", e);
  }
  return 1;
}

async function wrapHidDevice(device: HIDDevice): Promise<ValveHidDevice> {
  const deviceType = PID_TO_DEVICE_TYPE[device.productId] ?? DeviceType.TritonUSB;
  debug(`wrapHidDevice: PID=0x${device.productId.toString(16)}, deviceType=${DeviceType[deviceType]}`);

  // Only dongle devices need bcdVersion detection; Triton always uses report ID 1
  let bcdVersion = 1;
  if (DONGLE_DEVICE_TYPES.has(deviceType)) {
    bcdVersion = await detectBcdVersion(device);
  }

  debug(`wrapHidDevice: bcdVersion=${bcdVersion}`);
  return { device, bcdVersion, deviceType };
}

/**
 * Request user to select a Valve HID device.
 * Must be called from a user gesture handler (click, keypress, etc).
 */
export async function requestHidDevice(): Promise<ValveHidDevice> {
  let devices: HIDDevice[];
  try {
    devices = await navigator.hid.requestDevice({
      filters: getAllHidFilters(),
    });
  } catch {
    throw new UserCancelledError();
  }

  if (!devices.length) {
    throw new UserCancelledError();
  }

  const device = devices[0];
  await openHidDevice(device);
  return await wrapHidDevice(device);
}

/**
 * Get the vendor-defined usage code from a device's collections.
 * Returns the usage from the first collection with usagePage >= 0xFF00.
 */
function getVendorUsage(device: HIDDevice): number | null {
  for (const col of device.collections) {
    if ((col.usagePage ?? 0) >= 0xff00) {
      return col.usage ?? null;
    }
  }
  return null;
}

/**
 * Quick serial number read for deduplication. Returns null on failure.
 * Uses the same logic as hid-protocol's getTritonSerial/getDongleSerial
 * but avoids a circular dependency.
 */
async function readSerialRaw(
  device: HIDDevice,
  reportId: number,
  opcode: number,
): Promise<string | null> {
  try {
    await sendFeatureReport(device, reportId, new Uint8Array([opcode, 1, 1]));
    const { reportType, reportLength, reportData } = await receiveFeatureReport(device, reportId);
    if (!reportLength || reportType !== opcode) return null;
    const strBytes = reportData.subarray(1);
    if (strBytes[0] === 0xff) return null;
    const nullPos = strBytes.indexOf(0);
    if (nullPos === -1) return null;
    return new TextDecoder().decode(strBytes.subarray(0, nullPos));
  } catch {
    return null;
  }
}

/**
 * Get all previously-granted Valve HID devices. No user gesture needed.
 * Filters to vendor-defined usage pages (>= 0xFF00).
 *
 * Dongle devices (Proteus/Nereid) expose multiple HID interfaces:
 * - usage=0x02: The dongle's own interface (1 per physical dongle)
 * - usage=0x01: Controller slots for wirelessly connected Tritons
 *               (up to 4 per dongle, one per connected controller)
 *
 * We return:
 * - One device per dongle (usage=0x02 interface)
 * - One device per connected controller on a dongle (usage=0x01 with
 *   a valid Triton serial on report ID 1), typed as TritonESB
 * - Non-dongle devices (Triton USB/BLE) as-is
 */
export async function getGrantedHidDevices(): Promise<ValveHidDevice[]> {
  const allDevices = await navigator.hid.getDevices();
  const valveDevices = allDevices.filter(
    (d) =>
      d.vendorId === VALVE_VID &&
      d.productId in PID_TO_DEVICE_TYPE &&
      d.collections.some((c) => (c.usagePage ?? 0) >= 0xff00),
  );

  debug(`getGrantedHidDevices: ${valveDevices.length} candidate interface(s) from ${allDevices.length} total`);

  // Separate dongle interfaces by role, pass through non-dongle devices
  const dongleSelfInterfaces: HIDDevice[] = [];
  const controllerSlotInterfaces: HIDDevice[] = [];
  const directDevices: HIDDevice[] = [];

  for (const device of valveDevices) {
    if (DONGLE_PIDS.has(device.productId)) {
      const usage = getVendorUsage(device);
      if (usage === DONGLE_SELF_USAGE) {
        dongleSelfInterfaces.push(device);
      } else if (usage === CONTROLLER_SLOT_USAGE) {
        controllerSlotInterfaces.push(device);
      } else {
        debug(`getGrantedHidDevices: unknown dongle usage=0x${(usage ?? 0).toString(16)}, skipping`);
      }
    } else {
      directDevices.push(device);
    }
  }

  debug(`getGrantedHidDevices: ${directDevices.length} direct, ${dongleSelfInterfaces.length} dongle-self, ${controllerSlotInterfaces.length} controller-slot`);

  const results: ValveHidDevice[] = [];

  // 1. Non-dongle devices (Triton USB, Triton BLE) — one per device
  for (const device of directDevices) {
    await openHidDevice(device);
    results.push(await wrapHidDevice(device));
  }

  // 2. Dongle self interfaces (usage=0x02) — one per physical dongle
  for (const device of dongleSelfInterfaces) {
    await openHidDevice(device);
    results.push(await wrapHidDevice(device));
  }

  // 3. Controller slots (usage=0x01) are NOT returned as top-level devices.
  //    Use getConnectedControllers() to query them for a specific dongle.
  debug(`getGrantedHidDevices: ${controllerSlotInterfaces.length} controller slot(s) available (query via getConnectedControllers)`);

  return results;
}

interface SlotAttrs {
  hardwareId: number;
  buildTimestamp: number;
  bootBuildTimestamp: number;
  productId: number;
  capabilities: number;
}

/**
 * Read numeric attributes from a device on a specific report ID.
 */
async function readAttrsRaw(
  device: HIDDevice,
  reportId: number,
): Promise<SlotAttrs | null> {
  try {
    await sendFeatureReport(device, reportId, new Uint8Array([OPCODE_GET_NUMERIC_ATTRS]));
    const { reportType, reportLength, reportData } = await receiveFeatureReport(device, reportId);
    if (reportType !== OPCODE_GET_NUMERIC_ATTRS || !reportLength) return null;
    const numAttrs = Math.floor(reportLength / 5);
    const view = new DataView(reportData.buffer, reportData.byteOffset, reportData.byteLength);
    const result: SlotAttrs = { hardwareId: 0, buildTimestamp: 0, bootBuildTimestamp: 0, productId: 0, capabilities: 0 };
    for (let i = 0; i < numAttrs; i++) {
      const tag = view.getUint8(i * 5);
      const val = view.getUint32(i * 5 + 1, true);
      if (tag === AttributeTag.HardwareId) result.hardwareId = val;
      if (tag === AttributeTag.BuildTimestamp) result.buildTimestamp = val;
      if (tag === AttributeTag.BootBuildTimestamp) result.bootBuildTimestamp = val;
      if (tag === AttributeTag.ProductId) result.productId = val;
      if (tag === AttributeTag.Capabilities) result.capabilities = val;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Scan controller slot interfaces for wirelessly connected controllers.
 * Returns info for each connected controller (deduplicated by serial).
 *
 * These controllers are read-only — they cannot be updated over ESB,
 * only over USB. This is for display purposes.
 */
export async function getConnectedControllers(): Promise<ConnectedController[]> {
  const allDevices = await navigator.hid.getDevices();
  const slotDevices = allDevices.filter(
    (d) =>
      d.vendorId === VALVE_VID &&
      DONGLE_PIDS.has(d.productId) &&
      d.collections.some(
        (c) => (c.usagePage ?? 0) >= 0xff00 && c.usage === CONTROLLER_SLOT_USAGE,
      ),
  );

  debug(`getConnectedControllers: ${slotDevices.length} slot(s)`);

  const seen = new Set<string>();
  const controllers: ConnectedController[] = [];
  let slotIndex = 0;

  for (const device of slotDevices) {
    slotIndex++;
    await openHidDevice(device);

    // Controller slots always use report ID 1 for the connected Triton
    const serial = await readSerialRaw(device, 1, OPCODE_GET_STRING_ATTR);
    if (!serial) {
      debug(`getConnectedControllers: slot ${slotIndex} empty`);
      continue;
    }
    if (seen.has(serial)) {
      debug(`getConnectedControllers: slot ${slotIndex} duplicate for ${serial}`);
      continue;
    }
    seen.add(serial);

    const attrs = await readAttrsRaw(device, 1);
    debug(`getConnectedControllers: slot ${slotIndex} found ${serial}`, attrs);

    controllers.push({
      slot: slotIndex,
      serialNumber: serial,
      hardwareId: attrs?.hardwareId ?? 0,
      buildTimestamp: attrs?.buildTimestamp ?? 0,
      bootBuildTimestamp: attrs?.bootBuildTimestamp ?? 0,
      productId: attrs?.productId ?? 0,
      capabilities: attrs?.capabilities ?? 0,
      device,
    });
  }

  return controllers;
}

/**
 * Attach input report listeners to all controller slot interfaces
 * and the dongle-self interface, logging every report to the debug log.
 * Returns a cleanup function that removes all listeners.
 *
 * Use this to discover which input reports fire when a controller
 * connects/disconnects wirelessly.
 */
export async function watchInputReports(): Promise<() => void> {
  const allDevices = await navigator.hid.getDevices();
  const valveDevices = allDevices.filter(
    (d) =>
      d.vendorId === VALVE_VID &&
      DONGLE_PIDS.has(d.productId) &&
      d.collections.some((c) => (c.usagePage ?? 0) >= 0xff00),
  );

  const cleanups: (() => void)[] = [];

  for (let i = 0; i < valveDevices.length; i++) {
    const device = valveDevices[i];
    await openHidDevice(device);
    const usage = getVendorUsage(device);
    const label = usage === DONGLE_SELF_USAGE
      ? "dongle-self"
      : usage === CONTROLLER_SLOT_USAGE
        ? `slot-${i}`
        : `unknown-${i}`;

    const handler = (e: HIDInputReportEvent) => {
      // Filter out noisy periodic reports:
      // 66 (0x42) = controller input state (high frequency)
      // 67 (0x43) = ~1/s periodic
      // 123 (0x7B) = ~1/s periodic
      if (e.reportId === 66 || e.reportId === 67 || e.reportId === 123) return;
      const data = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
      const hex = Array.from(data.subarray(0, 32), (b) => b.toString(16).padStart(2, "0")).join(" ");
      debug(`inputReport [${label}] reportId=${e.reportId} len=${data.length} data=[${hex}${data.length > 32 ? "..." : ""}]`);
    };

    device.addEventListener("inputreport", handler);
    cleanups.push(() => device.removeEventListener("inputreport", handler));
    debug(`watchInputReports: listening on ${label} (usage=0x${(usage ?? 0).toString(16)})`);
  }

  debug(`watchInputReports: attached to ${valveDevices.length} interface(s)`);

  return () => {
    for (const cleanup of cleanups) cleanup();
    debug("watchInputReports: stopped");
  };
}

/** Report ID 121 (0x79) = wireless controller connection status.
 *  Data: [0x02] = connected, [0x01] = disconnected. */
const CONNECTION_STATUS_REPORT_ID = 121;

/**
 * Watch controller slot interfaces for wireless connect/disconnect events.
 * Calls `onChange` when a controller connects or disconnects from the dongle.
 * Returns a cleanup function that removes all listeners.
 */
export async function watchControllerSlots(
  onChange: () => void,
): Promise<() => void> {
  const allDevices = await navigator.hid.getDevices();
  const slotDevices = allDevices.filter(
    (d) =>
      d.vendorId === VALVE_VID &&
      DONGLE_PIDS.has(d.productId) &&
      d.collections.some(
        (c) => (c.usagePage ?? 0) >= 0xff00 && c.usage === CONTROLLER_SLOT_USAGE,
      ),
  );

  const cleanups: (() => void)[] = [];

  for (const device of slotDevices) {
    await openHidDevice(device);

    const handler = (e: HIDInputReportEvent) => {
      if (e.reportId !== CONNECTION_STATUS_REPORT_ID) return;
      const status = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)[0];
      debug(`controllerSlot: connection status=${status === 2 ? "connected" : status === 1 ? "disconnected" : `unknown(${status})`}`);
      onChange();
    };

    device.addEventListener("inputreport", handler);
    cleanups.push(() => device.removeEventListener("inputreport", handler));
  }

  debug(`watchControllerSlots: listening on ${slotDevices.length} slot(s)`);

  return () => {
    for (const cleanup of cleanups) cleanup();
    debug("watchControllerSlots: stopped");
  };
}

/**
 * Get the device class for a given device type.
 */
export { PID_TO_DEVICE_TYPE };
