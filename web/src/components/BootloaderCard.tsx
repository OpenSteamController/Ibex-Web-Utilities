import { useState } from "react";
import { DeviceType } from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type { BootloaderDevice } from "@lib/index.js";
import type { FirmwareCatalog } from "../firmware-catalog";
import { lookupFirmwareByCrc } from "../firmware-catalog";
import { TimestampValue } from "./TimestampValue";
import { BootloaderIcon, HashIcon, FirmwareIcon, SerialIcon, FlashIcon } from "./Icons";
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

interface BootloaderCardProps {
  device: BootloaderDevice;
  firmwareCatalog: FirmwareCatalog | null;
  onFlashComplete: () => void;
  onFlashingChange: (flashing: boolean) => void;
}

export function BootloaderCard({ device, firmwareCatalog, onFlashComplete, onFlashingChange }: BootloaderCardProps) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { info, deviceType } = device;
  const catalogEntry = firmwareCatalog
    ? lookupFirmwareByCrc(firmwareCatalog, info.installedFwChecksum)
    : null;

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
                <div className="flex justify-between">
                  <dt className="text-gray-400">Firmware</dt>
                  {catalogEntry ? (
                    <TimestampValue ts={parseInt(catalogEntry.version_hex, 16)} />
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
          <button
            className={styles.flashButton}
            onClick={() => setWizardOpen(true)}
          >
            <FlashIcon className="w-3.5 h-3.5" />
            Flash Firmware
          </button>
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
