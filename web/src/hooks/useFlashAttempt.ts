import { useCallback, useState } from "react";
import { flashFirmware, openSerialPort, closeSerialPort } from "@lib/index.js";
import type { FirmwareFile, UpdateEvent } from "@lib/index.js";

/** Outcome of a flash attempt. The phase distinguishes a failed serial
 *  open (device unavailable) from a failed flash (device is presumably
 *  still in bootloader and the user can retry). Wizards key their
 *  user-facing error message off this. */
export type FlashAttemptOutcome =
  | { ok: true }
  | { ok: false; phase: "open" | "flash"; error: Error };

/** Wraps the open-port → flashFirmware → close-port pattern shared by
 *  FlashWizard (single-device) and UpdateWizard (per-target in a loop).
 *  Owns the streaming progress state so callers just render `status`. */
export function useFlashAttempt() {
  const [status, setStatus] = useState<UpdateEvent | null>(null);

  const runFlash = useCallback(
    async (port: SerialPort, firmware: FirmwareFile): Promise<FlashAttemptOutcome> => {
      setStatus(null);

      let transport;
      try {
        transport = await openSerialPort(port);
      } catch (err) {
        return { ok: false, phase: "open", error: err instanceof Error ? err : new Error(String(err)) };
      }

      try {
        await flashFirmware(transport, firmware, setStatus);
        return { ok: true };
      } catch (err) {
        return { ok: false, phase: "flash", error: err instanceof Error ? err : new Error(String(err)) };
      } finally {
        try {
          await closeSerialPort(transport);
        } catch {
          // Port may already be closed after reset.
        }
      }
    },
    [],
  );

  const resetStatus = useCallback(() => setStatus(null), []);

  return { status, runFlash, resetStatus };
}
