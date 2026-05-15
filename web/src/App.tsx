import { useState, useEffect, useCallback, useRef } from "react";
import {
  requestHidDevice,
  getGrantedHidDevices,
  getConnectedControllers,
  listGrantedBootloaderPorts,
  readBootloaderInfo,
  watchControllerSlots,
  getDeviceInfo,
  readAllAttributes,
  DeviceClass,
} from "@lib/index.js";
import type { ValveHidDevice, DeviceInfo, DeviceAttributes, ConnectedController, BootloaderDevice } from "@lib/index.js";
import { ConnectButton } from "./components/ConnectButton";
import { DeviceList } from "./components/DeviceList";
import { ErrorBanner } from "./components/ErrorBanner";
import { DebugPanel } from "./components/DebugPanel";
import { PickerInstructionsModal } from "./components/PickerInstructionsModal";
import { GitHubIcon } from "./components/Icons";
import { usePickerFlow } from "./hooks/usePickerFlow";
import { PickerProvider } from "./picker-context";
import { BOOTLOADER_PORT_FILTERS } from "./serial-filter";
import { fetchFirmwareCatalog } from "./firmware-catalog";
import type { FirmwareCatalog } from "./firmware-catalog";

export interface ConnectedDevice {
  hid: ValveHidDevice;
  info: DeviceInfo;
  attrs: DeviceAttributes | null;
  connectedControllers: ConnectedController[];
}

/** Debounce delay for USB hotplug events (ms).
 *  The Puck has 5 HID interfaces that enumerate/de-enumerate
 *  one at a time — we wait for them all to settle. */
const HOTPLUG_DEBOUNCE_MS = 2000;

/** Short debounce for wireless connect/disconnect (ms).
 *  Only need a brief delay since no USB re-enumeration happens. */
const WIRELESS_DEBOUNCE_MS = 500;

