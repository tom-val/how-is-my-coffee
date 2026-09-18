/* eslint-disable import/no-named-as-default-member -- i18next's default export is the instance we call methods on */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import en from './en.json';
import lt from './lt.json';

/**
 * English and Lithuanian. English is the default and the fallback: the app is written in English
 * first, and an untranslated key must read as English rather than as a raw key.
 *
 * The stored choice is read SYNCHRONOUSLY at import, for the same reason the appearance preference
 * is (see `theme/appearance.ts`): an async read would render the first screen in the wrong language
 * and then snap.
 */
export const SUPPORTED = ['en', 'lt'] as const;
export type Lang = (typeof SUPPORTED)[number];

const STORAGE_KEY = 'coffee.language';

function isSupported(code: string | null | undefined): code is Lang {
  return !!code && (SUPPORTED as readonly string[]).includes(code);
}

function readStored(): Lang | null {
  try {
    const raw =
      Platform.OS === 'web'
        ? typeof localStorage === 'undefined'
          ? null
          : localStorage.getItem(STORAGE_KEY)
        : SecureStore.getItem(STORAGE_KEY);
    return isSupported(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(lang: Lang): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, lang);
    } else {
      SecureStore.setItem(STORAGE_KEY, lang);
    }
  } catch {
    // best-effort persistence
  }
}

function deviceLanguage(): Lang {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return isSupported(code) ? code : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    lt: { translation: lt },
  },
  lng: readStored() ?? deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/** Switch language and persist the choice on this device. */
export async function setLanguage(lang: Lang): Promise<void> {
  await i18n.changeLanguage(lang);
  writeStored(lang);
}

export default i18n;
