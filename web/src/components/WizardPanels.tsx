import type { ReactNode } from "react";
import type { UpdateEvent } from "@lib/index.js";
import { WarningIcon, SpinnerIcon, CheckCircleIcon } from "./Icons";
import styles from "./FlashWizard.module.sass";

/** Spinner + typed status text + (during programming) progress bar +
 *  "do not disconnect" hint. Shared by FlashWizard and UpdateWizard's
 *  flashing phases. `label` is the optional per-target prefix used by
 *  UpdateWizard ("Flashing Steam Controller Puck…"). */
export function FlashProgressView({
  status,
  label,
}: {
  status: UpdateEvent | null;
  label?: string;
}) {
  return (
    <>
      {label && (
        <p className="text-xs text-gray-400 mb-2">Flashing {label}…</p>
      )}
      <div className={styles.statusText}>
        <SpinnerIcon className="w-4 h-4" />
        {status?.type === "erasing" && "Erasing flash..."}
        {status?.type === "programming" && `Programming... ${Math.round(status.percent)}%`}
        {status?.type === "finalizing" && "Finalizing..."}
        {status?.type === "resetting" && "Resetting device..."}
        {!status && "Preparing..."}
      </div>
      {status?.type === "programming" && (
        <div className={styles.progressBar}>
          <div className={styles.fill} style={{ width: `${status.percent}%` }} />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">
        Do not disconnect the device during this process.
      </p>
    </>
  );
}

/** Amber warning panel with a fixed heading and a slot for the variable
 *  bullet list. Used on each wizard's disclaimer step. */
export function WarningPanel({ children }: { children: ReactNode }) {
  return (
    <div className={styles.warningBox}>
      <div className="flex items-start gap-3">
        <WarningIcon className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-200">
          <p className="font-semibold text-amber-300 text-base mb-2">Warning: Proceed at your own risk</p>
          <ul className="space-y-1.5 text-sm text-gray-200 list-disc list-inside">
            {children}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Green checkmark + heading + body + Done button. Shared completion
 *  panel for both wizards. */
export function SuccessPanel({
  title,
  children,
  onDone,
  doneLabel = "Done",
}: {
  title: string;
  children: ReactNode;
  onDone: () => void;
  doneLabel?: string;
}) {
  return (
    <div className={styles.successBox}>
      <CheckCircleIcon className={styles.successIcon} />
      <p className="text-base font-medium text-gray-200 mb-1">{title}</p>
      <div className="text-sm text-gray-400">{children}</div>
      <div className={styles.buttonRow} style={{ justifyContent: "center" }}>
        <button className={styles.primaryButton} onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  );
}
