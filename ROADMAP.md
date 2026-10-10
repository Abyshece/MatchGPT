# Shaadi24 roadmap

13 phases in total. Phases 1–5, 7–9 and 12 are done, and Phase 6 is mostly done. **Phase 13 (the
phone apps ready for the stores) is built. What's left of it is yours: the launch checklist in
[docs/store/README.md](docs/store/README.md).** Phase 10 (launch readiness) is under way: parts 1 to
12 are done (checks and a linter on every push, a faster first load, admin alerts, one switch for
Shaadi24+, tidier access rules, the whole journey tested, the README, Shaadi24+ sold only in the
apps, the website as a home page with the admin panel, an accessibility check, error reports in
Admin → Errors, the new name, Shaadi24, the members' app inside the admin panel, required
answers with free searches for filling in the profile, an alignment pass over every screen, the
legal pages, and a two-minute sign-up with the rest in My Profile). The iPhone app goes to TestFlight from GitHub's Macs.
AI search (Gemini) is built and live; it switches on once you add the `GEMINI_API_KEY` secret (Phase 9).
Shaadi24+ is sold only in the apps, through Google Play and the App Store (Phase 13); Razorpay was
dropped on 2026-10-05 (Phase 11).
Items left unfinished in earlier phases were moved into later ones, so each open item appears once.
(`PHASE_1_README.md`–`PHASE_3_README.md` are historical setup notes.)

| # | Phase | Status |
|---|---|---|
| 1 | Backend foundation | Done |
| 2 | Sign-up & onboarding | Done (forgot password → Phase 8) |
| 3 | Profile system | Done |
| 4 | Search & matching | Done (rebuilt on the server in Phase 9) |
| 5 | Likes, matches & chat | Done |
| 6 | Polish & launch prep | Mostly done (payments → 11, cleanup → 10) |
| 7 | Make the backend safe and rebuildable | **Done** (3 small owner follow-ups) |
| 8 | Finish half-built features | **Done** (owner checks listed) |
| 9 | Smarter search that scales | **Done** (add the Gemini key to switch AI on) |
| 10 | Launch readiness → public launch | **In progress** (parts 1–12 done 2026-10-07) |
| 11 | Payments (Shaadi24+ via Razorpay) | Dropped 2026-10-05: Shaadi24+ is sold only in the apps (Phase 13) |
| 12 | Profile details for India (community, family, horoscope) | **Done** |
| 13 | The phone apps, ready for Google Play and the App Store | **Built**; your launch checklist: [docs/store/README.md](docs/store/README.md) |

---

## Phase 7 — Make the backend safe and rebuildable (done 2026-09-26)

### Security holes in the live database — fixed
Migrations `20260926133139_close_public_data_exposure` and `20260926141513_fix_likes_matches_and_limits`.
- [x] Anyone with the public website key could read every user's email, phone number and private answers,
  and edit or delete any profile, through views that bypassed the access rules
- [x] Any user could make themselves an admin (`is_admin()` trusted the profile email, which users can edit)
- [x] Users could mark themselves verified or Pro, lift their own ban, or reset their like counter
- [x] Anyone could disable other people's push notifications (`increment_push_failure`)
- [x] Signed-out visitors could call signed-in-only functions; trigger functions were callable directly

### Live bugs found on the way — fixed
- [x] "Likes You" and "Matches" were always empty (the functions couldn't see the other person's profile)
- [x] Admins couldn't resolve reports (a database rule only allowed "dismissed"); "Export my data" always failed
- [x] The match celebration popup couldn't load the other person's profile
- [x] Daily like limit enforced by the database: 15/day for free users, Super Likes Pro-only, counter kept by the server

### Rebuildable
- [x] `supabase/migrations/`: a baseline regenerated from the live catalog (replaces `001` and the unsaved
  002–012) plus the two security migrations; the live migration history matches the repo
- [x] A database rebuilt from the repo matches live on all 12 checksums in `supabase/tests/schema_checksums.sql`
- [x] `supabase/tests/run_local.sh` rebuilds locally (no Docker) and runs 37 security/behaviour checks — all pass
- [x] `lib/database.types.ts` regenerated; 0 type errors in app code (the 60 left are in unused prototype files → Phase 10)

### Code
- [x] `.env.local.example`; `Supabase/` → `supabase/`; `.env` files git-ignored
- [x] Profile-rescue screen fixed; removed browser helpers that wrote verification fields
- [x] Admin tab decided by the database (`is_admin()`); the admin email list no longer ships in the website
- [x] Edge functions read allowed browser origins from `ALLOWED_ORIGINS` (unset = any origin, as before)
- [x] `GEMINI_API_KEY` is no longer injected into the website bundle

### Owner follow-ups
- [ ] Once the live site address is known: set the `ALLOWED_ORIGINS` secret and redeploy the edge functions
  (`npx supabase functions deploy delete-account`, `send-push` and `search`). No behaviour changes until then.
  Include the phone apps' origins, `https://localhost` (Android) and `capacitor://localhost` (iPhone), or
  the apps can't reach the functions (`docs/store/README.md`, step 3)
- [ ] Turn on leaked-password protection in the Supabase dashboard's Authentication settings
  ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
- [ ] Remove the now-unused `VITE_ADMIN_EMAILS` variable from the hosting settings

The daily **search** limit moved to Phase 9, where search moved to the server; it's enforced there now.

---

## Phase 8 — Finish half-built features (done 2026-09-26)

### Checked first: sign-up and profile setup (2026-09-26)
Run in a browser against a local copy of the backend (`npx supabase start` with the repo's migrations).
- [x] Works: email sign-up with "Confirm email" off and on (code from the email), Google-style sign-up,
  the 3-step profile setup (details, 4 photos, 5 detail pages), search, sign out and back in
- [x] Fixed: after signing out, new users were stuck on the "Check your inbox" screen
- [x] Fixed: Google sign-ups never accepted the Terms and Privacy Policy, so nothing was recorded. Anyone
  without a recorded acceptance is now asked once before continuing, existing accounts included
- [x] Fixed: with "Confirm email" on, the Terms acceptance from the sign-up form was silently lost
- [x] Google sign-ups start profile setup with their name filled in
- [x] Owner: "Confirm email" switched off on the live site (checked 2026-09-27). Until a proper email sender
  is set up, only addresses in your Supabase team could have received the code

### Done
- [x] Fixed a live bug: about an hour into a session (when the sign-in token refreshes), the app replaced
  everything with "Couldn't load your profile". The auth listener queried the database while the auth
  client still held its lock, so the query waited until the 8-second timeout
- [x] Forgot password: the reset link opened a page that didn't exist. It now opens the site, which asks
  for the new password; an expired or used link says so. Emails still only reach addresses in your
  Supabase team until a proper email sender is set up (Phase 10)
- [x] Profile cards show "Online" for people active in the last 5 minutes (every card said "Offline")
- [x] "Active Status" off: the person shows as Offline and drops out of the "Online Now" and
  "Recently active" filters
- [x] "Pause my profile" switch in Settings: hidden from search and Standouts, matches and chats keep working
- [x] Blocked people list in Settings with an Unblock button
- [x] Fixed: people you blocked (or who blocked you) still appeared in search and Standouts
- [x] Email digests: removed the toggle, which did nothing. The weekly email needs the email service (Phase 10)
- [x] Fixed: Standouts re-ran a top-8 search on every visit and dropped saved picks that were no longer
  in it, so picks vanished later in the day (reproduced: 0 of 5 saved picks shown; now 5 of 5)
- [x] Profile page: "Coming in Phase 4" is now a "Get verified →" button; the upgrade pop-up no longer
  mentions "Phase 6"

- [x] Admin "Users" and "Reports" tabs only saw the admin's own profile: new admin-only lookups
  (`admin_search_users`, `admin_list_reports`, migration `20260926195517`)
- [x] "Active Status" off now also hides the last-active time in the database (it reached every
  signed-in browser)
- [x] Push notifications were never sent. Nothing ran `send-push`, the Vault key it would have used was a
  placeholder, and it had no Web Push (VAPID) keys. Now a cron job calls it every minute when something is
  queued, authenticated by a secret the database generates; `send-push` creates and stores its own key
  pair; browsers read the public key from the database. Tested locally with a stand-in push service that
  checked the signature and decrypted the message
- [x] `supabase/tests/run_local.sh`: 50 security/behaviour checks (13 new), all pass
- [x] `supabase/config.toml` for a full local Supabase (Docker); keeps JWT checks off for both functions
- [x] Browser tests for all of the above in `tests/e2e/`
- [x] Live: migration applied, `send-push` redeployed, the schedule created its keys; the live schema
  matches a rebuild from the repo on all 12 checksums

- [x] Renamed from ShaadiGPT to MatchGPT everywhere users see it: every screen, Terms and Privacy, the
  browser tab, plan names, notifications, "Export my data" (migration `20260927101209`); contact emails
  became support@ and privacy@matchgpt.com. Unchanged on purpose: saved-setting keys in the browser
  (renaming them would reset everyone's theme and cookie choices) and the site address
  `shaadi-gpt.vercel.app`. (Renamed again, to Shaadi24, on 2026-10-06: Phase 10, part 7.)

### Owner checks
- [ ] Test Google sign-in with a real Google account. Everything checkable from outside is in order
  (provider on, Google accepts the app's ID and return address, returns to the live site); in Google Cloud
  → Google Auth Platform → Audience the publishing status must be "In production", not "Testing"
- [ ] Turn on push notifications on a phone or laptop (Settings → Notifications) and get someone to
  Super Like you or message you

## Phase 9 — Smarter search that scales (done 2026-09-27)
Search and Standouts run in a new `search` edge function instead of the browser. Migrations
`20260927112757_phase9_server_search` and `20260927123642_phase9_drop_profile_views`, both applied live.

- [x] Search runs on the server. It works past 1,000 users: each search considers the 5,000 most recently
  active people whose gender preferences fit. Browsers only receive the top 50 results, not everyone's profile
- [x] The daily limit (3 searches for free accounts) and the 72-hour verification lockout are enforced by
  the server. Users can no longer reset their own search counter
- [x] The three read-only views flagged by Supabase (`eligible_profiles`, `public_profiles`,
  `my_blocked_ids`) and the unused `visible_profiles` are gone. The advisor has no errors left
- [x] Fields users marked "hidden" never reach other people's browsers: search, Standouts, Likes You,
  Matches, the liked list and the blocked list. Filters and prompts treat them as not filled in, so results
  can't reveal them either. A hidden name shows as "Name hidden"
- [x] Other people's profiles only include the fields the profile screen shows (therapy, criminal record,
  family health and similar answers are no longer sent)
- [x] All compatibility factors count, including diet, exercise, sleep schedule, living situation,
  closeness to family and openness to an interracial marriage
- [x] Prompts:
  - "near me" (same city or state), "online", "recently active", "verified"
  - "a woman" / "men"
  - ages: "under 30", "late 20s", "25-32"
- [x] Whole words only ("man" ≠ "woman"). "Not", "doesn't", "no", "non-" and "… free" are understood.
  "Doesn't smoke" (also drinking, cannabis and drugs) leaves out people who say they do
- [x] Standouts: picked on the server; refreshing them is Pro-only there too
- [x] Tests:
  - 61 database checks
  - 12 unit tests for the matching logic (`supabase/functions/search/matching_test.ts`)
  - browser test `tests/e2e/phase9-search.mjs`
  - checked live with a temporary account, deleted afterwards
- [x] AI search with Google Gemini's free tier (decided 2026-09-27; migration `20260927210449_phase9_ai_prompt_cache`,
  applied live). Gemini turns the prompt into filters (gender, age, a named city, "near me",
  online, habits to avoid) and preferences that raise the score (profile answers such as diet or religion, and
  words with synonyms to look for in bios, hobbies and jobs). Results show what the search understood
  ("✨ Understood by AI: Women · In Pune · Doesn't smoke · …")
  - Sent to Google: only the typed text (emails and phone numbers removed) and the list of answers people have;
    never names, photos or profiles. The Privacy Policy now says so (version `privacy-v2-2026-09-27`)
  - Free-tier limits: roughly 500–1,000 AI searches a day and about 15 a minute (Google shows the exact numbers
    in AI Studio). The same prompt reuses its saved plan for 30 days. When the key is missing, the quota is used
    up or Gemini is slow, search falls back to the rule-based understanding above, so it never stops working
  - The model is picked automatically (newest Flash-Lite first); a `GEMINI_MODEL` secret overrides it
  - Tested with 14 more unit tests (`ai_test.ts`, `matching_test.ts`), the browser test against a local stand-in
    for Gemini (`tests/e2e/gemini-standin.cjs`), and live with a temporary account (deleted afterwards)
- [ ] **Owner:** create a free Gemini API key (aistudio.google.com → Get API key, no billing) and add it in Supabase
  under Edge Functions → Secrets as `GEMINI_API_KEY`. Until then search uses the rules
- [ ] Optional: AI-written "why you match" summaries (each would use free quota: better after launch, or on the paid tier)
- [ ] Optional: rank by the meaning of bios with Supabase's built-in embedding model (free, runs inside Supabase)

## Phase 10 — Launch readiness → public launch

### Fixes asked for first (2026-09-27)
- [x] "Verify your identity" popup: opened from the sidebar it was squeezed into the sidebar's width (the
  sidebar's slide-in transform trapped it). It now opens over the whole page (a full-width sheet on phones),
  with plain link fields that are checked, the server's real rule (2 of the 4 links; it asked for all 3 of
  LinkedIn, Instagram and Facebook), and links that can be changed while the request is in review.
  Browser test `tests/e2e/verify-popup.mjs`
