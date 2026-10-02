# Browser tests

Playwright scripts that drive the real app in Chromium against a local
Supabase (`supabase/config.toml`), used to check Phases 8 and 9 and later fixes. Each prints what it
checked and exits non-zero on failure; screenshots go to `tests/e2e/.shots/`.

## Setup

```bash
npx supabase start && npx supabase db reset       # local backend from the migrations
VITE_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<from `npx supabase status`> npx tsx scripts/seed.ts
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<from `npx supabase status`> npm run dev
npm i --no-save playwright && npx playwright install chromium
```

Defaults match the local stack; override with `BASE_URL`, `SUPABASE_URL`,
`SERVICE_ROLE_KEY`, `MAILPIT_URL`, `DB_CONTAINER` (the database container in
`docker ps`) and `CHROMIUM_PATH`.

## Scripts

| Script | Checks |
|---|---|
| `signup-flow.mjs` | Email sign-up → 3-step profile setup (date of birth, marital status, country → state → city; 4 photos; the 6 pages of India details, with long lists typed into and chips) → what was saved, with age, location and height worked out → search → sign out → log back in |
| `consent-flows.mjs [email]` | Google-style sign-up gets the Terms screen and a filled-in name; an existing account without Terms is asked once. `email`: a seeded account that hasn't accepted yet |
| `confirm-flow.mjs` | Sign-up with "Confirm email" on: code from the email, Terms recorded after verifying. Needs `enable_confirmations = true` |
| `reset-flow.mjs` | Forgot password → email link → new password; old one rejected; a used link is refused |
| `refresh-check.mjs [email]` | The app survives sign-in token refreshes. Set `jwt_expiry = 120` to see several in two minutes |
| `phase8-app.mjs <email>` | Online status, Standouts keeping its picks, block/unblock, pause, "Get verified" (an onboarded account, password `TestPass!2026`) |
| `gemini-standin.cjs` | Not a test: a stand-in for Google's Gemini API so AI search can be tried locally without a key (instructions at the top of the file) |
| `phase9-search.mjs <email>` | Search on the server: "near me", "doesn't smoke", hidden name and religion never sent, the daily limit refused by the server, liked list / Standouts / blocked list (an onboarded account, password `TestPass!2026`; moves it to Mumbai) |
| `verify-popup.mjs <email>` | "Verify your identity": full size when opened from the sidebar (was squeezed into it), link checks, 2 of 4 links, sending, "in review" with the links filled in, a full-width sheet on a phone; Pro accounts see "Unlimited searches" (an onboarded account, password `TestPass!2026`) |
| `android-app.mjs <email>` | The Android app's own behaviour, with a stand-in for Capacitor's Android bridge (its real bridge script, plugin calls recorded and answered, the back button pressed): launch screen hidden once drawn, bar colours in light and dark, no cookie banner, email-only sign-in, MatchGPT+ "coming to the app soon" with no Razorpay call, the notifications note, no share button or keyboard hint; back closes each popup, then a chat, Terms or another tab, and last puts the app in the background (an onboarded account, password `TestPass!2026`; set `REPO_ROOT` when running from outside the repo) |
| `ios-app.mjs <email>` | The iPhone app's own layout, with a stand-in for Capacitor's iOS bridge on an iPhone 15/16-sized screen given its notch and home-bar room (59 and 34 points): the start screen, sign-in popup, app screen, toast, filters drawer, menu, MatchGPT+ sheet and a chat's message box all stay clear of both; the page runs edge to edge (`viewport-fit=cover`); the status bar text follows light and dark; email-only sign-in; MatchGPT+ "coming to the app soon" (an onboarded account, password `TestPass!2026`; set `REPO_ROOT` when running from outside the repo) |
| `popups.mjs <email>` | Every popup sits on the same light, see-through blur covering the whole window: sign-in in light and dark (no white line behind it; scrolls on a short screen), the like confirmation on a match card (was squeezed into the card; a click outside doesn't open the profile; "Yes, Like" still likes), profile, filters, MatchGPT+, verify, delete account and the phone menu (an onboarded account, password `TestPass!2026`; made Free and unverified) |
| `google-button.mjs <email>` | Google's own sign-in button, with a stand-in for Google's library: Google gets a hashed nonce, Supabase gets the token and the matching nonce, errors are shown. Needs a dev server started with `VITE_GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com` (default `BASE_URL` http://localhost:3001) |
| `razorpay-standin.cjs` | Not a test: a stand-in for Razorpay's API, Checkout approvals and webhooks, so MatchGPT+ can be tried locally without an account (instructions at the top of the file) |
| `billing-flow.mjs <email>` | MatchGPT+ with the Razorpay stand-in: sidebar button, plans, closing Checkout, the free trial, a charge by webhook with its invoice, repeated and forged webhooks, cancelling, the period ending, a second (yearly) subscription without a trial, cancelling after a failed renewal, two checkouts at once (paid: the second cancelled and refunded; in the trial), cancelling a trial, a halted renewal, "coming soon" without keys (an onboarded account, password `TestPass!2026`) |
| `admin-tabs.mjs <email>` | Admin Users and Reports tabs see everyone (makes the account an admin) |
| `india-profile.mjs <email A> <email B>` | Phase 12: A (India details cleared) gets the invitation, fills in date of birth, religion, mother tongue, caste (then hides it), sub-caste, height, state and city, brothers, Manglik, diet and languages in My Profile; cannabis, drugs and relationship type are gone. B finds A with the mother-tongue and height filters and with typed searches ("taller than 5'6"", "non manglik"), sees the new sections on A's profile, and never gets A's hidden caste or date of birth (two onboarded accounts, password `TestPass!2026`) |
