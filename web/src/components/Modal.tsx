import { useEffect, useCallback, useState, type ReactNode } from "react";
import { CloseIcon } from "./Icons";
import styles from "./Modal.module.sass";

/** Module-level depth so stacked modals can detect they're nested and
 *  drop the dim tint — otherwise two overlays compound to a much darker
 *  background that obscures the modal beneath. */
let openModalCount = 0;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  preventClose?: boolean;
}

export function Modal({ isOpen, onClose, title, children, preventClose }: ModalProps) {
  const [nested, setNested] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !preventClose) onClose();
    },
    [onClose, preventClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!isOpen) return;
    setNested(openModalCount > 0);
    openModalCount++;
    return () => {
      openModalCount--;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`${styles.overlay} ${nested ? styles.overlayNested : ""}`}
      onClick={preventClose ? undefined : onClose}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          {!preventClose && (
            <button className={styles.closeButton} onClick={onClose}>
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
