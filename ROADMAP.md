# ShaadiGPT roadmap

11 phases in total. Phases 1–5 and 7 are done, Phase 6 is mostly done; **Phase 8 is next**.
Items left unfinished in earlier phases were moved into later ones, so each open item appears once.
(`PHASE_1_README.md`–`PHASE_3_README.md` are historical setup notes.)

| # | Phase | Status |
|---|---|---|
| 1 | Backend foundation | Done |
| 2 | Sign-up & onboarding | Done (forgot password → Phase 8) |
| 3 | Profile system | Done |
| 4 | Search & matching | Done (upgrade in Phase 9) |
| 5 | Likes, matches & chat | Done |
| 6 | Polish & launch prep | Mostly done (payments → 11, cleanup → 10) |
| 7 | Make the backend safe and rebuildable | **Done** (3 small owner follow-ups) |
| 8 | Finish half-built features | To do — next |
| 9 | Smarter search that scales | To do |
| 10 | Launch readiness → public launch | To do |
| 11 | Payments (Pro via Razorpay) | To do |

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
- [ ] Once the live site address is known: set the `ALLOWED_ORIGINS` secret and redeploy both edge functions
  (`npx supabase functions deploy delete-account` and `send-push`). No behaviour changes until then.
- [ ] Turn on leaked-password protection in the Supabase dashboard's Authentication settings
  ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
- [ ] Remove the now-unused `VITE_ADMIN_EMAILS` variable from the hosting settings

The daily **search** limit moves to Phase 9: search still runs in the browser, so only the server-side search can enforce it.

---

## Phase 8 — Finish half-built features