- [x] Pro accounts saw "Infinity of 3 searches remaining today"; now "Unlimited searches"
- [x] Google's sign-in screen says "to continue to fmrbzzdjtarsaqvfukum.supabase.co": Google names the app
  after the address it returns to, which is Supabase's in the classic sign-in, and only shows an app name
  once it has verified the brand, which needs every address in the sign-in setup to be yours. Google's own
  button is built (`lib/googleSignIn.ts`, `components/GoogleSignInButton.tsx`): the sign-in happens on this
  site and Supabase checks Google's token, so Supabase's address disappears. Browser test
  `tests/e2e/google-button.mjs`. It stays off until the step below: Google refuses its button on sites
  that aren't registered, and a check against Google showed `https://shaadi-gpt.vercel.app` isn't yet
- [ ] **Owner:** Google Cloud → Google Auth Platform → Clients → the web client (ID starting
  `1095396009529-7cqo…`) → Authorized JavaScript origins → add `https://shaadi-gpt.vercel.app` → Save.
  Then I switch Google's button on (`LIVE_CLIENT_ID` in `lib/googleSignIn.ts`); Google's screen then shows
  the site's address instead of Supabase's
- [ ] **Owner, for "Shaadi24" on Google's screen** (after the button is on): Branding: app name Shaadi24,
  logo, home page `https://shaadi-gpt.vercel.app`, privacy `https://shaadi-gpt.vercel.app/#privacy`, terms
  `https://shaadi-gpt.vercel.app/#terms`, authorized domain `shaadi-gpt.vercel.app`; remove the Supabase
  callback from the client's redirect URIs and `fmrbzzdjtarsaqvfukum.supabase.co` from the authorized domains;
  prove the site is yours in Google Search Console (I add the verification tag); then Verification Center →
  submit for brand verification (Google says a few business days)

### Launch readiness
Part 1 done 2026-10-04. Migration `20261004221100_phase10_admin_alerts` is applied live, and
`send-push` was redeployed.

**Done**

- [x] **Checks on every push and pull request** (`.github/workflows/ci.yml`):
  - the type check, which now passes with no errors;
  - the website's build;
  - the server's 64 unit tests.

  The 18 unused prototype files are left out of the type check until they're deleted.
- [x] **A smaller main JavaScript file: 585 kB → 63 kB.**
  - Each screen loads the first time it's shown. Signed-in people get the app's main screen loaded in
    the background straight away.
  - React, Supabase and Capacitor are files of their own (about 120 kB compressed). Browsers keep them
    cached from one release to the next, so after a release returning visitors only download what
    changed.
  - When a release goes live while someone has the page open, a screen whose old file is gone reloads
    the page once, instead of going blank.
- [x] **A "Something went wrong" screen**, with a Reload button and the support address, instead of a
  blank page when a screen fails.
- [x] **Favicon** (it was broken), the page's title and description, and **link previews**: a picture
  and description when the site's link is shared on WhatsApp, X, LinkedIn or Facebook.
  `public/og-image.png` is made by `scripts/store-graphics.mjs`, along with the store graphics.
- [x] **Admins keep up with reports and verification requests.**
  - Each new report or request sends admins a notification, in the phone apps and the browser. On
    Android these come in a channel of their own, "Admin alerts".
  - A report of someone under 18 says so in its title.
  - Tapping the notification opens Admin → Reports or Admin → Verifications.
  - Admins who turned notifications off in Settings get none, and nobody is alerted about their own
    report.
- [x] **README rewritten**: what Shaadi24 is, how it's built, running it locally, the checks,
  deploying, the apps.
- [x] **Tests.** New: `tests/e2e/admin-alerts.mjs` (21 checks). The other 16 browser and server tests
  ran again; the website ones ran on the production build.

Part 2 done 2026-10-04. Migrations `20261005214651_phase10_pro_access` and
`20261005214739_phase10_access_rules` are applied live, and `search` was redeployed.

- [x] **React's type definitions**: the type check now also checks what every screen is given (it
  found 3 mismatches, in the Finance tab's toggles).
- [x] **A linter in the checks** (`npm run lint`: ESLint with TypeScript's rules and React's rules
  of hooks), and what it found, fixed:
  - Find Match called three of its hooks only after the profile had loaded, which crashes the screen
    if the profile arrives while it's showing.
  - Pieces of screens were rebuilt on every redraw (Settings' switches, the sidebar's items, the
    sections of Terms, Privacy and profiles).
  - Times like "5m ago" and the trial's end date now stay current, and the hearts on the match
    celebration no longer jump around.
- [x] **Keyboards and screen readers** (part of the accessibility check): Settings' switches and the
  sidebar's items were clickable areas that a keyboard couldn't reach and a screen reader didn't
  announce. They're buttons now: switches say whether they're on, the sidebar says which page is
  open, and the locked filters say what they're for.
- [x] **One rule for Shaadi24+.** One switch, "Shaadi24+ for everyone", in Admin → Dashboard (in the
  audit log). It is on, as before.
  - While it's on, every member gets Shaadi24+'s features: Likes You, Super Likes, refreshing
    Standouts, every filter, compatibility reports and date proposals. Free accounts keep the daily
    limits (3 AI searches, 15 likes).
  - Before, the switch was a setting in the app's code that only Likes You followed. The like
    button, chat, filters, Standouts and compatibility reports showed "(Pro)" paywalls whose upgrade
    screens say "coming soon".
  - The server enforces the same rule (`has_pro()`). When the switch is off, a member without a
    subscription gets Likes You without who it was (the server doesn't send it), and the server
    leaves out the Shaadi24+ filters, the reports, Super Likes, date proposals and refreshing
    Standouts.
  - Turning it off when Shaadi24+ goes on sale needs no new app release.
- [x] **Tidier access rules** (Supabase's advisor):
  - Reports and verification requests have one rule each for reading.
  - The admin tables' rules apply to signed-in members only. Signed-out visitors can't reach those
    four tables at all, or `is_admin()`.
- [x] **The whole journey, tested**: a brand-new member signs up, sets up a profile, finds someone
  with a filter, likes her; she likes back; both get "It's a Match!"; they chat live and see "Read".
  It caught two bugs, now fixed:
  - Liking someone back showed "It's a Match!" twice, one on top of the other.
  - "Send a Message" from a match made in Likes You only said to open Matches; it now opens the chat.
- [x] **The upgrade screens** list only what buying adds while "Shaadi24+ for everyone" is on (the
  unlimited searches and likes), and say the rest is free for everyone right now.
- [x] **Security updates** for the libraries the website and the build use (`npm audit fix`). The
  one left is in Firebase's web library, in parts the app doesn't load.
- [x] **Tests:**
  - `tests/e2e/journey.mjs` (22 checks) and `tests/e2e/pro-access.mjs` (42 checks).
  - 10 new database checks: 45 attacks blocked, 53 normal actions working.
  - A unit test for the free filters.
  - All the browser and server tests ran again.

Part 3 done 2026-10-05: **Shaadi24+ is sold only in the apps.** You decided to sell it only through
Google Play and the App Store, so Razorpay is gone. The app and the server no longer use it; the
database change that removes its fields is ready and waits for your approval (below).

- [x] **The website** no longer sells Shaadi24+. Its Shaadi24+ screen says it's bought in the Shaadi24
  app, with Google Play and App Store badges ("Coming soon" until the apps' store addresses are set:
  `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL` in Vercel). Settings shows a subscription bought in
  either store, where to manage it, and its payments. The help answers and the Delete account page no
  longer mention paying on the website.
- [x] **The server**: the `billing` and `razorpay-webhook` functions and their code are deleted, and
  deleting an account no longer has a Razorpay step.
- [x] **The database change** (`supabase/migrations/20261005222759_phase10_no_razorpay.sql`) removes
  the Razorpay fields: every subscription and payment is then sold by Google Play or the App Store,
  with that store's id, and "Download my data" lists payments without invoices. The live database
  has no Razorpay subscriptions or payments, and the change refuses to run if it finds any, so
  nothing is lost. Tested on a local copy.
- [x] **Terms and Privacy Policy** no longer mention Razorpay (new versions, so members accept them
  again). The Finance tab lists Google Play and the App Store.
- [x] **Tests**: the Razorpay tests and stand-in are gone; the finance, store and popup tests and the
  database checks were updated (still 45 attacks blocked, 53 normal actions working).
- [ ] **Owner: approve the database change.** It removes columns, so the Supabase connector asks you
  to confirm before it runs, and the request timed out twice. Approve it the next time I apply it, or
  run `npx supabase db push --include-all` (newer changes are already live, hence `--include-all`; it
  also applies the notifications sign-out change in Phase 13). Until then the live database keeps the
  old, unused Razorpay fields, which changes nothing for members.
- [ ] **Owner:** Supabase → Edge Functions: delete `billing` and `razorpay-webhook`, which are no longer
  used, and remove any `RAZORPAY_*` secrets. The live `delete-account` still has its old Razorpay
  step until it's next deployed (`npx supabase functions deploy delete-account --project-ref
  fmrbzzdjtarsaqvfukum`); that step finds nothing to cancel, so it changes nothing.

Part 4 done 2026-10-05: **the website is a home page and the admin panel.** As you chose, members use
Shaadi24 in the apps, and the website (https://shaadi-gpt.vercel.app) no longer has the members' app.

- [x] **The home page**: what Shaadi24 is, the Google Play and App Store badges ("Coming soon" until
  `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL` are set in Vercel), and links to Help & Support, the
  Privacy Policy, Terms of Service, Delete your account and the admin panel. No sign-in for members and
  no cookie banner (the website keeps nothing but an admin's sign-in). It follows the device's light or
  dark setting and fits a phone's screen.
- [x] **`/admin`**: a sign-in for Shaadi24's team (email, Google, or a reset code; no sign-up), then
  the admin panel, with a switch for alerts in that browser. A member who signs in there is told
  Shaadi24 is used in the app.
- [x] Admin alerts clicked in the browser open their tab in the admin panel, as before.
- [x] Email links still work on the website: a password-reset link asks for the new password; a member
  signed in by an email link sees who they are, and can sign out or delete the account (the Delete
  account page sends them there when its email has a link instead of a code).
- [x] `/support` says Shaadi24 is on Android and iPhone, with the store badges; the help answers send
  members to the app's Settings.
- [x] For development and the browser tests, `VITE_MEMBERS_ON_WEB=true` (in `.env.local.example`) puts
  the members' app back in the browser. Never set it in Vercel.
- [x] **Tests**: `tests/e2e/website.mjs` (the website as it is live, 39 checks); the other browser tests
  ran again.
- [ ] **Owner:** Supabase → Authentication → URL Configuration → Redirect URLs: add
  `https://shaadi-gpt.vercel.app/**`, so an admin who signs in with Google comes back to the admin panel
  (without it they come back to the home page, which links to it).
- [ ] **Owner, once the apps are live:** set `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL` in Vercel and
  redeploy (docs/store/README.md, step 9).

Part 5 done 2026-10-06: **an accessibility check at phone width.** axe-core checked 34 screens (the
website and the app, light and dark) for the WCAG 2.1 AA rules; it found 3 kinds of serious problems,
all fixed:

- [x] **Faint text.** Secondary text (light grey on white) was below the contrast people with low vision
  need (2.5:1, AA asks for 4.5:1). It's a shade darker now in light mode, all over the app; dark mode
  is as it was.
- [x] **Buttons without a name** for screen readers: the phone menu's close button and the
  notifications switch (now a switch that says whether it's on). The Likes You sort list has a label.
- [x] Each page has its main content marked, so screen readers can jump to it.
- [x] `tests/e2e/accessibility.mjs` runs the check again (34 screens). What's left is minor (the order
  of some headings).
- [x] **Claude Code can use the app**: `.mcp.json` adds mobile-mcp, so Claude can tap through the app on
  an emulator or a connected phone (README, "Phone apps"). It needs a computer that can run an
  emulator, or a phone: the cloud container these changes are made in can't run Android fast enough.

Part 6 done 2026-10-06: **error reports, in Shaadi24's own database.** When the apps or the website hit
an error, it's reported, so it can be fixed before members write in about it. No outside service and
no key to add.

- [x] **What's sent**: the error and where in the code it came from, the screen (the tab, or the
  sign-in, setup or website page), the app version and the kind of phone or browser. Not who: emails,
  phone numbers, ids and sign-in tokens are blanked out on the device, the report goes with the app's
  public key rather than the member's sign-in, and the database keeps no account or address with it.
- [x] **What's reported**: errors nobody caught, promises that failed with nobody waiting for them, and
  screens that fail to draw (the "Something went wrong" screen). Not the noise that isn't Shaadi24's to
  fix (the network dropping, a cancelled request, a browser quirk, browser extensions). The same error
  is sent once per page or app session, and at most 10 errors are.
- [x] **Kept small** (`supabase/migrations/…_phase10_error_reports.sql`): the same error on the same
  day adds up on one row; at most 20 new errors a minute and 1,000 a day are kept; the table never holds
  more than 5,000, as a new error takes the place of the one seen longest ago (errors marked fixed
  first). Nothing is ever deleted. Members and visitors can only send reports, never read them.
- [x] **Admin → Errors**: each error once, most recent first, with how often and on how many days, the
  device, version and screen; tap one for its stack and browser. "Mark fixed" (in the audit log) hides
  it until it happens again.
- [x] **Privacy**: the Privacy Policy says what error reports contain and how many are kept (new
  version, so members accept it again). The store answers (docs/store/README.md) and the iPhone
  privacy manifest add crash data and diagnostics, which App Store answers count as not linked to you.
- [x] **Tests**: `tests/e2e/error-reports.mjs` (26 checks: the app, the Android app, the website and
  Admin → Errors); 10 new database checks (51 attacks blocked, 57 normal actions working); the
  accessibility check covers the Errors tab (36 screens); the other browser tests ran again.

Part 7 done 2026-10-06: **the name is now Shaadi24** (it was MatchGPT), everywhere it can be.

- [x] **What people see**: every screen of the apps and the website, the browser tab and link preview
  (`public/og-image.png` remade), the phone apps' names, the notifications, the emails' wording
  (`supabase/templates/`), "Download my data", the Terms and the Privacy Policy (new versions, so
  members accept them again), the help answers, the store texts and Google Play's graphics. MatchGPT+ is
  now **Shaadi24+**. Contact addresses: support@ and privacy@shaadi24.com.
- [x] **The apps' ID** is now `com.shaadi24.app` (Android package and iPhone bundle ID), and the
  Shaadi24+ store products are `shaadi24_plus` (Google Play, base plans monthly and yearly),
  `shaadi24_plus_monthly` and `shaadi24_plus_yearly` (App Store). Nothing was in the stores yet, so
  nothing is lost; an Android test app installed before is a different app now.
- [x] **The live database** (`supabase/migrations/20261006122347_phase10_rename_shaadi24.sql`, applied
  live): the plans' names and store products, and the seven functions whose messages named MatchGPT
  (notifications, the messages when something isn't allowed, "Download my data"). The waiting Razorpay
  clean-up migration says Shaadi24 too. The server functions that check purchases and Sign in with
  Apple use the new ID; apple-sign-in, delete-account, store-billing, store-notifications and send-push
  are deployed with the new name.
- [x] Checked: 108 database checks, 58 function tests and the 25 browser tests. The welcome screen
  shows the same search hint as Find Match now, so the tests know Find Match's box by its own test ID
  (`find-match-box`) rather than its hint.
- [x] Unchanged on purpose: saved-setting keys on people's devices (renaming them would reset their
  choices), the website's address `shaadi-gpt.vercel.app`, and the GitHub repository's name.
- [ ] **Owner:** Apple: register the App ID `com.shaadi24.app` (with Push Notifications and Sign In with
  Apple) and name the app Shaadi24 in App Store Connect; an App ID `com.matchgpt.app` made before can be
  deleted. Google Cloud → OAuth consent screen: app name Shaadi24. Supabase → Authentication → Emails:
  paste the templates again (their subjects: "Your Shaadi24 code", "Your Shaadi24 password reset code")
  and set the sender name to Shaadi24. Optional: rename the Vercel project (a new `*.vercel.app` address,
  or your own domain), the GitHub repository and the Supabase project.
- [ ] **Owner:** shaadi24.com was already registered by someone in October 2026 (it answered with a
  hosted website), so mail to support@ and privacy@shaadi24.com won't reach you unless you get the domain;
  otherwise tell Claude which addresses to use. Shaadi.com is a big matrimony brand: have a lawyer check
  the name with the legal review.

Part 8 done 2026-10-06: **the members' app inside the admin panel**, to see that everything works.

- [x] **Admin → App Preview** shows the members' app on the website, phone-sized (iPhone 16, iPhone SE
  or Android), scaled to fit the screen, with Reload and "Open in a new tab" (`/app-preview`). Only
  someone signed in to the admin panel as an admin gets it (`is_admin()`); anyone else is told it's
  for Shaadi24's admins. Members still use the phone apps.
