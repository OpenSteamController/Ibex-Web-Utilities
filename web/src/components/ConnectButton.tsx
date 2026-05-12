import { SpinnerIcon, UsbIcon, TerminalIcon } from "./Icons";
import styles from "./ConnectButton.module.sass";

interface ConnectButtonProps {
  onClick: () => void;
  loading: boolean;
  variant?: "device" | "bootloader";
  label?: string;
  loadingLabel?: string;
}

export function ConnectButton({
  onClick,
  loading,
  variant = "device",
  label,
  loadingLabel,
}: ConnectButtonProps) {
  const Icon = variant === "device" ? UsbIcon : TerminalIcon;
  const defaultLabel = variant === "device" ? "Connect Device" : "Connect Bootloader";
  const defaultLoadingLabel = "Connecting...";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${styles.button} ${styles[variant]}`}
    >
      {loading ? (
        <>
          <SpinnerIcon className="h-4 w-4" />
          {loadingLabel ?? defaultLoadingLabel}
        </>
      ) : (
        <>
          <Icon className="w-4 h-4" />
          {label ?? defaultLabel}
        </>
      )}
    </button>
  );
}
