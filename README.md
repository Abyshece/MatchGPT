# MatchGPT

A matrimony app for India. People describe the person they hope to marry in their own words, and
MatchGPT finds the people they fit best: by values, family, lifestyle and plans, not just photos.
Profiles carry what Indian families ask about (community, mother tongue, family, horoscope), and any
answer can be hidden. Likes that go both ways become matches, and matches can chat. Profiles are
verified through their social links, and MatchGPT+ adds unlimited searches and likes.

MatchGPT comes as **Android and iPhone apps**, plus the website, **https://shaadi-gpt.vercel.app**.
The website also serves the pages the stores link to (support, privacy, terms, account deletion).
MatchGPT+ is sold only in the apps, through Google Play and the App Store.

- What's done and what's left: [ROADMAP.md](ROADMAP.md)
- The launch checklist for the stores: [docs/store/README.md](docs/store/README.md)
- Every setting and secret: [.env.local.example](.env.local.example)

## How it's built

- **The app.** React and TypeScript, built by Vite and styled with Tailwind. The website and both phone
  apps run the same code (`App.tsx`, `components/`, `lib/`), and each screen loads the first time
  it's shown (`lib/lazyScreen.ts`).
- **The phone apps.** [Capacitor](https://capacitorjs.com) wraps that code (`capacitor.config.ts`,
  `android/`, `ios/`).
