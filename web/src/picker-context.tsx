import { createContext, useContext, type ReactNode } from "react";

interface PickerContextValue {
  /** Runs the given async picker fn under the bootloader-instructions overlay.
   *  Lifted to App scope so the overlay survives the DeviceCard unmount
   *  that happens when the HID device re-enumerates as the bootloader.
   *  Resolves to `true` if the user confirmed (clicked Continue), `false`
   *  if they clicked Cancel. */
  runBootloaderPicker: (fn: () => Promise<unknown>) => Promise<boolean>;
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
