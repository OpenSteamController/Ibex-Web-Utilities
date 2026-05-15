export const FIRMWARE_CATALOG_URL =
  "https://opensteamcontroller.github.io/Ibex-Firmware/index.json";

export type FirmwareChannel = "stable" | "publicbeta";
export type FirmwareCategory = "controller" | "puck";

export interface FirmwareFirstSeenEntry {
  commit: string;
  date: string;
  steam_version?: string;
}

export interface FirmwareEntry {
  version_hex: string;
  version_unix: number;
  crc32: string;
  sha256: string;
  file_size: number;
  payload_size: number;
  first_seen?: Partial<Record<FirmwareChannel, FirmwareFirstSeenEntry>>;
}

export interface CrcIndexEntry {
  category: FirmwareCategory;
  path: string;
  version_hex: string;
}

export interface FirmwareCatalog {
  controller: Record<string, FirmwareEntry>;
  puck: Record<string, FirmwareEntry>;
  crc32_index: Record<string, CrcIndexEntry>;
  generated_at?: string;
}

export async function fetchFirmwareCatalog(): Promise<FirmwareCatalog> {
  const res = await fetch(FIRMWARE_CATALOG_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FirmwareCatalog;
}

export function lookupFirmwareByCrc(
  catalog: FirmwareCatalog,
  crc32: number,
): CrcIndexEntry | null {
  const key = (crc32 >>> 0).toString(16).padStart(8, "0").toLowerCase();
  return catalog.crc32_index[key] ?? null;
}

export interface LatestFirmwareRelease {
  filename: string;
  entry: FirmwareEntry;
}

export type LatestFirmwareVersions = Partial<Record<FirmwareChannel, LatestFirmwareRelease>>;

export function getLatestFirmware(
  catalog: FirmwareCatalog,
  category: FirmwareCategory,
): LatestFirmwareVersions {
  const out: LatestFirmwareVersions = {};
  for (const [filename, entry] of Object.entries(catalog[category])) {
    const channels = entry.first_seen;
    if (!channels) continue;
    for (const channel of Object.keys(channels) as FirmwareChannel[]) {
      const current = out[channel];
      if (!current || entry.version_unix > current.entry.version_unix) {
        out[channel] = { filename, entry };
      }
    }
  }
  return out;
}

export async function downloadFirmware(
  category: FirmwareCategory,
  filename: string,
): Promise<Uint8Array> {
  const subdir = category === "puck" ? "Puck" : "Controller";
  const url = new URL(`${subdir}/${filename}`, FIRMWARE_CATALOG_URL).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
