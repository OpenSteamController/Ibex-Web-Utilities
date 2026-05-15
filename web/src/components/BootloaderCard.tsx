import { useEffect, useState } from "react";
import { DeviceType } from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type { BootloaderDevice } from "@lib/index.js";
import type { FirmwareCatalog, FirmwareCategory } from "../firmware-catalog";
import { lookupFirmwareByCrc } from "../firmware-catalog";
import { TimestampValue } from "./TimestampValue";
import { FirmwareUpdateBadge } from "./FirmwareUpdateBadge";
import { BootloaderIcon, HashIcon, FirmwareIcon, SerialIcon, FlashIcon, RebootIcon, SpinnerIcon } from "./Icons";
import { FlashWizard } from "./FlashWizard";
import styles from "./BootloaderCard.module.sass";

function fwMagicName(magic: number): string {
  if (magic === TRITON_FW_MAGIC) return "IBEX";
  if (magic === PROTEUS_FW_MAGIC) return "PROTEUS";
  return `Unknown (0x${magic.toString(16).toUpperCase()})`;
}

function bootloaderTitle(t: DeviceType): string {
  return t === DeviceType.TritonBootloader ? "Steam Controller" : "Steam Controller Puck";
}

/** Time the bootloader waits for activity before auto-exiting to firmware. */
const BOOTLOADER_IDLE_TIMEOUT_MS = 120_000;

interface BootloaderCardProps {
  device: BootloaderDevice;
  firmwareCatalog: FirmwareCatalog | null;
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
  onExitBootloader: (device: BootloaderDevice) => Promise<void>;
}

export function BootloaderCard({ device, firmwareCatalog, onFlashComplete, onFlashingChange, onExitBootloader }: BootloaderCardProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { info, deviceType, lastInfoAt } = device;
  const catalogEntry = firmwareCatalog
    ? lookupFirmwareByCrc(firmwareCatalog, info.installedFwChecksum)
    : null;
  const installedCategory: FirmwareCategory | null =
    info.installedFwMagic === TRITON_FW_MAGIC ? "controller"
    : info.installedFwMagic === PROTEUS_FW_MAGIC ? "puck"
    : null;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, BOOTLOADER_IDLE_TIMEOUT_MS - (now - lastInfoAt));
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = remainingMs / BOOTLOADER_IDLE_TIMEOUT_MS;

  const handleExit = async () => {
    setExitError(null);
    setExiting(true);
    try {
      await onExitBootloader(device);
      // Card unmounts when the device re-enumerates as normal HID.
    } catch (e) {
      setExitError(e instanceof Error ? e.message : String(e));
      setExiting(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.accentBar} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={styles.iconCircle}>
            <BootloaderIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-100 truncate">
              {bootloaderTitle(deviceType)}
            </h2>
            <p className="text-xs text-gray-500 font-mono">{info.unitSerial}</p>
          </div>
          <span className={styles.badge}>
            Bootloader
          </span>
        </div>

        <div className={styles.status}>
          <BootloaderIcon className={styles.icon} />
          Ready for firmware update
          <span className={styles.countdown}>auto-exit in {remainingSec}s</span>
        </div>
        <div className={styles.timeoutBar} aria-hidden="true">
          <div className={styles.fill} style={{ width: `${progress * 100}%` }} />
        </div>

        <dl className={`${styles.infoList} text-sm`}>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-gray-400">
              <SerialIcon className="w-3.5 h-3.5" />
              Unit Serial
            </dt>
            <dd className="font-mono text-gray-200">{info.unitSerial}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-gray-400">
              <SerialIcon className="w-3.5 h-3.5" />
              PCBA Serial
            </dt>
            <dd className="font-mono text-gray-200">{info.pcbaSerial}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-gray-400">
              <HashIcon className="w-3.5 h-3.5" />
              Hardware ID
            </dt>
            <dd className="font-mono text-gray-200">0x{info.hardwareId.toString(16).toUpperCase()}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-gray-400">
              <FirmwareIcon className="w-3.5 h-3.5" />
              Bootloader Version
            </dt>
            <TimestampValue ts={info.bootBuildTimestamp} />
          </div>
        </dl>

        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="text-xs text-gray-400 mb-2">Installed firmware</p>
          {info.installedFwMagic !== 0 && info.installedFwMagic !== 0xFFFFFFFF ? (
            <dl className={`${styles.infoList} text-sm`}>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-400">
                  <FirmwareIcon className="w-3.5 h-3.5" />
                  Target
                </dt>
                <dd className="font-mono text-gray-200 text-xs">{fwMagicName(info.installedFwMagic)}</dd>
              </div>
              {firmwareCatalog && (
                <div className="flex justify-between items-center">
                  <dt className="text-gray-400">Firmware</dt>
                  {catalogEntry ? (
                    <div className="flex items-center gap-1.5">
                      {installedCategory && (
                        <FirmwareUpdateBadge
                          current={parseInt(catalogEntry.version_hex, 16)}
                          category={installedCategory}
                          catalog={firmwareCatalog}
                        />
                      )}
                      <TimestampValue ts={parseInt(catalogEntry.version_hex, 16)} />
                    </div>
                  ) : (
                    <dd className="font-mono text-gray-500">Unrecognized</dd>
                  )}
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-400">Size</dt>
                <dd className="font-mono text-gray-200">{(info.installedFwSize / 1024).toFixed(1)} KiB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Checksum</dt>
                <dd className="font-mono text-gray-200">0x{info.installedFwChecksum.toString(16).toUpperCase()}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500 italic">No firmware installed</p>
          )}
        </div>

        <div className="mt-4 border-t border-border-subtle pt-3">
          {exitError && (
            <p className="text-xs text-red-400 mb-2">{exitError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              className={styles.flashButton}
              onClick={() => setWizardOpen(true)}
              disabled={exiting}
            >
              <FlashIcon className="w-3.5 h-3.5" />
              Flash Firmware
            </button>
            <button
              className={styles.exitButton}
              onClick={handleExit}
              disabled={exiting}
            >
              {exiting ? (
                <>
                  <SpinnerIcon className="w-3.5 h-3.5" />
                  Exiting…
                </>
              ) : (
                <>
                  <RebootIcon className="w-3.5 h-3.5" />
                  Exit Bootloader
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <FlashWizard
        device={device}
        firmwareCatalog={firmwareCatalog}
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onFlashComplete={onFlashComplete}
        onFlashingChange={onFlashingChange}
      />
    </div>
  );
}
