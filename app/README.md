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

Copy `.env.example` to `.env`. There is exactly one variable:

| Variable | Example | What it is |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:5090` | API base URL, no trailing slash, no `/v1`. In production this is the CloudFront domain, which forwards `/v1/*` to API Gateway. |

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
- **Maps.** There is no in-app map. Places are found via Nominatim or the device's location, and
  "Open in Maps" hands the coordinates to Apple Maps / the Android `geo:` intent / OpenStreetMap.
- **No EAS yet.** `app.json` deliberately has no `projectId`, `owner` or `updates.url`. Run
  `eas init` when the app is first linked to an EAS project.
