# MatchGPT roadmap

12 phases in total. Phases 1–5, 7–9 and 12 are done, Phase 6 is mostly done; **Phase 10 is next**.
AI search (Gemini) is built and live; it switches on once you add the `GEMINI_API_KEY` secret (Phase 9).
Payments (MatchGPT+ through Razorpay, Phase 11) are built too and switch on once you add the Razorpay keys.
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
| 10 | Launch readiness → public launch | To do — next |
| 11 | Payments (MatchGPT+ via Razorpay) | Built; waiting for your Razorpay account |
| 12 | Profile details for India (community, family, horoscope) | **Done** |

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
- [ ] Delete the 18 unused prototype files (~4,000 lines)
- [ ] Add automatic code-quality checks (a linter) and fix what they find
- [ ] End-to-end tests for sign-up → match → chat (the matching logic has unit tests since Phase 9)
- [ ] Run type checks, code checks, tests and a build on every push (CI)
- [ ] Separate test and live Supabase projects, with database backups
- [ ] A proper email service: sign-up codes and password resets (the built-in sender only reaches your
  Supabase team), then the weekly email digest and its Settings switch
- [ ] Error tracking, and analytics that respect the cookie banner
- [ ] Shrink the main JavaScript file (537 kB)
- [ ] Clear the remaining Supabase advisor warnings (access rules re-checking the user on every row, unindexed
  foreign keys, `pg_net` in the public schema). The "signed-in users can run SECURITY DEFINER functions"
  warnings are expected: each of those functions checks who is asking
- [ ] Fix the broken favicon, add a page description and link previews
- [ ] Rewrite the README and setup guide
- [ ] Plan how admins keep up with verification requests (new users are locked out of search after 72 hours)
- [ ] Legal review of Terms and Privacy; mobile and accessibility check

## Phase 11 — Payments (MatchGPT+ via Razorpay)
Built 2026-09-27; waiting for a Razorpay account. Until its keys are set, the upgrade screens say
"coming soon" and nothing can be charged. Migrations `20260927231921_phase11_billing`,
`20260927232811_phase11_trial_rule` and `20260928000736_phase11_one_live_subscription` (applied live);
edge functions `billing` and `razorpay-webhook` (deployed, idle without keys).

- [x] Prices as in the Terms: ₹999 a month or ₹9,999 a year (17% less), a 7-day free trial for
  first-time subscribers, renewing automatically. Cancel any time in Settings: Pro stays to the end
  of the period paid for, a trial cancelled in time is never charged, and cancelling after a failed
  payment stops Razorpay's retries at once. Prices live in the `billing_plans` table; a new price
  makes a new Razorpay plan for new subscribers
- [x] What MatchGPT+ adds, as enforced by the server: unlimited AI searches (free: 3 a day), unlimited
  likes (free: 15 a day), Super Likes, refreshing Standouts; plus the Likes You list
- [x] "Get MatchGPT+" is back in the sidebar ("MatchGPT+ active" on Pro accounts); the old plan list
  said ₹2,999 and listed features that don't exist
- [x] Upgrade screen: monthly or yearly, then Razorpay Checkout (cards, UPI AutoPay, bank mandates)
- [x] The server confirms payments: Checkout's signature is checked, then Razorpay's webhooks keep the
  subscription current (renewals, failed payments while Razorpay retries, cancellation, the end).
  Pro follows the subscription with a 3-day grace, and an hourly job ends lapsed Pro. Pro given by
  hand (all 12 Pro accounts today) is never touched
- [x] Settings → MatchGPT+: plan, trial / renewal / end date, cancel, payments with Razorpay's invoices
- [x] One subscription per person: if two checkouts are finished at once (say, in two tabs), the one
  that went through first stays; the other is cancelled straight away and anything it charged is
  refunded, and its popup says so
- [x] Deleting an account cancels its subscription first, and refuses if Razorpay can't be reached
- [x] Privacy Policy lists the payment details kept (`privacy-v3-2026-09-27`)
- [x] Tests: 14 database checks, 7 unit tests (`_shared/razorpay_test.ts`), and a browser test against a
  local Razorpay stand-in (`tests/e2e/billing-flow.mjs`, `tests/e2e/razorpay-standin.cjs`)
- [ ] **Owner, to try it (test mode, no real money; no business documents needed yet):**
  1. Create an account at razorpay.com
  2. Dashboard → Account & Settings → API Keys → generate a **test** key (`rzp_test_…` and its secret)
  3. Check that Subscriptions is available on the account, and turn on Flash Checkout (Account & Settings)
  4. Account & Settings → Webhooks → add one: URL
     `https://fmrbzzdjtarsaqvfukum.supabase.co/functions/v1/razorpay-webhook`, a secret you make up (a long
     random string), and every `subscription.*` event
  5. Supabase → Edge Functions → Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
     (optional: `PRO_TRIAL_DAYS`, default 7). Then I test it end to end with Razorpay's test cards
- [ ] **Owner, to take real payments:** finish Razorpay's activation (KYC), generate **live** keys, add the
  same webhook in live mode, and replace the three secrets with the live ones
- [ ] GST: if MatchGPT is GST-registered, add the GST details in Razorpay (its invoices then show GST), and
  say in the Terms whether prices include GST
- [ ] Decide when to start charging; then turn off `PRO_FOR_ALL` (today everyone sees the Likes You list for
  free) and make every Pro check follow one rule (the like button and chat ignore `PRO_FOR_ALL` today)

---

## Phase 12 — Profile details for India (done 2026-09-28)
The sign-up questions of Shaadi.com, BharatMatrimony and Jeevansathi, compared with MatchGPT's in
[the research page](https://claude.ai/artifact/YDnK5UxggV5mLcVoyP5hHG); everything marked "Add" or
"Improve" there is in. Migration `20260928…_phase12_india_profile_fields`; `search` function redeployed.

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
- [x] Razorpay payments → built in Phase 11
- [ ] Delete unused prototype files → Phase 10
