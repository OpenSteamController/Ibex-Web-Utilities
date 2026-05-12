import { DeviceTypeNames } from "@lib/index.js";
import { TRITON_FW_MAGIC, PROTEUS_FW_MAGIC } from "@lib/constants.js";
import type { BootloaderDevice } from "@lib/index.js";
import { TimestampValue } from "./TimestampValue";
import { BootloaderIcon, HashIcon, FirmwareIcon, SerialIcon } from "./Icons";
import styles from "./BootloaderCard.module.sass";

function fwMagicName(magic: number): string {
  if (magic === TRITON_FW_MAGIC) return "IBEX";
  if (magic === PROTEUS_FW_MAGIC) return "PROTEUS";
  return `Unknown (0x${magic.toString(16).toUpperCase()})`;
}

interface BootloaderCardProps {
  device: BootloaderDevice;
}

export function BootloaderCard({ device }: BootloaderCardProps) {
  const { info, deviceType } = device;

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
              {DeviceTypeNames[deviceType]}
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

        {info.installedFwMagic !== 0 && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs text-gray-400 mb-2">Installed firmware</p>
            <dl className={`${styles.infoList} text-sm`}>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-400">
                  <FirmwareIcon className="w-3.5 h-3.5" />
                  Target
                </dt>
                <dd className="font-mono text-gray-200 text-xs">{fwMagicName(info.installedFwMagic)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Size</dt>
                <dd className="font-mono text-gray-200">{(info.installedFwSize / 1024).toFixed(1)} KiB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Checksum</dt>
                <dd className="font-mono text-gray-200">0x{info.installedFwChecksum.toString(16).toUpperCase()}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
