# Shaadi24 in Google Play and the App Store

Everything needed to put the apps in the stores: the steps in order, the words and answers to paste,
and the graphics. The code side is done (ROADMAP.md, Phase 13); what's left needs your accounts.
Store menus move around now and then; the names here are from October 2026.

In this folder:
- `README.md`: this guide
- `graphics/play-icon-512.png` (512 × 512) and `graphics/play-feature-graphic.jpg` (1024 × 500): Google
  Play's icon and feature graphic, made from the app's icon: a silver solitaire ring with a pale blue
  diamond, on white (`scripts/assets/ring.png`). `scripts/store-graphics.mjs` makes every image from
  it: these two, the iPhone and Android icons and launch screens, and the website's icons and link
  preview. Change the words or the picture there and run it to remake them all. The App Store takes
  its icon from the app.

The website pages the stores link to (the home page, https://shaadi-gpt.vercel.app, says what Shaadi24
is and links to the stores; members use the apps):

| Page | Address |
|---|---|
| Privacy Policy | https://shaadi-gpt.vercel.app/privacy |
| Terms of Service | https://shaadi-gpt.vercel.app/terms |
| Help & Support | https://shaadi-gpt.vercel.app/support |
| Delete your account | https://shaadi-gpt.vercel.app/delete-account |

With a domain of your own (step 1), use it in place of `shaadi-gpt.vercel.app` everywhere below.

---

## The launch checklist

### 1. Before you start
- [ ] **The email addresses.** The apps, the Terms, the Privacy Policy and the support page tell people
  to write to `support@shaadi24.com` and `privacy@shaadi24.com`. Make sure both reach you: they need the
  shaadi24.com domain, which in October 2026 was already registered by someone (it answered with a
  hosted website). If you can't get it, ask Claude to change them to addresses you have.
- [ ] **The website's address.** The stores show it to everyone. `shaadi-gpt.vercel.app` works; a domain
  of your own (Vercel → your project → Settings → Domains) looks more trustworthy. If you add one, also
  set it as Supabase's Site URL and in `ALLOWED_ORIGINS` (step 3).
- [ ] **The name.** Search both stores for "Shaadi24" to be sure it's free. Shaadi.com is a large
  matrimony brand in India, so have a lawyer check that "Shaadi24" doesn't conflict with its trademarks
  (with the legal review of the Terms and Privacy Policy). If a store objects, a different store name is
  the quickest way through; the app can keep its name inside.
- [ ] **Demo accounts for the reviewers**: both stores ask for one ("Notes for the reviewers" below).

