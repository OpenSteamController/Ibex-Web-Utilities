import { useState, useEffect, useCallback, useRef } from "react";
import {
  requestHidDevice,
  getGrantedHidDevices,
  getConnectedControllers,
  listGrantedBootloaderPorts,
  findGrantedBootloaderPort,
  readBootloaderInfo,
  watchControllerSlots,
  getDeviceInfo,
  readAllAttributes,
  openSerialPort,
  closeSerialPort,
  resetDevice,
  DeviceClass,
} from "@lib/index.js";
import type { ValveHidDevice, DeviceInfo, DeviceAttributes, ConnectedController, BootloaderDevice, BootloaderPort } from "@lib/index.js";
import { ConnectButton } from "./components/ConnectButton";
import { DeviceList } from "./components/DeviceList";
import { UpdateWizard, deviceKey } from "./components/UpdateWizard";
import { ErrorBanner } from "./components/ErrorBanner";
import { DebugPanel } from "./components/DebugPanel";
import { PickerInstructionsModal } from "./components/PickerInstructionsModal";
import { GitHubIcon } from "./components/Icons";
import { usePickerFlow } from "./hooks/usePickerFlow";
import { PickerProvider, type BootloaderPickerOptions } from "./picker-context";
import { BOOTLOADER_PORT_FILTERS } from "./serial-filter";
import { fetchFirmwareCatalog } from "./firmware-catalog";
import type { FirmwareCatalog, FirmwareChannel } from "./firmware-catalog";

export interface ConnectedDevice {
  hid: ValveHidDevice;
  info: DeviceInfo;
  attrs: DeviceAttributes | null;
  connectedControllers: ConnectedController[];
}

/** Debounce delay for USB hotplug events (ms).
 *  The Puck has 5 HID interfaces that enumerate/de-enumerate
 *  one at a time — we wait for them all to settle. */
const HOTPLUG_DEBOUNCE_MS = 500;

/** Short debounce for wireless connect/disconnect (ms).
 *  Only need a brief delay since no USB re-enumeration happens. */
const WIRELESS_DEBOUNCE_MS = 500;

/** How long the Puck waits in bootloader mode before timing out to
 *  firmware. We track pending Puck bootloader ports for this long so the
 *  user can opt to talk to the bootloader before the timeout fires. */
const PUCK_BOOTLOADER_TIMEOUT_MS = 3000;

