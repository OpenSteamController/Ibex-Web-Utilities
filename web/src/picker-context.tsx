import { createContext, useContext, type ReactNode } from "react";
import type { DeviceClass } from "@lib/index.js";

export interface BootloaderPickerOptions {
  /** Device class whose bootloader port we expect to talk to. Used to
   *  detect if the port is already paired — if so, the instructional
   *  modal and the serial picker are both skipped. Omit when the caller
   *  has no specific device in mind (e.g., the Connect Bootloader header
   *  button), in which case the modal+picker are always shown. */
  deviceClass?: DeviceClass;
  /** The device-side action to perform (e.g., send a reboot HID command).
   *  Runs after the user clicks Continue on the modal, or immediately on
   *  the fast path. Omit when the only thing to do is bring up the
   *  picker (e.g., Connect Bootloader). */
  action?: () => Promise<unknown>;
  /** When true, run the action *before* showing the instructional modal.
   *  Use this when the connection that carries the command (BLE/ESB) is
   *  separate from the USB port we'll need afterwards — there's no
   *  reason to ask the user to plug in before the reboot has even left
   *  for the device. */
  actionFirst?: boolean;
}

interface PickerContextValue {
  /** Trigger a bootloader connect flow. If the deviceClass's port is
   *  already paired we skip the modal+picker entirely; otherwise we open
   *  the instructional modal and call navigator.serial.requestPort on
   *  Continue. Either way the action runs, hot-plug refreshes are paused
   *  while it runs, and a single refresh fires afterward. Resolves to
   *  `true` if the flow ran (paired fast path or modal Continue), `false`
   *  if the user cancelled the modal. */
  runBootloaderPicker: (opts: BootloaderPickerOptions) => Promise<boolean>;
}

const PickerContext = createContext<PickerContextValue | null>(null);

export function PickerProvider({
  value,
  children,
}: {
  value: PickerContextValue;
  children: ReactNode;
}) {
  return <PickerContext.Provider value={value}>{children}</PickerContext.Provider>;
}

export function usePicker(): PickerContextValue {
  const ctx = useContext(PickerContext);
  if (!ctx) throw new Error("usePicker must be used inside <PickerProvider>");
  return ctx;
}
