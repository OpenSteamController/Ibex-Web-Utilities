export const VALVE_VID = 0x28de;

export const HID_PIDS = {
  TRITON_USB: 0x1302,
  TRITON_BLE: 0x1303,
  PROTEUS_USB: 0x1304,
  NEREID_USB: 0x1305,
} as const;

export const BOOTLOADER_PIDS = {
  TRITON: 0x1005,
  PROTEUS: 0x1007,
} as const;

// Serial framing bytes
export const SOF = 0xad;
export const EOF = 0xae;
export const ESCAPE = 0xac;

// Serial bootloader message IDs (little-endian u16)
export const MESSAGE_INFO = 0x1233;
export const MESSAGE_FW_BEGIN = 0x1234;
export const MESSAGE_FW_DATA = 0x1235;
export const MESSAGE_FW_END = 0x1236;
export const MESSAGE_RESET = 0x1237;

// HID opcodes
export const OPCODE_GET_STRING_ATTR = 0xae;
export const OPCODE_GET_STRING_ATTR_V1 = 0xa4;
export const OPCODE_GET_NUMERIC_ATTRS = 0x83;
export const OPCODE_GET_NUMERIC_ATTRS_V1 = 0xa6;
export const OPCODE_REBOOT_TO_BL = 0x90;
export const OPCODE_REBOOT = 0x95;

// Firmware header magic numbers
export const TRITON_FW_MAGIC = 0xd2d86467;
export const PROTEUS_FW_MAGIC = 0x2e795631;
export const PROVISIONING_MAGIC = 0xac32a429;

export const HID_REPORT_LEN = 64;
export const FW_CHUNK_SIZE = 32768;
export const FW_HEADER_SIZE = 32;
export const FW_MAX_SIZE = 0x75000;
export const MIN_HW_ID = 68;
