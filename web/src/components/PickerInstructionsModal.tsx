import { Modal } from "./Modal";
import { InfoIcon, SpinnerIcon } from "./Icons";

interface PickerInstructionsModalProps {
  isOpen: boolean;
  mode: "hid" | "bootloader";
  busy: boolean;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * Centered modal shown before a browser device picker fires. Has a
 * Continue button — that click is the fresh user gesture the browser
 * requires for navigator.hid.requestDevice / navigator.serial.requestPort.
 */
export function PickerInstructionsModal({
  isOpen,
  mode,
  busy,
  onContinue,
  onCancel,
}: PickerInstructionsModalProps) {
  const title = mode === "hid" ? "Select your device" : "Select the bootloader";

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} preventClose={busy}>
      <div className="flex items-start gap-3">
        <InfoIcon className="w-5 h-5 text-valve-blue shrink-0 mt-0.5" />
        <div className="flex-1">
          {mode === "hid" ? <HidInstructions /> : <BootloaderInstructions />}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border-subtle">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded text-gray-300 hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onContinue}
          disabled={busy}
          className="px-4 py-1.5 text-sm font-medium rounded bg-valve-blue text-white hover:bg-valve-blue/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-colors"
        >
          {busy ? (
            <>
              <SpinnerIcon className="w-3.5 h-3.5" />
              Waiting for picker…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </Modal>
  );
}

function HidInstructions() {
  return (
    <div className="space-y-2.5 text-sm text-gray-300">
      <p>
        When you click <strong>Continue</strong>, your browser will open a
        device picker. Your Valve device may appear as:
      </p>
      <ul className="list-disc pl-5 space-y-1.5 text-gray-200">
        <li>
          <strong>Steam Ctrl (BT)</strong>{" "}
          <span className="text-gray-500">— Bluetooth</span>
        </li>
        <li>
          <strong>Steam Controller</strong> /{" "}
          <strong>Valve Software Steam Controller</strong>{" "}
          <span className="text-gray-500">— wired USB</span>
        </li>
        <li>
          <strong>Steam Controller Puck</strong> /{" "}
          <strong>Valve Software Steam Controller Puck</strong>{" "}
          <span className="text-gray-500">— Puck (USB or wireless)</span>
        </li>
      </ul>
      <p className="text-gray-500 text-xs">
        Don't see it? Make sure it's plugged in or paired, then try again.
      </p>
    </div>
  );
}

function BootloaderInstructions() {
  return (
    <div className="space-y-2.5 text-sm text-gray-300">
      <p>
        If your device isn't already plugged in via USB, plug it in now.
      </p>
      <p>
        When you click <strong>Continue</strong>, your browser will open a
        serial port picker. Select{" "}
        <strong>"Steam Controller Bootloader"</strong>.
      </p>
    </div>
  );
}
