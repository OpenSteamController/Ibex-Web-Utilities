import type { BootloaderDevice } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import { DeviceCard } from "./DeviceCard";
import { BootloaderCard } from "./BootloaderCard";
import { ControllerIcon } from "./Icons";

interface DeviceListProps {
  devices: ConnectedDevice[];
  bootloaderDevices: BootloaderDevice[];
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
}

export function DeviceList({ devices, bootloaderDevices, onFlashComplete, onFlashingChange }: DeviceListProps) {
  if (devices.length === 0 && bootloaderDevices.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-16" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-valve-blue/10 flex items-center justify-center mb-6">
            <ControllerIcon className="w-8 h-8 text-valve-blue/60" />
          </div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">No devices detected</h2>
          <p className="text-sm text-gray-500 mb-8">
            Connect a Valve Steam Controller or Puck to get started.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-4 bg-surface-raised/50 rounded-lg p-4 border border-border-subtle">
            <div className="w-7 h-7 rounded-full bg-valve-blue/15 text-valve-blue text-sm font-semibold flex items-center justify-center shrink-0">1</div>
            <div>
              <p className="text-sm font-medium text-gray-200">Connect your device via USB</p>
              <p className="text-xs text-gray-500 mt-0.5">Plug in the Steam Controller directly or place it on the Puck charging pad.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-surface-raised/50 rounded-lg p-4 border border-border-subtle">
            <div className="w-7 h-7 rounded-full bg-valve-blue/15 text-valve-blue text-sm font-semibold flex items-center justify-center shrink-0">2</div>
            <div>
              <p className="text-sm font-medium text-gray-200">Click "Connect Device"</p>
              <p className="text-xs text-gray-500 mt-0.5">Your browser will prompt you to select the Valve device from a list.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-surface-raised/50 rounded-lg p-4 border border-border-subtle">
            <div className="w-7 h-7 rounded-full bg-valve-blue/15 text-valve-blue text-sm font-semibold flex items-center justify-center shrink-0">3</div>
            <div>
              <p className="text-sm font-medium text-gray-200">View device info or flash firmware</p>
              <p className="text-xs text-gray-500 mt-0.5">Read firmware versions, serial numbers, and update firmware via the bootloader.</p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-600">
            Supported: Steam Controller (Triton) &middot; Steam Controller Puck (Proteus)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((dev, i) => (
        <DeviceCard key={`hid-${i}`} device={dev} />
      ))}
      {bootloaderDevices.map((dev, i) => (
        <BootloaderCard key={`bl-${i}`} device={dev} onFlashComplete={onFlashComplete} onFlashingChange={onFlashingChange} />
      ))}
    </div>
  );
}
