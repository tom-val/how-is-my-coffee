import { router, type Href } from 'expo-router';

/**
 * Back, or home when there is nothing to go back to. A screen reached by deep link, a restored
 * dev route, or a shared web URL has no history, and expo-router's `back()` then throws
 * "GO_BACK was not handled by any navigator". Falling back to the feed keeps the header's back
 * arrow meaningful in every case.
 */
export function goBack(fallback: Href = '/feed'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * The `?next=` a sign-in should land on, or null. Only an in-app path is honoured (`/settings`,
 * not `//evil.example` or `https://…`), so a crafted link cannot bounce a fresh sign-in off-site.
 */
export function safeNext(next: string | string[] | undefined): Href | null {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return null;
  }
  if (value === '/login' || value === '/register') return null;
  return value as Href;
}