### 2. Developer accounts
- [ ] **Account type: individual, as a sole trader** (chosen 7 October 2026). Apple lets sole traders
  enrol only as individuals, and its guideline 5.1.1(ix) says apps that "require sensitive user
  information should be submitted by a legal entity that provides the services, and not by an individual
  developer"; a matrimony app asks for religion, caste, health and sexuality. If App Review asks for a
  company, found a UG and convert the account to an organization:
  [docs/legal/README.md, "Running Shaadi24 from Germany"](../legal/README.md#running-shaadi24-from-germany).
  Google Play: a personal account.
- [ ] **Google Play Console** (play.google.com/console): US$25 once, with identity checks. A *personal*
  account must run a closed test with at least 12 testers for 14 days in a row before Google lets an
  app into production, and once it sells, Google Play shows its owner's full address; an
  *organization* account (it needs a D-U-N-S number) does neither. Start early.
- [ ] **Apple Developer Program** (developer.apple.com/programs): US$99 a year. As an individual your own
  name shows as the seller; as an organization (D-U-N-S number) the company's does.

### 3. Supabase (the live backend)
- [ ] Approve the last notifications migration: say "apply the notifications sign-out migration" and
  approve the prompt (ROADMAP.md, Phase 13, Notifications).
- [ ] Authentication → Emails → Templates: **Reset Password** and **Magic Link** from
  `supabase/templates/` (subjects in ROADMAP.md, Phase 13). Without them the emails have links but no codes.
- [ ] Authentication → Emails → SMTP Settings: your own email service (Resend, for example, from your
  domain). Supabase's built-in email sends a few emails an hour, and only to your team: members would
  get no codes.
- [ ] Authentication → URL Configuration → Site URL: the website's address. Redirect URLs: add the
  address with `/**` after it (`https://shaadi-gpt.vercel.app/**`), so an admin who signs in with Google
  comes back to the admin panel (without it they come back to the home page, which links to it).
- [ ] Authentication → Sign In / Providers: **Google** (Client IDs: the web client, then the iOS client
  from step 4) and **Apple** (Client IDs: `com.shaadi24.app`).
- [ ] Edge Functions → Secrets:

| Secret | For | Where it comes from |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | notifications on phones | step 4, Firebase |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | checking Google Play purchases | step 6.5 |
| `GOOGLE_RTDN_SECRET` | Google Play's purchase notifications | a long random string you make up (step 6.6) |
| `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` | ending Sign in with Apple when an account is deleted | step 4, Apple |
| `ALLOWED_ORIGINS` | which pages may call the server | `https://shaadi-gpt.vercel.app,https://localhost,capacitor://localhost` (the website, the Android app, the iPhone app; add your own domain). Without the apps' two, the apps can't search, buy or delete accounts: leave the secret out rather than miss them |
| `GEMINI_API_KEY` (optional) | AI search | Google AI Studio; read the note on search in "Data safety" |

- [ ] Optional: Authentication → Attack Protection → leaked-password protection (paid plans).

### 4. Google sign-in, Firebase and Apple keys
Each is spelled out in ROADMAP.md, Phase 13 ("Owner, Google", "Owner, Firebase", "Owner, Apple"):
- [ ] **Google Auth Platform**: Branding (Shaadi24, logo, support email) and Audience → Publish app; an
  **Android** client for each signing key's SHA-1: the Play App Signing key (step 6.2), your upload key
  (step 5) and, for test builds, the debug key; an **iOS** client, whose ID goes in
  `.env.production.local` as `VITE_GOOGLE_IOS_CLIENT_ID` and into Supabase's Google provider (step 3).
- [ ] **Firebase**: one project with both apps; `google-services.json` into `android/app/`;
  `GoogleService-Info.plist` into Xcode's App folder, or, with no Mac, its text as the GitHub secret
  `FIREBASE_IOS_CONFIG` (the TestFlight build puts it in the app); the APNs key uploaded to Firebase; a
  service account key as `FIREBASE_SERVICE_ACCOUNT`.
- [ ] **Apple**: Sign in with Apple ticked for `com.shaadi24.app`; a key with Sign in with Apple (and
  Apple Push Notifications) for the three `APPLE_*` secrets; the address Shaadi24's emails come from
  registered for Apple's private relay (Services → Sign in with Apple for Email Communication).

### 5. Build the apps
Both builds need the live Supabase URL and anon key in `.env.production.local` (README.md).

**Android, once: the upload key.** Google Play signs the app people download with its own key (Play App
Signing); you sign what you upload with an upload key that stays with you. Make it, on your computer:

```bash
keytool -genkeypair -v -keystore ~/shaadi24-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore ~/shaadi24-upload.jks -alias upload    # its SHA-1, for step 4
```

and tell the build where it is in `android/keystore.properties` (git never takes it):

```properties
storeFile=/Users/you/shaadi24-upload.jks
storePassword=the store password
keyAlias=upload
keyPassword=the key password
```

Keep the `.jks` file and both passwords safe (a password manager, and a backup of the file). A lost
upload key can be replaced through Google Play support, but it takes days.

- [ ] `npm run build:android:release` builds `android/app/build/outputs/bundle/release/app-release.aab`,
  the file Play Console takes, signed with your upload key and numbered from package.json's version.

**iPhone** (on a Mac with Xcode):
- [ ] `npm run build:ios`, then `npx cap open ios`.
- [ ] App target → Signing & Capabilities: your Team. Push Notifications, Background Modes (Remote
  notifications) and Sign in with Apple are already there; the privacy manifest
  (`PrivacyInfo.xcprivacy`) is in the app.
- [ ] Choose "Any iOS Device (arm64)" at the top, then Product → Archive → Distribute App → App Store
  Connect → Upload. The build appears in App Store Connect → TestFlight after processing (10–30 minutes).
- Or, without a Mac: add the secrets listed at the top of `.github/workflows/testflight.yml`, then
  GitHub → Actions → iPhone TestFlight → Run workflow. It also uploads a new build whenever the app
  changes on `main`, waits for Apple to process it and adds it to your internal tester groups, with
  the change as "What to Test". Its build numbers are the date and time, higher than package.json's,
  so keep uploading from there once you've started.

The iPhone app is for iPhones only: iPads run it as an iPhone app, and the App Store asks for no iPad
screenshots. (For a real iPad app later: Xcode → App target → General → Supported Destinations → iPad,
then test it and add iPad screenshots.)

### 6. Google Play Console
1. **Create app**: name "Shaadi24: Indian Matrimony" (or yours), default language English (India) – en-IN,
   App, Free (it sells subscriptions inside; a free app can never become paid).
2. **Test and release → App integrity**: Play App Signing (the default). Copy the app signing key's
   SHA-1 for Google's Android client (step 4).
3. **Test and release → Testing → Internal testing**: create a release, upload `app-release.aab`, add
   yourself as a tester and install it from the link. Do this before step 4: Play lets you make
   subscriptions only once a build that can sell them has been uploaded.
4. **Monetize with Play → Products → Subscriptions**: `shaadi24_plus` with four base plans, all active,
   auto-renewing: `weekly` (₹499, every week), `monthly` (₹999, every month), `quarterly` (₹1,999, every
   3 months) and `halfyearly` (₹2,999, every 6 months). The app shows them side by side with what each
   saves on the week's price; a base plan not made yet simply doesn't show. Leave free-trial offers out
   for now (ROADMAP.md, Phase 13). (A `yearly` base plan is no longer used: leave it out.)
   In the subscription's settings, set the **default replacement mode** (what happens when a subscriber
   buys another of its base plans: Settings → Shaadi24+ → Change plan in the app) to **"Charge at the
   next billing date"**: the new plan applies straight away and its price is charged on the date the
   current one would have renewed, so nobody pays twice. ("Charge immediately" also works: the new price
   is charged at once and the rest of the current plan is credited.)
   **Monetize with Play → Products → One-time products** (Spotlight and Super Interest, bought one at a
   time; "Spotlight and Super Interest" below): `spotlight_24h` (₹149), `super_interest_1` (₹49) and
   `super_interest_5` (₹199), each active, with the name and description from the table below. The app
   consumes each purchase once our server has added it, so they can be bought again. A product not made
   yet shows as "not on sale yet" in the app.
