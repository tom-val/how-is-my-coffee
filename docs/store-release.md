# Store release checklist — Kavutė (Google Play + App Store)

Answers for the store consoles, derived from what the code actually does. If the app changes what
it collects, update this file and the privacy policy (`app/src/app/privacy.tsx`) together.

Public URLs (served by the web build through CloudFront; they work signed out):

| Page | URL |
|---|---|
| Privacy policy | `https://d1q03bxibwmu9s.cloudfront.net/privacy` |
| Terms | `https://d1q03bxibwmu9s.cloudfront.net/terms` |
| Support | `https://d1q03bxibwmu9s.cloudfront.net/support` |
| Account deletion | `https://d1q03bxibwmu9s.cloudfront.net/delete-account` |

Contact: `tomas@valiunas.dev`. Replace the domain above if a custom domain is added.

## Reviewer account (both stores)

Reviewers must be able to sign in. Create a dedicated account in the app (Register), e.g. username
`app_review`, give it a couple of ratings, follow `tomas`, and put the username + password in:
- Play Console → App content → **Sign-in details**
- App Store Connect → the version → **App Review Information → Sign-in required**

If the password is ever lost: `make set-password USER=app_review PASS=…` (see `backend/README.md`).
Do not delete this account from inside the app while a review is pending.

## Google Play — "Let us know about the content of your app"

| Task | Answer |
|---|---|
| Privacy policy | The privacy URL above. |
| Sign-in details | "All or some functionality is restricted" → the reviewer account above. |
| Ads | **No**, the app does not contain ads. |
| Content rating | Category **Social or communication**. Users interact / share content: **Yes** (ratings, photos, comments, follows). Shares user's location with other users: **Yes** — "Use my location" stores the device's coordinates as the café location on a rating, which other users can see. No violence, sexual content, gambling, drugs (caffeine is not a controlled substance; answer No), no purchases. Expect a Teen / PEGI 12-type rating because of unmoderated user content. |
| Target audience | Ages **13–15, 16–17, 18+** (the Terms say 13+). Not designed for children; do not opt into the Families programme. If Play asks, the app is not appealing to children. |
| Data safety | See the table below. |
| Government apps | **No**. |
| Financial features | **None**. |
| Health | Caffeine tracking is the only health-adjacent feature. Declare **no health features** unless the form offers a "nutrition / diet tracking" option, in which case tick that one — either is defensible; it is not medical and the Terms say so. |

### Data safety (Play)

- Data encrypted in transit: **Yes** (HTTPS everywhere).
- Users can request data deletion: **Yes** — in-app (Settings → Delete account) and the account-deletion URL above.
- Data shared with third parties: **No** (AWS, Google Places, OpenAI and Expo act as processors on our behalf, which Play does not count as sharing).

| Data type | Collected | Optional? | Purpose | Notes |
|---|---|---|---|---|
| Personal info → Name | Yes | Required | Account management, App functionality | Display name |
| Personal info → User IDs | Yes | Required | Account management, App functionality | Username |
| Location → Precise location | Yes | Optional | App functionality | Only when the user taps "Use my location" (stored as the café's coordinates) or searches with location permission granted (sent to biasing café search, not stored) |
| Photos and videos → Photos | Yes | Optional | App functionality | Photo attached to a rating |
| App activity → Other user-generated content | Yes | Required | App functionality | Ratings, notes, comments, likes, companions |
| Device or other IDs | Yes | Optional | App functionality | Expo push token (only if notifications are allowed) |

Not collected: email, phone, contacts, messages, financial info, health info, web history, crash
logs, diagnostics, advertising ID. No analytics or tracking SDKs are in the app.

## App Store Connect

- **Privacy Policy URL**: the privacy URL above. **Support URL**: the support URL above.
- **App Privacy (nutrition labels)** — Data Used to Track You: **none**. Data Linked to You:
  - Contact Info: none
  - Identifiers → User ID (app functionality)
  - User Content → Photos or Videos, Other User Content (app functionality)
  - Location → Precise Location (app functionality) — same reasoning as on Play
  - Identifiers → Device ID: **no** (the Expo push token is not a device identifier in Apple's sense, but declare it under "Other Data" if unsure)
- **Account deletion** (Guideline 5.1.1(v)): in-app, Settings → Delete account. Mention it in the review notes.
- **Export compliance**: already answered in `app.json` (`ITSAppUsesNonExemptEncryption: false`).
- **Sign in with Apple**: not required — the app has only its own username/password login, no third-party social login.
- **Age rating**: 12+ is likely (unrestricted user-generated content).

### Known review risk: Guideline 1.2 (user-generated content)

Apps where users post content others see must offer: a way to **report** objectionable content, a
way to **block** abusive users, a method for filtering objectionable material, and published
contact information. Kavutė currently has the contact information only. Apple often rejects
social apps on this point, so building report + block before submitting to the App Store is
recommended. Google Play's UGC policy asks for the same (in-app reporting and blocking).
