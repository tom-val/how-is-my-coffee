/**
 * Imperative dialog API backed by in-app `<ConfirmHost>`s (see components/confirm-host.tsx).
 *
 * Replaces React Native's `Alert`, which has no web implementation (it silently no-ops), and gives
 * one branded, themed, localized dialog on web, iOS and Android.
 *
 * Like `lib/toast.ts` there is a STACK of hosts: the root layout mounts the bottom, and every
 * overlay presenting its own `Modal` pushes a scoped host while open. Only the topmost renders —
 * otherwise iOS draws the dialog in a sibling modal *underneath* the one already on screen and then
 * swallows every touch ("Delete does nothing and the app is frozen").
 */
export type DialogRequest = {
  title: string;
  message?: string;
  /** Text of the affirmative button. The host defaults it to "OK". */
  confirmLabel?: string;
  /** Style the affirmative button as destructive (red). */
  destructive?: boolean;
  /** Confirm dialogs offer Cancel; notifications (single OK) do not. */
  cancelable?: boolean;
  onConfirm?: () => void;
};

type Listener = (req: DialogRequest | null) => void;
type Host = { fn: Listener };

const hosts: Host[] = [];
// The one dialog on screen, if any. Requests raised before any host mounts wait here.
let current: DialogRequest | null = null;

function broadcast(): void {
  const top = hosts.length ? hosts[hosts.length - 1] : null;
  for (const h of hosts) h.fn(h === top ? current : null);
}

/** Internal: a host registers here. Scoped hosts go on top; the root host takes the bottom. */
export function registerDialogHost(fn: Listener, scoped: boolean): () => void {
  const host: Host = { fn };
  if (scoped) hosts.push(host);
  else hosts.unshift(host);
  broadcast();
  return () => {
    const i = hosts.indexOf(host);
    if (i < 0) return;
    hosts.splice(i, 1);
    broadcast();
  };
}

/** Internal: the host dismisses the dialog it is showing (confirmed or cancelled). */
export function resolveDialog(req: DialogRequest): void {
  if (current !== req) return;
  current = null;
  broadcast();
}

function emit(req: DialogRequest): void {
  current = req;
  broadcast();
}

/** Confirm a destructive action. `onConfirm` runs only if the user confirms. */
export function confirmDestructive(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  emit({ title, message, confirmLabel, destructive: true, cancelable: true, onConfirm });
}

/** Confirm a neutral action. `onConfirm` runs only if the user confirms. */
export function confirm(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  emit({ title, message, confirmLabel, cancelable: true, onConfirm });
}

/** Show an informational / error message with a single dismiss button. */
export function notify(title: string, message?: string): void {
  emit({ title, message, cancelable: false });
}
