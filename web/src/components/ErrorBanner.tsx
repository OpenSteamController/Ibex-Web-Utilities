import { ErrorIcon, CloseIcon } from "./Icons";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      className="mx-6 mt-4 px-4 py-3 bg-red-950/60 border border-red-800/50 rounded-lg flex items-center gap-3"
      style={{ animation: "slide-down 0.25s ease-out" }}
    >
      <ErrorIcon className="w-5 h-5 text-red-400 shrink-0" />
      <span className="text-red-200 text-sm flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="text-red-400/70 hover:text-red-200 p-1 rounded hover:bg-red-900/30 transition-colors"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
