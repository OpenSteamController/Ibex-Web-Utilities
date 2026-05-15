import { useState, useEffect, useCallback, useRef } from "react";
import {
  parseFirmware,
  validateFirmwareForDevice,
  flashFirmware,
  openSerialPort,
  closeSerialPort,
  rebootToBootloader,
  rebootControllerSlot,
  DeviceClass,
} from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type {
  BootloaderDevice,
  FirmwareFile,
  UpdateEvent,
} from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import type {
  FirmwareCatalog,
  FirmwareChannel,
  LatestFirmwareRelease,
} from "../firmware-catalog";
import { downloadFirmware, getLatestFirmware } from "../firmware-catalog";
import { Modal } from "./Modal";
import { usePicker } from "../picker-context";
import { WarningIcon, FlashIcon, SpinnerIcon, CheckCircleIcon } from "./Icons";
import styles from "./FlashWizard.module.sass";

type Target =
  | { id: string; kind: "puck"; category: "puck"; label: string; currentVersion: number; release: LatestFirmwareRelease }
  | { id: string; kind: "triton-usb"; category: "controller"; label: string; currentVersion: number; release: LatestFirmwareRelease }
  | { id: string; kind: "triton-wireless"; category: "controller"; label: string; controllerSerial: string; currentVersion: number; release: LatestFirmwareRelease };

type Phase =
  | { kind: "disclaimer" }
  | { kind: "downloading" }
  | { kind: "download-error"; message: string }
  | { kind: "prompt"; index: number }
  | { kind: "rebooting"; index: number }
  | { kind: "awaiting-bootloader"; index: number }
  | { kind: "flashing"; index: number; status: UpdateEvent | null }
  | { kind: "step-error"; index: number; message: string }
  | { kind: "complete"; flashed: string[] };

const CHANNEL_LABEL: Record<FirmwareChannel, string> = {
  stable: "Stable",
  publicbeta: "Beta",
};

/** How long to wait for a fresh bootloader to enumerate after the picker
 *  resolves successfully. */
const BOOTLOADER_WAIT_TIMEOUT_MS = 15_000;

function expectedClass(target: Target): DeviceClass {
  return target.category === "puck" ? DeviceClass.Proteus : DeviceClass.Triton;
}

function expectedMagic(target: Target): number {
  return target.category === "puck" ? PROTEUS_FW_MAGIC : TRITON_FW_MAGIC;
}

export function buildUpdateTargets(
  device: ConnectedDevice,
  channel: FirmwareChannel,
  catalog: FirmwareCatalog,
): Target[] {
  const out: Target[] = [];
  const puckLatest = getLatestFirmware(catalog, "puck")[channel];
  const controllerLatest = getLatestFirmware(catalog, "controller")[channel];

  if (device.info.deviceClass === DeviceClass.Proteus) {
    if (puckLatest && puckLatest.entry.version_unix > device.info.buildTimestamp) {
      out.push({
        id: `puck-${device.info.serialNumber}`,
        kind: "puck",
        category: "puck",
        label: "Steam Controller Puck",
        currentVersion: device.info.buildTimestamp,
        release: puckLatest,
      });
    }
    if (controllerLatest) {
      for (const c of device.connectedControllers) {
        if (controllerLatest.entry.version_unix > c.buildTimestamp) {
          out.push({
            id: `triton-wireless-${c.serialNumber}`,
            kind: "triton-wireless",
            category: "controller",
            label: `Steam Controller (Slot ${c.slot})`,
            controllerSerial: c.serialNumber,
            currentVersion: c.buildTimestamp,
            release: controllerLatest,
          });
        }
      }
    }
  } else if (device.info.deviceClass === DeviceClass.Triton) {
    if (controllerLatest && controllerLatest.entry.version_unix > device.info.buildTimestamp) {
      out.push({
        id: `triton-usb-${device.info.serialNumber}`,
        kind: "triton-usb",
        category: "controller",
        label: "Steam Controller",
        currentVersion: device.info.buildTimestamp,
        release: controllerLatest,
      });
    }
  }

  return out;
}

interface UpdateWizardProps {
  channel: FirmwareChannel;
  /** Snapshot captured when the user clicked the Update button — used to
   *  build the target list once, even if the live device drops in and out. */
  initialDevice: ConnectedDevice;
  /** Live ConnectedDevice from App state, or null if the device is
   *  temporarily not present (e.g., mid-reboot). Used to resolve fresh HID
   *  references each time we reboot a target. */
  liveDevice: ConnectedDevice | null;
  bootloaderDevices: BootloaderDevice[];
  firmwareCatalog: FirmwareCatalog;
  onClose: () => void;
  onFlashingChange: (flashing: boolean) => void;
  onFlashComplete: () => void;
}

