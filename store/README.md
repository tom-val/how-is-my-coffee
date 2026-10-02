# Kavutė — store release kit

Everything needed to submit Kavutė to the App Store and Google Play, plus the review-compliance
audit. Derived from the code as of 2026-10-02; if the app changes what it collects or does, update
this file, the privacy policy (`app/src/app/privacy.tsx`) and the privacy manifest in `app/app.json`
together.

| What | Where |
|---|---|
| Listing texts (both stores, en-GB + lt) | `listing.py` → generated copy-paste sheet `LISTING.md` (run `python3 store/listing.py`; it checks every limit) |
| Screenshots, App Store 6.9" (1320×2868) | `screenshots/app-store-6.9/{en,lt}/` — 5 each |
| Screenshots, Google Play phone (1200×2400) | `screenshots/google-play-phone/{en,lt}/` — 4 each |
| Google Play icon 512×512 + feature graphic 1024×500 | `graphics/` (regenerate: `python3 store/make_graphics.py`) |
| Demo data used for the screenshots | `seed_screenshot_data.py` (local API only; invented people and cafés) |

## Public URLs

| | URL |
|---|---|
| Privacy policy | https://coffee.valiunas.dev/privacy |
| Terms | https://coffee.valiunas.dev/terms |
| Support | https://coffee.valiunas.dev/support |
| Account deletion (Google Play) | https://coffee.valiunas.dev/delete-account |
| Marketing (optional) | https://coffee.valiunas.dev |

Contact on all pages: `tomas@valiunas.dev`.

## Before you submit

1. **Deploy** the current `main` (reports/blocks/filter, deletion fix, Terms update must be live —
   the reviewer uses production).
2. **Moderator push:** reports notify the prod user `tomas` (`moderation_notify_usernames`). Sign in
   as `tomas` on your phone with notifications allowed, or change the variable. Otherwise check
   **Actions → Admin → list-reports** at least daily — the Terms promise a 24-hour review.
3. **Reviewer account** in production: register `app_review` in the app, rate two coffees, follow
   `tomas`. Put username + password into both consoles (below). Don't delete it during review.
4. **Builds:** `eas build -p ios --profile production` (needs the iOS credentials + APNs key set up in
   EAS, done) and `-p android`. Both pick up the new native config (iPhone-only, permissions,
   privacy manifest) on their own.
5. Upload with `eas submit -p ios --profile production --latest` (App Store Connect app id is in
   `app/eas.json`) and via the Play Console (internal testing → production).

## App Store Connect

- **Name / Subtitle / Promotional text / Description / Keywords / What's New:** `LISTING.md`
  (English (U.K.) primary, add Lithuanian as a localization).
- **Category:** Food & Drink (primary), Lifestyle (secondary). Avoid Social Networking: it adds
  scrutiny and the app's core is the coffee journal.
- **Copyright:** `2026 Tomas Valiūnas`
- **Support URL / Privacy Policy URL / Marketing URL:** table above.
- **Screenshots:** iPhone 6.9" only (`screenshots/app-store-6.9/`). The app is iPhone-only
  (`supportsTablet: false`), so no iPad screenshots are needed.
