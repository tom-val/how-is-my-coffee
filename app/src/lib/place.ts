import { Linking, Platform } from 'react-native';

/**
 * Place identity and the "open in maps" hand-off.
 *
 * Place IDs are client-generated from the name (`place_<snake_case_name>`) — unchanged from the old
 * web client, because production data is keyed on them. Two people typing "Caffeine" at different
 * branches land on the same place; that is the existing (deliberate) behaviour.
 */
export function placeIdFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `place_${slug}`;
}

/**
 * Open a place in the platform's maps app. There is no in-app map (Leaflet does not run on native
 * and a native map SDK is more than this app needs), so this is the whole map story:
 *   iOS      Apple Maps via `maps://`
 *   Android  the `geo:` intent, which lets the user pick their map app
 *   web      OpenStreetMap, which needs no key and no account
 * `label` only decorates the pin; the coordinates are what actually locate it.
 */
export function openInMaps(lat: number, lng: number, label?: string): void {
  const name = encodeURIComponent(label ?? '');
  const url =
    Platform.OS === 'ios'
      ? `maps://?ll=${lat},${lng}&q=${name || 'Pin'}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}(${name})`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  void Linking.openURL(url).catch(() => {
    // Fall back to the browser when no maps app answers the scheme (simulators, stripped devices).
    void Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
    ).catch(() => {});
  });
}