- [x] **Its own sign-in** (`lib/appPreview.ts`): any account can be tried in it, a test account or
  your own, while the admin panel stays signed in; signing out of one leaves the other signed in.
- [x] Like the phone apps: no cookie banner, and sign-in by email (Google's page can't open inside
  the admin panel; Google and Apple sign-in, purchases and phone notifications are tried in the phone
  apps). It runs on the live data, so what's done in it is real. Its errors show in Admin → Errors
  as "app preview: …".
- [x] Checked: a new browser test (`tests/e2e/app-preview.mjs`, 28 checks); the accessibility check
  covers the tab.

Part 9 done 2026-10-06: **required answers, and free searches for filling in the profile.**

- [x] **16 answers every member gives** (15 since part 11, without "looking for") before using the app (`lib/profileRewards.ts`): who the profile
  is for, name, date of birth, gender, interested in, looking for, marital status, height, country,
  state (in India) and city, religion, mother tongue, highest qualification, occupation, and at least
  30 characters about themselves. Sign-up asks for them (height and the five on the details pages are
  new; those pages have no Skip), and members who joined earlier get a short screen with only what's
  missing (`components/RequiredDetails.tsx`) before anything else. My Profile won't remove them.
- [x] **The other answers come in six sections**: religion and community (12, the horoscope only for
  Hindu, Jain, Sikh and Buddhist members), education and career (7), family (11), lifestyle (11),
  appearance (7), plans and personality (11). A section is complete with about 7 in 10 of its answers
  given, and **each section complete adds one free AI search a day**: free accounts get 3 to 9.
  Shaadi24+ stays unlimited.
- [x] **The server decides** (migrations `20261006151802_phase10_profile_sections` and
  `20261006152044_phase10_search_bonus`, applied live): `profile_sections()` counts the answers,
  `profiles.search_bonus` is set by the database on every change (members can't set it) and
  `consume_search()` allows 3 plus the bonus. On the live database 51 of the 55 profiles already had
  sections complete, so they got their extra searches at once.
- [x] **What members see**: My Profile opens with "Earn free AI searches" (how many a day, each section's
  progress and what's left in it; tapping one goes to it), each section's heading says what it earns,
  and completing one says "Section complete! You now get N free AI searches a day". Find Match says
  "N of M searches remaining today" with "Earn more: fill in your profile"; the limit popup, Settings,
  the help answers ("How do I get more free searches?") and Shaadi24+'s list say so too.
- [x] Checked: 6 new database checks (members can't set the bonus or call `consume_search()`, signed-out
  visitors can't read anyone's sections; the sections, the limit, the horoscope only where it counts),
  a new browser test (`tests/e2e/profile-rewards.mjs`, 24 checks), the sign-up, India-profile, reset
  and journey tests updated for the required answers, and the full browser run (27 suites) and the
  accessibility check passed.

Part 10 done 2026-10-06: **an alignment pass** over every screen of the apps, the website and the admin
panel, at phone and desktop width, in light and dark (over 100 screenshots).

- [x] **My Profile on phones**: values were cut off ("Meera Testc", "Never Marri"). The label now takes
  2/5 of the width and values wrap; the edit and hide buttons always show on touch screens (they
  waited for a hover); editing no longer pushes the page sideways; the red "empty" dot stays with the
  label. A section's badge moves under its title when there's no room.
- [x] **Find Match**: the profile banner's icon, text and button line up (they were centred, left and
  centred), with the close button at the top right; after a search the heading is centred like the
  chips, count and results under it (it was left-aligned).
- [x] **Notifications** run across the top on phones (top-right on wider screens), keep their icon
  beside text that wraps, and are solid in dark mode.
- [x] **Buttons**: the sign-in form's Log In, Create Account, Send Code and Continue match the first
  screen's buttons. Sign-up's three steps, the Terms screen and the required-details screen share one
  footer: Skip or Sign out (and how much is filled in) on the left, the button on the right, the same
  size everywhere; in step 1, fields side by side line up ("(optional)" is set small, so labels fit on
  one line). The Shaadi24+ and daily-limit popups centre the store badges and their note.
- [x] **Also**: Likes You's title stays on one line, with "Sort by" under it on phones; the "Earn free AI
  searches" card no longer cuts section names short; Settings' account card fits a phone (a long email
  is shortened, Edit Profile stays inside); page titles are a size smaller on phones; Admin → Users
  reads "Joined … · N searches today · N likes today" (lines started with "·"); the chat's
  Shift+Enter hint is hidden on touch screens.

Part 11 done 2026-10-06: **Indian law: the legal pages, and the app made to follow them.** The report,
with what's left for you and a lawyer: [docs/legal/README.md](docs/legal/README.md).

- [x] **Five legal pages**, on the website (`/terms`, `/privacy`, `/grievances`, `/safety`, `/refunds`)
  and in the apps, each with a summary in Hindi: the Terms and Privacy Policy rewritten for Indian law
  (the IT Rules 2021 as amended in February 2026, the DPDP Act 2023 and its Rules, the SPDI Rules 2011,
  the Government's advisory for matrimonial websites, consumer law), and new Grievance Redressal,
  Community Guidelines and Safety, and Refund and Cancellation pages.
- [x] **Marriage only**: "Looking for" (casual, friendship…) is gone from sign-up, the profile, the
  filters and search, and the database keeps every profile at Marriage. The home page and the welcome
  screen say Shaadi24 is for marriage only, not dating.
- [x] **The legal age to marry**: 21 for men, 18 for women, checked in the app and by the database.
  Anyone under it is hidden from everyone and told why (one live profile was).
- [x] **A consent screen** with separate ticks, none ticked in advance: the Terms and Privacy Policy;
  looking to marry, with true details; the legal age; the sensitive details; emails (optional). Each is
  recorded with the internet address it came from, and asked again when the documents change. A profile
  made for a family member needs a tick that they know and agree.
- [x] **The rules every three months**, as the IT Rules now ask.
- [x] **Complaints to the Grievance Officer**, from members and anyone else: a ticket at once and the
  law's deadline (2 hours for intimate images or impersonation, 36 hours for unlawful content, a month
  for payments, 7 days for the rest), an alert for admins, and **Admin → Complaints**. Reports have two
  new reasons (intimate or morphed photos; dowry), and Admin → Reports shows the time left on each. The
  app's menu links Terms, Privacy, Safety and Complaints.
- [x] **What's kept after an account goes**: a registration record for a year, what a ban removes for
  180 days, consents and complaints for 3 years, deleted by a daily job when their time is up.
- [x] Checked: 21 new database checks (135 in all), a new browser test (`tests/e2e/legal-pages.mjs`), the
  consent test extended (updated Terms, the reminder, a man under 21), the other tests updated, and the
  full browser run (28 suites) and the accessibility check (48 screens) passed. Migrations
  `20261006181147_phase10_india_law`, `20261006183822_phase10_india_law_grievances` and
  `20261006185006_phase10_india_law_retention` are applied live; `search`, `send-push` and
  `delete-account` were redeployed.
- [ ] **Owner: the daily clean-up job.** Its migration
  (`supabase/migrations/20261006185100_phase10_india_law_purge.sql`) deletes data, and Supabase's tool
  here waits for a confirmation it can't get, so it isn't live yet. Paste the file into Supabase → SQL
  Editor and run it. Nothing is due to be deleted before April 2027 (a ban's records are kept 180
  days), so there's time, but do it before launch.

Part 12 done 2026-10-07: **a two-minute sign-up, with the rest in My Profile.** Sign-up asked about 70
questions on 8 pages, a written About me and 4 photos before anyone saw a match. Every question was
checked against how Indian families screen matches and what people are comfortable sharing; the
research, with sources: [docs/research/profile-questions.md](docs/research/profile-questions.md).

- [x] **Sign-up is three short steps**: the basics (who the profile is for, name, date of birth, gender,
  interested in, filled in from the gender, marital status, height, where they live), background
  (religion, mother tongue, highest qualification, occupation) and one clear photo, with five more
  slots that suggest what families like to see (full-length, traditional, everyday, at work, a hobby).
  Photos are saved as they're added, and going back keeps every answer.
- [x] **A pop-up after sign-up**: "Unlock more free searches" lists each section of My Profile not done
  yet, the free search it adds and about how long it takes (a minute or two each), with "Complete my
  profile" (straight to that section) and "Later". It comes back every three days until the profile is
  complete. "Earn free AI searches" in My Profile shows the minutes too.
- [x] **My Profile's sections now fit India**: About you (About me, where you grew up, body type) comes
  first, in place of Appearance; Plans & values replaces Plans & personality. About me is optional now,
  with "Write a draft for me", which turns the member's answers into a few sentences to edit (About my
  family has one too). Gotra, Manglik, rashi and nakshatra get "Don't know" and a hint where to find
  them, and family status a line on what each choice means.
