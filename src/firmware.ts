import {
  TRITON_FW_MAGIC,
  PROTEUS_FW_MAGIC,
  FW_HEADER_SIZE,
  FW_MAX_SIZE,
} from "./constants.js";
import { DeviceClass } from "./types.js";
import { InvalidFirmwareError } from "./errors.js";
import { crc32 } from "./crc32.js";
import type { FirmwareFile } from "./types.js";

export function parseFirmware(raw: Uint8Array): FirmwareFile {
  if (raw.byteLength < FW_HEADER_SIZE) {
    throw new InvalidFirmwareError("Firmware file too small");
  }

  if (raw.byteLength > FW_MAX_SIZE) {
    throw new InvalidFirmwareError(
      `Firmware file too large: ${raw.byteLength} bytes (max ${FW_MAX_SIZE})`,
    );
  }

  const headerBytes = raw.slice(0, FW_HEADER_SIZE);
  const view = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength,
  );
  const magic = view.getUint32(0, true);

  if (magic !== TRITON_FW_MAGIC && magic !== PROTEUS_FW_MAGIC) {
    throw new InvalidFirmwareError(
      `Invalid firmware magic: 0x${magic.toString(16)}`,
    );
  }

  const payloadSize = view.getUint32(4, true);
  const payloadChecksum = view.getUint32(8, true);
  const data = raw.slice(FW_HEADER_SIZE);

  const actualSize = data.byteLength;
  if (payloadSize !== actualSize) {
    throw new InvalidFirmwareError(
      `Payload size mismatch: header says ${payloadSize} bytes, actual is ${actualSize} bytes`,
    );
  }

  const actualChecksum = crc32(data);
  if (payloadChecksum !== actualChecksum) {
    throw new InvalidFirmwareError(
      `Checksum mismatch: header says 0x${payloadChecksum.toString(16).toUpperCase()}, actual is 0x${actualChecksum.toString(16).toUpperCase()}`,
    );
  }

  return {
    metadata: { magic, payloadSize, payloadChecksum, headerBytes },
    data,
  };
}

export function getFirmwareDeviceClass(firmware: FirmwareFile): DeviceClass {
  if (firmware.metadata.magic === TRITON_FW_MAGIC) {
    return DeviceClass.Triton;
  }
  return DeviceClass.Proteus;
}

export function validateFirmwareForDevice(
  firmware: FirmwareFile,
  deviceClass: DeviceClass,
): void {
  const FRIENDLY_NAMES: Record<DeviceClass, string> = {
    [DeviceClass.Triton]: "Controller",
    [DeviceClass.Proteus]: "Puck",
  };
  const fwClass = getFirmwareDeviceClass(firmware);
  if (fwClass !== deviceClass) {
    throw new InvalidFirmwareError(
      `Firmware is for ${FRIENDLY_NAMES[fwClass]}, but device is ${FRIENDLY_NAMES[deviceClass]}`,
    );
  }
}
