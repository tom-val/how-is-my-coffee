/**
 * Where the API JWT lives on web: `localStorage`. The native twin (`tokenStorage.ts`) uses
 * expo-secure-store; Metro picks this file for the web bundle.
 *
 * Every call is wrapped — `localStorage` throws in a private window with site data blocked, and a
 * storage failure must degrade to "signed out", never crash the app.
 */
const KEY = 'coffee.authToken';

export function getToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, token);
  } catch {
    // best-effort persistence
  }
}

export function clearToken(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
