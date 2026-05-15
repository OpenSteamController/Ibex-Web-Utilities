import { FW_CHUNK_SIZE } from "./constants.js";
import { DeviceType, DeviceClass } from "./types.js";
import type {
  ValveHidDevice,
  ValveSerialPort,
  DeviceInfo,
  BootloaderInfo,
  FirmwareFile,
  UpdateEventCallback,
} from "./types.js";
import {
  getTritonSerial,
  getDongleSerial,
  getTritonBuildInfo,
  getDongleBuildInfo,
  rebootToBootloader,
} from "./hid/hid-protocol.js";
import { getBootloaderInfo as serialGetBootloaderInfo } from "./serial/serial-protocol.js";
import {
  eraseFlash,
  sendFirmwareChunk,
  finalizeFirmware,
  resetDevice,
} from "./serial/serial-protocol.js";
import { openSerialPort, closeSerialPort } from "./serial/serial-transport.js";
import { validateFirmwareForDevice, getFirmwareDeviceClass } from "./firmware.js";

function getDeviceClass(deviceType: DeviceType): DeviceClass {
  switch (deviceType) {
    case DeviceType.TritonBootloader:
    case DeviceType.TritonUSB:
    case DeviceType.TritonBLE:
    case DeviceType.TritonESB:
      return DeviceClass.Triton;
    case DeviceType.ProteusBootloader:
    case DeviceType.ProteusUSB:
    case DeviceType.NereidUSB:
      return DeviceClass.Proteus;
    default: {
      const _exhaustive: never = deviceType;
      throw new Error(`Unhandled DeviceType: ${_exhaustive}`);
    }
  }
}

/**
 * Read device info from a HID device (serial number, hardware ID, build timestamp).
 */
export async function getDeviceInfo(
  dev: ValveHidDevice,
): Promise<DeviceInfo> {
  const deviceClass = getDeviceClass(dev.deviceType);
  let serialNumber: string | null;
  let hardwareId: number;
  let buildTimestamp: number;

  if (deviceClass === DeviceClass.Triton) {
    serialNumber = await getTritonSerial(dev);
    const info = await getTritonBuildInfo(dev);
    hardwareId = info.hardwareId;
    buildTimestamp = info.buildTimestamp;
  } else {
    serialNumber = await getDongleSerial(dev);
    const info = await getDongleBuildInfo(dev);
    hardwareId = info.hardwareId;
    buildTimestamp = info.buildTimestamp;
  }

  return {
    type: dev.deviceType,
    deviceClass,
    serialNumber: serialNumber ?? "Unknown",
    hardwareId,
    buildTimestamp,
  };
}

/**
 * Read device info from a bootloader serial port.
 */
export async function getBootloaderDeviceInfo(
  transport: ValveSerialPort,
): Promise<BootloaderInfo> {
  return serialGetBootloaderInfo(transport);
}

/**
 * Flash firmware to a device already in bootloader mode over serial.
 *
 * Flow: erase -> send 32KB chunks with progress -> finalize with header -> reset
 */
export async function flashFirmware(
  transport: ValveSerialPort,
  firmware: FirmwareFile,
  onEvent?: UpdateEventCallback,
): Promise<void> {
  try {
    onEvent?.({ type: "erasing" });
    await eraseFlash(transport);

    const data = firmware.data;
    const totalSize = data.length;
    let offset = 0;

    while (offset < totalSize) {
      const end = Math.min(offset + FW_CHUNK_SIZE, totalSize);
      const chunk = data.subarray(offset, end);

      offset = end;
      const percent = Math.min((offset / totalSize) * 100, 100);
      onEvent?.({ type: "programming", percent });

      await sendFirmwareChunk(transport, chunk);
    }

    onEvent?.({ type: "finalizing" });
    await finalizeFirmware(transport, firmware.metadata.headerBytes);

    onEvent?.({ type: "resetting" });
    await resetDevice(transport);

    onEvent?.({ type: "complete" });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    onEvent?.({ type: "error", error });
    throw e;
  }
}

/**
 * Full firmware update for a device currently in normal HID mode.
 *
 * 1. Validates firmware matches device class
 * 2. Reboots device to bootloader via HID
 * 3. Waits for re-enumeration
 * 4. Calls requestPort (requires user gesture) to get serial access
 * 5. Flashes firmware over serial
 */
export async function updateDeviceFromNormalMode(
  hidDevice: ValveHidDevice,
  firmware: FirmwareFile,
  requestPort: () => Promise<SerialPort>,
  onEvent?: UpdateEventCallback,
): Promise<void> {
  const deviceClass = getDeviceClass(hidDevice.deviceType);
  validateFirmwareForDevice(firmware, deviceClass);

  // Reboot into bootloader
  await rebootToBootloader(deviceClass, hidDevice);

  // Wait for device to re-enumerate as a serial device
  await new Promise((r) => setTimeout(r, 4000));

  // User must grant serial port access (requires gesture)
  const port = await requestPort();
  const transport = await openSerialPort(port);

  try {
    await flashFirmware(transport, firmware, onEvent);
  } finally {
    await closeSerialPort(transport);
  }
}

export { getDeviceClass };