export function UpdateWizard({
  channel,
  initialDevice,
  liveDevice,
  bootloaderDevices,
  firmwareCatalog,
  onClose,
  onFlashingChange,
  onFlashComplete,
}: UpdateWizardProps) {
  const { runBootloaderPicker } = usePicker();

  // Snapshot targets once. We deliberately don't recompute when liveDevice
  // changes — the work the wizard is committed to is fixed at open time.
  const [targets] = useState<Target[]>(() =>
    buildUpdateTargets(initialDevice, channel, firmwareCatalog),
  );

  const [phase, setPhase] = useState<Phase>({ kind: "disclaimer" });
  const [firmwares, setFirmwares] = useState<Record<string, FirmwareFile>>({});
  const flashAttempted = useRef(false);
  /** Snapshot of bootloader unitSerials present before each reboot, so we
   *  can identify the *new* arrival after the picker resolves. */
  const beforeSerials = useRef<Set<string>>(new Set());

  const handleClose = useCallback(() => {
    const needsRefresh = flashAttempted.current;
    onFlashingChange(false);
    onClose();
    if (needsRefresh) onFlashComplete();
  }, [onClose, onFlashingChange, onFlashComplete]);

  const beginDownload = useCallback(async () => {
    setPhase({ kind: "downloading" });
    try {
      const entries = await Promise.all(
        targets.map(async (t) => {
          const bytes = await downloadFirmware(t.category, t.release.filename);
          const fw = parseFirmware(bytes);
          validateFirmwareForDevice(fw, expectedClass(t));
          return [t.id, fw] as const;
        }),
      );
      setFirmwares(Object.fromEntries(entries));
      if (targets.length === 0) {
        setPhase({ kind: "complete", flashed: [] });
      } else {
        setPhase({ kind: "prompt", index: 0 });
      }
    } catch (err) {
      setPhase({
        kind: "download-error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [targets]);

  const beginTarget = useCallback(async (index: number) => {
    const target = targets[index];
    if (!target) return;

    if (!liveDevice) {
      setPhase({
        kind: "step-error",
        index,
        message: "Device isn't currently connected. Plug it back in and retry.",
      });
      return;
    }

    let rebootAction: () => Promise<unknown>;
    if (target.kind === "puck" || target.kind === "triton-usb") {
      rebootAction = () => rebootToBootloader(expectedClass(target), liveDevice.hid);
    } else {
      const slot = liveDevice.connectedControllers.find(
        (c) => c.serialNumber === target.controllerSerial,
      );
      if (!slot) {
        setPhase({
          kind: "step-error",
          index,
          message:
            "Steam Controller isn't currently paired to the Puck. Power it on and wait for the wireless connection, then retry.",
        });
        return;
      }
      rebootAction = () => rebootControllerSlot(slot.device);
    }

    flashAttempted.current = true;
    beforeSerials.current = new Set(
      bootloaderDevices
        .filter((b) => b.deviceClass === expectedClass(target))
        .map((b) => b.info.unitSerial),
    );

    setPhase({ kind: "rebooting", index });

    let pickerOk = false;
    try {
      pickerOk = await runBootloaderPicker({
        deviceClass: expectedClass(target),
        action: rebootAction,
        // Wireless slot reboots go over the Puck's RF link — the Triton
        // doesn't need USB to receive the reboot, only to expose the
        // bootloader afterwards. Send first, then prompt for USB.
        actionFirst: target.kind === "triton-wireless",
      });
    } catch (err) {
      setPhase({
        kind: "step-error",
        index,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (!pickerOk) {
      setPhase({ kind: "step-error", index, message: "Cancelled." });
      return;
    }

    setPhase((p) =>
      p.kind === "rebooting" && p.index === index
        ? { kind: "awaiting-bootloader", index }
        : p,
    );
  }, [targets, liveDevice, bootloaderDevices, runBootloaderPicker]);

  const runFlash = useCallback(
    async (index: number, bootloader: BootloaderDevice) => {
      const target = targets[index];
      const firmware = firmwares[target.id];
      if (!firmware) return;

      onFlashingChange(true);
      setPhase({ kind: "flashing", index, status: null });

      let transport;
      try {
        transport = await openSerialPort(bootloader.port);
      } catch (err) {
        onFlashingChange(false);
        setPhase({
          kind: "step-error",
          index,
          message: `Failed to open serial port: ${err instanceof Error ? err.message : String(err)}`,
        });
        return;
      }

      try {
        await flashFirmware(transport, firmware, (event) => {
          setPhase((prev) =>
            prev.kind === "flashing" && prev.index === index
              ? { ...prev, status: event }
              : prev,
          );
        });
        onFlashingChange(false);
        if (index + 1 < targets.length) {
          setPhase({ kind: "prompt", index: index + 1 });
        } else {
          setPhase({ kind: "complete", flashed: targets.map((t) => t.label) });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onFlashingChange(false);
        setPhase({
          kind: "step-error",
          index,
          message: `${msg}\n\nThe device should still be in bootloader mode. You can retry.`,
        });
      } finally {
        try {
          await closeSerialPort(transport);
        } catch {
          // Port may already be closed after reset.
        }
      }
    },
    [targets, firmwares, onFlashingChange],
  );

  // Watch for a freshly-arrived bootloader matching the current target.
  useEffect(() => {
    if (phase.kind !== "awaiting-bootloader") return;
    const target = targets[phase.index];
    if (!target) return;

    const candidates = bootloaderDevices.filter(
      (b) =>
        b.deviceClass === expectedClass(target) &&
        !beforeSerials.current.has(b.info.unitSerial),
    );
    if (candidates.length === 0) return;

    // Prefer one whose installed firmware magic matches what we're targeting.
    const match =
      candidates.find((b) => b.info.installedFwMagic === expectedMagic(target)) ??
      candidates[0];

    void runFlash(phase.index, match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bootloaderDevices, targets]);

  // Time out the awaiting-bootloader phase if nothing shows up.
  useEffect(() => {
    if (phase.kind !== "awaiting-bootloader") return;
    const index = phase.index;
    const handle = setTimeout(() => {
      setPhase((p) =>
        p.kind === "awaiting-bootloader" && p.index === index
          ? {
              kind: "step-error",
              index,
              message:
                "Didn't see the device's bootloader. Make sure it's plugged in via USB and retry.",
            }
          : p,
      );
    }, BOOTLOADER_WAIT_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [phase]);

  const retryStep = useCallback(
    (index: number) => setPhase({ kind: "prompt", index }),
    [],
  );

  const title = (() => {
    const label = CHANNEL_LABEL[channel];
    switch (phase.kind) {
      case "disclaimer": return `Update to ${label}`;
      case "downloading": return `Downloading ${label} firmware`;
      case "download-error": return "Download failed";
      case "prompt":
      case "rebooting":
      case "awaiting-bootloader":
      case "flashing":
      case "step-error":
        return `Update to ${label} — step ${phase.index + 1} of ${targets.length}`;
      case "complete": return "Update complete";
    }
  })();

  const preventClose =
    phase.kind === "downloading" ||
    phase.kind === "rebooting" ||
    phase.kind === "awaiting-bootloader" ||
    phase.kind === "flashing";

  return (
    <Modal isOpen={true} onClose={handleClose} title={title} preventClose={preventClose}>
      {phase.kind === "disclaimer" && (
        <>
          <p className="text-sm text-gray-300 mb-3">
            This will install the latest <span className="text-gray-100 font-medium">{CHANNEL_LABEL[channel]}</span> firmware
            on:
          </p>
          <ul className="text-sm text-gray-200 list-disc list-inside mb-3 space-y-1.5">
            {targets.map((t) => (
              <li key={t.id}>
                {t.label}
                <div className="ml-5 text-xs font-mono text-gray-400">
                  {t.currentVersion.toString(16).toUpperCase()}
                  <span className="text-gray-500"> → </span>
                  {t.release.entry.version_hex.toUpperCase()}
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.warningBox}>
            <div className="flex items-start gap-2">
              <WarningIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-amber-400 mb-2">Warning: Proceed at your own risk</p>
                <ul className="space-y-1 text-xs text-gray-400 list-disc list-inside">
                  <li>This tool is unofficial and not affiliated with Valve.</li>
                  <li>Unofficial firmware may cause permanent damage.</li>
                  <li>You accept full responsibility for any damage to your device.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className={styles.recoveryBox}>
            <p className="text-xs font-medium text-blue-400 mb-2">If something goes wrong</p>
            <ul className="text-xs text-gray-400 list-disc list-inside space-y-0.5">
              <li>The Puck auto-enters bootloader mode for 4 seconds on power-up — unplug and re-plug to retry.</li>
              <li>For a Steam Controller: remove the battery, then hold <span className="font-mono text-gray-300">View + Menu + A</span> while connecting via USB.</li>
            </ul>
          </div>

          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
            <button className={styles.primaryButton} onClick={beginDownload}>
              I Understand, Continue
            </button>
          </div>
        </>
      )}

      {phase.kind === "downloading" && (
        <div className={styles.statusText}>
          <SpinnerIcon className="w-4 h-4" />
          Downloading firmware…
        </div>
      )}

      {phase.kind === "download-error" && (
        <>
          <div className={styles.errorBox}>
            <p className="text-sm text-red-400 whitespace-pre-line">{phase.message}</p>
          </div>
          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Close</button>
            <button className={styles.primaryButton} onClick={beginDownload}>Retry</button>
          </div>
        </>
      )}

      {phase.kind === "prompt" && targets[phase.index] && (() => {
        const t = targets[phase.index];
        const slotReady = t.kind === "triton-wireless"
          ? !!liveDevice?.connectedControllers.some((c) => c.serialNumber === t.controllerSerial)
          : !!liveDevice;
        return (
          <>
            <p className="text-sm text-gray-300 mb-3">
              Next: <span className="text-gray-100 font-medium">{t.label}</span>
              {" → v"}
              <span className="font-mono text-gray-200">{t.release.entry.version_hex}</span>
            </p>
            {t.kind === "triton-wireless" ? (
              <p className="text-xs text-gray-400 mb-3">
                After clicking <span className="text-gray-200">Begin</span>, the controller will reboot.
                Plug it into USB so the bootloader can be reached.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-3">
                Clicking <span className="text-gray-200">Begin</span> will reboot the device into bootloader mode.
                Keep it plugged in over USB.
              </p>
            )}
            {!slotReady && (
              <p className="text-xs text-amber-400 mb-3">
                {t.kind === "triton-wireless"
                  ? "Waiting for the Steam Controller to reconnect to the Puck…"
                  : "Waiting for the device to finish reconnecting…"}
              </p>
            )}
            <div className={styles.buttonRow}>
              <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
              <button
                className={styles.primaryButton}
                onClick={() => void beginTarget(phase.index)}
                disabled={!slotReady}
              >
                Begin
              </button>
            </div>
          </>
        );
      })()}

      {phase.kind === "rebooting" && targets[phase.index] && (
        <div className={styles.statusText}>
          <SpinnerIcon className="w-4 h-4" />
          Rebooting {targets[phase.index].label} into bootloader…
        </div>
      )}

      {phase.kind === "awaiting-bootloader" && targets[phase.index] && (
        <div className={styles.statusText}>
          <SpinnerIcon className="w-4 h-4" />
          Waiting for {targets[phase.index].label} bootloader…
        </div>
      )}

      {phase.kind === "flashing" && targets[phase.index] && (
        <>
          <p className="text-xs text-gray-400 mb-2">Flashing {targets[phase.index].label}…</p>
          <div className={styles.statusText}>
            <SpinnerIcon className="w-4 h-4" />
            {phase.status?.type === "erasing" && "Erasing flash..."}
            {phase.status?.type === "programming" && `Programming... ${Math.round(phase.status.percent)}%`}
            {phase.status?.type === "finalizing" && "Finalizing..."}
            {phase.status?.type === "resetting" && "Resetting device..."}
            {!phase.status && "Preparing..."}
          </div>
          {phase.status?.type === "programming" && (
            <div className={styles.progressBar}>
              <div className={styles.fill} style={{ width: `${phase.status.percent}%` }} />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">
            Do not disconnect the device during this process.
          </p>
        </>
      )}

      {phase.kind === "step-error" && targets[phase.index] && (
        <>
          <p className="text-sm text-gray-300 mb-2">
            {targets[phase.index].label} did not update.
          </p>
          <div className={styles.errorBox}>
            <p className="text-sm text-red-400 whitespace-pre-line">{phase.message}</p>
          </div>
          <div className={styles.buttonRow}>
            <button className={styles.cancelButton} onClick={handleClose}>Cancel</button>
            <button className={styles.primaryButton} onClick={() => retryStep(phase.index)}>
              <FlashIcon className="w-4 h-4" />
              Retry
            </button>
          </div>
        </>
      )}

      {phase.kind === "complete" && (
        <div className={styles.successBox}>
          <CheckCircleIcon className={styles.successIcon} />
          <p className="text-base font-medium text-gray-200 mb-1">Update complete</p>
          {phase.flashed.length > 0 ? (
            <p className="text-sm text-gray-400">
              Updated: {phase.flashed.join(", ")}.
            </p>
          ) : (
            <p className="text-sm text-gray-400">Nothing was flashed.</p>
          )}
          <div className={styles.buttonRow} style={{ justifyContent: "center" }}>
            <button className={styles.primaryButton} onClick={handleClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Key matching App's `devices` Map: `${serialNumber}:${deviceType}`. */
export function deviceKey(d: ConnectedDevice): string {
  return `${d.info.serialNumber}:${d.info.type}`;
}

export type { Target as UpdateWizardTarget };
