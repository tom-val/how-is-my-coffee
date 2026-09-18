/**
 * Imperative toast API backed by in-app `<ToastHost>`s (see components/toast-host.tsx).
 *
 * A toast is raised from an event handler, not during render, so the request lives in this module
 * and is published to a host through a tiny listener rather than being some screen's state. Any
 * code anywhere can say "this happened" without the screen it happened on owning a banner.
 *
 * Hosts form a STACK: the root layout mounts the bottom of it, and every overlay that presents its
 * own RN `Modal` (the place picker, the companion picker) pushes a scoped host while open. Only the
 * topmost host renders, so a toast raised inside a modal is drawn inside that modal — on iOS the
 * root host sits *underneath* an open modal, where a toast would simply never be seen.
 *
 * Only one toast is on screen at a time; a new one replaces it and restarts the clock. The timer
 * lives here rather than in a host so pushing or popping a host mid-toast neither restarts nor
 * strands it.
 */

/** The toast on screen. `id` changes on every raise, so a replacement re-runs the enter animation. */
export type ToastRequest = { id: number; message: string };

type Listener = (toast: ToastRequest | null) => void;
type Host = { fn: Listener };

/** Long enough to read a sentence, short enough not to sit in the way. */
const DEFAULT_DURATION_MS = 2600;

const hosts: Host[] = [];
let current: ToastRequest | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 0;

/** Hands `current` to the topmost host and clears every host below it. */
function broadcast(): void {
  const top = hosts.length ? hosts[hosts.length - 1] : null;
  for (const h of hosts) h.fn(h === top ? current : null);
}

/**
 * Internal: a host registers here. A scoped host (one inside an overlay's own modal) becomes the
 * topmost; the root host takes the bottom of the stack. The returned unregister re-delivers any
 * toast still up to whatever host is topmost then, so a toast raised in a modal that closes right
 * after finishes its second on the root host instead of vanishing with it.
 */
export function registerToastHost(fn: Listener, scoped: boolean): () => void {
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

/** Show a brief message in a pill near the bottom. Replaces any toast already up. */
export function showToast(message: string, opts?: { duration?: number }): void {
  if (hideTimer) clearTimeout(hideTimer);
  const toast: ToastRequest = { id: ++nextId, message };
  current = toast;
  broadcast();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (current !== toast) return; // already replaced — that toast owns the screen and its own timer
    current = null;
    broadcast();
  }, opts?.duration ?? DEFAULT_DURATION_MS);
}
