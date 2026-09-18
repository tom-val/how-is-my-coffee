import { devHost } from './devHost';

/**
 * Typed app configuration.
 *
 * In a production build `apiUrl` comes from `EXPO_PUBLIC_API_URL`, injected at build time (the
 * deploy workflow feeds it the CloudFront domain, which forwards `/v1/*` to API Gateway).
 *
 * In development on native the app is served by Metro on the machine's current LAN IP. We reuse
 * that host for the API (same machine, port 5090) so a phone on the same Wi-Fi just works — see
 * `devHost` (platform-split: native discovers the host, web returns null).
 */
const host = __DEV__ ? devHost() : null;
const trim = (u: string) => u.replace(/\/+$/, '');

/** Port the local `dotnet run` API listens on (see docs/api-contract.md). */
const DEV_API_PORT = 5090;

// The localhost fallback is dev-only: a production build with a missing env var must NOT silently
// point at localhost — it surfaces the "not configured" screen instead (see `missingConfig`).
const devOnly = (fallback: string) => (__DEV__ ? fallback : '');

export const config = {
  apiUrl: trim(
    host
      ? `http://${host}:${DEV_API_PORT}`
      : (process.env.EXPO_PUBLIC_API_URL ?? devOnly(`http://localhost:${DEV_API_PORT}`)),
  ),
} as const;

/** Env vars the app needs to function that this build does not have. Empty in development. */
export const missingConfig: string[] = [!config.apiUrl && 'EXPO_PUBLIC_API_URL'].filter(
  (v): v is string => typeof v === 'string',
);
