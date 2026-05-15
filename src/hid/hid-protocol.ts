import {
  OPCODE_GET_STRING_ATTR,
  OPCODE_GET_STRING_ATTR_V1,
  OPCODE_GET_NUMERIC_ATTRS,
  OPCODE_GET_NUMERIC_ATTRS_V1,
  OPCODE_REBOOT_TO_BL,
  OPCODE_REBOOT,
} from "../constants.js";
import { DeviceClass, AttributeTag } from "../types.js";
import type { ValveHidDevice, DeviceAttributes } from "../types.js";
import { sendFeatureReport, receiveFeatureReport } from "./hid-transport.js";

/**
 * Read a string attribute from the device.
 */
async function getStringAttribute(
  device: HIDDevice,
  reportId: number,
  attributeNumber: number,
  opcode: number,
): Promise<string | null> {
  const data = new Uint8Array([opcode, 1, attributeNumber]);
  await sendFeatureReport(device, reportId, data);
  const { reportType, reportLength, reportData } =
    await receiveFeatureReport(device, reportId);

  if (!reportLength || reportType !== opcode) {
    return null;
  }

  // Skip the attribute number echo byte
  const strBytes = reportData.subarray(1);
  if (strBytes[0] === 0xff) {
    return "Not Provisioned";
  }

  const nullPos = strBytes.indexOf(0);
  if (nullPos === -1) {
    return "Not Provisioned";
  }

  const decoder = new TextDecoder("utf-8");
  return decoder.decode(strBytes.subarray(0, nullPos));
}

/**
 * Read numeric attribute values from the device.
 * Each attribute is encoded as a 5-byte pair: u8 tag + u32 LE value.
 */
async function getNumericAttributes(
  device: HIDDevice,
  reportId: number,
  opcode: number,
): Promise<DeviceAttributes> {
  const data = new Uint8Array([opcode]);
  await sendFeatureReport(device, reportId, data);
  const { reportLength, reportData } =
    await receiveFeatureReport(device, reportId);

  const numAttrs = Math.floor(reportLength / 5);
  if (!numAttrs) return {};

  const view = new DataView(
    reportData.buffer,
    reportData.byteOffset,
    reportData.byteLength,
  );
  const attrs: DeviceAttributes = {};

  for (let i = 0; i < numAttrs; i++) {
    const tag = view.getUint8(i * 5);
    const val = view.getUint32(i * 5 + 1, true);

    switch (tag) {
      case AttributeTag.UniqueId:
        attrs.uniqueId = val;
        break;
      case AttributeTag.ProductId:
        attrs.productId = val;
        break;
      case AttributeTag.Capabilities:
        attrs.capabilities = val;
        break;
      case AttributeTag.BuildTimestamp:
        attrs.buildTimestamp = val;
        break;
      case AttributeTag.RadioBuildTimestamp:
        attrs.radioBuildTimestamp = val;
        break;
      case AttributeTag.HardwareId:
        attrs.hardwareId = val;
        break;
      case AttributeTag.BootBuildTimestamp:
        attrs.bootBuildTimestamp = val;
        break;
      case AttributeTag.FrameRate:
        attrs.frameRate = val;
        break;
      case AttributeTag.SecondaryBuildTimestamp:
        attrs.secondaryBuildTimestamp = val;
        break;
      case AttributeTag.SecondaryBootBuildTimestamp:
        attrs.secondaryBootBuildTimestamp = val;
        break;
      case AttributeTag.SecondaryHardwareId:
        attrs.secondaryHardwareId = val;
        break;
      case AttributeTag.DataStreaming:
        attrs.dataStreaming = val;
        break;
      case AttributeTag.TrackpadId:
        attrs.trackpadId = val;
        break;
      case AttributeTag.SecondaryTrackpadId:
        attrs.secondaryTrackpadId = val;
        break;
    }
  }

  return attrs;
}

/**
 * Get serial number for a Triton-class device.
 * Always uses reportId=1, opcode=0xAE, attribute 1.
 */
export async function getTritonSerial(
  dev: ValveHidDevice,
): Promise<string | null> {
  return getStringAttribute(dev.device, 1, 1, OPCODE_GET_STRING_ATTR);
}

/**
 * Get serial number for a dongle device (Proteus/Nereid).
 * v2 (bcdVersion=2): reportId=2, opcode=0xAE
 * v1: reportId=1, opcode=0xA4
 */
export async function getDongleSerial(
  dev: ValveHidDevice,
): Promise<string | null> {
  if (dev.bcdVersion === 2) {
    return getStringAttribute(dev.device, 2, 1, OPCODE_GET_STRING_ATTR);
  }
  return getStringAttribute(dev.device, 1, 1, OPCODE_GET_STRING_ATTR_V1);
}

/**
 * Get build info (hardwareId, buildTimestamp) for a Triton device.
 */
export async function getTritonBuildInfo(
  dev: ValveHidDevice,
): Promise<{ hardwareId: number; buildTimestamp: number }> {
  const attrs = await getNumericAttributes(
    dev.device,
    1,
    OPCODE_GET_NUMERIC_ATTRS,
  );
  return {
    hardwareId: attrs.hardwareId ?? 0,
    buildTimestamp: attrs.buildTimestamp ?? 0,
  };
}

/**
 * Get build info for a dongle device (Proteus/Nereid).
 */
export async function getDongleBuildInfo(
  dev: ValveHidDevice,
): Promise<{ hardwareId: number; buildTimestamp: number }> {
  let attrs: DeviceAttributes;
  if (dev.bcdVersion === 2) {
    attrs = await getNumericAttributes(
      dev.device,
      2,
      OPCODE_GET_NUMERIC_ATTRS,
    );
  } else {
    attrs = await getNumericAttributes(
      dev.device,
      1,
      OPCODE_GET_NUMERIC_ATTRS_V1,
    );
  }
  return {
    hardwareId: attrs.hardwareId ?? 0,
    buildTimestamp: attrs.buildTimestamp ?? 0,
  };
}

/**
 * Read all numeric attributes from the device using the appropriate
 * report ID and opcode for the device type.
 */
export async function readAllAttributes(
  dev: ValveHidDevice,
): Promise<DeviceAttributes> {
  if (dev.bcdVersion === 2) {
    return getNumericAttributes(dev.device, 2, OPCODE_GET_NUMERIC_ATTRS);
  }
  return getNumericAttributes(dev.device, 1, OPCODE_GET_NUMERIC_ATTRS);
}

/**
 * Reboot a device into bootloader mode.
 */
export async function rebootToBootloader(
  deviceClass: DeviceClass,
  dev: ValveHidDevice,
): Promise<void> {
  const reportId =
    deviceClass === DeviceClass.Proteus && dev.bcdVersion === 2 ? 2 : 1;
  await sendFeatureReport(
    dev.device,
    reportId,
    new Uint8Array([OPCODE_REBOOT_TO_BL]),
  );
}

/**
 * Reboot a wirelessly-connected controller (via its Puck slot interface)
 * into bootloader mode. The controller stops responding on ESB and must
 * be plugged in via USB to receive the firmware update.
 */
export async function rebootControllerSlot(slot: HIDDevice): Promise<void> {
  await sendFeatureReport(slot, 1, new Uint8Array([OPCODE_REBOOT_TO_BL]));
}

/**
 * Normal reboot (Triton only).
 */
export async function reboot(dev: ValveHidDevice): Promise<void> {
  await sendFeatureReport(
    dev.device,
    1,
    new Uint8Array([OPCODE_REBOOT]),
  );
}
