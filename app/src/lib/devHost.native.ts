import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

/**
 * Native (iOS/Android) dev-machine host resolution. In development the app is served by Metro on
 * the dev machine's LAN IP; we reuse that host for the API (same machine, port 5090) so switching
 * Wi-Fi or changing IP needs no .env edit. Metro picks this file over `devHost.ts` on native; the
 * web bundle never imports it (these native deep imports would crash react-native-web).
 */

// `localhost`/loopback are useless on a physical device — they resolve to the phone itself, so the
// API (on the dev machine) is unreachable and every request hangs until it times out.
function usableHost(h: string | null | undefined): string | null {
  if (typeof h !== 'string' || h.length === 0) return null;
  const host = h.split('://').pop()!.split('/')[0].split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
  return host;
}

export function devHost(): string | null {
  // Expo sets `hostUri` to the Metro server the running bundle came from ("192.168.1.5:8081"),
  // in Expo Go and in dev clients alike, under the new architecture too. It is the same value the
  // deep import `react-native/Libraries/Core/Devtools/getDevServer` used to give us, without the
  // deprecated deep import (a warning on every launch since RN 0.86).
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost ??
    null;
  const fromHostUri = usableHost(hostUri);
  if (fromHostUri) return fromHostUri;

  // Fallback: the URL the running JS bundle was downloaded from (legacy bridge mode only).
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  return usableHost(scriptURL);
}
