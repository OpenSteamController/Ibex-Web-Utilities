import { useEffect, useRef } from "react";
import type { BootloaderDevice } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import type { CardAccent, NotifyInput } from "../notifications-context";
import {
  bootloaderDeviceLabel,
  connectedDeviceAccent,
  connectedDeviceLabel,
  controllerLabel,
} from "../device-labels";

interface DeviceEntry {
  label: string;
  accent: CardAccent;
}

/** Coalesce device changes that land within this window into one card. Covers
 *  the Puck's multi-interface enumeration, the on-load burst, and rapid
 *  plug/unplug. */
const BATCH_WINDOW_MS = 500;

type Notify = (n: NotifyInput) => string;

/** Build a snapshot of every device currently present, keyed so the same
 *  physical device is stable across renders. Includes firmware-mode devices,
 *  serial bootloaders, and controllers wirelessly paired to the Puck. */
function buildWorld(
  devices: Map<string, ConnectedDevice>,
  bootloaderDevices: BootloaderDevice[],
): Map<string, DeviceEntry> {
  const world = new Map<string, DeviceEntry>();
  for (const d of devices.values()) {
    world.set(`dev:${d.info.serialNumber}:${d.info.type}`, {
      label: connectedDeviceLabel(d),
      accent: connectedDeviceAccent(d),
    });
    for (const c of d.connectedControllers) {
      world.set(`wl:${c.serialNumber}`, {
        label: controllerLabel(c),
        accent: "wireless",
      });
    }
  }
  for (const b of bootloaderDevices) {
    const serial = b.info.unitSerial || b.deviceType;
    world.set(`bl:${serial}`, {
      label: bootloaderDeviceLabel(b),
      accent: "bootloader",
    });
  }
  return world;
}

function sameKeys(a: Map<string, DeviceEntry>, b: Map<string, DeviceEntry>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

function emitDiff(
  before: Map<string, DeviceEntry>,
  after: Map<string, DeviceEntry>,
  notify: Notify,
): void {
  const added: DeviceEntry[] = [];
  const removed: DeviceEntry[] = [];
  for (const [key, entry] of after) if (!before.has(key)) added.push(entry);
  for (const [key, entry] of before) if (!after.has(key)) removed.push(entry);

  const total = added.length + removed.length;
  if (total === 0) return;

  if (total === 1) {
    const entry = added[0] ?? removed[0];
    const connected = added.length === 1;
    notify({
      variant: "device",
      accent: entry.accent,
      title: `${entry.label} ${connected ? "connected" : "disconnected"}`,
    });
    return;
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} connected`);
  if (removed.length) parts.push(`${removed.length} disconnected`);
  notify({
    variant: "device",
    accent: "neutral",
    title: `Devices ${parts.join(", ")}`,
    lines: [
      ...added.map((e) => `+ ${e.label}`),
      ...removed.map((e) => `− ${e.label}`),
    ],
  });
}

/** Surfaces a notification card when devices attach or detach. Changes are
 *  batched over a short window and the net diff is emitted as one card, so
 *  churn (a device that connects then disconnects, or a bootloader→firmware
 *  reboot) collapses cleanly. */
export function useDeviceChangeNotifications(
  devices: Map<string, ConnectedDevice>,
  bootloaderDevices: BootloaderDevice[],
  notify: Notify,
): void {
  // The world as of the last emitted card (empty at startup, so already-present
  // devices are reported on load). Persists across renders.
  const committedRef = useRef<Map<string, DeviceEntry>>(new Map());
  // The freshest world; the debounced flush diffs committed → latest.
  const latestRef = useRef<Map<string, DeviceEntry>>(new Map());

  useEffect(() => {
    const current = buildWorld(devices, bootloaderDevices);
    latestRef.current = current;

    // Nothing pending (or churn cancelled back to the committed state).
    if (sameKeys(current, committedRef.current)) return;

    // Trailing debounce: the cleanup clears the timer on every dependency
    // change, so rapid changes coalesce into a single flush.
    const handle = setTimeout(() => {
      const before = committedRef.current;
      const after = latestRef.current;
      committedRef.current = after;
      emitDiff(before, after, notify);
    }, BATCH_WINDOW_MS);

    return () => clearTimeout(handle);
  }, [devices, bootloaderDevices, notify]);
}
