import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

/**
 * The browser tab's title for the focused screen: "Kavutė · Places".
 *
 * Ours to set, because expo-router does not turn a screen's `title` option into `document.title`
 * for this app's navigators. It hangs off FOCUS rather than mounting: a visited tab stays mounted,
 * so a mount effect would leave whichever tab was opened last owning the title.
 *
 * A no-op on native, where there is no document.
 */
export function useDocumentTitle(screen: string): void {
  const { t } = useTranslation();
  const name = t('app.name');

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return;
      document.title = `${name} · ${screen}`;
    }, [name, screen]),
  );
}