export function App() {
  const [devices, setDevices] = useState<Map<string, ConnectedDevice>>(new Map());
  const [bootloaderDevices, setBootloaderDevices] = useState<BootloaderDevice[]>([]);
  const [firmwareCatalog, setFirmwareCatalog] = useState<FirmwareCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashingRef = useRef(false);

  const refreshDevices = useCallback(async () => {
    if (flashingRef.current) return;
    try {
      const granted = await getGrantedHidDevices();
      const next = new Map<string, ConnectedDevice>();

      for (const hidDev of granted) {
        const info = await getDeviceInfo(hidDev);
        const key = `${info.serialNumber}:${info.type}`;
        let attrs: DeviceAttributes | null = null;
        try {
          attrs = await readAllAttributes(hidDev);
        } catch {
          // Non-critical
        }
        next.set(key, { hid: hidDev, info, attrs, connectedControllers: [] });
      }

      // Scan controller slots and attach to dongle devices
      const controllers = await getConnectedControllers();
      if (controllers.length > 0) {
        for (const [key, dev] of next) {
          if (dev.info.deviceClass === DeviceClass.Proteus) {
            next.set(key, { ...dev, connectedControllers: controllers });
          }
        }
      }

      setDevices(next);
    } catch {
      // WebHID may not be available
    }

    // Scan for bootloader devices (Web Serial)
    try {
      const ports = await listGrantedBootloaderPorts();
      const blDevices: BootloaderDevice[] = [];
      for (const p of ports) {
        const d = await readBootloaderInfo(p);
        if (d) blDevices.push(d);
      }
      setBootloaderDevices(blDevices);
    } catch {
      setBootloaderDevices([]);
    }
  }, []);

  /** Lightweight refresh: only rescan controller slots and update
   *  existing dongle cards. Skips re-querying the dongle itself. */
  const refreshControllers = useCallback(async () => {
    try {
      const controllers = await getConnectedControllers();
      setDevices((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, dev] of next) {
          if (dev.info.deviceClass === DeviceClass.Proteus) {
            next.set(key, { ...dev, connectedControllers: controllers });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch {
      // No dongle or WebHID unavailable
    }
  }, []);

  /** Schedule a debounced callback — resets the timer on each call
   *  so rapid events coalesce into one invocation. */
  const scheduleCallback = useCallback((fn: () => void, delayMs: number) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      fn();
    }, delayMs);
  }, []);

  // watchGeneration increments on USB hotplug to re-attach wireless listeners
  // when device handles change.
  const [watchGeneration, setWatchGeneration] = useState(0);

  const refreshDevicesAndRewatch = useCallback(async () => {
    await refreshDevices();
    setWatchGeneration((g) => g + 1);
  }, [refreshDevices]);

  // Initial load (no debounce)
  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Fetch firmware metadata catalog once on mount
  useEffect(() => {
    fetchFirmwareCatalog()
      .then(setFirmwareCatalog)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to load firmware catalog: ${msg}`);
      });
  }, []);

  // Listen for USB device connect/disconnect with debounce (HID + Serial)
  useEffect(() => {
    const onHotplug = () => { scheduleCallback(refreshDevicesAndRewatch, HOTPLUG_DEBOUNCE_MS); };
    const cleanups: (() => void)[] = [];

    if (navigator.hid) {
      navigator.hid.addEventListener("connect", onHotplug);
      navigator.hid.addEventListener("disconnect", onHotplug);
      cleanups.push(() => {
        navigator.hid.removeEventListener("connect", onHotplug);
        navigator.hid.removeEventListener("disconnect", onHotplug);
      });
    }

    if (navigator.serial) {
      navigator.serial.addEventListener("connect", onHotplug);
      navigator.serial.addEventListener("disconnect", onHotplug);
      cleanups.push(() => {
        navigator.serial.removeEventListener("connect", onHotplug);
        navigator.serial.removeEventListener("disconnect", onHotplug);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [scheduleCallback, refreshDevicesAndRewatch]);

  useEffect(() => {
    let stopWatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const stop = await watchControllerSlots(() => {
          scheduleCallback(refreshControllers, WIRELESS_DEBOUNCE_MS);
        });
        if (cancelled) {
          stop();
        } else {
          stopWatch = stop;
        }
      } catch {
        // No dongle connected or WebHID unavailable
      }
    })();

    return () => {
      cancelled = true;
      stopWatch?.();
    };
  }, [scheduleCallback, refreshControllers, watchGeneration]);

  const hidPicker = usePickerFlow();
  const bootloaderPicker = usePickerFlow();

  const runBootloaderPicker = useCallback(
    (fn: () => Promise<unknown>) => bootloaderPicker.run(fn),
    [bootloaderPicker],
  );

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await hidPicker.run(() => requestHidDevice());
      await refreshDevicesAndRewatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [hidPicker, refreshDevicesAndRewatch]);

  const handleConnectBootloader = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No deviceClass — could be either Triton or Puck bootloader, so
      // always show the picker.
      await runBootloaderPicker(() =>
        navigator.serial.requestPort({ filters: BOOTLOADER_PORT_FILTERS }),
      );
      await refreshDevicesAndRewatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [runBootloaderPicker, refreshDevicesAndRewatch]);

  return (
    <div className="min-h-screen flex flex-col bg-surface text-gray-100">
      <header className="relative bg-valve-darker px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-valve-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-valve-blue">Ibex</span>
              <span className="text-gray-300 ml-1.5">Web Utilities</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ConnectButton onClick={handleConnect} loading={loading} />
            <ConnectButton
              onClick={handleConnectBootloader}
              loading={loading}
              variant="bootloader"
            />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-valve-blue/30 to-transparent" />
      </header>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <main className="flex-1 p-6">
        <PickerProvider value={{ runBootloaderPicker }}>
          <DeviceList
            devices={Array.from(devices.values())}
            bootloaderDevices={bootloaderDevices}
            firmwareCatalog={firmwareCatalog}
            onFlashComplete={refreshDevicesAndRewatch}
            onFlashingChange={(v) => { flashingRef.current = v; }}
          />
        </PickerProvider>
      </main>

      <DebugPanel />

      <footer className="px-6 py-4 border-t border-border-subtle text-xs text-gray-500 flex items-center justify-between">
        <span>Part of the OpenSteamController project</span>
        <a
          href="https://github.com/OpenSteamController/Ibex-Web-Utilities"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-valve-blue transition-colors"
          aria-label="GitHub repository"
        >
          <GitHubIcon className="w-5 h-5" />
        </a>
      </footer>

      <PickerInstructionsModal
        isOpen={hidPicker.open}
        mode="hid"
        busy={hidPicker.busy}
        onContinue={hidPicker.confirm}
        onCancel={hidPicker.cancel}
      />
      <PickerInstructionsModal
        isOpen={bootloaderPicker.open}
        mode="bootloader"
        busy={bootloaderPicker.busy}
        onContinue={bootloaderPicker.confirm}
        onCancel={bootloaderPicker.cancel}
      />
    </div>
  );
}
