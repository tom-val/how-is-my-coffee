/**
 * The in-app appearance preference (System / Light / Dark), and the two platform facts the rest of
 * the theme has to bend around.
 *
 * How the choice is applied per platform:
 *   iOS   LIVE. `Appearance.setColorScheme()` sets `window.overrideUserInterfaceStyle` and the
 *         `DynamicColorIOS` tokens in `theme/index.ts` re-resolve on the spot.
 *   web   LIVE. `document.documentElement.dataset.theme`, which `theme/css.js` keys its dark block
 *         on; the `var(--coffee-*)` values repaint themselves.
 *   Android  RELOAD. Android resolves a view's colour once, when its style is first set, and never
 *         re-evaluates it — so nothing can repaint an already-mounted screen there. The palette is
 *         therefore plain hex FROZEN at bundle load (`loadTimeScheme`) and a change is applied by
 *         restarting the JS bundle (dev) or on next launch (release — this app ships no
 *         expo-updates, so there is no `reloadAsync` to call).
 *
 * The preference is read SYNCHRONOUSLY: `theme/index.ts` builds the `colors` object and the root
 * layout renders before any async storage could resolve, so an async read would flash the wrong
 * scheme. `SecureStore.getItem` is sync on native; `localStorage` is sync on web. Both are wrapped —
 * storage is never allowed to throw at import time.
 */
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Appearance, DevSettings, Platform, useColorScheme } from 'react-native';

/** What the user picked. `system` follows the OS. */
export type AppearancePreference = 'system' | 'light' | 'dark';

/** A concrete scheme — what `system` resolves to once the OS has been consulted. */
export type ResolvedScheme = 'light' | 'dark';

export const APPEARANCE_PREFERENCES: readonly AppearancePreference[] = ['system', 'light', 'dark'];

/** SecureStore / localStorage key. Value is the literal preference string, e.g. `"dark"`. */
export const APPEARANCE_STORAGE_KEY = 'coffee.appearance';

/**
 * Whether the running UI can change scheme IN PLACE, without restarting the JS bundle.
 * True on iOS and web; false on Android, forever — see the file header.
 */
export const liveSchemeSwitching: boolean = Platform.OS !== 'android';

function isPreference(value: string | null | undefined): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readStored(): AppearancePreference {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof localStorage === 'undefined'
          ? null
          : localStorage.getItem(APPEARANCE_STORAGE_KEY)
        : SecureStore.getItem(APPEARANCE_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system'; // storage unavailable (private mode, keychain locked) — never throw at import
  }
}

function writeStored(preference: AppearancePreference): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
    } else {
      SecureStore.setItem(APPEARANCE_STORAGE_KEY, preference);
    }
  } catch {
    // best-effort persistence — the in-memory choice still applies for this session
  }
}

let current: AppearancePreference = readStored();
const listeners = new Set<() => void>();

/** The current preference. Safe to call at module load — this is how `theme/index.ts` uses it. */
export function getAppearancePreference(): AppearancePreference {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders on every change to the preference (not to the OS scheme — that's `useColorScheme`). */
export function useAppearancePreference(): AppearancePreference {
  return useSyncExternalStore(subscribe, getAppearancePreference, getAppearancePreference);
}

/** The OS-reported scheme right now, normalised (`null` — "no preference" — counts as light). */
function osScheme(): ResolvedScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

/** The scheme in force when this module was imported — i.e. what the frozen Android palette uses. */
export const loadTimeScheme: ResolvedScheme = current === 'system' ? osScheme() : current;

function applyToPlatform(preference: AppearancePreference): void {
  if (Platform.OS === 'web') {
    // `theme/css.js` emits the dark block under BOTH `prefers-color-scheme: dark` (guarded by
    // `:root:not([data-theme="light"])`) and `:root[data-theme="dark"]`, so removing the attribute
    // is exactly "follow the system".
    const root = typeof document === 'undefined' ? null : document.documentElement;
    if (!root) return;
    if (preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = preference;
    return;
  }
  // iOS. `'unspecified'` is RN's "no override — follow the OS". Never reached on Android:
  // `applyStoredAppearance` returns before this.
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/**
 * Push the persisted preference at the platform. Called once, at import — which happens before the
 * first render because `theme/index.ts` imports this module, so a cold start paints the chosen
 * scheme straight away with no light flash.
 */
export function applyStoredAppearance(): void {
  // Android: the styles already hold the frozen hex for `loadTimeScheme`, derived from this very
  // preference — there is nothing to push.
  if (!liveSchemeSwitching) return;
  applyToPlatform(current);
}

applyStoredAppearance();

/** What happened when a new preference was applied — the UI only needs to react to the last one. */
export type ApplyOutcome =
  /** Live: the running UI already shows the new scheme. */
  | 'applied'
  /** The JS bundle is restarting into the new scheme; this call may never return. */
  | 'reloading'
  /** Persisted, but nothing could restart the bundle — the user must relaunch the app. */
  | 'restart-required';

/**
 * Persist the choice and apply it. Returns how far it got so the UI can show a "restart to apply"
 * note in the one case that needs it (Android release builds, which have no reload mechanism here).
 */
export async function setAppearancePreference(
  preference: AppearancePreference,
): Promise<ApplyOutcome> {
  current = preference;
  writeStored(preference);
  listeners.forEach((listener) => listener());

  if (liveSchemeSwitching) {
    applyToPlatform(preference);
    return 'applied';
  }

  // Android: `colors` is plain hex frozen at module load, so the only way to repaint everything is
  // to restart the JS bundle and let the theme re-read what we just wrote.
  try {
    if (typeof DevSettings?.reload === 'function') {
      DevSettings.reload();
      return 'reloading';
    }
  } catch {
    // fall through — nothing could restart us
  }
  return 'restart-required';
}

/**
 * The scheme the UI should draw in — preference first, OS second.
 *
 * `useColorScheme()` alone is not enough anywhere: on web react-native-web only tracks the
 * `prefers-color-scheme` media query and knows nothing about our `data-theme`, and on Android the
 * OS scheme can drift away from the frozen palette until the next launch.
 */
export function useResolvedScheme(): ResolvedScheme {
  const preference = useAppearancePreference();
  const system = useColorScheme();
  if (!liveSchemeSwitching) return loadTimeScheme;
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
