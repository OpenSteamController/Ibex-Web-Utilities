import type {
  FirmwareCatalog,
  FirmwareCategory,
  FirmwareChannel,
  FirmwareEntry,
} from "../firmware-catalog";
import { getLatestFirmware } from "../firmware-catalog";
import { UpgradeArrowIcon } from "./Icons";

interface FirmwareUpdateBadgeProps {
  current: number | null | undefined;
  category: FirmwareCategory;
  catalog: FirmwareCatalog | null;
  className?: string;
}

function formatReleaseDate(entry: FirmwareEntry, channel: FirmwareChannel): string {
  const iso = entry.first_seen?.[channel]?.date;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return new Date(entry.version_unix * 1000).toLocaleDateString();
}

export function FirmwareUpdateBadge({
  current,
  category,
  catalog,
  className,
}: FirmwareUpdateBadgeProps) {
  if (!catalog || !current) return null;

  const latest = getLatestFirmware(catalog, category);
  const stable = latest.stable;
  const beta = latest.publicbeta;

  if (stable && stable.version_unix > current) {
    const label = `Newer stable firmware available: v${stable.version_hex} (${formatReleaseDate(stable, "stable")}).`;
    return (
      <span
        className={`inline-flex text-amber-400 ${className ?? ""}`}
        title={label}
        aria-label={label}
      >
        <UpgradeArrowIcon className="w-3.5 h-3.5" />
      </span>
    );
  }

  if (beta && beta.version_unix > current) {
    const label = `Newer beta firmware available: v${beta.version_hex} (${formatReleaseDate(beta, "publicbeta")}). No newer stable release.`;
    return (
      <span
        className={`inline-flex text-valve-blue ${className ?? ""}`}
        title={label}
        aria-label={label}
      >
        <UpgradeArrowIcon className="w-3.5 h-3.5" />
      </span>
    );
  }

  return null;
}
