import { useState } from "react";
import {
  DeviceType,
  DeviceClass,
  rebootToBootloader,
  rebootControllerSlot,
  getDeviceClass,
} from "@lib/index.js";
import type { ConnectedController, DeviceAttributes } from "@lib/index.js";
import type { ConnectedDevice } from "../App";
import type { FirmwareCatalog, FirmwareChannel } from "../firmware-catalog";
import { ExtraAttributes } from "./DeviceAttributes";
import { TimestampValue } from "./TimestampValue";
import { FirmwareUpdateBadge } from "./FirmwareUpdateBadge";
import { buildUpdateTargets } from "./UpdateWizard";
import {
  ControllerIcon,
  PuckIcon,
  HashIcon,
  FirmwareIcon,
  ChevronRightIcon,
  RebootIcon,
  SpinnerIcon,
  WirelessIcon,
  UpgradeArrowIcon,
} from "./Icons";
import { usePicker } from "../picker-context";
import styles from "./DeviceCard.module.sass";

function connectionChip(type: DeviceType): { label: string; variant: "usb" | "ble" | "esb" } {
  switch (type) {
    case DeviceType.TritonBLE:
      return { label: "BLE", variant: "ble" };
    case DeviceType.TritonESB:
      return { label: "ESB", variant: "esb" };
    default:
      return { label: "USB", variant: "usb" };
  }
}

function ControllerChild({ controller, firmwareCatalog }: { controller: ConnectedController; firmwareCatalog: FirmwareCatalog | null }) {
  const { runBootloaderPicker } = usePicker();
  const [expanded, setExpanded] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);

  const handleReboot = async () => {
    setRebootError(null);
    setRebooting(true);
    try {
      await runBootloaderPicker({
        deviceClass: DeviceClass.Triton,
        action: () => rebootControllerSlot(controller.device),
        actionFirst: true,
      });
    } catch (e) {
      setRebootError(e instanceof Error ? e.message : String(e));
    } finally {
      setRebooting(false);
    }
  };

  return (
    <div className={styles.wirelessChild}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left cursor-pointer hover:text-accent-wireless/80 transition-colors"
        aria-expanded={expanded}
      >
        <span className={styles.wirelessDot}>
          <span className={styles.ping} />
          <span className={styles.dot} />
        </span>
        <WirelessIcon className="w-3.5 h-3.5 text-accent-wireless" />
        <h3 className="text-sm font-medium text-accent-wireless flex-1">
          Steam Controller — Slot {controller.slot}
        </h3>
        <span className={`${styles.badge} ${styles.esb} ${styles.small}`}>ESB</span>
        <ChevronRightIcon className={`${styles.chevron} ${expanded ? styles.open : ""}`} />
      </button>

      <div className={`${styles.expandContent} ${expanded ? styles.open : styles.closed}`}>
        <dl className={`${styles.infoList} text-xs mt-2`}>
          <div className="flex justify-between">
            <dt className="text-gray-400">Serial</dt>
            <dd className="font-mono">{controller.serialNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Hardware ID</dt>
            <dd className="font-mono">0x{controller.hardwareId.toString(16).toUpperCase()}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-gray-400">Firmware Version</dt>
            <div className="flex items-center gap-1.5">
              <FirmwareUpdateBadge
                current={controller.buildTimestamp}
                category="controller"
                catalog={firmwareCatalog}
              />
              <TimestampValue ts={controller.buildTimestamp} />
            </div>
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

        <div className="mt-2">
          {rebootError && (
            <p className="text-xs text-red-400 mb-1.5">{rebootError}</p>
          )}
          <button
            onClick={handleReboot}
            disabled={rebooting}
            className={`${styles.rebootButton} ${styles.small}`}
          >
            {rebooting ? (
              <>
                <SpinnerIcon className="h-3 w-3" />
                Rebooting...
              </>
            ) : (
              <>
                <RebootIcon className="w-3 h-3" />
                Reboot to Bootloader
              </>
            )}
          </button>
        </div>
      </div>
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
  firmwareCatalog: FirmwareCatalog | null;
  onRequestUpdate: (channel: FirmwareChannel) => void;
}

export function DeviceCard({
  device,
  firmwareCatalog,
  onRequestUpdate,
}: DeviceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [rebootError, setRebootError] = useState<string | null>(null);
  const { runBootloaderPicker } = usePicker();
  const { info, attrs, connectedControllers } = device;

  const stableTargets = firmwareCatalog
    ? buildUpdateTargets(device, "stable", firmwareCatalog)
    : [];
  const betaTargets = firmwareCatalog
    ? buildUpdateTargets(device, "publicbeta", firmwareCatalog)
    : [];

  const isPuck = info.deviceClass === DeviceClass.Proteus;
  const variant = isPuck ? "puck" : "controller";
  const chip = connectionChip(info.type);
  const titleName = isPuck ? "Steam Controller Puck" : "Steam Controller";

  const handleRebootToBootloader = async () => {
    setRebootError(null);
    setRebooting(true);
    try {
      const deviceClass = getDeviceClass(info.type);
      const isWireless = info.type === DeviceType.TritonBLE || info.type === DeviceType.TritonESB;
      const confirmed = await runBootloaderPicker({
        deviceClass,
        action: () => rebootToBootloader(deviceClass, device.hid),
        actionFirst: isWireless,
      });
      if (!confirmed) {
        // User cancelled the modal — nothing rebooted, drop the busy state.
        setRebooting(false);
      }
      // If confirmed, stay in "Rebooting..." — the card unmounts when the
      // device disconnects.
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
              {titleName}
            </h2>
            <p className="text-xs text-gray-500 font-mono">{info.serialNumber}</p>
          </div>
          <span className={`${styles.badge} ${styles[chip.variant]}`}>
            {chip.label}
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
            <div className="flex items-center gap-1.5">
              <FirmwareUpdateBadge
                current={info.buildTimestamp}
                category={isPuck ? "puck" : "controller"}
                catalog={firmwareCatalog}
              />
              <TimestampValue ts={info.buildTimestamp} />
            </div>
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
                <ControllerChild key={c.serialNumber} controller={c} firmwareCatalog={firmwareCatalog} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-border-subtle pt-3">
          {rebootError && (
            <p className="text-xs text-red-400 mb-2">{rebootError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {stableTargets.length > 0 && firmwareCatalog && (
              <button
                onClick={() => onRequestUpdate("stable")}
                disabled={rebooting}
                className={styles.updateStableButton}
              >
                <UpgradeArrowIcon className="w-3.5 h-3.5" />
                Update to Stable
              </button>
            )}
            {betaTargets.length > 0 && firmwareCatalog && (
              <button
                onClick={() => onRequestUpdate("publicbeta")}
                disabled={rebooting}
                className={styles.updateBetaButton}
              >
                <UpgradeArrowIcon className="w-3.5 h-3.5" />
                Update to Beta
              </button>
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
    </div>
  );
}
