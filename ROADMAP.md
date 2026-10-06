# MatchGPT roadmap

13 phases in total. Phases 1–5, 7–9 and 12 are done, and Phase 6 is mostly done. **Phase 13 (the
phone apps ready for the stores) is built. What's left of it is yours: the launch checklist in
[docs/store/README.md](docs/store/README.md).** Phase 10 (launch readiness) is under way: parts 1 to
6 are done (checks and a linter on every push, a faster first load, admin alerts, one switch for
MatchGPT+, tidier access rules, the whole journey tested, the README, MatchGPT+ sold only in the
apps, the website as a home page with the admin panel, an accessibility check, error reports in
Admin → Errors).
AI search (Gemini) is built and live; it switches on once you add the `GEMINI_API_KEY` secret (Phase 9).
MatchGPT+ is sold only in the apps, through Google Play and the App Store (Phase 13); Razorpay was
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
| 10 | Launch readiness → public launch | **In progress** (parts 1–6 done 2026-10-06) |
| 11 | Payments (MatchGPT+ via Razorpay) | Dropped 2026-10-05: MatchGPT+ is sold only in the apps (Phase 13) |
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

- [x] Renamed to MatchGPT everywhere users see it: every screen, Terms and Privacy, the browser tab,
  plan names, notifications, "Export my data" (migration `20260927101209`); contact emails are now
  support@ and privacy@matchgpt.com. Unchanged on purpose: saved-setting keys in the browser (renaming
  them would reset everyone's theme and cookie choices) and the site address `shaadi-gpt.vercel.app`
- [ ] Owner: matchgpt.com currently redirects to a domain-sales page (domains.atom.com), so mail to the
  new contact addresses won't arrive until you own the domain and set up those mailboxes. To serve the
  site there later: add the domain in Vercel, then set it as the Site URL in Supabase Authentication

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
- [ ] **Owner, for "MatchGPT" on Google's screen** (after the button is on): Branding: app name MatchGPT,
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
- [x] **README rewritten**: what MatchGPT is, how it's built, running it locally, the checks,
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
- [x] **One rule for MatchGPT+.** One switch, "MatchGPT+ for everyone", in Admin → Dashboard (in the
  audit log). It is on, as before.
  - While it's on, every member gets MatchGPT+'s features: Likes You, Super Likes, refreshing
    Standouts, every filter, compatibility reports and date proposals. Free accounts keep the daily
    limits (3 AI searches, 15 likes).
  - Before, the switch was a setting in the app's code that only Likes You followed. The like
    button, chat, filters, Standouts and compatibility reports showed "(Pro)" paywalls whose upgrade
    screens say "coming soon".
  - The server enforces the same rule (`has_pro()`). When the switch is off, a member without a
    subscription gets Likes You without who it was (the server doesn't send it), and the server
    leaves out the MatchGPT+ filters, the reports, Super Likes, date proposals and refreshing
    Standouts.
  - Turning it off when MatchGPT+ goes on sale needs no new app release.
- [x] **Tidier access rules** (Supabase's advisor):
  - Reports and verification requests have one rule each for reading.
  - The admin tables' rules apply to signed-in members only. Signed-out visitors can't reach those
    four tables at all, or `is_admin()`.
- [x] **The whole journey, tested**: a brand-new member signs up, sets up a profile, finds someone
  with a filter, likes her; she likes back; both get "It's a Match!"; they chat live and see "Read".
  It caught two bugs, now fixed:
  - Liking someone back showed "It's a Match!" twice, one on top of the other.
  - "Send a Message" from a match made in Likes You only said to open Matches; it now opens the chat.
- [x] **The upgrade screens** list only what buying adds while "MatchGPT+ for everyone" is on (the
  unlimited searches and likes), and say the rest is free for everyone right now.
- [x] **Security updates** for the libraries the website and the build use (`npm audit fix`). The
  one left is in Firebase's web library, in parts the app doesn't load.
- [x] **Tests:**
  - `tests/e2e/journey.mjs` (22 checks) and `tests/e2e/pro-access.mjs` (42 checks).
  - 10 new database checks: 45 attacks blocked, 53 normal actions working.
  - A unit test for the free filters.
  - All the browser and server tests ran again.

Part 3 done 2026-10-05: **MatchGPT+ is sold only in the apps.** You decided to sell it only through
Google Play and the App Store, so Razorpay is gone. The app and the server no longer use it; the
database change that removes its fields is ready and waits for your approval (below).

- [x] **The website** no longer sells MatchGPT+. Its MatchGPT+ screen says it's bought in the MatchGPT
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
  run `npx supabase db push`. Until then the live database keeps the old, unused Razorpay fields, which
  changes nothing for members.
- [ ] **Owner:** Supabase → Edge Functions: delete `billing` and `razorpay-webhook`, which are no longer
  used, and remove any `RAZORPAY_*` secrets. The live `delete-account` still has its old Razorpay
  step until it's next deployed (`npx supabase functions deploy delete-account --project-ref
  fmrbzzdjtarsaqvfukum`); that step finds nothing to cancel, so it changes nothing.

Part 4 done 2026-10-05: **the website is a home page and the admin panel.** As you chose, members use
MatchGPT in the apps, and the website (https://shaadi-gpt.vercel.app) no longer has the members' app.

- [x] **The home page**: what MatchGPT is, the Google Play and App Store badges ("Coming soon" until
  `VITE_PLAY_STORE_URL` and `VITE_APP_STORE_URL` are set in Vercel), and links to Help & Support, the
  Privacy Policy, Terms of Service, Delete your account and the admin panel. No sign-in for members and
  no cookie banner (the website keeps nothing but an admin's sign-in). It follows the device's light or
  dark setting and fits a phone's screen.
- [x] **`/admin`**: a sign-in for MatchGPT's team (email, Google, or a reset code; no sign-up), then
  the admin panel, with a switch for alerts in that browser. A member who signs in there is told
  MatchGPT is used in the app.
- [x] Admin alerts clicked in the browser open their tab in the admin panel, as before.
- [x] Email links still work on the website: a password-reset link asks for the new password; a member
  signed in by an email link sees who they are, and can sign out or delete the account (the Delete
  account page sends them there when its email has a link instead of a code).
- [x] `/support` says MatchGPT is on Android and iPhone, with the store badges; the help answers send
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

Part 6 done 2026-10-06: **error reports, in MatchGPT's own database.** When the apps or the website hit
an error, it's reported, so it can be fixed before members write in about it. No outside service and
no key to add.

- [x] **What's sent**: the error and where in the code it came from, the screen (the tab, or the
  sign-in, setup or website page), the app version and the kind of phone or browser. Not who: emails,
  phone numbers, ids and sign-in tokens are blanked out on the device, the report goes with the app's
  public key rather than the member's sign-in, and the database keeps no account or address with it.
- [x] **What's reported**: errors nobody caught, promises that failed with nobody waiting for them, and
  screens that fail to draw (the "Something went wrong" screen). Not the noise that isn't MatchGPT's to
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
  - "RLS enabled, no policy" on the tables only the server uses.
- [ ] Legal review of Terms and Privacy. (The mobile and accessibility check is done: Phase 10, part 5.)

## Phase 11 — Payments (MatchGPT+ via Razorpay) — dropped 2026-10-05
Built 2026-09-27 for the website, but never switched on. On 2026-10-05 you decided MatchGPT+ is sold
only in the apps, through Google Play and the App Store (Phase 13), so Razorpay was removed (Phase 10,
part 3). What it set up stays, for the store subscriptions:

- [x] Prices as in the Terms: ₹999 a month or ₹9,999 a year (17% less), renewing automatically; a
  free trial when the store offers one
- [x] What MatchGPT+ adds, as enforced by the server: unlimited AI searches (free: 3 a day), unlimited
  likes (free: 15 a day), Super Likes, refreshing Standouts; plus the Likes You list
- [x] "Get MatchGPT+" in the sidebar ("MatchGPT+ active" on Pro accounts)
- [x] Pro follows the subscription with a 3-day grace, and an hourly job ends lapsed Pro. Pro given by
  hand is never touched
- [x] Every MatchGPT+ check follows one rule, on the server and in the apps (Phase 10, part 2)
- [ ] **Owner:** decide when to start charging, then turn off "MatchGPT+ for everyone" in Admin →
  Dashboard. It needs no app release

---

## Phase 13 — The phone apps, ready for Google Play and the App Store
Started 2026-10-03. The apps sell MatchGPT+ through the stores (their rules for digital subscriptions),
and since 2026-10-05 only the apps sell it. Every subscription and charge lands in the same tables, so
the money is in one place.

### Payments on the server (done 2026-10-03)
Migration `20261003203818_phase13_store_billing` (applied live); edge functions `store-billing` and
`store-notifications` (new), `billing`, `razorpay-webhook` and `delete-account` (redeployed).

- [x] Store products: Play Console subscription `matchgpt_plus` with base plans `monthly` and `yearly`;
  App Store `matchgpt_plus_monthly` and `matchgpt_plus_yearly` (in `billing_plans`)
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
  1. Monetize → Subscriptions: create `matchgpt_plus` with base plans `monthly` (₹999, renews monthly) and
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
  2. Subscriptions: a group "MatchGPT+" with `matchgpt_plus_monthly` (₹999) and `matchgpt_plus_yearly`
     (₹9,999); optionally a 1-week free trial as the introductory offer
  3. App Information → App Store Server Notifications → Version 2, for production and sandbox:
     `https://fmrbzzdjtarsaqvfukum.supabase.co/functions/v1/store-notifications?provider=apple`
- [ ] The stores' payout reports are the final word on fees and tax; the finance figures estimate the
  stores' fees at 15% (set `STORE_FEE_PERCENT_GOOGLE_PLAY` / `STORE_FEE_PERCENT_APP_STORE` if yours differ)

### Buying MatchGPT+ inside the apps (done 2026-10-03)
- [x] In the apps, MatchGPT+ opens Google's or Apple's own payment sheet at the store's price (in the
  person's currency). The purchase carries the account's id, and the server checks it
  with the store before Pro turns on. MatchGPT+ belongs to the account, so it works on both phones
- [x] Next to the button, what the stores require: length and price, that it renews until cancelled,
  where to cancel, Terms of Use and Privacy Policy, Restore purchases. On iPhone the free trial shows
  when the App Store offers one
- [x] Closing the payment sheet changes nothing; a payment still going through (some UPI and cash
  methods, Apple's Ask to Buy) says MatchGPT+ turns on once it does; a plan already bought is restored
- [x] The app catches up with the store when it opens (at most every 6 hours) and in Settings; on
  iPhone, renewals and refunds the App Store delivers while it runs are passed on to the server
- [x] Settings → MatchGPT+: which store bills it, trial / renewal / end dates, payment problems, Manage
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
     needed). Add an Android app with package `com.matchgpt.app` → download `google-services.json`
     into `android/app/`. Add an iOS app with bundle ID `com.matchgpt.app` → download
     `GoogleService-Info.plist`, and in Xcode drag it into the App folder (tick "App" under targets)
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
- [x] Tests: `tests/e2e/app-social-signin.mjs` (30 checks, both phones), `tests/e2e/apple-sign-in.mjs`
  (27 checks, server, with an Apple stand-in in `store-standin.cjs`), 3 unit tests
  (`_shared/appleSignIn_test.ts`), and the Android, iPhone and store tests again
- [ ] **Owner, Google** (Google Cloud, the project of the web client Supabase already uses,
  `1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde`; Google Auth Platform):
  1. Branding: app name **MatchGPT**, logo, support email. Audience: External, and "Publish app" so
     every Google account can sign in (in Testing only listed test users can). This is what makes
     Google's sheet say MatchGPT
  2. Clients → Create client → **Android**: package `com.matchgpt.app` and the SHA-1 of each key that
     signs the app: the Play App Signing key (Play Console → Test and release → App integrity), the
     upload key, and for test builds the debug key (`cd android && ./gradlew signingReport`); one
     Android client per SHA-1. Nothing changes in Supabase for Android
  3. Clients → Create client → **iOS**: bundle ID `com.matchgpt.app` (and your Team ID). Put its client
     ID in `.env.production.local` as `VITE_GOOGLE_IOS_CLIENT_ID=…`, and in Supabase → Authentication →
     Sign In / Providers → Google → Client IDs add it after the web client:
     `1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde.apps.googleusercontent.com,<iOS client ID>`.
     `npm run build:ios` then adds its URL scheme to the app by itself
- [ ] **Owner, Apple**:
  1. Apple Developer → Identifiers → `com.matchgpt.app` → tick **Sign in with Apple** (Xcode's
     automatic signing does this too: the project already has the entitlement)
  2. Supabase → Authentication → Sign In / Providers → **Apple** → on, Client IDs `com.matchgpt.app`
     (no secret key needed for the app). The iPhone app shows "Continue with Apple" (and Google) from then
  3. Keys → + → tick **Sign in with Apple** (configure it for `com.matchgpt.app`); if you haven't made
     the push key yet (Notifications above), make one key with both "Apple Push Notifications service"
     and "Sign in with Apple". Download the .p8. Supabase → Edge Functions → Secrets: `APPLE_TEAM_ID`,
     `APPLE_SIGNIN_KEY_ID` (the key's ID) and `APPLE_SIGNIN_PRIVATE_KEY` (the .p8 file's text)
  4. Services → Sign in with Apple for Email Communication: register the address MatchGPT's emails
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
  1. Templates → **Reset Password**: subject `Your MatchGPT password reset code`, body = the text of
     `supabase/templates/recovery.html`. **Magic Link**: subject `Your MatchGPT code`, body =
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
- [x] Words MatchGPT doesn't allow (Apple's App Review rule 1.2 and Google Play's rules for apps where
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

---

## Phase 12 — Profile details for India (done 2026-09-28)
The sign-up questions of Shaadi.com, BharatMatrimony and Jeevansathi, compared with MatchGPT's in
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
