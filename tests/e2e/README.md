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
| `signup-flow.mjs` | Email sign-up → 3-step profile setup (4 photos) → search → sign out → log back in |
| `consent-flows.mjs [email]` | Google-style sign-up gets the Terms screen and a filled-in name; an existing account without Terms is asked once. `email`: a seeded account that hasn't accepted yet |
| `confirm-flow.mjs` | Sign-up with "Confirm email" on: code from the email, Terms recorded after verifying. Needs `enable_confirmations = true` |
| `reset-flow.mjs` | Forgot password → email link → new password; old one rejected; a used link is refused |
| `refresh-check.mjs [email]` | The app survives sign-in token refreshes. Set `jwt_expiry = 120` to see several in two minutes |
| `phase8-app.mjs <email>` | Online status, Standouts keeping its picks, block/unblock, pause, "Get verified" (an onboarded account, password `TestPass!2026`) |
| `gemini-standin.cjs` | Not a test: a stand-in for Google's Gemini API so AI search can be tried locally without a key (instructions at the top of the file) |
| `phase9-search.mjs <email>` | Search on the server: "near me", "doesn't smoke", hidden name and religion never sent, the daily limit refused by the server, liked list / Standouts / blocked list (an onboarded account, password `TestPass!2026`; moves it to Mumbai) |
| `verify-popup.mjs <email>` | "Verify your identity": full size when opened from the sidebar (was squeezed into it), link checks, 2 of 4 links, sending, "in review" with the links filled in, a full-width sheet on a phone; Pro accounts see "Unlimited searches" (an onboarded account, password `TestPass!2026`) |
| `google-button.mjs <email>` | Google's own sign-in button, with a stand-in for Google's library: Google gets a hashed nonce, Supabase gets the token and the matching nonce, errors are shown. Needs a dev server started with `VITE_GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com` (default `BASE_URL` http://localhost:3001) |
| `razorpay-standin.cjs` | Not a test: a stand-in for Razorpay's API, Checkout approvals and webhooks, so MatchGPT+ can be tried locally without an account (instructions at the top of the file) |
| `billing-flow.mjs <email>` | MatchGPT+ with the Razorpay stand-in: sidebar button, plans, closing Checkout, the free trial, a charge by webhook with its invoice, repeated and forged webhooks, cancelling, the period ending, a second (yearly) subscription without a trial, cancelling after a failed renewal, two checkouts at once (paid: the second cancelled and refunded; in the trial), cancelling a trial, a halted renewal, "coming soon" without keys (an onboarded account, password `TestPass!2026`) |
| `admin-tabs.mjs <email>` | Admin Users and Reports tabs see everyone (makes the account an admin) |
