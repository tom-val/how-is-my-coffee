import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `app.json` is still the app's configuration; this file exists for the one value that cannot live
 * in static JSON — the Android Google Maps key, which comes from the environment.
 *
 * iOS needs nothing: react-native-maps uses Apple Maps there, which has no key and no account.
 * Android's map is Google's, and Google wants a key. Leave
 * `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` empty and the Android build still works — the map draws an
 * empty tile background with our pins on it rather than crashing. Set it (see `.env.example` and
 * the README) to get real tiles.
 *
 * The web build never reaches any of this: Leaflet over OpenStreetMap needs no key either.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '';

  return {
    ...config,
    // `ConfigContext['config']` is the JSON with `name`/`slug` optional; they are both set in
    // `app.json`, and the fallbacks are here only to satisfy `ExpoConfig`.
    name: config.name ?? 'Kavutė',
    slug: config.slug ?? 'kavute',
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: googleMapsApiKey },
      },
    },
  };
};