5. **Users and permissions**: invite the Google Cloud service account whose key is
   `GOOGLE_PLAY_SERVICE_ACCOUNT`, with "View financial data" and "Manage orders and subscriptions".
6. **Monetization setup → Real-time developer notifications**: the Pub/Sub topic whose push subscription
   goes to the `store-notifications` address with `GOOGLE_RTDN_SECRET` (ROADMAP.md, Phase 13), then
   "Send test notification".
7. **Settings → License testing**: your Gmail and your testers', so test purchases aren't charged.
8. **Grow users → Store presence → Main store listing**: the texts, graphics and screenshots below.
9. **Policy and programs → App content**:
   - Privacy policy: `https://shaadi-gpt.vercel.app/privacy`
   - App access: "All or some functionality is restricted", with the demo account (below)
   - Ads: no ads
   - Content rating: the questionnaire (below)
   - Target audience: 18 and over, nothing younger
   - Data safety: the answers below
   - Account deletion: Settings → Delete Account in the app, and `https://shaadi-gpt.vercel.app/delete-account`
   - Advertising ID: the app doesn't use it. Government app: no. Financial features: none. Health: none.
     News: no
10. **Closed testing** (personal accounts): at least 12 testers opted in for 14 days in a row; friends and
    family with Google accounts who use the app now and then.
11. **Production**: countries (India; add where your members live: the UAE, the UK, the US, Canada,
    Australia, Singapore…), then send the release for review.

### 7. App Store Connect
1. **Business → Agreements**: the Paid Apps agreement, bank and tax details. Join the App Store Small
   Business Program (15% commission instead of 30%).
2. **Apps → + → New App**: iOS, the name, primary language English (U.K.), bundle ID `com.shaadi24.app`,
   SKU `shaadi24-ios`.
3. **App Information**: category Lifestyle (secondary: Social Networking); Age Rating (below); App Store
   Server Notifications, Version 2, for production and sandbox:
   `https://fmrbzzdjtarsaqvfukum.supabase.co/functions/v1/store-notifications?provider=apple`.
4. **Monetization → Subscriptions**: group "Shaadi24+" with four subscriptions, all on the same level
   (so changing length is a crossgrade, which Apple starts at the next renewal: Settings → Shaadi24+ →
   Change plan in the app says so): `shaadi24_plus_weekly` (1 week, ₹499), `shaadi24_plus_monthly`
   (1 month, ₹999), `shaadi24_plus_quarterly` (3 months, ₹1,999) and `shaadi24_plus_halfyearly`
   (6 months, ₹2,999), each with a display name, a description and a review screenshot (the Shaadi24+
   page in the app; names and descriptions under "Shaadi24+ prices" below). `shaadi24_plus_yearly`, made earlier, is no longer used: delete it (it was never
   submitted). Optionally a 1-week free trial as the introductory offer. Actions → App Store check
   (`scripts/store-check.mjs`) says what each still needs.
   The first subscriptions are reviewed with the app: tick them on the version page before submitting.
   **Monetization → In-App Purchases**: three **Consumables**, `shaadi24_spotlight_24h` (₹149),
   `shaadi24_super_interest_1` (₹49) and `shaadi24_super_interest_5` (₹199), each with the display
   name, description and a review screenshot (Menu → Spotlight in the app). Tick them on the version page
   too. Apple tells our server about each purchase and refund (the notifications address above).
5. **App Privacy**: the Privacy Policy address and the answers below.
6. **Pricing and Availability**: free; the same countries as Google Play.
7. **TestFlight**: add yourself as a tester, install the build, and go through step 8. Purchases there
   use Apple's sandbox, without charges.
8. **The version page (1.0)**: screenshots, promotional text, description, keywords, support and
   marketing URLs, copyright, the build, App Review Information (your contact details, the demo account,
   the notes below), the subscriptions; then Add for Review.

### 8. Try everything on real phones first
On an Android phone (internal testing) and an iPhone (TestFlight):
- [ ] Sign up with email (the code arrives); with Google; on the iPhone with Apple, also with "Hide My Email"
- [ ] Forgot password: the code arrives and the new password works
- [ ] Make the profile with photos, search, like, match and chat; a rude word in a chat is refused
- [ ] Notifications for a match and a message; tapping one opens it
- [ ] Buy Shaadi24+ (license tester / sandbox); Settings shows it; Restore purchases on the other phone
- [ ] Report and block someone; the report is in Admin → Reports
- [ ] Settings → Download my data opens the share sheet; Help Center and Contact support work
- [ ] Delete an account in the app, and another on the website's Delete account page

