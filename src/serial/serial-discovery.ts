import { VALVE_VID, BOOTLOADER_PIDS } from "../constants.js";
import { DeviceType, DeviceClass } from "../types.js";
import type { BootloaderInfo } from "../types.js";
import { debug } from "../debug.js";
import { openSerialPort, closeSerialPort } from "./serial-transport.js";
import { getBootloaderInfo } from "./serial-protocol.js";

export interface BootloaderPort {
  port: SerialPort;
  deviceType: DeviceType;
  deviceClass: DeviceClass;
}

export interface BootloaderDevice extends BootloaderPort {
  info: BootloaderInfo;
  /** Wall-clock time (Date.now()) of the most recent INFO request to
   *  this device. The bootloader auto-exits to firmware ~120 s after the
   *  last INFO, so the UI can show a countdown until then. */
  lastInfoAt: number;
}

const PID_TO_BL_TYPE: Record<number, { type: DeviceType; class: DeviceClass }> = {
  [BOOTLOADER_PIDS.TRITON]: { type: DeviceType.TritonBootloader, class: DeviceClass.Triton },
  [BOOTLOADER_PIDS.PROTEUS]: { type: DeviceType.ProteusBootloader, class: DeviceClass.Proteus },
};

function getPortInfo(port: SerialPort): { vid: number; pid: number } | null {
  const info = port.getInfo();
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    return { vid: info.usbVendorId, pid: info.usbProductId };
  }
  return null;
}

/**
 * List previously-granted serial ports that look like Valve bootloader
 * devices, classified by device type. Does not open the port or send any
 * traffic — caller decides when to read INFO via `readBootloaderInfo`.
 *
 * The Puck always enumerates in bootloader mode on power-up and times out
 * to firmware after ~5 seconds if nothing talks to it. Opening the port
 * keeps it stuck in bootloader, so callers should hold off on Puck
 * bootloader ports unless the user has explicitly asked to talk to them.
 */
export async function listGrantedBootloaderPorts(): Promise<BootloaderPort[]> {
  if (!navigator.serial) return [];
  const ports = await navigator.serial.getPorts();
  const results: BootloaderPort[] = [];
  for (const port of ports) {
    const portInfo = getPortInfo(port);
    if (!portInfo || portInfo.vid !== VALVE_VID) continue;
    const blType = PID_TO_BL_TYPE[portInfo.pid];
    if (!blType) continue;
    debug(`listGrantedBootloaderPorts: found ${DeviceType[blType.type]} VID=0x${portInfo.vid.toString(16)} PID=0x${portInfo.pid.toString(16)}`);
    results.push({ port, deviceType: blType.type, deviceClass: blType.class });
  }
  return results;
}

/**
 * Check whether a previously-granted bootloader port exists for the given
 * device class. Returns the first match, or null if none. Doesn't open or
 * talk to the port — only inspects USB descriptors.
 */
export async function findGrantedBootloaderPort(
  deviceClass: DeviceClass,
): Promise<BootloaderPort | null> {
  const ports = await listGrantedBootloaderPorts();
  return ports.find((p) => p.deviceClass === deviceClass) ?? null;
}

/**
 * Open a known bootloader port, query INFO, and close it. Returns null on
 * failure (e.g., the device transitioned out of bootloader mode before we
 * could talk to it).
 */
export async function readBootloaderInfo(bp: BootloaderPort): Promise<BootloaderDevice | null> {
  try {
    const transport = await openSerialPort(bp.port);
    try {
      const info = await getBootloaderInfo(transport);
      const lastInfoAt = Date.now();
      debug(`readBootloaderInfo: ${DeviceType[bp.deviceType]} serial=${info.unitSerial} hwid=${info.hardwareId}`);
      return { ...bp, info, lastInfoAt };
    } finally {
      await closeSerialPort(transport);
    }
  } catch (e) {
    debug("readBootloaderInfo: failed", e);
    return null;
  }
}
