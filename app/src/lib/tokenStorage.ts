import * as SecureStore from 'expo-secure-store';

/**
 * Where the API JWT lives on iOS/Android: the Keychain / Keystore, via expo-secure-store.
 * `tokenStorage.web.ts` is the web twin (localStorage) — Metro picks it for the web bundle.
 *
 * Reads are SYNCHRONOUS so the app can decide "signed in or not" before its first paint, with no
 * flash of the login screen for an already-signed-in user. Every call is wrapped: a locked keychain
 * or a private-mode browser must degrade to "signed out", never throw.
 */
const KEY = 'coffee.authToken';

export function getToken(): string | null {
  try {
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    SecureStore.setItem(KEY, token);
  } catch {
    // best-effort persistence — the in-memory token still works for this session
  }
}

export function clearToken(): void {
  try {
    // `deleteItemAsync` is the only removal API; nothing waits on it, and a failure just means the
    // stale token is overwritten on the next sign-in.
    void SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