### 9. After launch
- [ ] **The website's store badges.** Once each app is live, Vercel → your project → Settings →
  Environment Variables: `VITE_PLAY_STORE_URL` (the app's Google Play address,
  `https://play.google.com/store/apps/details?id=com.shaadi24.app`) and `VITE_APP_STORE_URL` (the address
  App Store Connect shows, `https://apps.apple.com/app/id…`), then redeploy. The home page and the help
  page link to the stores instead of saying "Coming soon".
- [ ] **Reports within 24 hours.** The Terms promise it and both stores expect it: look at Admin →
  Reports every day, remove what breaks the rules and ban the people who post it.
- [ ] Verification requests (Admin → Verifications), so new members don't wait long. The admin panel is in
  the app, and on the website at https://shaadi-gpt.vercel.app/admin.
- [ ] Reply to reviews in Play Console and App Store Connect.
- [ ] The stores' payout reports are the final word on fees and tax; Admin → Finance estimates the
  stores' share at 15% (`STORE_FEE_PERCENT_GOOGLE_PLAY`, `STORE_FEE_PERCENT_APP_STORE` if yours differ).

### Every new version
1. `npm version patch --no-git-tag-version` (or `minor`): package.json's version goes up, and with it
   Android's versionCode and the iPhone's build number (1.0.1 → 10001). Both stores refuse a number
   they've had before.
2. Android: `npm run build:android:release`, upload the `.aab` to a testing track, then promote it.
3. iPhone: `npm run build:ios`, Archive and upload in Xcode, and a new version in App Store Connect with
   "What's New".
4. Commit the version change.
5. Release it in stages (below), not to everyone at once.

### Staged rollouts, and stopping a bad version
A new version goes to a few people first, so a mistake reaches a few hundred phones, not everyone.
- **Google Play**: Production → Create new release → upload the `.aab` → *Staged roll-out*. Start at
  **5%** for a day, then 20%, 50% and 100%, a day or two apart. Before each step, look at:
  - Firebase → Crashlytics: crash-free users should stay above 99%, with no new crash at the top of the list.
  - Play Console → Android vitals: crashes and "app not responding".
  - Admin → Errors: error reports, and the problems members sent with Settings → Report a problem.

  If something is wrong, use **Halt roll-out**. Phones that already have the version keep it. Fix it,
  raise the version, and start a new staged release.
- **App Store**: on the version's page, before submitting, choose *Release update over 7-day period
  using phased release*. Apple gives it to 1%, 2%, 5%, 10%, 20%, 50% and then 100% of automatic updates.
  If something is wrong, use **Pause Phased Release** (up to 30 days), then submit a fixed version.
  People can still update by hand from the App Store page.
- **TestFlight first**: every build from main goes to the testers before it goes to review (`.github/workflows/testflight.yml`).
- **When an old version is broken for everyone**, for example after a backend change it can't handle:
  1. Release the fixed version in both stores, and wait until it is live.
  2. Go to Admin → Errors → *Oldest app that still works* and enter that version's build number
     (version 1.2.3 is 10203).
  3. Older apps then show "Please update Shaadi24" with a button to the store, and nothing else.

  Notes:
  - Raise it only once the fixed version can be downloaded, or members are stuck with nowhere to go.
  - The website is always the newest, so it never asks.
  - Only the owner can change it, and each change is in Admin → Audit log.
  - Set it back to 0 to turn it off.

### Crash reports (Firebase Crashlytics)
The apps send a report to Firebase when they crash. It contains where in the code, the app's version and
the phone, but no name, account or screen contents. Admin → Errors covers the website's errors and the
problems members report.
- [ ] Firebase console → Crashlytics → **Enable Crashlytics** for both apps.
- [ ] **Android**: on by itself once `google-services.json` is in `android/app/`. Reports come from
  release and debug builds; a crash shows up a few minutes after the app is opened again.
- [ ] **iPhone**: on by itself with `FIREBASE_IOS_CONFIG`. The TestFlight job uploads the debug symbols
  (dSYMs), so crashes show the code's names. If you upload from Xcode instead, Firebase's guide shows how
  to add the symbol upload to the build.
- [ ] Optional: Firebase → Crashlytics → alerts by email for new crashes and for a crash that comes back.

## Shaadi24+ prices

A ladder: the longer the plan, the less it costs a week, and the page shows both what each plan saves
on the week's price ("Save 69%" on its card) and what the chosen one saves in rupees under the cards.

| Plan | Price | A week | A month | Card says | Saving shown under the cards | You keep* |
|---|---|---|---|---|---|---|
| 1 week | ₹499 | ₹499 | (₹2,162) | Try it | "The longer the plan, the less you pay a week." | ~₹359 |
| 1 month | ₹999 | ₹231 | ₹999 | Save 54% | You save ₹268 a week (₹231 instead of ₹499) | ~₹720 |
| 3 months | ₹1,999 | ₹154 | ₹666 | Save 69% | You save ₹998 (₹1,999 instead of ₹2,997) | ~₹1,440 |
| 6 months | ₹2,999 | ₹115 | ₹500 | Save 77% | You save ₹2,995 (₹2,999 instead of ₹5,994) | ~₹2,160 |

