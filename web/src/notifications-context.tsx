import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { NotificationStack } from "./components/NotificationStack";

export type NotificationKind = "persistent" | "notification";
export type NotificationVariant = "success" | "error" | "device" | "info";
export type CardAccent = "puck" | "controller" | "bootloader" | "wireless" | "neutral";

export interface AppNotification {
  id: string;
  /** "persistent" cards are highest-priority, never auto-dismiss, and have no
   *  manual dismiss button — they're managed entirely by their producer.
   *  Scaffolded for in-progress tasks; no producers are wired yet. */
  kind: NotificationKind;
  variant: NotificationVariant;
  title: string;
  /** Optional body lines (e.g. the per-device list in a batched device card). */
  lines?: string[];
  accent?: CardAccent;
  /** Notification cards only: a number auto-dismisses after that many ms;
   *  null/undefined makes the card sticky (X button only — used for errors). */
  durationMs?: number | null;
  /** Persistent cards only: 0-100 progress for the task. Unused for now. */
  progress?: number;
}

export type NotifyInput = Omit<AppNotification, "id" | "kind"> & { kind?: "notification" };
export type PersistentInput = Omit<AppNotification, "id" | "kind" | "durationMs">;

interface NotificationsContextValue {
  /** Push a transient notification card. Defaults to a 5s auto-dismiss unless
   *  `durationMs` is explicitly null (sticky). Returns the new card's id. */
  notify: (n: NotifyInput) => string;
  dismiss: (id: string) => void;
  update: (id: string, partial: Partial<AppNotification>) => void;
  /** Add a persistent (in-progress) card. Scaffolded; no producers yet. */
  addPersistent: (n: PersistentInput) => string;
}

const DEFAULT_DURATION_MS = 5000;

// Module-scoped counter — avoids Date.now()/Math.random() and is stable across
// renders. Ids only need to be unique within a session.
let seq = 0;
function nextId(): string {
  return `n${++seq}`;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const update = useCallback((id: string, partial: Partial<AppNotification>) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ...partial } : n)));
  }, []);

  const notify = useCallback((n: NotifyInput) => {
    const id = nextId();
    const durationMs = n.durationMs === undefined ? DEFAULT_DURATION_MS : n.durationMs;
    setItems((prev) => [...prev, { ...n, id, kind: "notification", durationMs }]);
    return id;
  }, []);

  const addPersistent = useCallback((n: PersistentInput) => {
    const id = nextId();
    setItems((prev) => [...prev, { ...n, id, kind: "persistent" }]);
    return id;
  }, []);

  return (
    <NotificationsContext.Provider value={{ notify, dismiss, update, addPersistent }}>
      {children}
      <NotificationStack notifications={items} onDismiss={dismiss} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}