- [x] **Dropped**: complexion and weight were never asked; glasses and contact lenses, hair, eyes,
  tattoos, style, makeup, politics, ethnicity and race, sexuality, sun sign, love language, attachment
  style, dream home, "sex style", therapy and health history, criminal record, COVID vaccine and the
  dating-app filler (phone, car, shopping…) are gone from the profile, the profile others see, the
  search, its scores and the AI. Answers already given stay in members' data ("Download my data") but
  aren't shown, searched or scored; the scores' points moved to the questions still asked.
- [x] Checked: 2 new search unit tests (60 in all), a new database check (136 in all), the sign-up browser
  test rewritten for the three steps, the pop-up and the About me draft, the India-profile, content-filter
  and reset tests updated, the full browser run (28 suites) and the accessibility check (50 screens, the
  pop-up among them) passed. Migration `20261007173707_short_sign_up` is applied live and `search` is
  redeployed.

Part 13 done 2026-10-07: **support can correct a date of birth.** A member under the legal age sees
"Shaadi24 is for 21 and over" and is asked to write to support if the date is wrong, but support had
no way to change it, and the member could still change it through the API.

- [x] **Admin → Users → Date of birth**: after seeing an ID that shows the date, an admin enters it with
  a note on how it was checked, which goes in the audit log. A date under the legal age is refused. A
  profile hidden only because of the age is visible again; one the member paused stays paused. Each
  row now shows the gender, the date of birth and "Under 21" or "Hidden" where they apply.
- [x] **Only support changes it**: an account under the legal age can no longer change its own date of
  birth, typed age or gender, so typing an older year doesn't let someone in.
- [x] Checked: 10 new database checks (146 in all) and the admin browser test extended (an under-age
  member, a refused date, a corrected one, the audit note); the consent, India-profile and sign-up
  tests pass, and the accessibility check now covers Admin → Users and the pop-up (54 screens).
  Migration `20261007213718_admin_correct_date_of_birth` is applied live. It adds
  `admin_find_users()` beside `admin_search_users()` instead of replacing it, so nothing is dropped.

Part 14 done 2026-10-07: **light or dark follows the phone.** On a phone in light mode the app could
open dark, and switch only after a tap.

- [x] Signed out (the welcome and sign-in screens), the app always follows the phone. Before, it kept
  whatever the last account had picked, on the phone.
- [x] When the phone switches between light and dark, the app switches at once. Before, it waited for
  the next tap.
- [x] Signed in, it follows the phone until the member picks Light or Dark in Settings → Appearance,
  where **Automatic** (the phone's mode) now comes first. A pick is kept on the account.
- [x] Checked: a new browser test (`tests/e2e/theme.mjs`, 21 checks; the old code fails its first
  ones), the Android, iPhone, Settings and accessibility tests.

Part 15 done 2026-10-07: **Find Match's start screen fits the phone.** It scrolled on an iPhone, with a
scrollbar on the right: a large sparkle and title, then seven full-width suggestions, one per row.

- [x] Smaller title and sparkle on phones (no sparkle on short screens), and shorter suggestions, two to a
  row and centred ("Matches near me", "Online now"…; each is understood as the longer one was). Nothing
  to scroll on an iPhone SE, 15 or 15 Pro Max or a 360-wide Android, with the profile banner showing;
  results still scroll.
- [x] The iPhone test checks the start screen fits; the Android, Settings, popup and accessibility tests
  pass.

Part 16 done 2026-10-08: **a new app icon: a silver solitaire ring with a pale blue diamond, on
white**, like the 💍 iPhones show. The icon was a white ring outline on a pink-to-orange square.

- [x] The ring is a picture made for Shaadi24 (`scripts/assets/ring.png`; `scripts/assets/README.md`
  says how). Apple's own 💍 picture can't be used: Apple's emoji pictures may only be shown as text
  on Apple's devices.
- [x] It's the iPhone icon, the Android icon (round, squircle or square, whatever the phone uses, with
  all of the ring inside; the single-colour themed icon on Android 13+ is its outline), Google Play's
  icon and feature graphic, and the website's icons and link preview.
- [x] Launch screens: the ring on white, or on the app's dark grey when the phone is in dark mode.
- [x] `scripts/store-graphics.mjs` makes every image from that one picture.

Part 17 done 2026-10-08: **sort Find Match's results, and the Online filter shows as a chip.**

- [x] A **Sort** button just above the first result: best match first (as before), lowest match first,
  online now first, verified first, youngest or oldest first. And a **match level**: top matches,
  middle or lower matches (about a third of the results each, by match score, with the scores each
  covers and how many), or any match. The count beside it says how many show ("17 of 50").
- [x] **"Online Now" on its own now shows an "Online now" chip** under the search box, with Clear all,
  and the filter button counts it. Before, the chips counted every filter but Online, so with only
  Online on there was no chip to take it off (with Verified as well, both showed).
- [x] Every active filter now has its chip, the filter panel's too (religion, age, height, state…);
  before, those showed only Clear all. Screen readers hear how many are on ("Open filters, 1 on"), as
  the button's badge shows.
- [x] The quick filters (Online Now, Verified Only, Has Instagram, Has LinkedIn) narrow the results on
  screen at once. Before, they did nothing until the next search, which used up one of the day's
  searches. Taking one off, or a change in the filter panel, asks to search again; if nobody left
  matches, "Show all" brings the results back.
- [x] Tests: `tests/e2e/search-sort.mjs` (a phone screen, light and dark), and the search, filter,
  Android, iPhone and accessibility tests again.

Part 18 done 2026-10-08: **Shaadi24+ in black and white, and its pop-up floats.** On a phone the
Shaadi24+ pop-up ran to the screen's edges, under an orange-to-pink header.

- [x] The pop-up is a frosted-glass card with round corners, clear of the screen's sides and bottom,
  in black and white (white and black in dark mode): a black ⚡ tile, black ticks, the chosen plan
  outlined in black, a black Subscribe button.
- [x] The rest of Shaadi24+ matches: its badges and buttons were yellow-to-orange (the Super Like and
  Shaadi24+ badges, the locked compatibility report, Likes You's banner, the filter panel's locks,
  Settings, Standouts, the menu's "Get Shaadi24+", which was blue). Colours that say something stay:
  green for online and verified, yellow for a pending verification, red for errors.
- [x] "Pro" and "Upgrade to Pro" now say Shaadi24+ and "Get Shaadi24+".
- [x] The iPhone test checks the pop-up floats clear of the sides with round corners and no colour
  gradient; the purchases, pop-up, accessibility, Android and website tests pass.

Part 19 done 2026-10-08: **Shaadi24+ for a week, a month, 3 months or 6 months, on a page like the
dating apps' own.** It offered a month or a year in a small pop-up.

- [x] Four plans side by side, sliding sideways on a phone: 1 week (₹349, now ₹499: Part 20), 1 month (₹999), 3 months
  (₹1,999) and 6 months (₹2,999). Each card shows the full price first, the price a week under it
  ("₹154/wk") and what it saves on the week's price ("Save 56%"); 3 months is chosen to start with, and
  the button says what you get and what it costs ("Get 3 months for ₹1,999.00", or the free trial). The
  full price stands out more than the price a week, as App Review asks (guideline 3.1.2).
- [x] A full-screen dark page on a phone (a card on a wide screen): a black-and-white photo of a couple's
  hands with the headline, the plans, "What you get" with an icon for each, and the button with the
  store's terms, Terms of Use, Privacy Policy and Restore purchases kept at the bottom.
- [x] The plans come from the stores: each one shows once it's set up in App Store Connect or Play
  Console (`shaadi24_plus_weekly`, `_monthly`, `_quarterly`, `_halfyearly`; base plans `weekly`,
  `monthly`, `quarterly`, `halfyearly`; docs/store/README.md). The yearly plan is no longer sold.
- [x] Database: the new plans, and the Finance tab counts each plan for a month in its monthly revenue
  (`supabase/migrations/20261008122539_shaadi24_plus_more_plans.sql`, applied live).
- [x] The Terms and the Refund page list the new plans and prices (Terms `terms-v7-2026-10-08`, so
  members accept them again).
- [x] Tests: buying on Android and iPhone with the store stand-ins (four plans, the prices, the savings,
  3 months chosen first, the trial), the iPhone layout, the App Store check (`scripts/store-check.mjs`
  looks for all four), and the pop-up, accessibility, Android, website, legal and consent tests.
- [ ] **Owner:** in App Store Connect, add `shaadi24_plus_weekly`, `shaadi24_plus_quarterly` and
  `shaadi24_plus_halfyearly` to the "Shaadi24+" group next to `shaadi24_plus_monthly`, all on one level,
  and delete `shaadi24_plus_yearly`; in Play Console, the four base plans. Then Actions → App Store check.

Part 20 done 2026-10-08: **Prices that get cheaper the longer you take, with the saving in rupees.**

- [x] The week is now ₹499 (was ₹349; ₹449 at first, then ₹499 as set in App Store Connect): ₹499 a
  week, ₹999 a month, ₹1,999 for 3 months, ₹2,999 for 6 months, so each plan costs 54%, 69% and 77%
  less a week than the week (docs/store/README.md, "Shaadi24+ prices", with why, and what's left after
  GST and the stores).
- [x] Under the plans, what the chosen one saves: "You save ₹998" and "₹1,999 instead of ~~₹2,997~~
  (₹999 a month for 3 months)"; for a month, ₹268 a week less than the week's price. Worked out from the
  store's prices, so it's right in any currency.
- [x] The Terms and Refund page show the new price (Terms `terms-v9-2026-10-08`), and `billing_plans`
  has it (`supabase/migrations/20261008131919_shaadi24_plus_weekly_price.sql` and
  `…_shaadi24_plus_weekly_499.sql`, applied live).
- [x] The App Store check also compares each India price with the Terms (and reads a price change set to
  start later), and says when the subscriptions are split across groups or one the app doesn't sell is
  still there (`shaadi24_plus_yearly`).
- [x] **Owner:** App Store Connect has all four in the "Shaadi24+" group, with their names, descriptions
  and prices (₹499, ₹999, ₹1,999, ₹2,999); yearly is gone.
- [ ] **Owner:** a review screenshot for each of the four (the Shaadi24+ page in TestFlight); then they
  are "Ready to Submit" and the app offers them. In Play Console, the base plan `weekly` at ₹499.

Part 21 done 2026-10-08: **A plain Shaadi24+ page in the app's own colours.**

- [x] Light in light mode and dark only in dark mode (it was always dark), as a card over the blurred
  page that stays clear of the screen's edges, like every popup.
- [x] Simpler: the 💍 Shaadi24 logo on top instead of the lightning bolt, no photo, the plans in a list
  (each with its price, the price a week and what it saves), a short "What you get" checklist, and the
  button with the store's terms at the bottom.
- [x] Tests: the iPhone test checks a white card in light mode and a dark one in dark mode, the logo, no
  photo and no colour; the purchase, popup and accessibility tests pass in both.

Part 22 done 2026-10-08: **The admin panel, part 1: a sidebar, Customers and verification checks.**

- [x] Sections in a sidebar on the left, Notion-like (a wrapping row of buttons on a phone): Overview;
  People: Customers, Verification; Safety: Reports, Complaints; Business: Finance; System: Errors,
  Audit log, App preview. Each section has its title and what it's for.
- [x] **Customers** (it replaces Users): every member in one row with everything about them (phone,
  gender, age and date of birth, who the profile is for, marital status, height, location, religion,
  community, mother tongue, education, occupation, income, joined, last active, how they sign in, their
  phones, verification, plan and renewal, how complete the profile is, photos, likes sent and received,
  matches, messages, reports, blocks, status). The name stays in view while the row scrolls sideways.
  Search by name, email, phone, city or ID; filters (new this week, Shaadi24+, free, verified, waiting
  for verification, not verified, profile not complete, inactive 30 days, paused, banned); sorting;
  50 to a page; Export CSV. A row opens the member, grouped, with Verify, Date of birth, Ban or Unban
  and Copy ID (`admin_customers()`).
- [x] **Verification**: each request says whether it's likely to pass, and why: two working profile
  links (a post or another site doesn't count), their name in a link, photos, sections complete, how
  long ago they joined, a confirmed email or Apple/Google sign-in, reports, blocks, earlier rejections,
  and links another member has given too (`admin_verification_signals()`, `lib/verificationChecks.ts`).
- [x] **Audit log**: every admin action, newest first.
- [x] Database: `supabase/migrations/20261008160000_admin_customers_and_verification_checks.sql`
  (applied live); both for admins only, refused to anyone else.
- [x] Tests: `admin-tabs` (the sidebar, Customers with 50 to a page and every column, search, a member
  under 21 corrected from the member panel, the Audit log, a request unlikely to pass and why), and the
  accessibility, admin alerts, app preview, website, finance, errors and complaints tests.

Part 23 done 2026-10-08: **The admin panel, part 2: Profiles, Messages, Offers and Enquiries.**

- [x] **Profiles** (People): how much members have filled in (by quarters and by sections complete),
  each section's complete and not complete, and the 15 answers most often missing. Each section has
  **Message them**: a ready in-app message to everyone who hasn't completed it, with a button that
  opens that section in their app ("Fill in Family"), and how many it reaches.
- [x] **Messages** (Growth): in-app messages to a group (everyone, profile not complete, a section not
  complete, not verified, free, inactive 14 or 30 days), with a title, text, a button (a section of My
  Profile, My Profile, Get verified, Shaadi24+, Find Match, or none), optionally as a notification too,
  and a preview. Sent messages show how many got, saw and tapped each. In the app, the newest one
  shows as a card until it's tapped or put off ("Not now").
- [x] **Offers** (Growth): a code from App Store Connect (offer codes) or Play Console (promo codes),
  with banner text, the stores and dates. The home page shows the running one in a banner with the
  code (tap to copy) and the stores' redeem links; the Shaadi24+ page has "Have an offer code?".
- [x] **Enquiries** (Inbox): a contact form on the website's Support page (a few a day from one
  address); the inbox lists them newest first with a count in the sidebar, Reply by email (quoting it),
  notes, Close and Reopen; a new one alerts the admins.
- [x] Database: `supabase/migrations/20261008170000_admin_profiles_messages_enquiries_offers.sql`
  (applied live): admins only, except the contact form (anyone) and the running offer (anyone reads).
- [x] Tests: `admin-growth` (a Family message from Profiles reaching a member, its card opening Family,
  seen and tapped; the contact form landing in Enquiries and closed; an offer on the home page with its
  redeem links, and gone when turned off; visitors refused), and accessibility (the new screens).

Part 24 done 2026-10-08: **The admin panel, part 3: the Blog.**

- [x] **Blog** (Growth): every post (published, scheduled, drafts) with its visits; **New post** opens
  an editor like Notion's: the title, the text in Markdown with a toolbar (headings, bold, lists, a tip,
  links, pictures), Write and Preview, and on the right, like WordPress: publish now or on a date,
  unpublish, delete; the address, excerpt, tags and author; a cover picture (uploaded, 1200 × 630) and
  its description; the search title and description with counters, the search phrase, a Google
  preview, "hide from search engines", and a check list of 12 SEO points (the phrase in the title,
  description, first paragraph and address; lengths; 600+ words; headings; a cover; a link; an
  excerpt).
