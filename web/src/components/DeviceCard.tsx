import { useState } from "react";
import { DeviceTypeNames, DeviceClass, rebootToBootloader, getDeviceClass } from "@lib/index.js";
import type { ConnectedController, DeviceAttributes } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import { ExtraAttributes } from "./DeviceAttributes";
import { TimestampValue } from "./TimestampValue";
import {
  ControllerIcon,
  PuckIcon,
  HashIcon,
  FirmwareIcon,
  ChevronRightIcon,
  RebootIcon,
  SpinnerIcon,
  WirelessIcon,
} from "./Icons";
import styles from "./DeviceCard.module.sass";

function ControllerChild({ controller }: { controller: ConnectedController }) {
  return (
    <div className={styles.wirelessChild}>
      <div className="flex items-center gap-2 mb-2">
        <span className={styles.wirelessDot}>
          <span className={styles.ping} />
          <span className={styles.dot} />
        </span>
        <WirelessIcon className="w-3.5 h-3.5 text-accent-wireless" />
        <h3 className="text-sm font-medium text-accent-wireless">
          Steam Controller — Slot {controller.slot}
        </h3>
      </div>
      <dl className={`${styles.infoList} text-xs`}>
        <div className="flex justify-between">
          <dt className="text-gray-400">Serial</dt>
          <dd className="font-mono">{controller.serialNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Hardware ID</dt>
          <dd className="font-mono">0x{controller.hardwareId.toString(16).toUpperCase()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Firmware Version</dt>
          <TimestampValue ts={controller.buildTimestamp} />
        </div>
        {controller.bootBuildTimestamp !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Bootloader Version</dt>
            <TimestampValue ts={controller.bootBuildTimestamp} />
          </div>
        )}
        {controller.productId !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Product ID</dt>
            <dd className="font-mono">0x{controller.productId.toString(16).toUpperCase()}</dd>
          </div>
        )}
        {controller.capabilities !== 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-400">Capabilities</dt>
            <dd className="font-mono">0x{controller.capabilities.toString(16).toUpperCase()}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

const PROMOTED_KEYS = new Set([
  "buildTimestamp",
  "bootBuildTimestamp",
  "hardwareId",
  "productId",
  "capabilities",
]);

interface DeviceCardProps {
  device: ConnectedDevice;
}

export function DeviceCard({ device }: DeviceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const { info, attrs, connectedControllers } = device;

  const isPuck = info.deviceClass === DeviceClass.Proteus;
  const variant = isPuck ? "puck" : "controller";

  const handleRebootToBootloader = async () => {
    setRebootError(null);
    setRebooting(true);
    try {
      const deviceClass = getDeviceClass(info.type);
      await rebootToBootloader(deviceClass, device.hid);
      // Stay in "Rebooting..." state — the card unmounts when the device disconnects.
    } catch (e) {
      setRebootError(e instanceof Error ? e.message : String(e));
      setRebooting(false);
    }
  };

  const hasExtras = attrs && Object.keys(attrs).some(
    (k) => !PROMOTED_KEYS.has(k) && attrs[k as keyof DeviceAttributes] !== undefined,
  );

  return (
    <div className={styles.card}>
      <div className={`${styles.accentBar} ${styles[variant]}`} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={`${styles.iconCircle} ${styles[variant]}`}>
            {isPuck ? <PuckIcon className="w-5 h-5" /> : <ControllerIcon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-100 truncate">
              {DeviceTypeNames[info.type]}
            </h2>
            <p className="text-xs text-gray-500 font-mono">{info.serialNumber}</p>
          </div>
          <span className={`${styles.badge} ${styles[variant]}`}>
            {isPuck ? "Puck" : "Controller"}
          </span>
        </div>

        <dl className={`${styles.infoList} text-sm`}>
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
              Firmware
            </dt>
            <TimestampValue ts={info.buildTimestamp} />
          </div>
          {attrs?.bootBuildTimestamp != null && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-gray-400">
                <FirmwareIcon className="w-3.5 h-3.5" />
                Bootloader
              </dt>
              <TimestampValue ts={attrs.bootBuildTimestamp} />
            </div>
          )}
          {attrs?.productId != null && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-gray-400">
                <HashIcon className="w-3.5 h-3.5" />
                Product ID
              </dt>
              <dd className="font-mono text-gray-200">0x{attrs.productId.toString(16).toUpperCase()}</dd>
            </div>
          )}
          {attrs?.capabilities != null && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-gray-400">
                <HashIcon className="w-3.5 h-3.5" />
                Capabilities
              </dt>
              <dd className="font-mono text-gray-200">0x{attrs.capabilities.toString(16).toUpperCase()}</dd>
            </div>
          )}
        </dl>

        {hasExtras && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className={styles.expandToggle}
            >
              <ChevronRightIcon className={`${styles.chevron} ${expanded ? styles.open : ""}`} />
              {expanded ? "Hide" : "Show"} all attributes
            </button>
            <div className={`${styles.expandContent} ${expanded ? styles.open : styles.closed}`}>
              <ExtraAttributes attrs={attrs!} exclude={PROMOTED_KEYS} />
            </div>
          </div>
        )}

        {isPuck && connectedControllers.length > 0 && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs text-gray-400 mb-2">
              Connected controllers ({connectedControllers.length})
            </p>
            <div className="space-y-2">
              {connectedControllers.map((c) => (
                <ControllerChild key={c.serialNumber} controller={c} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-border-subtle pt-3">
          {rebootError && (
            <p className="text-xs text-red-400 mb-2">{rebootError}</p>
          )}
          <button
            onClick={handleRebootToBootloader}
            disabled={rebooting}
            className={styles.rebootButton}
          >
            {rebooting ? (
              <>
                <SpinnerIcon className="h-3.5 w-3.5" />
                Rebooting...
              </>
            ) : (
              <>
                <RebootIcon className="w-3.5 h-3.5" />
                Reboot to Bootloader
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
