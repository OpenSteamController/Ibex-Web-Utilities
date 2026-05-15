import { useCallback, useRef, useState } from "react";
import { UserCancelledError } from "@lib/index.js";

interface Pending {
  fn: () => Promise<unknown>;
  resolve: (confirmed: boolean) => void;
  reject: (e: unknown) => void;
}

/**
 * Coordinates a confirmation modal with a browser picker
 * (navigator.hid.requestDevice / navigator.serial.requestPort).
 *
 * `run` opens the modal and resolves to `true` when the user clicks
 * Continue (regardless of whether the picker itself was then selected or
 * cancelled — both count as user intent), or `false` when the user clicks
 * Cancel on the modal. The picker fn is held until `confirm` is called by
 * the Continue button — that click is a fresh user gesture, which is what
 * the browser requires to allow requestPort/requestDevice. We can't
 * pre-delay the picker because awaiting a timer would consume the
 * original click's transient activation.
 *
 * Browser-level picker cancellations (NotFoundError, UserCancelledError)
 * resolve as `true` since the user still confirmed the intent.
 */
export function usePickerFlow() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const run = useCallback((fn: () => Promise<unknown>) => {
    return new Promise<boolean>((resolve, reject) => {
      pendingRef.current = { fn, resolve, reject };
      setOpen(true);
      setBusy(false);
    });
  }, []);

  const confirm = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    setBusy(true);
    try {
      await p.fn();
      p.resolve(true);
    } catch (e) {
      if (e instanceof UserCancelledError) p.resolve(true);
      else if (e instanceof DOMException && e.name === "NotFoundError") p.resolve(true);
      else p.reject(e);
    } finally {
      pendingRef.current = null;
      setOpen(false);
      setBusy(false);
    }
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
    setOpen(false);
    setBusy(false);
  }, []);

  return { open, busy, run, confirm, cancel };
}
