import { router } from 'expo-router';

/**
 * Back, or home when there is nothing to go back to. A screen reached by deep link, a restored
 * dev route, or a shared web URL has no history, and expo-router's `back()` then throws
 * "GO_BACK was not handled by any navigator". Falling back to the feed keeps the header's back
 * arrow meaningful in every case.
 */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/feed');
}
