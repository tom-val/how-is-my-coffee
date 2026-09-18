import Constants from 'expo-constants';
import { NativeModules } from 'react-native';
import getDevServer from 'react-native/Libraries/Core/Devtools/getDevServer';

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
  // Most reliable source on a physical device: the live Metro dev-server URL. Works under the new
  // architecture / bridgeless mode, where NativeModules.SourceCode is undefined.
  try {
    const fromDevServer = usableHost(getDevServer?.()?.url);
    if (fromDevServer) return fromDevServer;
  } catch {
    // getDevServer can throw if the dev-server module isn't available; fall through.
  }

  // Fallback: the URL the running JS bundle was downloaded from (legacy bridge mode only).
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  const fromScript = usableHost(scriptURL);
  if (fromScript) return fromScript;

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost ??
    null;
  return usableHost(hostUri);
}