\* After 18% GST (included in Indian store prices) and the stores' 15% (Google Play's for subscriptions;
Apple's with the Small Business Program, 30% without it).

Why these:
- **The week is the anchor.** At ₹499, a month costs what 2 weeks do, so most people who'd try a week
  take a month or more. Each step costs less a week (54%, 69%, 77% less than the week), like Hinge's
  own ($14.99, $32.99, $64.99 and $99.99 in the US: 49%, 67%, 74%).
- **₹499, ₹999, ₹1,999, ₹2,999**: under ₹500, ₹1,000, ₹2,000 and ₹3,000, the price points Indian
  buyers know.
  3 months costs about what 2 months would, and 6 months about what 3 would.
- **3 months is chosen to start with** (most people take it); 6 months is the best value for those
  who are sure, and brings the most in at once.
- **Still well under the matrimony sites**: Shaadi.com's 3-month plans are around ₹3,900–₹5,900 and
  its 6-month ones ₹5,500–₹8,900; Hinge+ in India is about ₹500–₹1,200 a month.
- Change them any time in App Store Connect and Play Console (the app shows whatever the stores say,
  and works the savings out from those), then update `DEFAULT_PLANS` in `lib/billingService.ts` and
  `billing_plans` so the Terms list the same prices (bump `TERMS_VERSION`), and `EXPECTED` in
  `scripts/store-check.mjs`; the App Store check says when App Store Connect and the Terms differ.

The subscriptions' names and descriptions (App Store: 30 and 45 characters at most):

| Product | Display name | Description |
|---|---|---|
| `shaadi24_plus_weekly` | Shaadi24+ 1 Week | More AI searches, unlimited likes, 1 week |
| `shaadi24_plus_monthly` | Shaadi24+ 1 Month | More AI searches, unlimited likes, 1 month |
| `shaadi24_plus_quarterly` | Shaadi24+ 3 Months | More AI searches, unlimited likes, 3 months |
| `shaadi24_plus_halfyearly` | Shaadi24+ 6 Months | More AI searches, unlimited likes, 6 months |

---

## Spotlight and Super Interest

For members who won't take a plan (and Shaadi24+ members who want more): bought one at a time, never
renewing. The app shows the store's own prices.

| Pack | Google Play | App Store | Price | You keep* | What it does |
|---|---|---|---|---|---|
| Spotlight | `spotlight_24h` | `shaadi24_spotlight_24h` | ₹149 | ~₹107 | Shown first, marked "Spotlight", to people searching nearby, for 24 hours |
| 1 Super Interest | `super_interest_1` | `shaadi24_super_interest_1` | ₹49 | ~₹35 | A like with a note, top of their Likes You, seen even without Shaadi24+ |
| 5 Super Interests | `super_interest_5` | `shaadi24_super_interest_5` | ₹199 | ~₹143 | The same, five (save ₹46) |

\* After 18% GST and the stores' 15%.

Why these: ₹49 is an impulse price (less than a coffee), the 5-pack makes each about ₹40, and a
Spotlight costs under a third of the 1-week plan (₹499), so it's the step before a plan. Shaadi24+
includes 3 Super Interests a week, which makes the plan worth more.
Change the prices in the stores, then `boost_products.amount` (the finance figures use it for Google
Play, which doesn't say a one-time purchase's price) and `PACK_PRICES` in `lib/billingService.ts` (the
Terms and Refunds pages; bump `TERMS_VERSION`).

| Product | Display name | Description |
|---|---|---|
| Spotlight | Spotlight (24 hours) | Be shown first to people near you for a day |
| 1 Super Interest | 1 Super Interest | A like with a note that stands out |
| 5 Super Interests | 5 Super Interests | Five likes with a note that stand out |

## Google Play store listing

**App name** (30 characters): `Shaadi24: Indian Matrimony`

**Short description** (80):

```
Describe your life partner in your own words, and meet the people you fit best.
```

**Full description** (4,000):

