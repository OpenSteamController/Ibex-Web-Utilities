# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-based firmware updater for Valve Steam Controller (2026) hardware. Ported from a decompiled Python tool (`hardwareupdater.py`). Uses WebHID for device communication and Web Serial for bootloader flashing.

**Device codenames:**
- **Triton** = Steam Controller (the handheld)
- **Proteus** = Steam Controller Puck (wireless dongle + charging pad)
- **Nereid** = Steam Machine integrated dongle (unconfirmed)
- **Ibex** = Another codename for the Steam Controller (used in firmware filenames)

## Build & Dev Commands

```bash
# Type-check
npm run check          # Both lib + web
npm run check:lib      # Library only (tsc --noEmit)
npm run check:web      # Web app only (tsc --noEmit --project web/tsconfig.json)

# Library build
npm run build          # tsc → dist/

# Web dev server
cd web && npm run dev  # Vite dev server with hot reload
```

The web app imports the library source directly via `@lib` path alias (resolves to `../src`), so library changes are hot-reloaded during `npm run dev`.

## Architecture

**Two packages in one repo:**
- `src/` — Protocol library (no React deps). Exports via `src/index.ts`. WebHID + Web Serial APIs.
- `web/` — React + Vite + Tailwind CSS 4 frontend. Imports library via `@lib/*` alias.

**Library layers:**
- `hid/hid-transport.ts` — Low-level feature report I/O. Handles WebHID quirks (report ID prefix detection, descriptor-based report sizing).
- `hid/hid-protocol.ts` — Device commands: read serial, attributes, reboot. Version-aware (v1 vs v2 protocol on different report IDs).
- `hid/hid-device-discovery.ts` — Device enumeration, dongle interface classification (usage=0x02 = dongle-self, usage=0x01 = controller slots), wireless connection monitoring via input report 121.
- `serial/serial-framing.ts` — SOF/EOF/ESCAPE byte-stuffing (pure functions).
- `serial/serial-transport.ts` — Web Serial port management.
- `serial/serial-protocol.ts` — Bootloader commands: INFO, FW_BEGIN/DATA/END, RESET.
- `serial/serial-discovery.ts` — Bootloader device enumeration via serial ports.
- `firmware.ts` — Parse and validate .fw files (32-byte header with magic + size + checksum).
- `updater.ts` — High-level orchestration (flash workflow, device info queries).

## Key Protocol Details

**HID (normal mode):** Feature reports on report IDs 1 and 2. Proteus v2 uses report ID 2 for dongle-self, v1 uses report ID 1 with different opcodes. Version detected by probing report ID 2 at discovery time.

**WebHID quirk (Chrome/Linux):** `receiveFeatureReport` includes the report ID as byte 0 of the DataView despite the spec saying otherwise. Auto-detected by checking if byte[0] === requested reportId.

**Report sizing:** Feature report data length must exactly match the HID descriptor. Read from `device.collections` at runtime, not hardcoded.

**Dongle interfaces:** The Puck exposes 5 HID interfaces — 1 dongle-self (vendor usage=0x02) + 4 controller slots (usage=0x01). Controller slots respond on report ID 1 only when a controller is wirelessly connected. Report ID 1 writes fail with NotAllowedError on empty slots.

**Wireless detection:** Input report ID 121 (1 byte): `0x02` = connected, `0x01` = disconnected.

**Serial (bootloader mode):** Framed protocol with SOF=0xAD, EOF=0xAE, ESCAPE=0xAC. Firmware sent in 32KB chunks. INFO response is 164 bytes: 36-byte header (bootloader timestamp, installed FW magic/size/checksum) + provisioning block.

## Web App Patterns

**Debounced hotplug:** USB connect/disconnect debounced 500ms (multi-interface devices enumerate one at a time). Wireless connect/disconnect debounced 500ms.

**Refresh hierarchy:** `refreshDevices()` = full HID + serial scan. `refreshControllers()` = lightweight controller slot rescan only (no dongle re-query). Wireless events use the lightweight path.

**State keying:** Devices keyed by `{serialNumber}:{deviceType}` to deduplicate multi-interface devices.
