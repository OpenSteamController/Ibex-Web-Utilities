import { useEffect, useRef, type MutableRefObject } from "react";
import type { BootloaderPort } from "@lib/index.js";
import type { NotifyInput } from "../notifications-context";

type Notify = (n: NotifyInput) => string;
type Dismiss = (id: string) => void;

/** Notifies about the Puck's brief bootloader window. When a Puck shows up as a
 *  pending card it announces it with a countdown matching the window; when that
 *  window times out it announces the close. If the user instead clicks "Connect
 *  to Bootloader" (a promotion), the pending card is dismissed silently — the
 *  device-change hook's "… (Bootloader) connected" card covers that case.
 *
 *  Keyed by SerialPort object identity since pending ports have no unit serial
 *  until their INFO is read on connect. */
export function usePendingPuckNotifications(
  pendingPuckPorts: BootloaderPort[],
  promotedPortsRef: MutableRefObject<Set<SerialPort>>,
  puckTimeoutMs: number,
  notify: Notify,
  dismiss: Dismiss,
): void {
  // Port → id of its "in bootloader mode" card, so we can dismiss it when the
  // pending state ends (whether by timeout or by connecting).
  const cardIdsRef = useRef<Map<SerialPort, string>>(new Map());

  useEffect(() => {
    const current = new Set(pendingPuckPorts.map((p) => p.port));
    const cards = cardIdsRef.current;

    // Newly pending → announce, with a countdown matching the bootloader window.
    for (const p of pendingPuckPorts) {
      if (cards.has(p.port)) continue;
      const id = notify({
        variant: "device",
        accent: "bootloader",
        title: "Steam Controller Puck in bootloader mode",
        lines: ["Connect now to flash — the window closes shortly."],
        durationMs: puckTimeoutMs,
      });
      cards.set(p.port, id);
    }

    // No longer pending → dismiss its card. If it wasn't promoted by the user
    // clicking Connect, it timed out, so announce the window closing.
    for (const [port, id] of cards) {
      if (current.has(port)) continue;
      dismiss(id);
      cards.delete(port);
      if (promotedPortsRef.current.has(port)) {
        promotedPortsRef.current.delete(port);
      } else {
        notify({
          variant: "device",
          accent: "neutral",
          title: "Steam Controller Puck bootloader window closed",
        });
      }
    }
  }, [pendingPuckPorts, promotedPortsRef, puckTimeoutMs, notify, dismiss]);
}