```
Shaadi24 is a matrimony app for people who know what matters to them. Describe the person you hope to marry in your own words, and Shaadi24 finds the people you fit best: by values, family, lifestyle and plans, not just photos.

SEARCH THE WAY YOU TALK
"A vegetarian doctor in Pune who wants children." "Tamil, settled abroad, open to moving back." Type it and Shaadi24 turns it into the right filters, with the people you fit best first.

A PROFILE MADE FOR INDIA
Religion, mother tongue, community, gotra, Manglik status, rashi and nakshatra, education, profession, family type and values, and more. Every detail is optional, and you can hide any answer: hidden answers are never shown and nobody can search by them.

SEE WHY YOU FIT
Every profile comes with a compatibility score and a report: where you match and where you differ, from marriage plans and children to diet, languages and where you live.

LIKE, MATCH, CHAT
When you like each other, it's a match and you can chat. Notifications tell you about new matches and messages, never what was written.

5 STANDOUTS A DAY
Each day, five of the most compatible people you haven't liked yet.

OUR PROMISES
• We never call you to sell: Shaadi24 has no sales team
• Every interest is from a real member: we never send fake ones to get you to pay
• Chatting with your matches is free
• Clear prices, no hidden charges, cancel any time in the store

SAFE AND RESPECTFUL
• A verified badge for members our team has checked
• Report or block anyone from their profile or your chat; every report is reviewed within 24 hours
• Abusive and vulgar words are kept out of chats and profiles
• Pause your profile, or go incognito, whenever you like
• Your date of birth is never shown, only your age
• For adults 18 and over

SHAADI24+
A free account can make a few AI searches every 5 hours (more a day with a complete profile) and send 15 likes a day. Shaadi24+ adds more searches, unlimited likes, 3 Super Interests a week, everyone who has liked you (one a day without it), more search filters (religion, mother tongue, community, Manglik, height, diet, education and more), the full compatibility report and date proposals in chat. It's a subscription for a week, a month, 3 months or 6 months through Google Play that renews until you cancel it in Google Play.

SPOTLIGHT AND SUPER INTEREST
No plan needed: put yourself first in searches near you for 24 hours with Spotlight, or send a Super Interest, a like with a note that goes to the top of their Likes You. Bought one at a time in the app.

Making a profile for a son, daughter, brother, sister or friend? Welcome, with their permission.

Privacy Policy: https://shaadi-gpt.vercel.app/privacy
Terms of Service: https://shaadi-gpt.vercel.app/terms
Help: https://shaadi-gpt.vercel.app/support
```

**Category**: Dating. **Contact details**: email `support@shaadi24.com`, website
`https://shaadi-gpt.vercel.app`. **Graphics**: `graphics/play-icon-512.png`,
`graphics/play-feature-graphic.jpg`, and the phone screenshots (below).

## App Store listing

| Field | Text |
|---|---|
| Name (30) | `Shaadi24: Indian Matrimony` |
| Subtitle (30) | `Find a life partner who fits` |
| Promotional text (170) | `Describe the person you hope to marry, in your own words. Shaadi24 finds the people you fit best: by values, family, lifestyle and plans.` |
| Keywords (100) | `shaadi,rishta,marriage,bride,groom,biodata,kundli,manglik,hindu,muslim,sikh,jain,christian,nri,desi` |
| Support URL | `https://shaadi-gpt.vercel.app/support` |
| Marketing URL | `https://shaadi-gpt.vercel.app` |
| Privacy Policy URL | `https://shaadi-gpt.vercel.app/privacy` |
| Copyright | `2026 <your name or company>` |
| Category | Lifestyle; secondary Social Networking |

**Description** (4,000):

```
Shaadi24 is a matrimony app for people who know what matters to them. Describe the person you hope to marry in your own words, and Shaadi24 finds the people you fit best: by values, family, lifestyle and plans, not just photos.

SEARCH THE WAY YOU TALK
"A vegetarian doctor in Pune who wants children." "Tamil, settled abroad, open to moving back." Type it and Shaadi24 turns it into the right filters, with the people you fit best first.

A PROFILE MADE FOR INDIA
Religion, mother tongue, community, gotra, Manglik status, rashi and nakshatra, education, profession, family type and values, and more. Every detail is optional, and you can hide any answer: hidden answers are never shown and nobody can search by them.

SEE WHY YOU FIT
Every profile comes with a compatibility score and a report: where you match and where you differ, from marriage plans and children to diet, languages and where you live.

LIKE, MATCH, CHAT
When you like each other, it's a match and you can chat. Notifications tell you about new matches and messages, never what was written.

5 STANDOUTS A DAY
Each day, five of the most compatible people you haven't liked yet.

OUR PROMISES
• We never call you to sell: Shaadi24 has no sales team
• Every interest is from a real member: we never send fake ones to get you to pay
• Chatting with your matches is free
• Clear prices, no hidden charges, cancel any time in the store

SAFE AND RESPECTFUL
• A verified badge for members our team has checked
• Report or block anyone from their profile or your chat; every report is reviewed within 24 hours
• Abusive and vulgar words are kept out of chats and profiles
• Pause your profile, or go incognito, whenever you like
• Your date of birth is never shown, only your age
• For adults 18 and over

SHAADI24+
A free account can make a few AI searches every 5 hours (more a day with a complete profile) and send 15 likes a day. Shaadi24+ adds more searches, unlimited likes, 3 Super Interests a week, everyone who has liked you (one a day without it), more search filters (religion, mother tongue, community, Manglik, height, diet, education and more), the full compatibility report and date proposals in chat.

SPOTLIGHT AND SUPER INTEREST
No plan needed: put yourself first in searches near you for 24 hours with Spotlight, or send a Super Interest, a like with a note that goes to the top of their Likes You. Bought one at a time in the app.

Shaadi24+ is an auto-renewing subscription for 1 week, 1 month, 3 months or 6 months. Payment is charged to your Apple Account when you confirm the purchase. It renews automatically unless you turn off auto-renewal at least 24 hours before the end of the current period, and your account is charged for the renewal within 24 hours before the period ends. Manage or cancel it in your Apple Account settings. If a free trial is offered, any unused part of it ends when you buy a subscription.

Terms of Use: https://shaadi-gpt.vercel.app/terms
Privacy Policy: https://shaadi-gpt.vercel.app/privacy
```

