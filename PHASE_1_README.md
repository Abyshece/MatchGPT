# Phase 1: Backend Foundation

> **Superseded (2026-09-26):** `supabase/001_initial_schema.sql` no longer exists. The full database now lives in `supabase/migrations/` (see `supabase/tests/README.md` and `ROADMAP.md`). The steps below are kept for history.

This is the backend layer for Shaadi24 (then called ShaadiGPT). After this phase, your existing UI keeps running unchanged on mock data, but a real Supabase database is wired up underneath, ready for Phase 2.

## What's in this phase

| File | Purpose |
|---|---|
| `supabase/001_initial_schema.sql` | The full database schema: 6 tables, RLS policies, triggers, storage bucket. Paste into Supabase SQL editor once. |
| `.env.local.example` | Template for environment variables. Copy to `.env.local` and fill in. |
| `lib/database.types.ts` | TypeScript types matching the schema. Used everywhere we talk to Supabase. |
| `lib/supabase.ts` | The frontend Supabase client. Import this anywhere in the React app. |
| `scripts/seed.ts` | Inserts ~50 realistic mock profiles into your dev database. Run once after schema is set up. |

## Setup checklist

Do these in order. Each step takes 2-5 minutes.

### 1. Create the Supabase project

1. Go to https://supabase.com → "New project"
2. Name: `shaadigpt-dev`
3. Region: closest to you (Mumbai or Singapore for India)
4. Save the database password somewhere safe
5. Wait ~2 minutes for the project to provision

### 2. Run the SQL migration

1. In your Supabase project, open the **SQL Editor** (left sidebar, the icon that looks like `>_`)
2. Click "New query"
3. Open `supabase/001_initial_schema.sql` from this folder, copy the entire contents
4. Paste into the SQL editor and click "Run" (or press Cmd/Ctrl+Enter)
5. You should see `Success. No rows returned.` — that's normal

To verify it worked: in the left sidebar, click **Table Editor**. You should see all 6 tables: `profiles`, `likes`, `matches`, `messages`, `blocks`, `reports`.

### 3. Configure email OTP auth

1. Go to **Authentication → Providers** in Supabase
2. Make sure **Email** is enabled
3. Scroll down — find "Confirm email" and **disable it** for now (we want OTP, not magic links). We'll handle verification ourselves.
4. Under **Authentication → Email Templates**, the "Magic Link" template is what gets sent. Default works fine for dev. You can customize the look later.

For Google OAuth (optional, also works in Phase 2):

1. **Authentication → Providers → Google**
2. Toggle on, paste your OAuth client ID and secret from Google Cloud Console
3. Add `http://localhost:3000` to authorized redirect URIs in Google Cloud
4. Skip this for now if you don't have a Google Cloud project yet — email-only is fine to start

### 4. Set up environment variables

1. In Supabase, go to **Project Settings → API**
2. Copy the three values:
   - **Project URL**
   - **anon public** key
   - **service_role** key (under "Project API keys", reveal it)
3. In your project root, copy `.env.local.example` to `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
4. Open `.env.local` and paste the values:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbG...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
   ```
5. Verify `.env.local` is in `.gitignore` (it already is, in your existing `.gitignore`)

### 5. Install dependencies

From your project root:

```bash
npm install @supabase/supabase-js
npm install --save-dev tsx dotenv
```

`@supabase/supabase-js` is the runtime client. `tsx` lets us run the TypeScript seeder directly. `dotenv` lets the seeder read `.env.local`.

### 6. Run the seeder

```bash
npx tsx scripts/seed.ts
```

This takes about 60-90 seconds. You'll see progress like:

```
Seeding 50 mock profiles...
  [10/50] 10 ok, 0 failed
  [20/50] 20 ok, 0 failed
  ...
Done. 50 profiles created, 0 failed.
All seeded users share password: SeedUser!2024
```

To verify: go to Supabase **Table Editor → profiles**. You should see 50 rows with names, ages, locations, the works.

### 7. (Optional) Reset the seed data

If you want to wipe the seeded users and start over:

```bash
npx tsx scripts/seed.ts --reset
```

This deletes only users whose emails start with `seed_` and end with `@shaadigpt.dev`, so it's safe to run alongside real users later.

## How the schema is structured (in plain English)

**`profiles`** is one big wide table. One row per user. It holds every attribute we collect — basics, appearance, lifestyle, career, family plans, relationship psychology, all of it. Photos are stored as a text array of URLs (the actual image files live in Supabase Storage). Settings live on the same row to keep things simple.

**`likes`** is a flat list. One row per like sent. The `is_super_like` flag distinguishes the two types.

**`matches`** is created automatically — there's a trigger called `check_for_match` that fires on every insert into `likes`. If the person being liked has already liked the liker, a row gets inserted into `matches`. You never write to this table from the frontend.

**`messages`** lives under matches. Two message types: `text` and `date_proposal`. Read receipts are tracked via `read_at`.

**`blocks`** and **`reports`** are straightforward — flat lists of who blocked/reported whom and why.

## How RLS protects everything

Row Level Security is the wall that stops users from reading data they shouldn't, even if they craft custom requests.

- A user can read any profile **unless** the profile owner has blocked them
- A user can update **only their own** profile
- A user can read likes only if they're the liker or the liked
- A user can insert a like only as themselves
- A user can read messages only in matches they're part of
- A user can read matches only if they're one of the two participants
- A user can never read another user's blocks/reports

The policies are set up so even if you accidentally write `supabase.from('profiles').update(...)` without filtering, RLS blocks the write at the database level. This is your safety net.

## What about photos?

The `photos` storage bucket is public-read (so profile pictures load fast for everyone), but writes are folder-scoped: a user can only upload/edit/delete files in `photos/<their-user-id>/`. We'll wire up the upload flow in Phase 3.

## Troubleshooting

**"permission denied for table profiles"** when seeding → you're using the anon key instead of the service role key. Check `.env.local`. The seeder needs `SUPABASE_SERVICE_ROLE_KEY` (no `VITE_` prefix).

**"duplicate key value violates unique constraint"** when seeding → you've already seeded. Run `npx tsx scripts/seed.ts --reset` first, then seed again.

**Profile rows don't appear after auth user is created** → the `on_auth_user_created` trigger isn't installed. Re-run the SQL migration. You can run it multiple times safely (it'll error on the duplicate `create table`, but the triggers will be replaced).

**SQL migration errors halfway through** → you ran it twice. To start clean, in the SQL editor run:
```sql
drop schema public cascade;
create schema public;
grant all on schema public to postgres, anon, authenticated, service_role;
```
Then re-run the migration. **WARNING: this destroys all data in the public schema.** Only do this on a fresh dev project.

## When you're done

You should have:
- ✅ A Supabase project with 6 tables visible in Table Editor
- ✅ `.env.local` filled in with the three keys
- ✅ `@supabase/supabase-js`, `tsx`, `dotenv` installed
- ✅ 50 seeded profiles in the `profiles` table
- ✅ `lib/supabase.ts` and `lib/database.types.ts` in your project

Tell me when each step is done (or if anything errors), and we'll move to **Phase 2: Auth + Signup flow**, where we'll start replacing the existing auth screens with real Supabase email OTP signup and the 5-step onboarding form.
