# Kavutė — the app

The Expo client for Kavutė ("How is my coffee?"): rate the coffee you drink, keep an eye on the
caffeine, follow friends, and tag the people who were drinking it with you. One codebase for iOS,
Android and the web.

It talks to the .NET API described in [`../docs/api-contract.md`](../docs/api-contract.md) — every
call goes through `src/lib/api.ts`.

## Run it

```bash
npm install

npm run web        # browser, http://localhost:8081
npm run ios        # iOS simulator (needs Xcode)
npm run android    # Android emulator (needs Android Studio)
npm start          # Metro; scan the QR from Expo Go or a dev build
```

Checks:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run export:web  # static web bundle into ./dist
```

The API has to be running for anything past the login screen: `dotnet run` in `../backend` puts it
on <http://localhost:5090>. Without it the app still loads and shows a plain "no connection"
message rather than a blank screen.

## Environment

Copy `.env.example` to `.env`:

| Variable | Example | What it is |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:5090` | API base URL, no trailing slash, no `/v1`. In production this is the CloudFront domain, which forwards `/v1/*` to API Gateway. |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | *(empty)* | Google Maps key for the **Android** map. Optional — see Maps below. |

`EXPO_PUBLIC_*` values are inlined into the bundle at build time, so this file holds nothing secret.

**On a phone in development you can ignore it.** `src/lib/devHost.native.ts` reads the Metro
dev-server host the app connected to and points the API at `http://<that host>:5090`, so a device on
the same Wi-Fi reaches your machine without an edit here — even after the IP changes.

## Layout

```
src/
  app/          expo-router routes (this folder IS the URL structure)
  components/   shared UI: primitives, cards, pickers, hosts
  features/     screen-sized compositions that are not themselves routes
  lib/          api client, auth, config, storage, formatting, side effects
  theme/        design tokens: palette, typography, spacing, radius, appearance
  i18n/         en + lt resources
  types/        the API contract's DTOs, mirrored
```

Routes:

| URL | Screen |
|---|---|
| `/login`, `/register` | public |
| `/feed`, `/places`, `/friends`, `/profile` | the four tabs |
| `/rating/new` | the composer, as a modal |
| `/rating/<id>` | one rating: photo, companions, likes, comments |
| `/rating/<id>/edit` | the same composer, seeded |
| `/place/<placeId>` | a cafe and its ratings |
| `/u/<username>` | a public profile — **works signed out** |

## Notes worth knowing

- **Theme.** `src/theme/palette.js` is the single source of truth for both schemes. It is plain
  CommonJS because the web build requires it from Node. `src/theme/index.ts` turns each token into
  `DynamicColorIOS` on iOS, a frozen hex on Android and a `var(--coffee-*)` on web — so
  `StyleSheet.create` at module scope keeps working and dark mode still flips. Changing the
  appearance is live on iOS and web; on Android it restarts the JS bundle (Android resolves a view's
  colour once and never re-evaluates it).
- **Auth.** Username + password against our own API, which returns a 30-day JWT. The token lives in
  the Keychain/Keystore on native and `localStorage` on web (`src/lib/tokenStorage*.ts`), is read
  synchronously at startup so a signed-in user never sees the login screen flash, and a 401 from the
  API clears it and routes back to `/login`.
- **Likes.** `src/lib/useToggleLike.ts` applies the heart optimistically across every cache a rating
  can appear in — feed, profile, place, "coffees with me" and the detail screen — because the same
  rating really is in all of them.
- **Caffeine.** The drink table is shipped in `src/lib/caffeine.ts` (a port of the old web client's,
  Lithuanian aliases included) so a known drink fills in with no round trip. Only an unknown drink
  asks `POST /v1/drinks/resolve-caffeine`, which has the AI fallback.
- **Maps.** The Places tab is map-first: **Mine** pins the cafes you have rated, **Discover** asks
  `GET /v1/places?bbox=…` for everything anyone has rated inside the current viewport (debounced
  ~500 ms after the map stops moving, with the bbox rounded to three decimals so a small pan is a
  cache hit). One component API, two engines, in `src/components/place-map/`:
  `PlaceMap.tsx` uses **react-native-maps** — Apple Maps on iOS, Google Maps on Android — and
  `PlaceMap.web.tsx` uses **Leaflet + react-leaflet** over OpenStreetMap tiles. Metro picks the file
  per platform, so neither engine's code reaches the other bundle. Pins are drawn by us on both
  sides (a `divIcon` on the web) so they share the theme's colours and dark mode; Leaflet's
  stylesheet is injected as a `<link>` at runtime, the same trick `theme/css.js` uses for the
  custom properties, because `web.output: "single"` means `+html.tsx` is never rendered.
  Place search still goes through Nominatim, and "Open in Maps" still hands the coordinates to
  Apple Maps / the Android `geo:` intent / OpenStreetMap for directions.
- **The Android Maps key.** iOS and web need no key. Android's map is Google's and does:
  `app.config.ts` extends `app.json` and sets `android.config.googleMaps.apiKey` from
  `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`. It is **empty by default**, which is a supported state —
  the Android build runs and the pins draw, but over a blank tile background instead of real map
  tiles. Nothing crashes. Add a "Maps SDK for Android" key from the Google Cloud console to your
  `.env` (and to the build environment) when you want tiles.
- **No EAS yet.** `app.json` deliberately has no `projectId`, `owner` or `updates.url`. Run
  `eas init` when the app is first linked to an EAS project.

## Over-the-air updates (EAS Update)

JS-only changes reach installed native builds without a store release. Publish manually from GitHub
(**Actions → EAS Update (manual OTA)** → pick `preview` or `production`), or locally:

```bash
eas update --branch production --environment production --message "…"
```

On every cold start the app checks EAS for a newer bundle, downloads it and reloads into it before
showing the first screen (`src/lib/startupUpdate.ts`; bounded by short timeouts, fails open to the
cached bundle when offline). Only builds whose `runtimeVersion` matches receive an update — the
policy is `appVersion`, so bump `expo.version` in `app.json` whenever native code or dependencies
change and make a new build; pure JS/asset changes ship as updates against the same version.
`eas update` bundles `EXPO_PUBLIC_*` from the EAS `production` environment, which `deploy.yml`
keeps in sync with the deployed API URL. Expo Go and web ignore updates entirely.
