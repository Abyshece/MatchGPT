# ShaadiGPT roadmap

11 phases in total. Phases 1–5 are done, Phase 6 is mostly done, and **Phase 7 is in progress**.
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
| 7 | Make the backend safe and rebuildable | **In progress** |
| 8 | Finish half-built features | To do |
| 9 | Smarter search that scales | To do |
| 10 | Launch readiness → public launch | To do |
| 11 | Payments (Pro via Razorpay) | To do |

---

## Phase 7 — Make the backend safe and rebuildable (in progress)

### Done (code only)
- [x] Add `.env.local.example` listing every environment variable and where it belongs
- [x] Rename `Supabase/` → `supabase/` (the Supabase CLI's expected name); stop committing the CLI's `.temp` cache
- [x] Fix the "Create profile" rescue screen: it sent `account_created` as a number (rejected by Postgres) and set tier/verification fields from the browser
- [x] Remove unused browser code that could mark an account verified (`markVerified`, `softDeleteAccount`)
- [x] Edge functions: allowed browser origins now come from the `ALLOWED_ORIGINS` secret (unset = any origin, as before)
- [x] Stop injecting `GEMINI_API_KEY` into the website bundle (`vite.config.ts`)
- [x] Type errors not caused by the stale database types: fixed (153 → 129; the edge functions are no longer checked as website code)

### Still to do — needs the Supabase connector
This cloud environment can't reach Supabase directly (the network policy blocks `*.supabase.co` and
`api.supabase.com`, and raw Postgres connections aren't proxied). Connect the **Supabase** connector at
https://claude.ai/customize/connectors, then start a new session: connectors load when a session starts.
Project: **ShaadiGPT**, ref `fmrbzzdjtarsaqvfukum`.

Nothing below changes the live database without the owner's explicit OK.

- [ ] **1. Inspect the live database (read-only).** Tables, views, functions, triggers, RLS policies, grants,
  storage policies, cron jobs, realtime publication. Run Supabase's security advisors.
- [ ] **2. Save it into the repo** as a baseline migration in `supabase/migrations/`, confirm it rebuilds an empty
  database (PostgreSQL 16 installs with apt here; Docker is not running), and retire `supabase/001_initial_schema.sql`.
  The app uses all of these and none are in `001`:
  - Tables/views: `search_history`, `standouts`, `push_subscriptions`, `push_queue`, `pending_pushes`,
     `deletion_audit`, `verification_requests`, `consent_records`, `admin_audit`, `public_profiles`,
     `eligible_profiles`, `my_blocked_ids`
  - Functions: `get_likes_received`, `get_matches_with_profile`, `mark_messages_read`, `unmatch`,
     `submit_verification_request`, `increment_push_failure`, `admin_platform_stats`,
     `admin_pending_verifications`, `admin_review_verification`, `admin_update_report`, `admin_ban_user`,
     `admin_unban_user`, `admin_verify_user`
  - `profiles` columns: `settings_theme`, `is_banned`, `banned_at`, `ban_reason`, `is_paused`, `paused_at`,
     `cookie_preferences`, `terms_accepted_at`, `privacy_accepted_at`, `marketing_consent`
  - The push-notification queue triggers and the scheduled job that runs `send-push`
- [ ] **3. Regenerate `lib/database.types.ts`** from the live project and fix the 69 remaining type errors in live code.
- [ ] **4. Hardening migration** — write it, test it locally, show it to the owner, apply only after approval:
  - [ ] Other users can't read `email` or `phone_number` (the owner and admins still can)
  - [ ] Browser updates can't change `is_verified`, `verification_status`, `subscription_tier`,
     `subscription_renews_at`, the daily counters and their dates, or `is_banned` / `banned_at` / `ban_reason`.
     Move `incrementSearchCount` / `incrementLikeCount` into database functions.
  - [ ] Enforce the daily like limit when a like is inserted. **Decision needed:** 6/day for free users
     (what the like button does today), or unlimited while Pro is free for everyone (`PRO_FOR_ALL`)?
  - [ ] An `is_admin()` check the app can call, replacing the `VITE_ADMIN_EMAILS` list in the website bundle
  - [ ] Confirm the profile-rescue insert is allowed by the database, or remove the rescue screen
- [ ] **5. Deploy** both edge functions and set the `ALLOWED_ORIGINS` secret to the live site's address
  (owner's approval; needs the production domain).

The daily **search** limit can only be truly enforced once search runs on the server (Phase 9);
until then the browser downloads the candidate pool itself.

---

## Phase 8 — Finish half-built features
- [ ] Forgot password: add a "set new password" screen
- [ ] Show real online status on profile cards (every card says "Offline" today)
- [ ] Make the "Active Status" setting actually hide your online status
- [ ] Add a "Pause profile" switch in Settings (`setPauseStatus` already exists)
- [ ] Blocked users list with an Unblock button
- [ ] Email digests: build the weekly email, or remove the toggle
- [ ] Fix Standouts picks disappearing on reload later in the day
- [ ] Replace the "Coming in Phase 4" text on the profile page
- [ ] Test Google sign-in and push notifications end to end

## Phase 9 — Smarter search that scales
- [ ] Run search inside the database: works past 1,000 users, stops downloading everyone's profile, enforces the daily search limit
- [ ] Keep fields users marked "hidden" off other people's screens
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
- [ ] A proper email service for sign-up codes (Supabase's built-in sender is heavily rate-limited)
- [ ] Error tracking, and analytics that respect the cookie banner
- [ ] Shrink the main JavaScript file (537 kB)
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