- **The backend.** [Supabase](https://supabase.com) (project `fmrbzzdjtarsaqvfukum`) provides:
  - Postgres, with access rules on every table;
  - sign-in, photo storage and live chat.

  The whole database is in `supabase/migrations/` and rebuilds from scratch. The server code runs as
  edge functions in `supabase/functions/`:

  | Function | What it does |
  |---|---|
  | `search` | Search and matching: typed searches (understood by Google Gemini, or by rules without its key), filters, scores, the daily limit |
  | `store-billing`, `store-notifications` | MatchGPT+ in the apps: purchases checked with Google Play and the App Store, and the stores' notifications |
  | `send-push` | Notifications: phones through Firebase Cloud Messaging, browsers through Web Push. A cron job runs it every minute |
  | `delete-account` | Deletes an account and everything kept about it, stopping its Google Play renewal first |
  | `apple-sign-in` | Keeps the Sign in with Apple token, so deleting the account also ends it at Apple |

- **MatchGPT+.** Sold only in the apps, through Google Play and the App Store; the website says where
  to get the apps. One switch, "MatchGPT+ for everyone" in Admin → Dashboard, gives every member its
  features while it's on; only the daily limits (3 AI searches, 15 likes) stay for free accounts. The
  server (`has_pro()` in the database) and the apps (`useAuth().hasPro`) follow it at once, with no
  new app release.
- **Hosting.** The website is on Vercel (`vercel.json`) and the backend on Supabase.

## Run it locally

You need Node.js 22.

1. `npm ci`
2. `cp .env.local.example .env.local`, then fill in the Supabase address and anon key (Supabase →
   Project Settings → API).
3. `npm run dev`, then open http://localhost:3000

The app uses the Supabase project that `.env.local` names. To run a backend on your own computer
instead (this needs Docker):

```bash
npx supabase start            # database, sign-in, storage and a mail catcher
npx supabase db reset         # builds the database from supabase/migrations/
npx supabase status           # shows the local anon and service_role keys
VITE_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<service_role key> npx tsx scripts/seed.ts
npx supabase functions serve  # the edge functions
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon key> npm run dev
```

The seed script creates 50 test profiles. Emails such as sign-up codes and password resets land in
the mail catcher at http://127.0.0.1:54324.

## Checks

GitHub runs these on every pull request and every push to `main` (`.github/workflows/ci.yml`). Run
them yourself before pushing:

- `npx tsc --noEmit`: the type check
- `npm run lint`: the linter (ESLint: TypeScript's recommended rules and React's rules of hooks)
- `npm run build`: the website's build
- `deno test --no-config --node-modules-dir=none --allow-env --allow-read supabase/functions/`: the
  server's unit tests (search scores, the stores, notifications, Sign in with Apple). This
  needs [Deno](https://deno.com) 2.

With a local backend you can also run:

- `supabase/tests/run_local.sh`. It rebuilds the database from the migrations, then checks that
  attacks are blocked and that normal actions still work. See
  [supabase/tests/README.md](supabase/tests/README.md).
- `tests/e2e/`: a browser or server test for each feature, in Chromium with Playwright. Stand-ins play
  the stores, Firebase, Gemini and the phones' native side. See
  [tests/e2e/README.md](tests/e2e/README.md).

## Deploying

- **Website.** Vercel builds and publishes `main` after every merge. Vercel's project settings hold
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `vercel.json` sends `/support`, `/privacy`, `/terms`
  and `/delete-account` to the app, which shows those pages.
- **Database.** Each change is a new file in `supabase/migrations/`. `npx supabase link --project-ref
  fmrbzzdjtarsaqvfukum` once, then `npx supabase db push` applies the ones the live database doesn't
  have yet. You can also paste a file into Supabase → SQL Editor.
- **Edge functions.** Deploy with `npx supabase functions deploy <name> --project-ref fmrbzzdjtarsaqvfukum`.
  Their secrets (Google Play, Firebase, Gemini, Apple) go in Supabase → Edge Functions →
  Secrets. `.env.local.example` says what each one switches on.
- **Phone apps.** See the next section, and the launch kit in [docs/store/README.md](docs/store/README.md).

## Phone apps (Android and iPhone)

**What only the apps do** is in `lib/nativeApp.ts`, styled with `index.css`:

- the Android back button;
- the status and gesture bar colours;
- room for the iPhone's notch and home bar;
- the launch screen.

**MatchGPT+** is sold in the apps through Google Play and the App Store (`lib/storePurchases.ts`,
`components/StoreUpgrade.tsx`). The server checks each purchase with the store. This starts once the subscriptions are set up in the stores (ROADMAP.md, Phase 13); until then
the apps say "coming soon".

**Notifications** come through Firebase Cloud Messaging: `lib/nativePush.ts` in the app, `send-push`
on the server. They start once the app has its Firebase files (Firebase console → Project settings →
Your apps):

- `android/app/google-services.json`;
- `ios/App/App/GoogleService-Info.plist`, added to the App target in Xcode.

Without them the app still builds and runs, and says notifications are coming soon. Admins also get
alerts for new reports and verification requests, on Android in a channel of their own.

**Sign-in** uses the phone's own sheets (`lib/socialSignIn.ts`):

- Google on both phones, and Sign in with Apple on iPhones. Each shows once its provider is on in
  Supabase (Authentication → Sign In / Providers).
- Android uses the Google client Supabase already has. iPhones need their own client,
  `VITE_GOOGLE_IOS_CLIENT_ID` in `.env.production.local`. The iOS build adds its URL scheme to
  `Info.plist` itself (`scripts/ios-google-sign-in.mjs`).
- Email sign-in always works, and "Forgot password" emails a code to type into the app.

**Store pages.** The website's `/delete-account` page (`components/DeleteAccountPage.tsx`) lets anyone
delete their account without the app, with a code sent by email. It's the deletion link Google Play
asks for. `/support`, `/privacy` and `/terms` are the other pages the stores link to.

The emailed codes only work once Supabase's email templates include them. Paste
`supabase/templates/recovery.html` into Reset Password and `magic_link.html` into Magic Link, in
Supabase → Authentication → Emails.

Both apps need the live Supabase URL and anon key in `.env.production.local`, with the same names as
in `.env.local` (Supabase → Project Settings → API). The build bakes them into the app.

**Android** needs Node.js 22, JDK 21 and the Android SDK (platform 36, build-tools 36). Android Studio
installs the SDK.

1. `npm run build:android` builds the app and copies it into `android/`.
2. `cd android && ./gradlew assembleDebug`, or open `android/` in Android Studio and press Run. The
   test app is saved as `android/app/build/outputs/apk/debug/app-debug.apk`.

**iPhone** needs a Mac with Xcode (free in the Mac App Store) and Node.js 22. The project uses Swift
Package Manager, so there's no CocoaPods step.

1. `npm run build:ios` builds the app and copies it into `ios/`.
2. `npx cap open ios` opens it in Xcode. Pick an iPhone simulator at the top and press Run (▶). To run
   it on your own iPhone:
   1. Plug the iPhone in and pick it instead of the simulator.
   2. Choose your Apple ID under Signing & Capabilities → Team.
   3. Turn on Developer Mode on the phone (Settings → Privacy & Security).

After any code change, run the build command again before Run.

**For the stores**:

- **Google Play.** `npm run build:android:release` builds the bundle Google Play takes,
  `android/app/build/outputs/bundle/release/app-release.aab`. It's signed with your upload key once
  `android/keystore.properties` points to it.
- **App Store.** On the Mac, Xcode → Product → Archive uploads the iPhone app.
- **Version.** Both stores read the version from package.json. Raise it before each upload with
  `npm version patch --no-git-tag-version`.

The rest is in [docs/store/README.md](docs/store/README.md): the launch checklist, store listings,
privacy answers, notes for the reviewers and screenshots.

`com.matchgpt.app` is the app's ID on Google Play and the App Store. It's set in
`capacitor.config.ts`, `android/app/build.gradle` and the Xcode project, and can't change after the
first upload.
