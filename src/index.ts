// Types
export type {
  DeviceInfo,
  BootloaderInfo,
  ConnectedController,
  FirmwareFile,
  FirmwareMetadata,
  DeviceAttributes,
  UpdateEvent,
  UpdateEventCallback,
  ValveHidDevice,
  ValveSerialPort,
} from "./types.js";
export {
  DeviceType,
  DeviceClass,
  DeviceTypeNames,
  AttributeTag,
} from "./types.js";

// Device discovery (user gesture required)
export {
  requestHidDevice,
  getGrantedHidDevices,
  getConnectedControllers,
  watchControllerSlots,
  watchInputReports,
} from "./hid/hid-device-discovery.js";
export { requestSerialPort } from "./serial/serial-transport.js";
export type { BootloaderDevice, BootloaderPort } from "./serial/serial-discovery.js";
export {
  listGrantedBootloaderPorts,
  findGrantedBootloaderPort,
  readBootloaderInfo,
} from "./serial/serial-discovery.js";

// Device info
export {
  getDeviceInfo,
  getBootloaderDeviceInfo,
  getDeviceClass,
} from "./updater.js";

// Firmware parsing
export {
  parseFirmware,
  getFirmwareDeviceClass,
  validateFirmwareForDevice,
} from "./firmware.js";

// Update operations
export { flashFirmware, updateDeviceFromNormalMode } from "./updater.js";

// Low-level HID protocol (for advanced use)
export {
  getTritonSerial,
  getDongleSerial,
  getTritonBuildInfo,
  getDongleBuildInfo,
  readAllAttributes,
  rebootToBootloader,
  rebootControllerSlot,
  reboot,
} from "./hid/hid-protocol.js";

// Low-level transport (for advanced use)
export { openHidDevice, closeHidDevice } from "./hid/hid-transport.js";
export {
  openSerialPort,
  closeSerialPort,
} from "./serial/serial-transport.js";

// Errors
export {
  FirmwareUpdaterError,
  DeviceNotFoundError,
  ProtocolError,
  InvalidFirmwareError,
  DeviceCommunicationError,
  UserCancelledError,
} from "./errors.js";

// Debug
export type { DebugEntry, DebugListener } from "./debug.js";
export {
  enableDebug,
  disableDebug,
  isDebugEnabled,
  onDebug,
  getDebugLog,
  clearDebugLog,
} from "./debug.js";
