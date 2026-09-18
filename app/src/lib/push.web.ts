/**
 * Web twin of `push.ts` (Metro picks this file for the web bundle). Push notifications are a
 * native-app feature here: the web build never imports expo-notifications, so its web module (and
 * its "not yet fully supported on web" warning) never loads. The preference switches in Settings
 * still work on web — they are server-side and apply to the phone.
 */
export async function isPushBlocked(): Promise<boolean> {
  return false;
}

export async function registerForPush(): Promise<void> {}

export async function unregisterPush(): Promise<void> {}

export function initNotificationRouting(): () => void {
  return () => {};
}
