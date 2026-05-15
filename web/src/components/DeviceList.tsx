import type { BootloaderDevice, BootloaderPort } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import type { FirmwareCatalog, FirmwareChannel } from "../firmware-catalog";
import { DeviceCard } from "./DeviceCard";
import { BootloaderCard } from "./BootloaderCard";
import { PendingPuckCard } from "./PendingPuckCard";
import { ControllerIcon } from "./Icons";

interface DeviceListProps {
  devices: ConnectedDevice[];
  bootloaderDevices: BootloaderDevice[];
  pendingPuckPorts: BootloaderPort[];
  puckTimeoutMs: number;
  onConnectPendingPuck: (bp: BootloaderPort) => Promise<void>;
  firmwareCatalog: FirmwareCatalog | null;
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
  onExitBootloader: (device: BootloaderDevice) => Promise<void>;
  onRequestUpdate: (device: ConnectedDevice, channel: FirmwareChannel) => void;
}

export function DeviceList({
  devices,
  bootloaderDevices,
  pendingPuckPorts,
  puckTimeoutMs,
  onConnectPendingPuck,
  firmwareCatalog,
  onFlashComplete,
  onFlashingChange,
  onExitBootloader,
  onRequestUpdate,
}: DeviceListProps) {
  if (devices.length === 0 && bootloaderDevices.length === 0 && pendingPuckPorts.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-8" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-valve-blue/10 flex items-center justify-center mb-4">
            <ControllerIcon className="w-7 h-7 text-valve-blue/60" />
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-1.5">No devices detected</h2>
          <p className="text-sm text-gray-500 mb-5">
            Connect a Valve Steam Controller or Puck to get started.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-3 bg-surface-raised/50 rounded-lg p-3 border border-border-subtle">
            <div className="w-6 h-6 rounded-full bg-valve-blue/15 text-valve-blue text-xs font-semibold flex items-center justify-center shrink-0">1</div>
            <div>
              <p className="text-sm font-medium text-gray-200">Connect your device via USB</p>
              <p className="text-xs text-gray-500 mt-0.5">Plug in the Steam Controller and/or Puck directly.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-surface-raised/50 rounded-lg p-3 border border-border-subtle">
            <div className="w-6 h-6 rounded-full bg-valve-blue/15 text-valve-blue text-xs font-semibold flex items-center justify-center shrink-0">2</div>
            <div>
              <p className="text-sm font-medium text-gray-200">Click "Connect Device"</p>
              <p className="text-xs text-gray-500 mt-0.5">Your browser will prompt you to select the Valve device from a list.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-surface-raised/50 rounded-lg p-3 border border-border-subtle">
            <div className="w-6 h-6 rounded-full bg-valve-blue/15 text-valve-blue text-xs font-semibold flex items-center justify-center shrink-0">3</div>
            <div>
              <p className="text-sm font-medium text-gray-200">View device info or flash firmware</p>
              <p className="text-xs text-gray-500 mt-0.5">Read firmware versions, serial numbers, and update firmware via the bootloader.</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          Already in bootloader mode? Use <span className="text-gray-300">Connect Bootloader</span> above.
        </p>

        <p className="text-xs text-gray-600 text-center mt-5">
          Supported: Steam Controller (2026) &middot; Steam Controller Puck
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((dev, i) => (
        <DeviceCard
          key={`hid-${i}`}
          device={dev}
          firmwareCatalog={firmwareCatalog}
          onRequestUpdate={(channel) => onRequestUpdate(dev, channel)}
        />
      ))}
      {bootloaderDevices.map((dev, i) => (
        <BootloaderCard key={`bl-${i}`} device={dev} firmwareCatalog={firmwareCatalog} onFlashComplete={onFlashComplete} onFlashingChange={onFlashingChange} onExitBootloader={onExitBootloader} />
      ))}
      {pendingPuckPorts.map((p, i) => (
        <PendingPuckCard
          key={`pending-${i}`}
          pending={p}
          timeoutMs={puckTimeoutMs}
          onConnect={onConnectPendingPuck}
        />
      ))}
    </div>
  );
}
