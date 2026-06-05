import { DeviceClass } from "@lib/index.js";
import type { BootloaderDevice, ConnectedController } from "@lib/index.js";
import type { ConnectedDevice } from "./App";
import type { CardAccent } from "./notifications-context";

/** Friendly name for a normally-connected (firmware-mode) device. */
export function connectedDeviceLabel(d: ConnectedDevice): string {
  switch (d.info.deviceClass) {
    case DeviceClass.Triton:
      return "Steam Controller";
    case DeviceClass.Proteus:
      return "Steam Controller Puck";
    default:
      return "Unknown Device";
  }
}

export function connectedDeviceAccent(d: ConnectedDevice): CardAccent {
  switch (d.info.deviceClass) {
    case DeviceClass.Proteus:
      return "puck";
    case DeviceClass.Triton:
      return "controller";
    default:
      return "neutral";
  }
}

/** Friendly name for a device sitting in serial bootloader mode. */
export function bootloaderDeviceLabel(b: BootloaderDevice): string {
  const base =
    b.deviceClass === DeviceClass.Proteus ? "Steam Controller Puck" : "Steam Controller";
  return `${base} (Bootloader)`;
}

/** Friendly name for a controller wirelessly paired to the Puck. */
export function controllerLabel(c: ConnectedController): string {
  return `Steam Controller (Slot ${c.slot})`;
}
