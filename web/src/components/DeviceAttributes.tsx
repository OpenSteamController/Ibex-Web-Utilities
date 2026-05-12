import type { DeviceAttributes as DeviceAttributesType } from "@lib/index.js";

interface ExtraAttributesProps {
  attrs: DeviceAttributesType;
  exclude: Set<string>;
}

const ATTR_LABELS: Record<string, string> = {
  uniqueId: "Unique ID",
  productId: "Product ID",
  capabilities: "Capabilities",
  buildTimestamp: "Firmware Version",
  radioBuildTimestamp: "Radio Build Timestamp",
  hardwareId: "Hardware ID",
  bootBuildTimestamp: "Bootloader Version",
  frameRate: "Frame Rate",
  secondaryBuildTimestamp: "Secondary Firmware Version",
  secondaryBootBuildTimestamp: "Secondary Bootloader Version",
  secondaryHardwareId: "Secondary Hardware ID",
  dataStreaming: "Data Streaming",
  trackpadId: "Trackpad ID",
  secondaryTrackpadId: "Secondary Trackpad ID",
};

const TIMESTAMP_KEYS = new Set([
  "buildTimestamp",
  "bootBuildTimestamp",
  "radioBuildTimestamp",
  "secondaryBuildTimestamp",
  "secondaryBootBuildTimestamp",
]);

function formatValue(key: string, val: number): string {
  if (TIMESTAMP_KEYS.has(key) && val !== 0) {
    return val.toString(16).toUpperCase();
  }
  return `0x${val.toString(16).toUpperCase()}`;
}

function formatTitle(key: string, val: number): string | undefined {
  if (TIMESTAMP_KEYS.has(key) && val !== 0) {
    return new Date(val * 1000).toLocaleString();
  }
  return undefined;
}

export function ExtraAttributes({ attrs, exclude }: ExtraAttributesProps) {
  const entries = Object.entries(attrs).filter(
    ([key, val]) => val !== undefined && !exclude.has(key),
  ) as [string, number][];

  if (entries.length === 0) {
    return <p className="text-xs text-gray-500 mt-2">No additional attributes</p>;
  }

  return (
    <table className="w-full mt-3 text-xs" style={{ animation: "fade-in 0.2s ease-out" }}>
      <tbody>
        {entries.map(([key, val], i) => (
          <tr key={key} className={`border-t border-border-subtle/50 ${i % 2 === 0 ? "bg-surface-overlay/30" : ""}`}>
            <td className="py-1.5 text-gray-400 pr-4">
              {ATTR_LABELS[key] ?? key}
            </td>
            <td className="py-1.5 font-mono text-right text-gray-200" title={formatTitle(key, val)}>
              {formatValue(key, val)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
