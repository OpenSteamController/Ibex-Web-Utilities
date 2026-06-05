import type { AppNotification } from "../notifications-context";
import { NotificationCard } from "./NotificationCard";

/** Most cards visible at once before older ones are dropped from the stack. */
const MAX_VISIBLE = 4;

/** Fixed bottom-right overlay that stacks notification cards above modals.
 *  Persistent cards (highest priority) sort to the top; transient ones below,
 *  newest first. The container ignores pointer events so the empty corner
 *  doesn't block clicks — each card re-enables them for itself. */
export function NotificationStack({
  notifications,
  onDismiss,
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  const persistent = notifications.filter((n) => n.kind === "persistent");
  const transient = notifications
    .filter((n) => n.kind === "notification")
    .slice()
    .reverse();
  const ordered = [...persistent, ...transient].slice(0, MAX_VISIBLE);

  if (ordered.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
      {ordered.map((n) => (
        <NotificationCard key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
