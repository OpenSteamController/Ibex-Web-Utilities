import { createContext, useContext, type ReactNode } from "react";
import type { BootloaderDevice, BootloaderPort } from "@lib/index.js";
import type { ConnectedDevice } from "./App";
import type { FirmwareCatalog, FirmwareChannel } from "./firmware-catalog";

/** Cross-cutting state and callbacks shared by every card in DeviceList.
 *  Lets new cards (or new card-shared callbacks) be added without
 *  threading another prop through DeviceList. */
interface DeviceCardsContextValue {
  firmwareCatalog: FirmwareCatalog | null;
  puckTimeoutMs: number;
  onConnectPendingPuck: (bp: BootloaderPort) => Promise<void>;
  onExitBootloader: (device: BootloaderDevice) => Promise<void>;
  onRequestUpdate: (device: ConnectedDevice, channel: FirmwareChannel) => void;
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
}

const DeviceCardsContext = createContext<DeviceCardsContextValue | null>(null);

export function DeviceCardsProvider({
  value,
  children,
}: {
  value: DeviceCardsContextValue;
  children: ReactNode;
}) {
  return <DeviceCardsContext.Provider value={value}>{children}</DeviceCardsContext.Provider>;
}

export function useDeviceCards(): DeviceCardsContextValue {
  const ctx = useContext(DeviceCardsContext);
  if (!ctx) throw new Error("useDeviceCards must be used inside <DeviceCardsProvider>");
  return ctx;
}
