/**
 * Expo push notifications: registering this device with the API, and routing a tapped
 * notification to the screen it points at (see `docs/api-contract.md`, "Push notifications").
 *
 * Everything here is best-effort. A push token needs a real device AND a development/production
 * build with credentials — the iOS simulator, the Android emulator and Expo Go cannot produce one.
 * So every failure is swallowed: sign-in, sign-up and the cold-start bootstrap all call
 * `registerForPush()` and none of them may break because a phone said no to notifications.
 *
 * `expo-notifications` is loaded LAZILY, and only where push can exist. Since SDK 53 the Android
 * Expo Go client throws at import time ("remote notifications were removed from Expo Go"), so a
 * top-level import would red-box every Expo Go launch. The `available()` gate below is the single
 * place that decides; nothing else in this file touches the module directly.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';
import type { PushPlatform } from '@/types';

type NotificationsModule = typeof import('expo-notifications');

/** Expo Go (the store client) cannot do remote push at all; a dev/production build can. */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Web has no push support here, and `Device.isDevice` is meaningless there. */
const supported = (Platform.OS === 'ios' || Platform.OS === 'android') && !isExpoGo;

/** Dev-only breadcrumb: on a simulator, "no token" is the expected outcome, not a bug. */
function note(what: string, e: unknown): void {
  if (__DEV__) console.warn(`[push] ${what}:`, e instanceof Error ? e.message : String(e));
}

let modulePromise: Promise<NotificationsModule | null> | null = null;

/**
 * The notifications module, or null wherever push cannot work (web, Expo Go, simulators). Loaded
 * once; a notification that arrives while the app is open still shows its banner — the user may
 * be on a different screen than the one it is about. No badge: nothing in the app counts unread.
 */
function available(): Promise<NotificationsModule | null> {
  if (!supported || !Device.isDevice) return Promise.resolve(null);
  modulePromise ??= import('expo-notifications')
    .then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return Notifications;
    })
    .catch((e: unknown) => {
      note('notifications module unavailable', e);
      return null;
    });
  return modulePromise;
}

/** The token we handed the API this session, so `unregisterPush` knows what to delete. */
let registeredToken: string | null = null;

/** Whether we have already asked the OS this session (a second ask in one run is pointless). */
let registering: Promise<void> | null = null;

/** The EAS project id — `getExpoPushTokenAsync` needs it explicitly outside a classic build. */
function projectId(): string | undefined {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromConfig === 'string') return fromConfig;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return typeof fromEas === 'string' ? fromEas : undefined;
}

/**
 * Whether the OS permission is currently denied and cannot be re-requested in-app — the cue for
 * Settings to offer a link to the system settings instead of a switch that could never work.
 * Never throws; answers `false` anywhere push is not a thing (web, Expo Go, simulators).
 */
export async function isPushBlocked(): Promise<boolean> {
  const Notifications = await available();
  if (!Notifications) return false;
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    return !granted && !canAskAgain;
  } catch (e) {
    note('permission check failed', e);
    return false;
  }
}

/**
 * Register this device for push: Android channel, permission (asked only the first time), Expo
 * token, then `PUT /v1/push/tokens`. Idempotent — safe to call after every sign-in and on every
 * cold start; the server upserts and we skip the whole dance once a token is registered.
 */
export async function registerForPush(): Promise<void> {
  if (registeredToken) return;
  if (registering) return registering;
  registering = (async () => {
    try {
      const Notifications = await available();
      if (!Notifications) return; // web, Expo Go, simulator / emulator

      if (Platform.OS === 'android') {
        // Android needs a channel before any notification can be shown; "default" is the one the
        // server's payloads land in.
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      // Ask ONCE. If the user said no earlier, `canAskAgain` is false and the OS would swallow the
      // prompt anyway — Settings shows the "open system settings" line for that case.
      const current = await Notifications.getPermissionsAsync();
      let granted = current.granted;
      if (!granted && current.canAskAgain) {
        granted = (await Notifications.requestPermissionsAsync()).granted;
      }
      if (!granted) return;

      const id = projectId();
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        id ? { projectId: id } : undefined,
      );

      await api.registerPushToken({ token, platform: Platform.OS as PushPlatform });
      registeredToken = token;
    } catch (e) {
      // A build without push credentials, or an offline API: push simply will not arrive on this
      // device. Nothing else about the session is affected.
      note('registration skipped', e);
    } finally {
      registering = null;
    }
  })();
  return registering;
}

/**
 * Drop this device's token so the next person to sign in here does not get the last one's pushes.
 * Called at the START of sign-out, while the JWT is still set — the DELETE is authenticated.
 */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await api.deletePushToken(token);
  } catch (e) {
    note('unregister failed', e);
  }
}

// ── tap routing ───────────────────────────────────────────────────────────────

/** The `data` every push carries (contract): a type plus whatever the tap target needs. */
type PushData = { type?: string; ratingId?: string; username?: string };

/** `ratingId` wins over `username`; anything else is not a link and is ignored. */
function targetOf(data: unknown): string | null {
  const d = (data ?? {}) as PushData;
  if (typeof d.ratingId === 'string' && d.ratingId) return `/rating/${encodeURIComponent(d.ratingId)}`;
  if (typeof d.username === 'string' && d.username) return `/u/${encodeURIComponent(d.username)}`;
  return null;
}

function open(data: unknown): void {
  const href = targetOf(data);
  if (!href) return;
  // `push`, not `replace`: the notification opens a screen the user can back out of into the app
  // they were already in.
  router.push(href as Parameters<typeof router.push>[0]);
}

/**
 * Wire notification taps to navigation. Mounted once from the root layout.
 *
 * Two cases: the app was already running (the listener fires), or it was launched BY the tap, in
 * which case no listener was alive when it happened and `getLastNotificationResponseAsync` is the
 * only record of it. The cold-start navigation is deferred to the next tick so the router has
 * mounted its first route before we push onto it.
 */
export function initNotificationRouting(): () => void {
  let cancelled = false;
  let remove: (() => void) | null = null;

  void available().then((Notifications) => {
    if (!Notifications || cancelled) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data);
    });
    remove = () => sub.remove();

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return;
        setTimeout(() => {
          if (!cancelled) open(response.notification.request.content.data);
        }, 0);
      })
      .catch((e: unknown) => note('cold-start tap lookup failed', e));
  });

  return () => {
    cancelled = true;
    remove?.();
  };
}
