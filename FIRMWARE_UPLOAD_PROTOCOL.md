# Firmware Upload Protocol (Serial Bootloader)

This document describes the serial protocol used to communicate with the bootloader on Valve Steam Controller (2026) devices (Triton and Proteus). The bootloader is accessed over USB CDC serial at 115200 baud after the device is rebooted from normal HID mode.

## Framing

All messages on the wire are wrapped in a byte-stuffed frame. Three bytes have special meaning:

| Byte   | Name   | Value  |
|--------|--------|--------|
| `0xAD` | SOF    | Start of frame |
| `0xAE` | EOF    | End of frame |
| `0xAC` | ESCAPE | Escape prefix |

A frame on the wire looks like:

```
[SOF] [escaped payload bytes...] [EOF]
```

Because SOF, EOF, and ESCAPE are reserved, any occurrence of these bytes *within* the payload must be escaped. The escaping scheme replaces a reserved byte with a two-byte sequence:

| Literal byte | Escaped as     |
|--------------|----------------|
| `0xAC` (ESCAPE) | `0xAC 0x00` |
| `0xAD` (SOF)    | `0xAC 0x01` |
| `0xAE` (EOF)    | `0xAC 0x02` |

To decode, when an `0xAC` byte is encountered in the payload, the next byte is read and added to `0xAC` to recover the original value (e.g. `0xAC + 0x00 = 0xAC`, `0xAC + 0x01 = 0xAD`, `0xAC + 0x02 = 0xAE`).

Because raw `0xAE` bytes in the payload are always escaped, a raw `0xAE` on the wire unambiguously marks the end of a frame. The receiver can simply read bytes until `0xAE` is seen.

## Request / Response

Communication is request/response — the host sends a framed message, and the bootloader replies with a framed message. All message IDs are encoded as **little-endian uint16**.

Every response begins with a single status byte:
- `0x00` = ACK (success). Any remaining bytes after the status are the response payload.
- Any other value = error.

## Protocol Messages

| Message ID | Name       | Direction | Request Payload | Response Payload (after ACK byte) |
|------------|------------|-----------|-----------------|-----------------------------------|
| `0x1233`   | INFO       | Host -> Device | *(none, just the 2-byte message ID)* | 164 bytes: 36-byte header + 128-byte provisioning block |
| `0x1234`   | FW_BEGIN   | Host -> Device | *(none)* | *(none)* |
| `0x1235`   | FW_DATA    | Host -> Device | `u16le chunk_size` + `chunk_data[chunk_size]` | *(none)* |
| `0x1236`   | FW_END     | Host -> Device | `u8[32] firmware_header` | *(none)* |
| `0x1237`   | RESET      | Host -> Device | *(none)* | *(none)* |
| `0x1238`   | PROVISION  | Host -> Device | `u32le magic` (must be `0xE86DA4C7`) + provisioning data (~26 bytes) | *(none)* |

### INFO Response Layout

The 164-byte INFO response is split into two sections:

**Header (bytes 0–35):**

| Offset | Size | Type   | Description |
|--------|------|--------|-------------|
| 0      | 4    | u32le  | Bootloader build timestamp |
| 4      | 4    | u32le  | Installed firmware magic |
| 8      | 4    | u32le  | Installed firmware payload size |
| 12     | 4    | u32le  | Installed firmware CRC32 checksum |
| 16     | 20   | —      | Reserved / unused |

**Provisioning block (bytes 36–163):**

| Offset | Size | Type      | Description |
|--------|------|-----------|-------------|
| 0      | 4    | u32le     | Provisioning magic (`0xAC32A429`) |
| 4      | 4    | u32le     | Hardware ID |
| 8      | 16   | UTF-8 str | Unit serial number (null-terminated) |
| 24     | 16   | UTF-8 str | PCBA serial number (null-terminated) |
| 40     | 88   | —         | Remaining provisioning data |

### FW_DATA Chunk Format

The FW_DATA request payload (after the 2-byte message ID) contains:

| Offset | Size | Type  | Description |
|--------|------|-------|-------------|
| 0      | 2    | u16le | Chunk data length in bytes |
| 2      | N    | u8[]  | Chunk data (must be 4-byte aligned; pad with `0xFF`) |

Chunks are sent sequentially and are typically 32 KB (32768 bytes) each, with the final chunk being smaller.

### FW_END Header Format

The 32-byte firmware metadata header sent with FW_END is the same header found at the beginning of `.fw` files:

| Offset | Size | Type  | Description |
|--------|------|-------|-------------|
| 0      | 4    | u32le | Firmware magic (`0xD2D86467` = Triton, `0x2E795631` = Proteus) |
| 4      | 4    | u32le | Payload size (bytes, excluding this 32-byte header) |
| 8      | 4    | u32le | Payload CRC32 checksum |
| 12     | 20   | —     | Reserved (remaining header bytes) |

### PROVISION

PROVISION (`0x1238`) is a factory provisioning command that programs the device's serial numbers and hardware ID. The `0xE86DA4C7` magic acts as a gate to prevent accidental erasure.

**Request payload (after the 2-byte message ID):**

| Offset | Size | Type  | Description |
|--------|------|-------|-------------|
| 0      | 4    | u32le | Gate magic — must be `0xE86DA4C7` (NACKs otherwise) |
| 4      | ~26  | u8[]  | Provisioning data |

The provisioning data layout matches the provisioning block returned by INFO:

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 4    | Provisioning magic (`0xAC32A429`) |
| 4      | 4    | Hardware ID |
| 8      | 16   | Unit serial number (null-terminated UTF-8) |
| 24     | 16   | PCBA serial number (null-terminated UTF-8) |

## Firmware Upload Flow

A complete firmware upload proceeds as follows:

1. **Reboot to bootloader** — Send an HID command to reboot the device into bootloader mode. The device disconnects from USB and re-enumerates as a CDC serial device (VID `0x28DE`, PID `0x1005` for Triton or `0x1007` for Proteus).

2. **Open serial port** — Connect to the serial device at 115200 baud.

3. **INFO** (optional) — Query the bootloader for device identification and currently installed firmware details. Validate the provisioning magic and hardware ID.

4. **FW_BEGIN** — Erase the device's firmware flash region. The bootloader ACKs once erasure is complete.

5. **FW_DATA** (repeated) — Send firmware payload data in 32 KB chunks. Each chunk is 4-byte aligned (padded with `0xFF` if needed). The bootloader writes each chunk to flash and ACKs. Repeat until all payload data has been sent.

6. **FW_END** — Send the 32-byte firmware metadata header. The bootloader writes it and performs a final validation.

7. **RESET** — Reset the device. It reboots into the newly flashed firmware and re-enumerates as a HID device.
