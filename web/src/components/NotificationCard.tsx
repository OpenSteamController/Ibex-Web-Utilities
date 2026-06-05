import { useCallback, useEffect, useRef, useState } from "react";
import type { AppNotification, CardAccent, NotificationVariant } from "../notifications-context";
import {
  CheckCircleIcon,
  ErrorIcon,
  CloseIcon,
  ControllerIcon,
  PuckIcon,
  BootloaderIcon,
  WirelessIcon,
  WarningIcon,
} from "./Icons";
import styles from "./NotificationCard.module.sass";

const ACCENT_HEX: Record<CardAccent, string> = {
  puck: "#2dd4bf",
  controller: "#a78bfa",
  bootloader: "#f59e0b",
  wireless: "#c084fc",
  neutral: "#6b7280",
};

const VARIANT_HEX: Record<NotificationVariant, string> = {
  success: "#22c55e",
  error: "#ef4444",
  device: "#6b7280",
  info: "#1a9fff",
};

/** Success/error always own their color; device cards take the device accent. */
function accentColor(n: AppNotification): string {
  if (n.variant === "success" || n.variant === "error") return VARIANT_HEX[n.variant];
  if (n.accent) return ACCENT_HEX[n.accent];
  return VARIANT_HEX[n.variant];
}

function CardIcon({ n, className }: { n: AppNotification; className?: string }) {
  switch (n.variant) {
    case "success":
      return <CheckCircleIcon className={className} />;
    case "error":
      return <ErrorIcon className={className} />;
    case "device":
      if (n.accent === "puck") return <PuckIcon className={className} />;
      if (n.accent === "wireless") return <WirelessIcon className={className} />;
      if (n.accent === "bootloader") return <BootloaderIcon className={className} />;
      return <ControllerIcon className={className} />;
    default:
      return <WarningIcon className={className} />;
  }
}

/** Keep in sync with the slide-out-down animation duration in global.sass. */
const EXIT_MS = 220;

export function NotificationCard({
  notification: n,
  onDismiss,
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  // Bumped whenever the countdown (re)starts so the CSS drain animation and the
  // auto-dismiss timeout both restart cleanly from full.
  const [runId, setRunId] = useState(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoDismiss = n.kind === "notification" && typeof n.durationMs === "number";
  const showClose = n.kind === "notification";

  const beginExit = useCallback(() => {
    setExiting(true);
    exitTimer.current = setTimeout(() => onDismiss(n.id), EXIT_MS);
  }, [n.id, onDismiss]);

  // Auto-dismiss countdown. Cleared while hovered (paused); restarted fresh on
  // unhover via the runId bump (full duration, not resumed).
  useEffect(() => {
    if (!autoDismiss || paused || exiting) return;
    const handle = setTimeout(beginExit, n.durationMs as number);
    return () => clearTimeout(handle);
  }, [autoDismiss, paused, exiting, n.durationMs, beginExit, runId]);

  // Cancel a pending exit-animation timer if the card unmounts first.
  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  const onEnter = useCallback(() => {
    if (autoDismiss) setPaused(true);
  }, [autoDismiss]);

  const onLeave = useCallback(() => {
    if (!autoDismiss) return;
    setPaused(false);
    setRunId((r) => r + 1);
  }, [autoDismiss]);

  const color = accentColor(n);

  return (
    <div
      className={`${styles.card} ${exiting ? styles.exiting : ""} pointer-events-auto`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      role="status"
    >
      <div className={styles.body}>
        <span className={styles.iconCircle} style={{ color, background: `${color}1f` }}>
          <CardIcon n={n} className={styles.icon} />
        </span>
        <div className={styles.content}>
          <p className={styles.title}>{n.title}</p>
          {n.lines?.map((line, i) => (
            <p key={i} className={styles.line}>
              {line}
            </p>
          ))}
          {n.kind === "persistent" && typeof n.progress === "number" && (
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${n.progress}%`, background: color }}
              />
            </div>
          )}
        </div>
        {showClose && (
          <button className={styles.close} onClick={beginExit} aria-label="Dismiss">
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      {autoDismiss && (
        <div
          className={`${styles.timerTrack} ${paused ? styles.timerHidden : ""}`}
          aria-hidden="true"
        >
          <div
            key={runId}
            className={styles.timerFill}
            style={{ background: color, animationDuration: `${n.durationMs}ms` }}
          />
        </div>
      )}
    </div>
  );
}
