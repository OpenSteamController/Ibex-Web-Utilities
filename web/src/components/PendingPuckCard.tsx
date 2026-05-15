import { useEffect, useState } from "react";
import type { BootloaderPort } from "@lib/index.js";
import { PuckIcon, BootloaderIcon, SpinnerIcon } from "./Icons";
import styles from "./BootloaderCard.module.sass";

interface PendingPuckCardProps {
  pending: BootloaderPort;
  timeoutMs: number;
  onConnect: (bp: BootloaderPort) => Promise<void>;
}

/**
 * Shown while a Puck is in its bootloader-mode timeout window. If the
 * user doesn't act, the Puck transitions to firmware and a normal
 * DeviceCard takes over. Clicking the button stops the timeout and
 * opens the port now.
 */
export function PendingPuckCard({ pending, timeoutMs, onConnect }: PendingPuckCardProps) {
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(timeoutMs);

  useEffect(() => {
    const start = performance.now();
    const interval = setInterval(() => {
      const r = Math.max(0, timeoutMs - (performance.now() - start));
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [timeoutMs]);

  const handleClick = async () => {
    setBusy(true);
    try {
      await onConnect(pending);
    } catch {
      setBusy(false);
    }
  };

  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(1, remaining / timeoutMs));

  return (
    <div className={styles.card}>
      <div className={styles.accentBar} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className={styles.iconCircle}>
            <PuckIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-100 truncate">
              Steam Controller Puck
            </h2>
            <p className="text-xs text-gray-500">In bootloader mode</p>
          </div>
          <span className={styles.badge}>Pending</span>
        </div>

        <p className="text-sm text-gray-400 mb-3">
          Starting normally in <span className="text-gray-200 font-mono">{seconds}s</span>.
        </p>

        <div className="h-1 bg-surface rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-amber-500/60 transition-[width] duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button
          onClick={handleClick}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <>
              <SpinnerIcon className="w-3.5 h-3.5" />
              Connecting…
            </>
          ) : (
            <>
              <BootloaderIcon className="w-3.5 h-3.5" />
              Connect to Bootloader
            </>
          )}
        </button>
      </div>
    </div>
  );
}
