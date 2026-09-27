-- Phase 9, part 3: AI search (Google Gemini, free tier).
--
-- The search function asks Gemini what a prompt means. Its answers ("plans")
-- are kept here for 30 days, keyed by a hash of the prompt and the profile
-- answers it could choose from, so repeated prompts (the examples, re-runs
-- from History) don't use up the free quota. No user IDs or prompts are
-- stored, and only the search function (service role) can read or write it.
create table public.search_prompt_cache (
  key text primary key,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.search_prompt_cache enable row level security;
revoke all on public.search_prompt_cache from public, anon, authenticated;

-- Daily at 03:17 UTC: forget plans older than 30 days.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('search-prompt-cache-cleanup', '17 3 * * *',
      $job$delete from public.search_prompt_cache where created_at < now() - interval '30 days'$job$);
  end if;
end $$;