- [x] **AI writing** with Gemini (the same free key as search, `blog-ai` function, admins only):
  **Ideas** suggests posts people search for; **Write with AI** drafts a whole post from a topic,
  search phrase, reader, tone and length (title, address, text, excerpt, search fields, tags, a cover
  description); **Fill search fields** writes them for what's written; **Rewrite selection** improves a
  passage ("clearer", "shorter", "warmer", or anything). The house style: Indian English, respectful of
  every community, no invented facts or statistics, Shaadi24 mentioned at most twice.
- [x] **The website's blog**: `/blog` (newest first, a featured post, topics) and `/blog/<slug>` (cover,
  contents, the post, tags, sharing to WhatsApp, Facebook and X, where to get the apps, more posts),
  light and dark, with "Blog" in the header and footer.
- [x] **Found by search engines and link previews**: a Vercel function (`api/blog.ts`) sends each blog
  page with its own title, description, canonical address, Open Graph picture and schema.org
  `BlogPosting`, and the post as plain HTML for crawlers that don't run JavaScript; `/sitemap.xml` (the
  website's pages and every post), `/blog/feed.xml` (RSS) and `/robots.txt`.
- [x] Database: `supabase/migrations/20261008180000_blog.sql` (applied live): posts readable by anyone
  once published and their date has come, written by admins only; publishing, unpublishing and
  deleting in the audit log; visit counts; a public "blog" picture bucket only admins add to.
- [x] Tests: `admin-blog` (the whole flow above, with a Gemini stand-in), `scripts/blog.test.mjs`
  (Markdown, the server's pages, sitemap and feed), `blog-ai/writer_test.ts`, and accessibility (the
  blog, a post, the admin list, editor and AI draft).

Part 25 done 2026-10-08: **The admin panel, part 4: safety, insights, automatic messages and the team.**

- [x] **Moderation** (Safety): a photo a member adds, and what they write about themselves and their
  family, wait for an admin. Until then other members see the profile without that photo and with the
  text as it was; the member sees "under review" on their own profile. Approved, it shows; rejected,
  the photo comes off or the text goes back, and the member gets a message with the reason and a
  button to fix it. "Show first, review after" shows everything at once and keeps the queue. Each
  photo is fingerprinted in the admin's browser, so the same photo on another account shows next to it.
  New items notify the admins who moderate.
- [x] **Scam alerts** (Safety): members who look like scammers or fake profiles, from what they do: the
  same photo as another account, money or investment talk in chats, one message pasted to many people,
  likes by the dozen, reports from several members, a banned member back with a new account. Open the
  member, ban them, or mark it reviewed (it comes back if something new happens).
- [x] **A member's timeline** (Customers → a member → Timeline): everything they did and what was done
  about them, newest first, by day: searches, likes, matches, chats (a count, never the text), photos
  and text and their review, reports, blocks, complaints, verification, Shaadi24+, messages from the
  team. "Safety" shows reports, blocks and
  verification only.
- [x] **Growth** (Insights): members and who is active (today, 7 and 30 days); how far new members get
  in 8 steps (joined → profile → photo → verified → liked → matched → messaged → paid); sign-ups and
  active members a day (hover for the numbers, or see them as a table); members by city, community,
  religion, gender and age. For 7, 30 or 90 days.