### Checked first: sign-up and profile setup (2026-09-26)
Run in a browser against a local copy of the backend (`npx supabase start` with the repo's migrations).
- [x] Works: email sign-up with "Confirm email" off and on (code from the email), Google-style sign-up,
  the 3-step profile setup (details, 4 photos, 5 detail pages), search, sign out and back in
- [x] Fixed: after signing out, new users were stuck on the "Check your inbox" screen
- [x] Fixed: Google sign-ups never accepted the Terms and Privacy Policy, so nothing was recorded. Anyone
  without a recorded acceptance is now asked once before continuing, existing accounts included
- [x] Fixed: with "Confirm email" on, the Terms acceptance from the sign-up form was silently lost
- [x] Google sign-ups start profile setup with their name filled in
- [ ] Owner: "Confirm email" still reads as on for the live site. Until a proper email sender is set up,
  only addresses in your Supabase team can receive the code, so switch it off (and click Save)

### Done
- [x] Fixed a live bug: about an hour into a session (when the sign-in token refreshes), the app replaced
  everything with "Couldn't load your profile". The auth listener queried the database while the auth
  client still held its lock, so the query waited until the 8-second timeout
- [x] Forgot password: the reset link opened a page that didn't exist. It now opens the site, which asks
  for the new password; an expired or used link says so. Emails still only reach addresses in your
  Supabase team until a proper email sender is set up (Phase 10)
- [x] Profile cards show "Online" for people active in the last 5 minutes (every card said "Offline")
- [x] "Active Status" off: the person shows as Offline and drops out of the "Online Now" and
  "Recently active" filters. (Their last-active time still reaches other users' browsers until the
  database change below.)
- [x] "Pause my profile" switch in Settings: hidden from search and Standouts, matches and chats keep working
- [x] Blocked people list in Settings with an Unblock button
- [x] Fixed: people you blocked (or who blocked you) still appeared in search and Standouts
- [x] Email digests: removed the toggle, which did nothing. The weekly email needs the email service (Phase 10)
- [x] Fixed: Standouts re-ran a top-8 search on every visit and dropped saved picks that were no longer
  in it, so picks vanished later in the day (reproduced: 0 of 5 saved picks shown; now 5 of 5)
- [x] Profile page: "Coming in Phase 4" is now a "Get verified →" button; the upgrade pop-up no longer
  mentions "Phase 6"

- [x] Admin "Users" and "Reports" tabs only saw the admin's own profile: new admin-only lookups
  (`admin_search_users`, `admin_list_reports`, migration `20260926181500`)
- [x] "Active Status" off now also hides the last-active time in the database (it reached every
  signed-in browser)
- [x] Push notifications were never sent. Nothing ran `send-push`, the Vault key it would have used was a
  placeholder, and it had no Web Push (VAPID) keys. Now a cron job calls it every minute when something is
  queued, authenticated by a secret the database generates; `send-push` creates and stores its own key
  pair; browsers read the public key from the database. Tested locally with a stand-in push service that
  checked the signature and decrypted the message
- [x] `supabase/tests/run_local.sh`: 50 security/behaviour checks (13 new), all pass
- [x] `supabase/config.toml` for a full local Supabase (Docker); keeps JWT checks off for both functions

### To do
- [ ] Owner: test Google sign-in with a real Google account. Everything checkable from outside is in order
  (provider on, Google accepts the app's ID and return address, returns to the live site); in Google Cloud
  → Google Auth Platform → Audience the publishing status must be "In production", not "Testing"
- [ ] Owner: try push notifications on a phone or laptop (Settings → Notifications) once this is live

## Phase 9 — Smarter search that scales
- [ ] Run search inside the database: works past 1,000 users, stops downloading everyone's profile, enforces the daily search limit
- [ ] Replace the three read-only views the search and lists use (`eligible_profiles`, `public_profiles`,
  `my_blocked_ids` — flagged by Supabase) with server-side functions
- [ ] Keep fields users marked "hidden" off other people's screens
- [ ] Score all compatibility factors: six (diet, gym, sleep schedule, living preference, family closeness,
  interracial marriage) are ignored today because `eligible_profiles` doesn't include them
- [ ] Understand "near me" (location) and "online" in prompts
- [ ] Match whole words only ("man" ≠ "woman") and handle "not" / "doesn't"
- [ ] **Decision:** add real AI — turn the prompt into filters and rank by meaning (bio, hobbies, "vibe")
- [ ] Optional: AI-written "why you match" summaries

## Phase 10 — Launch readiness → public launch
- [ ] Delete the 18 unused prototype files (~4,000 lines)
- [ ] Add automatic code-quality checks (a linter) and fix what they find
- [ ] Tests for the matching logic, plus end-to-end tests for sign-up → match → chat
- [ ] Run type checks, code checks, tests and a build on every push (CI)
- [ ] Separate test and live Supabase projects, with database backups
- [ ] A proper email service: sign-up codes and password resets (the built-in sender only reaches your
  Supabase team), then the weekly email digest and its Settings switch
- [ ] Error tracking, and analytics that respect the cookie banner
- [ ] Shrink the main JavaScript file (537 kB)
- [ ] Clear the remaining Supabase advisor warnings (access rules re-checking the user on every row, unindexed foreign keys, unused `pg_net` in the public schema)
- [ ] Fix the broken favicon, add a page description and link previews, rename leftover "MatchGPT" references
- [ ] Rewrite the README and setup guide
- [ ] Plan how admins keep up with verification requests (new users are locked out of search after 72 hours)
- [ ] Legal review of Terms and Privacy; mobile and accessibility check

## Phase 11 — Payments (Pro via Razorpay)
Must come after Phase 7 — until then, users could give themselves Pro for free.
- [ ] **Decision:** price, what Pro includes, and when to start charging
- [ ] Make every Pro check follow one rule (the like button and chat ignore `PRO_FOR_ALL` today)
- [ ] Razorpay checkout
- [ ] Payment confirmation on the server that upgrades the account
- [ ] Renewals, expiry and cancellation, with subscription status in Settings
- [ ] GST invoices, and a refund policy in the Terms
- [ ] Turn off `PRO_FOR_ALL`

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
- [ ] Razorpay payments → Phase 11
- [ ] Delete unused prototype files → Phase 10