export function App() {
  const [devices, setDevices] = useState<Map<string, ConnectedDevice>>(new Map());
  const [bootloaderDevices, setBootloaderDevices] = useState<BootloaderDevice[]>([]);
  const [pendingPuckPorts, setPendingPuckPorts] = useState<BootloaderPort[]>([]);
  const [firmwareCatalog, setFirmwareCatalog] = useState<FirmwareCatalog | null>(null);
  const [updateWizard, setUpdateWizard] = useState<
    { initialDevice: ConnectedDevice; channel: FirmwareChannel } | null
  >(null);
  const handleRequestUpdate = useCallback(
    (initialDevice: ConnectedDevice, channel: FirmwareChannel) => {
      setUpdateWizard({ initialDevice, channel });
    },
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashingRef = useRef(false);
  /** Set true when the user clicks Connect Bootloader / Reboot to Bootloader.
   *  Consumed by the next refreshDevices to skip the Puck hold-off, since
   *  in that case the user actually wants to talk to the bootloader rather
   *  than letting the Puck time out to firmware. */
  const userInitiatedBootloaderRef = useRef(false);
  /** Set while a bootloader reboot/picker flow is in progress. Blocks
   *  refreshes (same pattern as flashingRef) so the hotplug events fired
   *  by the device tearing itself down don't run a stale refresh in the
   *  gap before it re-enumerates as the bootloader. After the flow ends
   *  we trigger one explicit refresh that sees the full new state. */
  const rebootingRef = useRef(false);
  /** Per-pending-port timeout handles, keyed by SerialPort reference. */
  const puckTimerRef = useRef<Map<SerialPort, ReturnType<typeof setTimeout>>>(new Map());
  /** Mirror of `bootloaderDevices` so refreshDevices can read the latest
   *  value synchronously (the useCallback closure captures a stale one). */
  const bootloaderDevicesRef = useRef<BootloaderDevice[]>([]);

  const setBootloaderDevicesSynced = useCallback(
    (updater: BootloaderDevice[] | ((prev: BootloaderDevice[]) => BootloaderDevice[])) => {
      setBootloaderDevices((prev) => {
        const next = typeof updater === "function" ? (updater as (p: BootloaderDevice[]) => BootloaderDevice[])(prev) : updater;
        bootloaderDevicesRef.current = next;
        return next;
      });
    },
    [],
  );

  const refreshDevices = useCallback(async () => {
    if (flashingRef.current) return;
    if (rebootingRef.current) return;
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

    // Scan for bootloader devices (Web Serial).
    const userInitiated = userInitiatedBootloaderRef.current;
    userInitiatedBootloaderRef.current = false;
    try {
      const ports = await listGrantedBootloaderPorts();
      const tritonPorts = ports.filter((p) => p.deviceClass === DeviceClass.Triton);
      const puckPorts = ports.filter((p) => p.deviceClass === DeviceClass.Proteus);

      // Triton bootloaders: connect immediately, no timeout to worry about.
      const triton: BootloaderDevice[] = [];
      for (const p of tritonPorts) {
        const d = await readBootloaderInfo(p);
        if (d) triton.push(d);
      }

      const puckPortSet = new Set(puckPorts.map((p) => p.port));
      if (userInitiated) {
        // Open all Puck bootloaders now — the user asked for it.
        // Skip ones we already have connected to avoid redundant INFO reads.
        const alreadyConnected = bootloaderDevicesRef.current.filter(
          (d) => d.deviceClass === DeviceClass.Proteus && puckPortSet.has(d.port),
        );
        const alreadyConnectedSet = new Set(alreadyConnected.map((d) => d.port));
        const newPuck: BootloaderDevice[] = [];
        for (const p of puckPorts) {
          if (alreadyConnectedSet.has(p.port)) continue;
          const d = await readBootloaderInfo(p);
          if (d) newPuck.push(d);
        }
        // Cancel any pending timers (now superseded) and clear pending state.
        for (const t of puckTimerRef.current.values()) clearTimeout(t);
        puckTimerRef.current.clear();
        setPendingPuckPorts([]);
        setBootloaderDevicesSynced([...triton, ...alreadyConnected, ...newPuck]);
      } else {
        // Auto-detect: hold off on *new* Puck ports (let them time out to
        // firmware) but preserve any Puck bootloaders we're already
        // connected to — a previous user-initiated refresh may have just
        // opened them, and a stray hotplug refresh shouldn't undo that.
        const keptPucks = bootloaderDevicesRef.current.filter(
          (d) => d.deviceClass === DeviceClass.Proteus && puckPortSet.has(d.port),
        );
        const keptPuckSet = new Set(keptPucks.map((d) => d.port));
        setBootloaderDevicesSynced([...triton, ...keptPucks]);
        setPendingPuckPorts((prev) => {
          // Preserve existing pending entries; add newly seen ports that
          // aren't already connected.
          const existing = new Set(prev.map((p) => p.port));
          const next = [...prev];
          for (const p of puckPorts) {
            if (existing.has(p.port)) continue;
            if (keptPuckSet.has(p.port)) continue;
            next.push(p);
            // Auto-drop after the Puck's bootloader timeout.
            const timer = setTimeout(() => {
              puckTimerRef.current.delete(p.port);
              setPendingPuckPorts((cur) => cur.filter((x) => x.port !== p.port));
            }, PUCK_BOOTLOADER_TIMEOUT_MS);
            puckTimerRef.current.set(p.port, timer);
          }
          // Drop pending entries whose ports are no longer present.
          return next.filter((p) => {
            if (puckPortSet.has(p.port)) return true;
            const t = puckTimerRef.current.get(p.port);
            if (t) {
              clearTimeout(t);
              puckTimerRef.current.delete(p.port);
            }
            return false;
          });
        });
      }
    } catch {
      setBootloaderDevicesSynced([]);
      setPendingPuckPorts([]);
    }
  }, [setBootloaderDevicesSynced]);

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

  /** User clicked "Exit Bootloader" on a BootloaderCard — open the
   *  serial port, send RESET, close. The device reboots into normal
   *  firmware mode; refresh gating prevents stale state while it
   *  re-enumerates as HID. */
  const handleExitBootloader = useCallback(async (dev: BootloaderDevice) => {
    rebootingRef.current = true;
    try {
      const transport = await openSerialPort(dev.port);
      try {
        await resetDevice(transport);
      } finally {
        await closeSerialPort(transport);
      }
    } finally {
      rebootingRef.current = false;
    }
    await refreshDevicesAndRewatch();
  }, [refreshDevicesAndRewatch]);

  /** User clicked "Connect to Bootloader" on a pending Puck card —
   *  cancel its timer and open the port now. The pending entry stays
   *  visible (in busy state) until the bootloader card is ready, so the
   *  two state updates batch into one render with no visual gap. */
  const connectPendingPuckPort = useCallback(async (bp: BootloaderPort) => {
    const t = puckTimerRef.current.get(bp.port);
    if (t) {
      clearTimeout(t);
      puckTimerRef.current.delete(bp.port);
    }
    const dev = await readBootloaderInfo(bp);
    setPendingPuckPorts((prev) => prev.filter((x) => x.port !== bp.port));
    if (dev) {
      setBootloaderDevicesSynced((prev) => [...prev, dev]);
    }
  }, [setBootloaderDevicesSynced]);

  // Initial load (no debounce). Treat any already-present Puck bootloader
  // port as intentional — by the time the page loads, the Puck has either
  // been in bootloader mode for a while (user held it there) or just
  // entered it on plug-in but well before we could see the hotplug event.
  // Either way, opening it now is safer than letting it time out.
  useEffect(() => {
    userInitiatedBootloaderRef.current = true;
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

  // Listen for USB device connect/disconnect.
  // HID is debounced because the Puck's 5 HID interfaces enumerate one at
  // a time and we want a single coalesced refresh. Serial enumerates as a
  // single port, so we refresh immediately — important for catching the
  // Puck's brief bootloader window before its 3s timeout fires.
  useEffect(() => {
    const onHidHotplug = () => { scheduleCallback(refreshDevicesAndRewatch, HOTPLUG_DEBOUNCE_MS); };
    const onSerialHotplug = () => { refreshDevicesAndRewatch(); };
    const cleanups: (() => void)[] = [];

    if (navigator.hid) {
      navigator.hid.addEventListener("connect", onHidHotplug);
      navigator.hid.addEventListener("disconnect", onHidHotplug);
      cleanups.push(() => {
        navigator.hid.removeEventListener("connect", onHidHotplug);
        navigator.hid.removeEventListener("disconnect", onHidHotplug);
      });
    }

    if (navigator.serial) {
      navigator.serial.addEventListener("connect", onSerialHotplug);
      navigator.serial.addEventListener("disconnect", onSerialHotplug);
      cleanups.push(() => {
        navigator.serial.removeEventListener("connect", onSerialHotplug);
        navigator.serial.removeEventListener("disconnect", onSerialHotplug);
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

  /** Trigger a bootloader connect flow. Always shows the instructional
   *  modal; on Continue we run the device action, then check whether the
   *  bootloader port for this device class is already paired. If it is,
   *  we skip the browser serial picker — the port will be picked up by
   *  the post-action refresh automatically. Otherwise we call
   *  navigator.serial.requestPort so the user can grant it.
   *
   *  Background refreshes are paused (rebootingRef) while the device is
   *  tearing down + re-enumerating, then a single explicit refresh fires
   *  after the flow ends so the new state is captured in one pass.
   *
   *  The paired check has to happen AFTER the action, because Web Serial
   *  getPorts() only returns currently-connected ports — and the
   *  bootloader port doesn't exist until the device has rebooted into
   *  bootloader mode. We poll briefly to give the device time to
   *  re-enumerate. */
  const runBootloaderPicker = useCallback(
    async ({ deviceClass, action }: BootloaderPickerOptions) => {
      userInitiatedBootloaderRef.current = true;

      const wrappedFn = async () => {
        rebootingRef.current = true;
        try {
          if (action) await action();

          if (deviceClass !== undefined) {
            const POLL_DEADLINE = Date.now() + 2000;
            while (Date.now() < POLL_DEADLINE) {
              if (await findGrantedBootloaderPort(deviceClass)) {
                // Already paired — skip the browser picker.
                return;
              }
              await new Promise((r) => setTimeout(r, 100));
            }
          }

          await navigator.serial.requestPort({ filters: BOOTLOADER_PORT_FILTERS });
        } finally {
          rebootingRef.current = false;
        }
      };

      const confirmed = await bootloaderPicker.run(wrappedFn);
      if (confirmed) {
        await refreshDevicesAndRewatch();
      } else {
        // User cancelled the modal — undo the flag so a stray refresh
        // doesn't promote pending Pucks to connected.
        userInitiatedBootloaderRef.current = false;
      }
      return confirmed;
    },
    [bootloaderPicker, refreshDevicesAndRewatch],
  );

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const confirmed = await hidPicker.run(() => requestHidDevice());
      if (confirmed) {
        // The user clicked a connect button — treat any pending Puck
        // bootloader ports as intentional and open them now instead of
        // letting them time out to firmware.
        userInitiatedBootloaderRef.current = true;
      }
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
      // always show the picker. runBootloaderPicker handles the gating
      // and post-action refresh itself.
      await runBootloaderPicker({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [runBootloaderPicker]);

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
            pendingPuckPorts={pendingPuckPorts}
            puckTimeoutMs={PUCK_BOOTLOADER_TIMEOUT_MS}
            onConnectPendingPuck={connectPendingPuckPort}
            firmwareCatalog={firmwareCatalog}
            onFlashComplete={refreshDevicesAndRewatch}
            onFlashingChange={(v) => { flashingRef.current = v; }}
            onExitBootloader={handleExitBootloader}
            onRequestUpdate={handleRequestUpdate}
          />
          {updateWizard && firmwareCatalog && (
            <UpdateWizard
              channel={updateWizard.channel}
              initialDevice={updateWizard.initialDevice}
              liveDevice={devices.get(deviceKey(updateWizard.initialDevice)) ?? null}
              bootloaderDevices={bootloaderDevices}
              firmwareCatalog={firmwareCatalog}
              onClose={() => setUpdateWizard(null)}
              onFlashingChange={(v) => { flashingRef.current = v; }}
              onFlashComplete={refreshDevicesAndRewatch}
            />
          )}
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
