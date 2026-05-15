export enum DeviceType {
  TritonBootloader = 0,
  ProteusBootloader = 1,
  TritonUSB = 2,
  TritonBLE = 3,
  TritonESB = 4,
  ProteusUSB = 5,
  NereidUSB = 6,
}

export enum DeviceClass {
  Triton = 0,
  Proteus = 1,
}

export enum AttributeTag {
  UniqueId = 0,
  ProductId = 1,
  Capabilities = 2,
  BuildTimestamp = 4,
  RadioBuildTimestamp = 5,
  HardwareId = 9,
  BootBuildTimestamp = 10,
  FrameRate = 11,
  SecondaryBuildTimestamp = 12,
  SecondaryBootBuildTimestamp = 13,
  SecondaryHardwareId = 14,
  DataStreaming = 15,
  TrackpadId = 16,
  SecondaryTrackpadId = 17,
}

export const DeviceTypeNames: Record<DeviceType, string> = {
  [DeviceType.TritonBootloader]: "Steam Controller (Bootloader)",
  [DeviceType.ProteusBootloader]: "Steam Controller Puck (Bootloader)",
  [DeviceType.TritonUSB]: "Steam Controller (USB)",
  [DeviceType.TritonBLE]: "Steam Controller (BLE)",
  [DeviceType.TritonESB]: "Steam Controller (Wireless)",
  [DeviceType.ProteusUSB]: "Steam Controller Puck",
  [DeviceType.NereidUSB]: "Steam Controller Dongle",
};

export interface DeviceAttributes {
  uniqueId?: number;
  productId?: number;
  capabilities?: number;
  buildTimestamp?: number;
  radioBuildTimestamp?: number;
  hardwareId?: number;
  bootBuildTimestamp?: number;
  frameRate?: number;
  secondaryBuildTimestamp?: number;
  secondaryBootBuildTimestamp?: number;
  secondaryHardwareId?: number;
  dataStreaming?: number;
  trackpadId?: number;
  secondaryTrackpadId?: number;
}

export interface DeviceInfo {
  type: DeviceType;
  deviceClass: DeviceClass;
  serialNumber: string;
  hardwareId: number;
  buildTimestamp: number;
}

export interface ConnectedController {
  slot: number;
  serialNumber: string;
  hardwareId: number;
  buildTimestamp: number;
  bootBuildTimestamp: number;
  productId: number;
  capabilities: number;
  device: HIDDevice;
}

export interface BootloaderInfo {
  bootBuildTimestamp: number;
  installedFwMagic: number;
  installedFwSize: number;
  installedFwChecksum: number;
  hardwareId: number;
  unitSerial: string;
  pcbaSerial: string;
}

export interface FirmwareMetadata {
  magic: number;
  payloadSize: number;
  payloadChecksum: number;
  headerBytes: Uint8Array;
}

export interface FirmwareFile {
  metadata: FirmwareMetadata;
  data: Uint8Array;
}

export type UpdateEvent =
  | { type: "erasing" }
  | { type: "programming"; percent: number }
  | { type: "finalizing" }
  | { type: "resetting" }
  | { type: "complete" }
  | { type: "error"; error: Error };

export type UpdateEventCallback = (event: UpdateEvent) => void;

export interface ValveHidDevice {
  device: HIDDevice;
  bcdVersion: number;
  deviceType: DeviceType;
}

export interface ValveSerialPort {
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
}