- **Age rating questionnaire:** violence, sexual content, profanity, drugs, gambling, horror,
  medical: **None**. *User-generated content*: **Yes**. *Messaging/chat*: **No** (public comments
  only). *Unrestricted web access*: **No**. Expect **13+** (Apple's 2025 tiers).
- **App Privacy (nutrition label):** Data Used to Track You — **none**. Data Linked to You, all for
  *App Functionality*: Contact Info → **Name** (display name); Identifiers → **User ID**; User
  Content → **Photos**, **Other User Content** (ratings, comments, reports); Location → **Precise
  Location**. Not collected: email, phone, contacts, health, financial, browsing, usage data,
  diagnostics, device ID. This matches `ios.privacyManifests` in `app.json`.
- **App Review Information → Notes** (paste):

  > Kavutė is a coffee journal shared with friends. Sign in with the demo account below; it already
  > follows other users so the feed has content.
  > • Account deletion: Profile → gear icon → Delete account (asks for the password).
  > • Report / block (Guideline 1.2): the "⋯" button on any rating, comment or profile that isn't
  > yours → Report or Block. Blocked users: Settings → Privacy & safety. Reports reach the developer
  > immediately and are reviewed within 24 hours; abusive content and accounts are removed. A word
  > filter rejects slurs and abuse in names, ratings and comments.
  > • Location (When In Use only) centres the map and fills in the café you are at; the app works
  > fully without it. No tracking, no ads, no in-app purchases.

- **Export compliance:** answered by `ITSAppUsesNonExemptEncryption: false`.

## Google Play Console

- **App name / Short / Full description / Release notes:** `LISTING.md` (en-GB default + lt-LT).
- **Graphics:** `graphics/play-icon-512.png`, `graphics/play-feature-1024x500.png`,
  phone screenshots `screenshots/google-play-phone/`.
- **Category:** Food & Drink. **Contact email:** tomas@valiunas.dev. **Website:** coffee.valiunas.dev.
- **App content tasks:**

| Task | Answer |
|---|---|
| Privacy policy | https://coffee.valiunas.dev/privacy |
| App access / Sign-in details | Restricted → the reviewer account |
| Ads | No |
| Content rating (IARC) | Social/communication category. Users interact and share content: **Yes**; shares location with others: **Yes** (a rating made with "Use my location" stores those coordinates as the café's location). Everything else No. Expect Teen / PEGI 12. |
| Target audience | 13–15, 16–17, 18+. Not for children; do not join the Families programme. |
| Data safety | Encrypted in transit: Yes. Deletion: in-app + https://coffee.valiunas.dev/delete-account. Shared with third parties: No (AWS, Google Places, OpenAI, Expo are processors). Collected: Name, User IDs (required; account, app functionality); Precise location (optional; app functionality); Photos (optional); Other user-generated content (required); Device or other IDs — push token (optional; app functionality). Nothing for ads/analytics. |
| Government apps / Financial features | No / None |
| Health | No health features (caffeine figures are informational; the Terms say so). |

## Compliance audit (2026-10-02)

Status after this release's fixes. ✅ = met and verified in code or on a device; ⚠️ = needs an
action from you (listed above).

| Requirement | Store | Status | How |
|---|---|---|---|
| Privacy policy in app + store | Apple 5.1.1(i), Play | ✅ | `/privacy`, linked before sign-in and in Settings |
| In-app account deletion | Apple 5.1.1(v), Play | ✅ | Settings → Delete account; `DELETE /v1/me` (prod `Scan` permission fixed 2026-10-02) |
| Account deletion web link | Play | ✅ | `/delete-account`, works signed out |
| Report content, block users | Apple 1.2, Play UGC | ✅ | ⋯ menus + Blocked users; `POST /v1/reports`, `/v1/blocks` |
| Filter objectionable content | Apple 1.2 | ✅ | `ContentFilter` (en + lt) on names, ratings, comments |
| Act on reports within 24 h + contact info | Apple 1.2 | ⚠️ | Moderator push + Admin workflow; you must actually watch it (step 2) |
| Zero-tolerance terms accepted at sign-up | Apple 1.2 | ✅ | Terms §5; register states agreement with links |
| Demo account for review | Apple 2.1, Play | ⚠️ | Create `app_review` (step 3) |
| Only needed permissions, specific purpose strings | Apple 5.1.1, Play | ✅ | iOS: camera, photos, location when-in-use only; Android: location + internet; storage/media/biometric/background blocked |
| Privacy manifest (required-reason APIs) | Apple (2024+) | ✅ | `ios.privacyManifests` |
| No tracking / ATT not needed | Apple 5.1.2 | ✅ | No ads, analytics or tracking SDKs |
| Sign in with Apple | Apple 4.8 | ✅ n/a | Only first-party username login, no third-party sign-in |
| Push not required to use the app, no marketing pushes | Apple 4.5.4 | ✅ | Five activity types, all switchable off |
| Over-the-air updates don't change the app's purpose | Apple 2.5.2 | ✅ | EAS Update ships JS fixes only |
| iPad support | Apple 2.4.1 | ✅ | iPhone-only build |
| Encryption export compliance | Apple | ✅ | Standard HTTPS only |
| Photo/video permission policy | Play | ✅ | Android Photo Picker, no `READ_MEDIA_*` |
| Target API level | Play | ✅ | Expo SDK 57 targets the current Android API |
| Metadata accurate, no promotional words in titles | Apple 2.3, Play | ✅ | `listing.py` checks |
| Health claims | Apple 1.4.1, Play | ✅ | "Estimates, not medical advice" in listing + Terms |

### Residual risks

- **Name availability:** "Kavutė: Coffee Journal" must be unique on the App Store; App Store Connect
  tells you when you save it. Fallback: "Kavutė – Coffee Diary".
- **Map on Android:** until the Maps SDK key from your EAS keystore is set
  (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`), the Android map shows blank tiles. Not a policy issue,
  but a reviewer may note a broken-looking screen — set it before the production build.
- **Moderation load:** reports from day one land on one person. If volume grows, add more
  usernames to `moderation_notify_usernames`.
