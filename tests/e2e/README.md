# Browser tests

Playwright scripts that drive the real app in Chromium against a local
Supabase (`supabase/config.toml`), used to check Phases 8 and 9. Each prints what it
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
| `phase9-search.mjs <email>` | Search on the server: "near me", "doesn't smoke", hidden name and religion never sent, the daily limit refused by the server, liked list / Standouts / blocked list (an onboarded account, password `TestPass!2026`; moves it to Mumbai) |
| `admin-tabs.mjs <email>` | Admin Users and Reports tabs see everyone (makes the account an admin) |