- [x] **Search insights** (Insights): searches a day, the words and searches typed most, the searches
  that found no one (what members want and don't find), and the filters used. Never who searched.
- [x] **Success stories** (Growth): couples who met on Shaadi24, published only with both partners'
  consent written down; on the website's home page and `/stories`. The contact form has "Our success
  story" for couples to send theirs.
- [x] **Automatic messages** (Growth): messages that send themselves, in the app and as a notification
  (to members who left notifications on), every hour from 9 in the morning to 9 at night India time:
  a welcome, nudges for a photo, an unfinished profile and verification, and for members not seen for
  a week or a month. Each can be turned off and reworded, shows how many it's due for now, sent, seen
  and tapped; "Send now" sends to those due at any hour. One a day at most to any member. **They are on
  from the start**; turn any off in Admin → Automatic messages.
- [x] **Team** (System, owners): add an admin by email with a role (Owner; Moderator; Support; Content;
  Finance), change it, remove them. Each role sees only its sections, and the database enforces it
  (`admin_can()` in every admin function and access rule); admin alerts go only to admins whose role
  covers them. Only owners have the team, the audit log and "Shaadi24+ for everyone".
- [x] **Two-step sign-in** for admins: an authenticator app (Google Authenticator, Microsoft
  Authenticator, 1Password…; scan the QR code, then the 6-digit code). Anyone can set it up on the
  Overview or Team; once set up, the admin panel asks for the code after signing in. An owner signed in
  with it can **require it for every admin**: then the admin functions refuse a session without it,
  and admins without one are asked to set it up first. A lost phone: an owner resets that admin's
  (which signs them out everywhere).
- [x] Bugs fixed on the way: admin alerts for enquiries went to the wrong Android channel; Verification
  and Reports counts in the sidebar only loaded on the Overview; Admin → Messages notified members who
  had turned notifications off; a member who changed a rejected photo was told twice; two quick clicks
  on "Set up" for two-step sign-in failed.
- [x] Database: `20261008190000_moderation_and_risk.sql`, `20261008200000_admin_insights_and_stories.sql`,
  `20261008210000_automatic_messages.sql`, `20261008220000_admin_roles_and_two_step.sql` (applied live).
  The Privacy Policy says photos and text are checked before others see them, and how scam checks
  work (members accept it again, v13).
- [x] Tests: `admin-safety` (moderation, fingerprints, scam alerts), `admin-insights` (timeline,
  growth, search insights, success stories), `admin-team` (roles, two-step sign-in with codes worked
  out like an authenticator app's, automatic messages), and the rest of the regression.

Part 26 done 2026-10-08: **Search limits, like Claude's.** Every AI search costs us an AI call, and
Shaadi24+ searches were unlimited. Now every search counts toward three limits, each with its own
reset, and a search goes ahead only while none is used up:

| | Every 5 hours | A day | A week |
|---|---|---|---|
| Free | 3 | 3, plus 1 for each profile section completed (up to 9) | 30 |
| Shaadi24+ | 15 | 50 | 200 |

- [x] **The 5 hours** start with a member's first search after their last 5 hours ended (like
  Claude's). **The day** runs midnight to midnight India time (it was midnight UTC). **The week** starts
  every **Friday at 6 pm India time**.
- [x] Find Match says how many are left and until when, in the phone's own time ("2 searches left until
  4:12 pm", "3 searches every 5 hours", "1 search left today"), and when one is used up, "Out of
  searches until Friday at 6:00 pm". A search then opens a pop-up saying which limit ("You've used
  today's searches") and when the next search can be; free members are offered Shaadi24+ (and, for the
  day's, completing their profile); Shaadi24+ members aren't sold what they have. History's re-run
  follows the same limits.
- [x] **Settings → Shaadi24+** shows each limit like Claude's usage page: how many are used of how many,
  a bar, and when it resets.
- [x] The server keeps the counts and decides (`search_allowance()`, called by the `search` function);
  the search answers with all three after each search, and with which one stopped it (429).
- [x] **Admin → Search insights → Search limits**: the numbers for free and Shaadi24+, and the hours;
  owners change them (an empty box is no limit; Shaadi24+ below free is refused; in the audit log),
  the rest of the team sees them. Also: how many members searched this week, and how many a limit
  stopped in the last 7 days, by which limit.
- [x] Shaadi24+ is no longer "unlimited searches": the pop-up's list, My Profile, Help, the Terms
  (clause 9: limits every few hours, a day and a week, shown in Settings; Shaadi24+ has higher ones;
  we tell Shaadi24+ members before lowering theirs; members accept it again, `terms-v10`) and the store
  texts (`docs/store/README.md`) say "more AI searches".
- [x] Database: `20261008230000_search_limits.sql` (`search_limits`, `search_usage`, three settings in
  `app_settings`). `profiles.daily_search_count` still counts the day, for Admin → Customers.
- [x] Tests: `search-limits` (the 5 hours, the day, the week and its Friday 6 pm start, the pop-ups,
  Settings on a computer and a phone, Shaadi24+, the admin card for an owner and a Content admin, and
  that no member or visitor can read or use anyone's counts), unit tests for the words
  (`scripts/search-limits.test.mjs`, `supabase/functions/search/limits_test.ts`), and the rest of the
  regression.
- [ ] **Owner:** change the four subscription descriptions in App Store Connect and Play Console to
  the new ones in `docs/store/README.md` ("More AI searches, unlimited likes, …"), and the store
  listings' Shaadi24+ paragraph.

Part 27 done 2026-10-09: **Change plan.** Settings → Shaadi24+ had only "Manage subscription", which
opens the store; there was no way to move to another plan in the app.

- [x] **Change plan** next to Manage subscription, for a subscriber in the app of the store that bills
  them: the four plans with theirs marked "Your plan", the next longer one chosen to start with, what it
  saves, when the change happens, and the store's terms.
- [x] Buying another of the plans is how both stores change a plan, and neither charges twice:
  - **App Store**: the plans are on one level, so a plan of another length starts when the current one
    renews and is charged then; until then Settings says "Switches to 3 months on 8 Apr 2027" (from the
    App Store on the phone).
  - **Google Play**: the plans are base plans of one subscription, so Google switches the plan with
    the subscription's default replacement mode; the server closes the old purchase.
- [x] Tests: `app-purchases` changes plan on both stores (the store stand-in now has Apple's
  change at the next renewal).
- [ ] **Owner:** in Play Console, set the `shaadi24_plus` subscription's default replacement mode to
  "Charge at the next billing date" (`docs/store/README.md`, Google Play step 4).

Part 28 done 2026-10-09: **Profile answers in one tap.** In My Profile some lists opened a drop-down
and others the phone's own picker, and every answer then needed the green tick.

- [x] **Short lists are pills** (14 options or fewer: religion, diet, Manglik, brothers…), like
  Bumble: tap one and it's saved, no tick. Tapping the chosen pill again clears an optional answer
  and keeps a required one.
- [x] **Long lists open a sheet** that slides up from the bottom, like an iPhone's, with a search box
  (mother tongue, caste and sub-caste, height, state, city, education, occupation…): type a few
  letters, tap, saved and closed. Lists that take your own answer (caste, city…) offer
  "Use “…”" for what you typed.
- [x] The answer itself opens the pills or the sheet; the pencil still works. Date of birth, time of
  birth, text answers and the multi-pick lists (languages, hobbies) keep the tick.
- [x] Tests: `india-profile` picks with pills and the sheet; `accessibility` checks the pills and the
  sheet in light and dark.

Part 29 done 2026-10-09: **Liking feels quick.** A liked card faded for 0.7 s, and only after the
app had also reloaded your profile (over a second in all); a like inside an open profile left it open.

- [x] **A liked card bursts into glittering yellow sparkles** and is gone in 0.6 s, as soon as the like is
  saved; the sparkles twinkle for about a second, slow enough to see. The next card moves up into its
  place (the page used to jump back a card). Passing is quicker too (0.3 s). With "reduce motion" on,
  the card just fades.
- [x] **A like inside an open profile closes it**, with the same sparkles, and the person leaves the
  results behind it. In Likes You, liking back from the open profile now shows "It's a Match!" at once.
- [x] **Standouts:** a liked pick leaves today's list (it used to leave an empty space), and the server
  leaves it out when Standouts opens again that day. With all five liked, Standouts says so.
- [x] Tests: `popups` (sparkles, the card leaves, a like in the profile closes it) and `phase8-app`
  (a liked pick stays off Standouts).

Part 30 done 2026-10-09: **Every button tapped, on both phones.** A test robot (`click-through`)
opened the members' app as Android and as iPhone see it and tapped every button it could reach, two
screens deep, checking each did something; `final-steps` taps Report, Unmatch, Block and Delete
account for real.

- [x] **Sign-in sheet:** "Terms" and "Privacy Policy" did nothing; they open the pages now.
- [x] **Menu:** "Chat History" opened Search History; it's called "Search History" now.
- [x] **Chat:** the back, more-options (⋯), propose-a-date (📅) and send buttons have names for
  screen readers.
- [x] **Profiles:** photos are "Photo 1 of 6" (they were "thumb 0"), the one showing marked; the
  full-screen viewer has a name and opens from the keyboard; no tap pointer when there are no photos.
- [x] **Search History:** Searches / Liked profiles are real tabs (screen readers hear which is open).
- [x] **Signing out** in the first 2.5 seconds no longer sends a request without a sign-in.
- [x] Tests: `click-through` (646 taps over both phones, 44 screens and popups, none broken; with
  `phone-standin`) and `final-steps`.

Part 31 done 2026-10-09: **Search in your own language; Biodata and Family Circle.**

- [x] **Trending searches on Find Match:** the pills under the search box are what members near you
  searched in the last 30 days. They come from your city first, then your state, then the country,
  and the heading says which ("Trending in Mumbai"). A search shows only once at least 2 members
  made it and it found people. Searches with numbers, links or bad words are never shown. Until
  there are enough searches, the old examples show.
- [x] **Search in any Indian language:** members can type in Hindi, Hinglish, Tamil, Marathi,
  Bengali and other Indian languages ("Mere liye 6 foot ka ladka dhundho jo London me rehta ho aur
  finance me kaam karta ho"). The AI understands it and says back what it understood in the same
  language. If the AI is busy, the rules-based reader still knows the common words (ladka/ladki,
  saal, foot, sharaab nahi peeta, shakahari, doctor, Tamil words…).
- [x] **My Biodata:** a marriage biodata made from the profile, in 6 languages (English, हिन्दी,
  मराठी, ગુજરાતી, தமிழ், বাংলা) and 3 designs, shared on WhatsApp or saved as an image in one tap.
  Its QR code opens the member's biodata page on the website (`/b/<link>`), which shows what
  members see (hidden fields stay hidden, never contact details) and invites people to get the
  app. The member sees how often it was opened and can turn the link off at any time.
- [x] **Family Circle (Shaadi24+):** invite up to 5 family members by WhatsApp. They open a private
  page (`/family/<link>`, English or हिन्दी, no app needed) with the people the member liked or
  matched with, and react 👍 / 🤔 / 👎 with a note. The member sees each reaction and gets a
  notification. Members can turn off "Show me to members' families" in Settings → Privacy.
- [x] **Admin → Growth:** biodata links shared and opened, and Family Circle invites, visits and
  reactions.
- [x] Terms (section 5) and the Privacy Policy explain biodata links, Family Circle and trending
  searches; members accept the new versions.
- [x] The menu scrolls when it's longer than the screen.
- [x] Tests: `search-languages`, `biodata-family`, and the search function's unit tests for the
  language reader.

Part 32 done 2026-10-09: **Spotlight and Super Interest, bought one at a time.** For members who
won't take a plan, and Shaadi24+ members who want more. Sold in the apps only, through Google Play and
the App Store (consumable in-app products); our server checks every purchase with the store.

- [x] **Spotlight (₹149, 24 hours):** Menu → Spotlight. While it's on, the member is shown first,
  marked ✨ Spotlight, to people searching in their city or state whose search they fit (at least a
  fair match, at most 3 Spotlights at the top of a search). The screen shows the time left, how many
  searches it was shown in and the likes that came in. It starts as soon as it's bought.
- [x] **Super Interest (₹49, or 5 for ₹199):** the ⭐ Super Interest button on a profile. A like with a
  note (up to 200 letters, checked by the word filter) that goes to the top of the other person's Likes
  You and shows who sent it, even if they don't have Shaadi24+, with a notification naming the sender.
  Shaadi24+ includes 3 a week; more are bought in the sheet.
  It replaces the old Super Like: the star next to Like is gone, and the help, the Shaadi24+ page, the
  notification settings and the store listings say "3 Super Interests a week".
- [x] **Likes You:** Super Interests show the sender and the note to everyone; a Spotlight banner.
- [x] **Payments:** a purchase is added once, to the account that bought it; the app finishes it only
  after our server has added it, and sends any it couldn't (no signal, the app closed) when it next opens.
  A payment that goes through later (some UPI and cash payments) is added by Google's notification.
  A refund takes the pack back; a Spotlight that's on ends.
- [x] **Admin → Finance:** a "Spotlight and Super Interest" card (packs sold and refunded, net,
  Spotlights and how they did, Super Interests sent and how many became matches next to ordinary
  likes); packs in the charges list by name; store test purchases kept out of the real figures.
  Members see the pack's name in their own payments (Settings → Shaadi24+).
- [x] Terms (section 9), the Refund policy and the Privacy Policy cover the packs; members accept the
  new versions.
- [x] Store kit: the products to create in Play Console and App Store Connect (docs/store/README.md,
  "Spotlight and Super Interest").
- [x] Tests: `boosts` (both stores, through the stand-in) and the search function's Spotlight ranking.

**Owner:** create the three products in each store (docs/store/README.md, steps 6.4 and 7.4). Until
then the app shows "not on sale yet" and nothing else changes.

On the live database the old Likes You function was set aside rather than deleted (renamed
`get_likes_received_before_notes`, callable by no one). **Owner, optional:** remove it in the SQL Editor
with `drop function public.get_likes_received_before_notes(uuid);`.

Also fixed: the WhatsApp buttons in My Biodata and Family Circle have dark text, readable on the green;
the search-limits test accepts "tomorrow at …" when the 5 hours run past midnight in India.

Link previews (WhatsApp and the rest) and the Google Play feature graphic are in the brand now: white,
the ring with its blue diamond, near-black type and a thin line of the diamond's blue, instead of the old
pink-to-orange (`scripts/store-graphics.mjs`; the image's address has `?v=2`, so apps fetch the new one).

Report and Block, checked end to end: both work (the browser tests `final-steps`, `legal-pages` and
`admin-safety`), and both reach the admin panel. A report goes to Admin → Reports with its deadline,
alerts the admins, and shows in the member's timeline and in Scam alerts once two members report the
same person. A block counts in Customers → "Blocked by", shows in the timeline with its reason (new), and
three blocks in 30 days raise a Scam alert, "Blocked by several members", quoting the latest reason (new;
`20261009160000_blocks_in_admin.sql`). The menus use the sidebar's flat icons instead of emojis: Report
(flag), Block (no-entry sign), Unmatch (broken heart), the "more" button, the Report/Block popup (black
"Submit Report"), the admin panel's ban and report labels, the member timeline and the sidebar's Admin item.

No more emojis in the app, the website or the admin panel: the same flat line icons everywhere
(`constants.tsx`). The 💍 logo is the ring from the app icon (`public/logo.png`, `BrandMark`); missing
photos show a person outline; empty screens, page headers, the date-proposal card and its ideas, the
compatibility report, Help Center, Settings (Automatic/Light/Dark), search (Instagram/LinkedIn filters,
"Understood by AI"), My Profile, toasts, the Spotlight badge, Family Circle reactions (thumbs up, question
mark, thumbs down, with Yes/Maybe/No), the landing page's features and offer banner, and the admin's
verification checks and social links. Kept on purpose: country flags, the biodata's religious symbols and
border, the WhatsApp invite's 🙏, notification titles, and chat messages already saved with an emoji.

Security against fake and repeat accounts, and scammers (`docs/security.md` has the whole picture and
the owner's steps). Throwaway email addresses (9,221 domains) can't sign up. A second account on the
same mailbox (Gmail dots and +tags) can't search. At most 3 accounts on one phone get free searches:
the app sends a scrambled app ID (`@capacitor/device`), and team test accounts are exempt. Admin →
Scam alerts adds a second account on a mailbox, 4 or more accounts on a phone, and a banned member's
phone (`20261010090000_account_guards.sql`, `account_guard()` in the search function). A chat message
asking for money, UPI or bank details shows a safety note with Report (`lib/scamWarning.ts`). The
website sends security headers (HTTPS only, no framing by other sites). The Privacy Policy (v16) and
the store forms mention the phone ID. Found while checking: two migrations were never applied live,
one of them a privacy fix (signing out doesn't stop that phone getting the account's notifications);
both wait for the owner to run them in the SQL Editor.

What members of other matrimony apps complain about (`docs/research/competitor-reviews.md`: 13,707
store reviews of 9 apps, 20 problems), fixed in 5 phases. Phase 1 (done): our promises (no sales
calls, real interests only, chatting free, clear prices) on the welcome screen, the Shaadi24+ page,
the website (with the price list) and the store texts; Undo after sending an interest and Withdraw in
Search History (undone within a minute, nothing is used up); one free "Likes You" a day
(`reveal_like()`); chat notes on "digital arrest" threats and on moving to WhatsApp or a video call
fast, and a scams section on the Safety page; sign-in errors in plain words. Phase 2 (done): "Not
interested" for good, with Undo and Settings → Hidden profiles (`passed_profiles`); nobody inactive
for 60 days in search or Standouts; unanswered interests expire after 14 days (28 for a Super
Interest) and can be sent again; "New" and "Usually replies" on cards (`member_stats`); no repeats in
Standouts for 30 days; "I found my match" in Settings. Phase 3 (done): partner preferences (Standouts
follow them, search starts from them, a daily alert about new members who fit); near misses below few
results; saved searches (up to 10) with a daily alert; "Family from (state)" and "Profile managed by"
filters. Phase 4 (done): the Verified badge needs a selfie doing a gesture we ask for and two photos (links
optional), a turned-down request says why with "Try again"; Settings → My requests (verifications,
complaints, reports, with answers and a message when answered); "An agent or marriage bureau" as a report
reason; "Share my number" in chat; screenshots blocked in the Android app; chat messages can't be changed by
members any more. Phase 5 (done): a message 3 days before Shaadi24+ renews (1 day for the weekly plan) and
before a free trial ends, with the price and where to cancel; "Your week" on Find Match and in a Monday
notification; Settings → Report a problem, answered in Admin → Errors and read in My requests; crash reports
from the apps (Firebase Crashlytics); staged releases and an "Oldest app that still works" switch for a broken
version (`docs/store/README.md`).

**Still to do**

- [ ] Delete the 18 unused prototype files (~4,000 lines). This waits for your OK.
- [ ] Analytics that respect the cookie banner.
- [ ] Separate test and live Supabase projects, with database backups.
- [ ] A proper email service. Sign-up codes and password resets come first (the built-in sender only
  reaches your Supabase team); then the weekly email digest and its Settings switch.
- [ ] Supabase's advisor:
  - `pg_net` sits in the public schema. Moving it means reinstalling it, which the send-push cron
    job uses.
  - **Owner:** turn on leaked-password protection: Authentication → Sign In / Providers → Email
    ("Prevent use of leaked passwords"; Pro plan and above).

  Fixed in Phase 13 and above: access rules re-checking the user on every row, unindexed foreign
  keys, overlapping rules, `is_admin()` callable signed out. Expected, so no change needed:
  - "signed-in users can run SECURITY DEFINER functions": each of those functions checks who is
    asking;
  - "signed-out visitors can run `report_error`": on purpose, so errors before sign-in are reported
    too. It only adds to the error table, within its limits, and returns nothing;
  - "signed-out visitors can run `submit_grievance`": on purpose, as anyone may complain to the
    Grievance Officer (IT Rules 2021, rule 3(2)). It only adds a complaint, within its limits (5 a day
    from one email address, 10 from one internet address);
  - "RLS enabled, no policy" on the tables only the server uses.
- [ ] **Owner:** what [docs/legal/README.md](docs/legal/README.md) asks of you before launch: registering
  as a sole trader in Germany (chosen 7 October 2026; no Indian company is needed, and a UG only if Apple
  asks for a company), the operator's full legal name and address, the Grievance Officer's name and
  phone, working mailboxes, CERT-In, keeping logs for 180 days, the trade mark. Then a lawyer's review
  (its "For the lawyer" list). (The mobile and accessibility check is done: Phase 10, part 5.)

## Phase 11 — Payments (Shaadi24+ via Razorpay) — dropped 2026-10-05
Built 2026-09-27 for the website, but never switched on. On 2026-10-05 you decided Shaadi24+ is sold
only in the apps, through Google Play and the App Store (Phase 13), so Razorpay was removed (Phase 10,
part 3). What it set up stays, for the store subscriptions:

- [x] Prices as in the Terms: ₹999 a month or ₹9,999 a year (17% less), renewing automatically; a
  free trial when the store offers one
- [x] What Shaadi24+ adds, as enforced by the server: unlimited AI searches (free: 3 a day), unlimited
  likes (free: 15 a day), Super Likes, refreshing Standouts; plus the Likes You list
- [x] "Get Shaadi24+" in the sidebar ("Shaadi24+ active" on Pro accounts)
- [x] Pro follows the subscription with a 3-day grace, and an hourly job ends lapsed Pro. Pro given by
  hand is never touched
- [x] Every Shaadi24+ check follows one rule, on the server and in the apps (Phase 10, part 2)
- [ ] **Owner:** decide when to start charging, then turn off "Shaadi24+ for everyone" in Admin →
  Dashboard. It needs no app release

---

## Phase 13 — The phone apps, ready for Google Play and the App Store
Started 2026-10-03. The apps sell Shaadi24+ through the stores (their rules for digital subscriptions),
and since 2026-10-05 only the apps sell it. Every subscription and charge lands in the same tables, so
the money is in one place.

### Payments on the server (done 2026-10-03)
Migration `20261003203818_phase13_store_billing` (applied live); edge functions `store-billing` and
`store-notifications` (new), `billing`, `razorpay-webhook` and `delete-account` (redeployed).

- [x] Store products: Play Console subscription `shaadi24_plus` with base plans `monthly` and `yearly`;
  App Store `shaadi24_plus_monthly` and `shaadi24_plus_yearly` (in `billing_plans`)
- [x] The app reports a purchase; the server checks it with Google (Play Developer API) or by Apple's
  signature (the chain up to Apple's root certificate), saves it and turns Pro on. A purchase belongs to
  the account the app tagged it with, so it can't be passed to someone else. "Restore purchases" too
- [x] The stores' notifications keep it current: renewals (each a charge), renewal turned off and on,
  grace period (Pro stays), on hold and billing retry (Pro off), recovered, expired, refunds and
  revocations, changes of plan. Each delivery is handled once; old news never undoes newer news
- [x] Finance record for every seller: what was paid, the store's fee (its 15% commission, estimated;
  `STORE_FEE_PERCENT_*`), refunds (whole or part), net; real money and tests kept apart. People see
  their own payments but not the fees
- [x] For the admin Finance tab: `admin_finance_summary()` (subscribers by seller and plan, monthly
  recurring revenue, cancellations, 12 months of gross / refunds / fees / net by seller) and
  `admin_list_payments()` (every charge with who paid, for the list and CSV export). Admins only
- [x] Deleting an account stops its Google Play renewal; an App Store one can only be cancelled by the
  person, which the app asks them to do first
- [x] Tests: 13 unit tests (`_shared/stores_test.ts`, including Apple's real root certificate), and checks
  against a Google Play / App Store stand-in (`tests/e2e/store-billing.mjs`, `store-standin.cjs`)
- [ ] **Owner, Google Play** (once the app is in Play Console):
  1. Monetize → Subscriptions: create `shaadi24_plus` with base plans `monthly` (₹999, renews monthly) and
     `yearly` (₹9,999, renews yearly); optionally a 7-day free-trial offer on each for new customers
  2. Google Cloud console: a service account with a JSON key. Play Console → Users and permissions →
     invite its email with "View financial data" and "Manage orders and subscriptions"
  3. Supabase → Edge Functions → Secrets: `GOOGLE_PLAY_SERVICE_ACCOUNT` (the whole JSON key file) and
     `GOOGLE_RTDN_SECRET` (a long random string you make up)
  4. Real-time developer notifications: a Pub/Sub topic (give
     `google-play-developer-notifications@system.gserviceaccount.com` the Publisher role on it) with a push
     subscription to `https://fmrbzzdjtarsaqvfukum.supabase.co/functions/v1/store-notifications?provider=google&secret=<GOOGLE_RTDN_SECRET>`;
     then Play Console → Monetization setup → that topic → "Send test notification"
- [ ] **Owner, App Store** (once the app is in App Store Connect):
  1. Agreements, Tax and Banking: the Paid Apps agreement, bank and tax details (needed to sell anything);
     join the App Store Small Business Program (15% commission instead of 30% in the first year)
  2. Subscriptions: a group "Shaadi24+" with `shaadi24_plus_monthly` (₹999) and `shaadi24_plus_yearly`
     (₹9,999); optionally a 1-week free trial as the introductory offer
  3. App Information → App Store Server Notifications → Version 2, for production and sandbox:
     `https://fmrbzzdjtarsaqvfukum.supabase.co/functions/v1/store-notifications?provider=apple`
- [ ] The stores' payout reports are the final word on fees and tax; the finance figures estimate the
  stores' fees at 15% (set `STORE_FEE_PERCENT_GOOGLE_PLAY` / `STORE_FEE_PERCENT_APP_STORE` if yours differ)

### Buying Shaadi24+ inside the apps (done 2026-10-03)
- [x] In the apps, Shaadi24+ opens Google's or Apple's own payment sheet at the store's price (in the
  person's currency). The purchase carries the account's id, and the server checks it
  with the store before Pro turns on. Shaadi24+ belongs to the account, so it works on both phones
- [x] Next to the button, what the stores require: length and price, that it renews until cancelled,
  where to cancel, Terms of Use and Privacy Policy, Restore purchases. On iPhone the free trial shows
  when the App Store offers one
- [x] Closing the payment sheet changes nothing; a payment still going through (some UPI and cash
  methods, Apple's Ask to Buy) says Shaadi24+ turns on once it does; a plan already bought is restored
- [x] The app catches up with the store when it opens (at most every 6 hours) and in Settings; on
  iPhone, renewals and refunds the App Store delivers while it runs are passed on to the server
- [x] Settings → Shaadi24+: which store bills it, trial / renewal / end dates, payment problems, Manage
  subscription (opens the store's own page), payments with refunds, Restore purchases
- [x] Deleting an account warns first that an App Store subscription keeps charging until the person
  cancels it (with a button to do it); Google Play renewals are stopped; a website one is cancelled
- [x] Terms (`terms-v2-2026-10-03`) and Privacy Policy (`privacy-v5-2026-10-03`) cover buying in the
  apps; "Download my data" now includes subscriptions and payments
  (`20261003211748_phase13_export_billing`, applied live)
- [x] Tests: `tests/e2e/app-purchases.mjs` (30 checks, both phones), plus the Android, iPhone, popup
  and website billing tests again
- [ ] Free trials on Android: the purchase plugin uses the first offer Google lists for a plan, so a
  free-trial offer in Play Console may or may not be used (Google's sheet always shows the real terms).
  Leave it out on Google Play for now, or have the plugin patched to pick the trial (a small change to
  its Android code)

### Admin Finance tab (done 2026-10-03)
Admin → Finance. Migration `20261003214808_phase13_finance_india_months` (applied live).

- [x] Subscribers now (paying and on free trial, by store and plan), monthly recurring revenue, how
  many won't renew, how many ended in the last 30 days
- [x] This month's net, paid and store fees (last month's net beside it), and net since launch
- [x] Net revenue by month, stacked by seller (Google Play, App Store, website), for 6, 12 or 24
  months: hover, tap or use the arrow keys for a month's figures; the same numbers as a table. The
  colours are checked for colour blindness in light and dark mode
- [x] Every charge: date, customer, seller, plan, order id, amount, fee (marked when estimated),
  refund, net and status; by seller and month (picking a month on the chart lists its charges), with
  rupee totals; 50 at a time
- [x] Export CSV of the charges shown (any number): amounts in rupees, dates in India time, ready for
  the accounts. In the phone apps it opens the share sheet (Save to Files, Drive, email…)
- [x] Live money and test purchases kept apart. Months now run by India time (a payment at 00:30 on the
  1st counts in that month, not the one before); a failed charge nets ₹0; charges in other currencies
  are noted apart from the rupee figures
- [x] Tests: `tests/e2e/admin-finance.mjs` (56 checks: every figure, the chart by mouse, keyboard and
  touch, filters, the CSV, phone width, dark mode, the Android share sheet, non-admins refused)

### Notifications on Android and iPhone (done 2026-10-04)
Migrations `20261004094057_phase13_phone_notifications` (applied live) and `20261004094100_phase13_phone_notifications_signout` (see below); `send-push` redeployed (and
`store-billing`, `store-notifications`, `delete-account`: the Google sign-in they share).

- [x] The apps get notifications through Firebase Cloud Messaging (FCM): on Android directly, on
  iPhones through Apple's push service. New matches, messages (never what was written) and
  super-likes, as on the website; one notification per chat, replaced as new messages come
- [x] The app offers to turn them on (once; "Not now" waits two weeks) before the phone's own
  question; Settings → "Notifications on this phone" turns them on and off; if they're blocked in
  the phone's settings it says where to allow them. No token is made before someone says yes
- [x] Android channels people can switch off separately: Messages, Matches, Likes; the ring as the
  status-bar icon, in the brand orange
- [x] While the app is open a notification shows as a toast (not for the chat on screen); tapping
  one opens its chat, or Likes You, also when it launched the app
- [x] A phone belongs to whoever is signed in on it; signing out takes it off. An account keeps its
  10 most recent phones. Phones that are gone are removed; busy ones are retried, then skipped
  until the app signs them up again. Notifications over a day old aren't sent; the queue keeps a week
- [x] Privacy Policy `privacy-v6-2026-10-04` names Firebase Cloud Messaging and Apple's push
  service; "Download my data" lists the phones and browsers notifications go to
- [x] Also fixed: if Google refused our own sign-in (a wrong or revoked key), a Google Play
  purchase was reported as invalid and its store notification acknowledged and lost; now it's
  "try again" and the notification is retried. A token Google stops accepting is replaced
- [x] Tests: `tests/e2e/phone-push.mjs` (43 checks, server, with an FCM stand-in in
  `store-standin.cjs`), `tests/e2e/app-notifications.mjs` (29 checks, both phones), 3 unit tests
  (`_shared/fcm_test.ts`), and the store, purchase, Android, iPhone and popup tests again
- [ ] **Owner, one approval**: the second migration (`…_phone_notifications_signout`: signing a phone
  out, the 10-phone limit, clearing the queue weekly) deletes rows, so Supabase's connection asks
  you to approve it, and it timed out while you were away. Say "apply the notifications sign-out
  migration" and approve the prompt, or paste the file into Supabase → SQL Editor → Run (it is safe
  to run twice). Until then, signing out still drops the phone's token, and the server removes
  dead tokens when it next sends
- [ ] **Owner, Firebase** (one project for both apps; free):
  1. [console.firebase.google.com](https://console.firebase.google.com) → Add project (no Analytics
     needed). Add an Android app with package `com.shaadi24.app` → download `google-services.json`
     into `android/app/`. Add an iOS app with bundle ID `com.shaadi24.app` → download
     `GoogleService-Info.plist`, and in Xcode drag it into the App folder (tick "App" under targets),
     or, with no Mac, paste its text into the GitHub secret `FIREBASE_IOS_CONFIG`: the TestFlight
     build adds it
  2. Apple Developer → Certificates, Identifiers & Profiles → Keys → + → "Apple Push Notifications
     service (APNs)" → download the .p8 key (note its Key ID and your Team ID). Firebase → Project
     settings → Cloud Messaging → Apple app configuration → upload it
  3. Firebase → Project settings → Service accounts → Generate new private key. Supabase → Edge
     Functions → Secrets → `FIREBASE_SERVICE_ACCOUNT` = the whole JSON file
  4. Build both apps again (`npm run build:android`, `npm run build:ios`). In Xcode, Signing &
     Capabilities shows Push Notifications and Background Modes → Remote notifications (already
     set up in the project)

### Sign in with Google and Apple in the apps (done 2026-10-04)
Migration `20261004105040_phase13_sign_in_with_apple` (applied live); new function `apple-sign-in`;
`delete-account` redeployed.

- [x] The apps sign in with the phone's own sheets (`lib/socialSignIn.ts`): Google's account chooser on
  Android (Credential Manager) and on iPhones, and Sign in with Apple on iPhones, its button first and in
  black as Apple asks. iPhones offer Google only next to Apple (Apple's rule). Never Google's web page
  inside the app, and Google's sheet names the app, not the Supabase address
- [x] A new account goes on to accept the Terms, then the profile form starts from the name Google or
  Apple gave (Apple gives it only the first time; it's kept on the account)
- [x] Each sign-in carries a fresh nonce that Supabase checks ("Skip nonce check" stays off)
- [x] A button shows only when its provider is on in Supabase; closing a sheet does nothing; plain
  messages when Google isn't set up for the app yet or a provider is off; email sign-in always there
- [x] Deleting an account also ends its Sign in with Apple (Apple's "revoke tokens" call, as Apple asks
  of apps with account deletion), with the token Apple's server gives at sign-in (`apple-sign-in`; only
  the server can read it). Best effort: the account is deleted either way
- [x] No Facebook SDK or advertising ID in either app (the plugin leaves the unused providers out)
- [x] Privacy Policy `privacy-v7-2026-10-04`: what Google and Apple tell us at sign-in, Apple's private
  relay addresses, the Apple token; "Download my data" says since when one is kept (not the token)
- [x] Tests: `tests/e2e/app-social-signin.mjs` (33 checks, both phones), `tests/e2e/apple-sign-in.mjs`
  (27 checks, server, with an Apple stand-in in `store-standin.cjs`), 3 unit tests
  (`_shared/appleSignIn_test.ts`), and the Android, iPhone and store tests again
- [ ] **Owner, Google** (Google Cloud, the project of the web client Supabase already uses,
  `1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde`; Google Auth Platform):
  1. Branding: app name **Shaadi24**, logo, support email. Audience: External, and "Publish app" so
     every Google account can sign in (in Testing only listed test users can). This is what makes
     Google's sheet say Shaadi24
  2. Clients → Create client → **Android**: package `com.shaadi24.app` and the SHA-1 of each key that
     signs the app: the Play App Signing key (Play Console → Test and release → App integrity), the
     upload key, and for test builds the debug key (`cd android && ./gradlew signingReport`); one
     Android client per SHA-1. Nothing changes in Supabase for Android
  3. Clients → Create client → **iOS**: bundle ID `com.shaadi24.app` (and your Team ID). Put its client
     ID in `.env.production.local` as `VITE_GOOGLE_IOS_CLIENT_ID=…`, and in Supabase → Authentication →
     Sign In / Providers → Google → Client IDs add it after the web client:
     `1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde.apps.googleusercontent.com,<iOS client ID>`.
     `npm run build:ios` then adds its URL scheme to the app by itself. Since 2026-10-07 the iPhone
     app asks Google for a token made out to the web client, so it signs in even without the iOS
     client in that list (TestFlight builds before then need it there)
- [ ] **Owner, Apple**:
  1. Apple Developer → Identifiers → `com.shaadi24.app` → tick **Sign in with Apple** (Xcode's
     automatic signing does this too: the project already has the entitlement)
  2. Supabase → Authentication → Sign In / Providers → **Apple** → on, Client IDs `com.shaadi24.app`
     (no secret key needed for the app). The iPhone app shows "Continue with Apple" (and Google) from then
  3. Keys → + → tick **Sign in with Apple** (configure it for `com.shaadi24.app`); if you haven't made
     the push key yet (Notifications above), make one key with both "Apple Push Notifications service"
     and "Sign in with Apple". Download the .p8. Supabase → Edge Functions → Secrets: `APPLE_TEAM_ID`,
     `APPLE_SIGNIN_KEY_ID` (the key's ID) and `APPLE_SIGNIN_PRIVATE_KEY` (the .p8 file's text)
  4. Services → Sign in with Apple for Email Communication: register the address Shaadi24's emails
     come from, so mail reaches people who hid their email (…@privaterelay.appleid.com)

### Password reset by code, and the account-deletion page (done 2026-10-04)
No database or function changes; the website serves the new page.

- [x] "Forgot password" emails a 6-digit code to type into the app (the apps have no web address for a
  link to come back to), then asks for the new password. The same email's link still works on the
  website. An address without an account gets the same answer, so nobody learns who has one
- [x] The website's **Delete account** page, `/delete-account` (Google Play asks for one): what's
  deleted and what's kept, how to do it in the app, and the deletion itself with a code sent by email,
  which works for accounts made with email, Google or Apple (Apple's hidden addresses too). It uses
  the same `delete-account` function as the apps (subscriptions stopped first, Sign in with Apple
  ended) and keeps nothing in the browser
- [x] Email templates with the codes: `supabase/templates/recovery.html` and `magic_link.html`
- [x] Privacy Policy `privacy-v8-2026-10-04` mentions the page
- [x] Tests: `tests/e2e/reset-code-flow.mjs` (20 checks, the Android app and the website),
  `tests/e2e/delete-account-page.mjs` (18 checks), and the website's reset link (`reset-flow.mjs`)
- [ ] **Owner, Supabase emails** (Authentication → Emails):
  1. Templates → **Reset Password**: subject `Your Shaadi24 password reset code`, body = the text of
     `supabase/templates/recovery.html`. **Magic Link**: subject `Your Shaadi24 code`, body =
     `supabase/templates/magic_link.html`. Until then the emails have only links (the app says the
     link works too, on the website)
  2. **SMTP Settings → your own email service** (Resend, for example, from your domain). Supabase's
     built-in email is for trying things out: a few emails an hour, and only to your team's
     addresses, so real members would get no codes
- [ ] **Owner, Google Play**: Play Console → App content → Data safety → "Delete account URL":
  `https://shaadi-gpt.vercel.app/delete-account` (or the same path on your own domain)

### Store releases and the launch kit (done 2026-10-04)
Migrations `20261004170828_phase13_rls_performance` and `20261004174515_phase13_content_filter`
(applied live); the website serves the new pages.

- [x] Android release builds: `npm run build:android:release` makes the bundle Google Play takes, signed
  with your upload key (`android/keystore.properties`, never in git), 16 KB-aligned as Android 15 phones
  need
- [x] One version for both stores, package.json's (1.0.0): Android's versionCode and the iPhone's build
  number follow it (10000), so each upload only needs `npm version patch --no-git-tag-version`
- [x] iPhone: the privacy manifest Apple requires (`PrivacyInfo.xcprivacy`: no tracking, the 15 kinds of
  data the app keeps, the reasons for the system features its plugins use); iPhone-only for now, so no
  iPad screenshots are needed
- [x] Words Shaadi24 doesn't allow (Apple's App Review rule 1.2 and Google Play's rules for apps where
  people post): sexual, abusive and hateful words in English and Hindi (Latin letters and Devanagari)
  are refused in chats and in profile text, with a plain message saying why; names and everyday words
  that look like them pass (Randeep, Ranchod, "chota", "chhod do", magna cum laude; all 6,648 strings in
  the app's own lists pass too). Reports aren't filtered, so they can quote. Terms `terms-v3-2026-10-04`:
  no tolerance for objectionable content or abusive users; reports reviewed within 24 hours
- [x] Pages the stores link to: `/support` (help and how to reach us: the App Store's Support URL),
  `/privacy` and `/terms` as addresses of their own (`#privacy` still works)
- [x] In the apps: the Help Center rewritten, because it described things the app doesn't do (voice
  profiles, SMS checks) and its Contact Support button did nothing. Each app's answers name only its
  own store and never the website's payments, as Apple and Google require. Settings → Support: Contact
  support, Terms, Privacy Policy; **Download my data** (everything kept about the person, as a file:
  a download on the website, the share sheet in the apps); the real version number; the empty
  "Phone" row is gone (nothing collects phone numbers)
- [x] The database's security rules look up the signed-in user once per query instead of once per row
  (32 rules), and 6 foreign keys got indexes (Supabase's performance advisor)
- [x] The launch kit, [docs/store/README.md](docs/store/README.md): the checklist in order, both store
  listings (within each field's limit), the Data safety and App Privacy answers, content rating, notes
  for the reviewers, screenshot sizes and screens; Google Play's icon and feature graphic
  (`docs/store/graphics/`, remade by `scripts/store-graphics.mjs`)
- [x] Tests: `tests/e2e/support-pages.mjs` (35 checks), `tests/e2e/content-filter.mjs` (27 checks), and
  the Android, iPhone, sign-up, consent, Settings, popups, purchases, notifications, India profile,
  account deletion, reset and sign-in tests again
- [ ] **Owner: the launch checklist** in [docs/store/README.md](docs/store/README.md), from step 1. It
  gathers every owner step of this phase in order (the ones above in this section included)

### The apps' welcome screen (done 2026-10-07)

- [x] A first screen like ChatGPT's: Shaadi24 and "Find your life partner by personality, not just
  biodata." in the middle; at the bottom, big rounded buttons: Continue with Apple (iPhones), Continue
  with Google, and Sign in or create account (email, in the popup as before); under them, that
  Shaadi24 is for marriage only, and Terms, Privacy, Safety and Grievances. The search box and example
  searches are gone from it: nothing can be searched before signing in, and it fits an iPhone without
  scrolling
- [x] Apple and Google moved from the sign-in popup to the welcome screen, one tap away; the popup is
  for email
- [x] The apps no longer zoom in on a tapped text box (2026-10-07)
- [x] Each TestFlight run's summary says whether Continue with Google and notifications are in that
  build; the iPhone simulator screenshots show Google once `VITE_GOOGLE_IOS_CLIENT_ID` is set
- [x] The "Offline" label on match cards is readable in dark mode
- [x] TestFlight builds reach the testers by themselves: after the upload, the workflow waits for Apple
  to process the build, then adds it to the internal tester groups without automatic distribution,
  with the change as "What to Test" (`scripts/testflight-testers.mjs`, tested against a stand-in for
  Apple's API in CI)
- [x] The iPhone simulator screenshots wait longer for Maestro on slow GitHub Macs (all six screens again)

---

## Phase 12 — Profile details for India (done 2026-09-28)
The sign-up questions of Shaadi.com, BharatMatrimony and Jeevansathi, compared with Shaadi24's in
[the research page](https://claude.ai/artifact/YDnK5UxggV5mLcVoyP5hHG); everything marked "Add" or
"Improve" there is in. Migrations `20260928210206_phase12_india_profile_fields` and
`20260928210509_phase12_location_text` (applied live); `search` function redeployed.

- [x] 39 new optional answers: who the profile is for, date of birth (only the age is ever shown; ages
  move on at birthdays), marital status and children, mother tongue (78, with Hindi by region), caste
  (479 over Hindu, Muslim, Sikh and Jain, with "Prefer not to say" and your own answer), sub-caste
  (1,203), sect or denomination, gotra (155), open to other communities ("caste no bar"), Manglik, rashi,
  nakshatra, time and place of birth, horoscope match, degree (168), employed in, occupation (245),
  annual income (₹ and $), country / state / city (all countries, 28 states and 8 union territories),
  residential status abroad, settling abroad, and family (type, status, values, parents' occupations,
  brothers and sisters with how many are married, where the family lives, about the family), disability
- [x] Improved: height from a list (4'0"–7'0" with cm), diet adds Non-vegetarian, religion adds Parsi,
  Bahai and No religion, hobbies and languages are tapped on and off, long lists can be typed into
- [x] No longer asked or shown: cannabis, other drugs, relationship type (monogamous/open/…). The answers
  already given stay in the database but are not shown, searched or scored
- [x] Sign-up: step 1 asks date of birth, marital status, height and country → state → city; step 3 has
  6 optional pages (religion & community, education & career, family, horoscope, lifestyle, you)
- [x] My Profile and other people's profiles show the new sections; any answer can be hidden (hiding the
  location hides city, state and country too). Members who joined before see an invitation to add them
- [x] Search: filters for country, state, religion, mother tongue, caste, marital status, height range,
  Manglik, diet and children; typed searches understand heights ("taller than 5'6""), "never married",
  "divorced", "Manglik", "NRI"; Gemini also knows the new answers. Scoring adds community (only when
  someone prefers their own), mother tongue, Manglik when a horoscope match is wanted, veg vs non-veg,
  settling abroad and family values
- [x] Privacy Policy lists the new details (`privacy-v4-2026-09-28`)
- [x] Tests: database checks, unit tests for the search, and a browser run through sign-up and profile
- [ ] Later (not in this phase): religious-practice questions, owns house/car, profile prompts, biodata
  upload, partner preferences

---

## Done

**Phase 1 — Backend foundation**
- [x] Supabase database: profiles, likes, matches, messages, blocks, reports
- [x] Access rules, automatic profile creation, automatic match when both people like each other
- [x] Photo storage and a script that creates 50 test profiles

**Phase 2 — Sign-up & onboarding**
- [x] Email + password sign-up with a 6-digit email code, sign in / sign out, Google button
- [x] Onboarding: basic info → at least 4 photos → details form, resuming where you left off

**Phase 3 — Profile system**
- [x] My Profile page with inline editing, a completion bar, and per-field hide/show
- [x] Add, replace and remove photos; settings saved to your account

**Phase 4 — Search & matching**
- [x] Search box and filters, compatibility score with a "why you match" report
- [x] Search history with re-run, 3 searches per day
- [x] Verification requests (social links); unverified users locked out of search after 72 hours

**Phase 5 — Likes, matches & chat**
- [x] Like, super like and undo; "Likes You" inbox; match celebration popup
- [x] Live chat with read receipts, date proposals and unmatch
- [x] Block and report; Standouts (5 daily picks); list of profiles you've liked

**Phase 6 — Polish & launch prep** (mostly done)
- [x] Terms, Privacy, cookie banner, consent records
- [x] Theme saved per account, faster loading
- [x] Admin panel: stats, reports, verifications, users, ban/unban, audit log
- [x] Full account deletion; push notifications (browser side and the sending function)
- [x] Incognito mode; liked profiles hidden from search
- [x] Payments → built in Phase 11 (Razorpay, later dropped); sold in the apps since Phase 13
- [ ] Delete unused prototype files → Phase 10