## Google Play: Data safety answers

Data collection: **yes**. Encrypted in transit: **yes**. People can ask for their data to be deleted:
**yes** (in the app, and `https://shaadi-gpt.vercel.app/delete-account`). Account creation: username and
password, and OAuth (Google; Apple on iPhones).

| Data type | Collected | Shared | Required or optional | Purposes |
|---|---|---|---|---|
| Personal info → Name | Yes | No | Required | App functionality, Account management, Fraud prevention, security, and compliance |
| Personal info → Email address | Yes | No | Required | App functionality, Account management, Fraud prevention, security, and compliance |
| Personal info → Phone number (only if shared in a chat with Share my number, or given with a complaint to the Grievance Officer) | Yes | No | Optional | App functionality, Fraud prevention, security, and compliance |
| Personal info → User IDs (the account's; Google's or Apple's at sign-in) | Yes | No | Required | App functionality, Account management |
| Personal info → Race and ethnicity (community, caste, ethnicity) | Yes | No | Optional | App functionality |
| Personal info → Political or religious beliefs | Yes | No | Optional | App functionality |
| Personal info → Sexual orientation | Yes | No | Optional | App functionality |
| Personal info → Other info (date of birth, gender, marital status, height, horoscope, family, education, job) | Yes | No | Required | App functionality |
| Financial info → Purchase history (Shaadi24+) | Yes | No | Optional | App functionality, Account management |
| Financial info → Other financial info (annual income on the profile) | Yes | No | Optional | App functionality |
| Health and fitness → Health info (disability, family health history) | Yes | No | Optional | App functionality |
| Location → Approximate location (the city, state and country people type; no GPS) | Yes | No | Required | App functionality |
| Messages → Other in-app messages | Yes | No | Optional | App functionality |
| Photos and videos → Photos | Yes | No | Required | App functionality |
| App activity → App interactions (likes, matches, last active) | Yes | No | Required | App functionality |
| App activity → In-app search history | Yes | **Yes**\* | Optional | App functionality |
| App activity → Other user-generated content (About me, profile answers, problems reported in Settings → Report a problem) | Yes | No | Optional | App functionality |
| Device or other IDs (the notification token, if notifications are on; the app's ID for the phone, kept scrambled) | Yes | No | Required | App functionality, Fraud prevention, security and compliance |
| App info and performance → Crash logs (error reports, and Firebase Crashlytics when the app crashes: the error and where in the code) | Yes | No | Required | App functionality |
| App info and performance → Diagnostics (with an error, a crash or a reported problem: the screen, app version, phone and system) | Yes | No | Required | App functionality |

Not collected: precise location, contacts, calendar, files, audio, web browsing, payment details (Google
Play takes the payment; Shaadi24 never sees cards or UPI). Internet (IP) addresses are kept with each
consent and complaint, and in the record kept for a year after an account is deleted, because Indian law
asks for them (`docs/legal/README.md`); they're never used to work out where someone is, so neither
store's form has a type for them, and the Privacy Policy names them. Error reports (`lib/errorReports.ts`) carry no
account, name or address, and the app blanks out emails, phone numbers and ids before sending one; they
are still "collected", as Google counts anything that leaves the phone.

\* **Search.** With `GEMINI_API_KEY` set, the words typed into search go to Google's Gemini AI (without
names, emails or phone numbers). On Gemini's free tier Google may use them to improve its services, which
makes this "shared". On a paid Gemini plan Google only processes them for Shaadi24: then answer **No**.
Without the key nothing is sent: also **No**. Hosting and delivery companies (Supabase, Vercel, Firebase
Cloud Messaging, Firebase Crashlytics) work for Shaadi24 and don't count as sharing; other members seeing a profile is what
the person asked for and doesn't either.

## App Store: App Privacy answers

These match the app's privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`). Every type: **Data
Linked to You**, purpose **App Functionality**, not used for tracking, except the two Diagnostics types,
which are **Data Not Linked to You** (error reports carry no account, name or address). "Do you or your
third-party partners use data for tracking?" **No.**

| Category | Data type | What it is in Shaadi24 |
|---|---|---|
| Contact Info | Name | the profile's name |
| Contact Info | Email Address | the account's email |
| Contact Info | Phone Number | only if someone shares it in a chat with Share my number, or gives it with a complaint (optional) |
| User Content | Photos or Videos | profile photos |
| User Content | Emails or Text Messages | chat messages between matches |
| User Content | Other User Content | About me and the profile's answers |
| User Content | Customer Support | complaints, and Settings → Report a problem (with the screen, app version and phone) |
| Health & Fitness | Health | disability, family health history (optional) |
| Sensitive Info | Sensitive Info | religion, community, sexuality, political views (optional) |
| Location | Coarse Location | the city and state people type |
| Financial Info | Other Financial Info | annual income on the profile (optional) |
| Purchases | Purchase History | Shaadi24+ subscriptions and payments |
| Search History | Search History | what people type into search |
| Identifiers | User ID | the account's ID |
| Identifiers | Device ID | the notification token, and the app's ID for the phone (kept scrambled; fraud prevention: free searches on 3 accounts a phone) |
| Usage Data | Product Interaction | likes, matches, last active |
| Other Data | Other Data Types | date of birth, gender, marital status, height, horoscope, family, education, job |
| Diagnostics (Not Linked to You) | Crash Data | error reports and Firebase Crashlytics crash reports: the error and where in the code |
| Diagnostics (Not Linked to You) | Other Diagnostic Data | with an error or a crash: the screen, app version, phone and system |

## Content rating

**Google Play** (Policy and programs → App content → Content rating; IARC questionnaire): pick the
category for apps where people communicate. Violence, fear, sexual content, bad language, gambling: no.
Alcohol, tobacco or drugs: references only (members say whether they drink or smoke). Users can interact
or exchange content: **yes**. Shares users' location with others: no (only the city they type). Digital
purchases: **yes**. Then Target audience: 18 and over only.

**App Store** (App Information → Age Rating): none for violence, horror, gambling, contests and medical
content; alcohol, tobacco or drug references: infrequent/mild; user-generated content and messaging:
**yes**; no unrestricted web access. Matrimony and dating apps are for adults: if the result is under
18+, choose 18+.

## Notes for the reviewers

**Demo accounts** (once):
1. Make an account with an email you control (for example `appreview@` your domain) and a strong
   password, and finish the profile with photos you have the right to use.
2. Admin → Users: verify it (unverified accounts can't search after 72 hours). Keep it on the free plan,
   so the reviewers can buy Shaadi24+ in the sandbox.
3. Make a second account, like each other, and exchange a message or two, so there's a match and a chat.
4. Give both stores the first account's email and password, and don't use it yourself after that.

**App Store → App Review Information → Notes** (and, shortened, Play's "App access" instructions):

```
Shaadi24 is a matrimony app for adults (18+) in India and Indians abroad: members describe the partner they're looking for in their own words, see compatible profiles, like, match and chat.

DEMO ACCOUNT (verified, with a match and a chat)
On the first screen tap "Sign in or create account", then "Continue with Email", and use the email and password above.

IN-APP PURCHASES
Shaadi24+ is an auto-renewable subscription (group "Shaadi24+": shaadi24_plus_weekly, shaadi24_plus_monthly, shaadi24_plus_quarterly and shaadi24_plus_halfyearly). Open it from the menu ("Get Shaadi24+") or Settings → Shaadi24+, which also has Restore purchases and Manage subscription. Our server checks every purchase with the App Store. The app offers no other way to pay.
Spotlight and Super Interest are consumables, bought one at a time from the menu ("Spotlight"): shaadi24_spotlight_24h (shows the member first in nearby searches for 24 hours, started when bought) and shaadi24_super_interest_1 / shaadi24_super_interest_5 (a like with a note, sent from the Super Interest button on any profile).

SIGN IN WITH APPLE is on the first screen, above Google.

ACCOUNT DELETION: Settings → Delete Account deletes the account and its data at once (and ends Sign in with Apple for the app). If an App Store subscription is still renewing, the app says so first and opens Subscriptions.

USER-GENERATED CONTENT: everyone accepts the Terms before using the app; they allow no objectionable content or abusive users. Abusive, hateful and sexual words are refused in chats and profiles. Report and Block are in the ⋯ menu of every profile and chat. We review reports within 24 hours and ban people who break the rules.

NOTIFICATIONS are optional; the app explains them before iOS asks. No ads, no tracking.
```

## Screenshots

| Store | Size | How many |
|---|---|---|
| Google Play, phone | 1080 × 1920 (9:16; the long side may be at most twice the short one) | 2–8; at least 4 for Google's recommendations |
| App Store, iPhone 6.9" | 1320 × 2868 (1290 × 2796 also works); Apple scales them for smaller iPhones | 1–10 |

The same screens, in this order, from the demo accounts (only photos you have the right to use, no
real members):
1. Search: a typed description and the people it found
2. A profile with its compatibility score and report
3. The profile's India details (community, family, horoscope)
4. Standouts
5. A chat
6. Likes You
7. Shaadi24+

Taking them:
- **iPhone**: in Xcode, run the app on the iPhone 16 Pro Max simulator (or a newer Pro Max). Tidy the
  status bar with `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100`, then File →
  Save Screen (⌘S) for a 1320 × 2868 picture.
- **Android**: in Android Studio, an emulator made from the "Pixel 2" hardware profile (1080 × 1920);
  the screenshot button in the emulator's toolbar saves one. Newer phones' screens are longer than
  Google Play allows.
