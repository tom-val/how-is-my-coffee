/**
 * Dev-machine host resolution — the base (web) implementation.
 *
 * On web there is no LAN dev host to discover (and the native `getDevServer` / `NativeModules`
 * paths pull React Native's native bridge into the web bundle, which crashes it). So web always
 * returns null and `config.ts` falls back to `EXPO_PUBLIC_API_URL`. The real logic lives in
 * `devHost.native.ts`, which Metro picks for iOS/Android.
 */
export function devHost(): string | null {
  return null;
}
