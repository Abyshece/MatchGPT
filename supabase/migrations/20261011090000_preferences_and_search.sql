-- ============================================================================
-- Fixes for what members of other matrimony apps complain about most
-- (research in docs/research/competitor-reviews.md), part 3: preferences and
-- search.
--
-- 1. Partner preferences (partner_preferences): the ages, heights, religions,
--    mother tongues, marital status, diets, places and habits a member is
--    looking for. Standouts follow them, search can use them as its starting
--    filters, and a member can hear once a day about new members who fit.
-- 2. Saved searches (saved_searches), up to 10, each with an alert about new
--    members who fit it.
-- 3. The alerts: once a day (search-alerts, 8:43 India time) the search
--    function looks at members who joined since the last look (listed_at:
--    when a profile was first finished), keeps who fits each member's saved
--    searches and preferences, and sends one notification. Only the server
--    writes what was found (new_ids), so a member can't use it to see
--    profiles without searching.
-- 4. Two new filters: the family's home state (family_state, a new profile
--    answer; taken from "Family lives in" where it names a state) and who
--    manages the profile (profile_created_for, asked at sign-up).
-- ============================================================================

-- ---- 1. Partner preferences --------------------------------------------------------------------

create table if not exists public.partner_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  age_min smallint check (age_min between 18 and 80),
  age_max smallint check (age_max between 18 and 80),
  height_min_cm smallint check (height_min_cm between 120 and 230),
  height_max_cm smallint check (height_max_cm between 120 and 230),
  religions text[] not null default '{}' check (cardinality(religions) <= 20),
  mother_tongues text[] not null default '{}' check (cardinality(mother_tongues) <= 40),
  marital_statuses text[] not null default '{}' check (cardinality(marital_statuses) <= 10),
  diets text[] not null default '{}' check (cardinality(diets) <= 15),
  manglik text[] not null default '{}' check (cardinality(manglik) <= 5),
  countries text[] not null default '{}' check (cardinality(countries) <= 30),
  states text[] not null default '{}' check (cardinality(states) <= 40),
  no_smoking boolean not null default false,
  no_drinking boolean not null default false,
  -- A notification once a day about new members who fit
  alerts boolean not null default true,
  -- Written by the server (the search function): when it last looked, who
  -- it found, when it last found someone, and when the member looked at them
  checked_at timestamptz not null default now(),
  new_ids uuid[] not null default '{}',
  alerted_at timestamptz,
  seen_at timestamptz,
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max),
  check (height_min_cm is null or height_max_cm is null or height_min_cm <= height_max_cm)
);
comment on table public.partner_preferences is
  'What a member is looking for: Standouts follow it, search can start from it, and new members who fit it are announced once a day.';

alter table public.partner_preferences enable row level security;
revoke all on table public.partner_preferences from public, anon, authenticated;
grant select on table public.partner_preferences to authenticated;
-- Members write their preferences; what the server found, only the server
grant insert (user_id, age_min, age_max, height_min_cm, height_max_cm, religions, mother_tongues, marital_statuses,
              diets, manglik, countries, states, no_smoking, no_drinking, alerts, updated_at)
  on public.partner_preferences to authenticated;
grant update (user_id, age_min, age_max, height_min_cm, height_max_cm, religions, mother_tongues, marital_statuses,
              diets, manglik, countries, states, no_smoking, no_drinking, alerts, updated_at)
  on public.partner_preferences to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'partner_preferences' and policyname = 'members see their own preferences') then
    create policy "members see their own preferences" on public.partner_preferences
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'partner_preferences' and policyname = 'members set their own preferences') then
    create policy "members set their own preferences" on public.partner_preferences
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'partner_preferences' and policyname = 'members change their own preferences') then
    create policy "members change their own preferences" on public.partner_preferences
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---- 2. Saved searches ----------------------------------------------------------------------------

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  prompt text not null default '' check (char_length(prompt) <= 500),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) < 4000),
  alerts boolean not null default true,
  -- Written by the server: Gemini's reading of the prompt (asked once), when
  -- it last looked, who it found, when it last found someone, and when the
  -- member looked at them
  plan jsonb,
  checked_at timestamptz not null default now(),
  new_ids uuid[] not null default '{}',
  alerted_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.saved_searches is
  'Searches a member saved (up to 10), each with a once-a-day alert about new members who fit it.';
create index if not exists saved_searches_user on public.saved_searches (user_id, created_at);

alter table public.saved_searches enable row level security;
revoke all on table public.saved_searches from public, anon, authenticated;
grant select, delete on table public.saved_searches to authenticated;
grant insert (user_id, name, prompt, filters, alerts) on public.saved_searches to authenticated;
grant update (name, alerts) on public.saved_searches to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'saved_searches' and policyname = 'members see their saved searches') then
    create policy "members see their saved searches" on public.saved_searches
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'saved_searches' and policyname = 'members save searches') then
    create policy "members save searches" on public.saved_searches
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'saved_searches' and policyname = 'members rename their saved searches') then
    create policy "members rename their saved searches" on public.saved_searches
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'saved_searches' and policyname = 'members remove their saved searches') then
    create policy "members remove their saved searches" on public.saved_searches
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

-- Up to 10 a member
create or replace function public.saved_searches_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saved_searches:' || new.user_id::text, 0));
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'You can keep 10 saved searches. Remove one to save this.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.saved_searches_limit() from public, anon, authenticated;
create or replace trigger saved_searches_limit
  before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

-- ---- 3. When a profile was first finished (for "new members" in alerts) --------------------------

alter table public.profiles add column if not exists listed_at timestamptz;
comment on column public.profiles.listed_at is
  'When the profile was first finished (onboarding complete); set by the database. Alerts tell members about people listed since they last looked.';
update public.profiles set listed_at = coalesce(account_created, now())
 where listed_at is null and onboarding_complete = true;

-- Set by the database only: the first time onboarding is complete
create or replace function public.profiles_set_listed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.listed_at := case when coalesce(new.onboarding_complete, false) then now() end;
  elsif old.listed_at is null and coalesce(new.onboarding_complete, false) then
    new.listed_at := now();
  else
    new.listed_at := old.listed_at;
  end if;
  return new;
end;
$$;
create or replace trigger profiles_listed_at
  before insert or update on public.profiles
  for each row execute function public.profiles_set_listed_at();

-- ---- 4. The family's home state ----------------------------------------------------------------

alter table public.profiles add column if not exists family_state text
  check (family_state is null or char_length(family_state) <= 60);
comment on column public.profiles.family_state is
  'The state the family comes from (native place), for the "Family from" filter.';

-- Taken from "Family lives in" where it names a state
update public.profiles p
   set family_state = s.name
  from (values ('Andaman and Nicobar Islands'), ('Andhra Pradesh'), ('Arunachal Pradesh'), ('Assam'), ('Bihar'),
               ('Chandigarh'), ('Chhattisgarh'), ('Dadra and Nagar Haveli and Daman and Diu'), ('Delhi'), ('Goa'),
               ('Gujarat'), ('Haryana'), ('Himachal Pradesh'), ('Jammu and Kashmir'), ('Jharkhand'), ('Karnataka'),
               ('Kerala'), ('Ladakh'), ('Lakshadweep'), ('Madhya Pradesh'), ('Maharashtra'), ('Manipur'), ('Meghalaya'),
               ('Mizoram'), ('Nagaland'), ('Odisha'), ('Puducherry'), ('Punjab'), ('Rajasthan'), ('Sikkim'),
               ('Tamil Nadu'), ('Telangana'), ('Tripura'), ('Uttar Pradesh'), ('Uttarakhand'), ('West Bengal')) s(name)
 where p.family_state is null
   and p.family_location ~* ('\m' || s.name || '\M');

-- ---- 5. The search pool: who the family is from, and when they joined ----------------------------

create or replace function public.search_candidates(p_user_id uuid, p_ids uuid[] default null, p_exclude_liked boolean default false,
                                                    p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  from (
    select
      p.id, p.name, p.age, p.location, p.hometown,
      public.moderated_text(p.id, 'description', p.description) as description,
      public.moderated_photos(p.id, p.photo_urls) as photo_urls,
      p.is_verified, p.subscription_tier, p.gender, p.interested_in, p.hidden_fields,
      case when p.settings_show_online is false then null else p.last_active_at end as last_active_at,
      p.settings_show_online, p.linkedin, p.instagram,
      p.job_title, p.work, p.work_style, p.university, p.education_level,
      p.height, p.body_type, p.hair_color, p.eye_color, p.clothing_style, p.has_tattoos,
      p.ethnicity, p.religion, p.politics, p.zodiac, p.languages,
      p.dating_intention, p.marriage_timeline, p.children, p.family_plans,
      p.interracial_marriage, p.family_closeness, p.pets,
      p.drinking, p.smoking,
      p.gym_routine, p.dietary_preferences, p.sleep_schedule, p.living_preference, p.can_cook,
      p.hobbies, p.travel_style, p.music_genre, p.sports_interest, p.reading_interest,
      p.loves_travel, p.next_travel_destination, p.favorite_drink, p.future_plans, p.dream_house_type,
      p.love_language, p.social_battery, p.attachment_style, p.conflict_resolution,
      p.financial_approach,
      -- Phase 12 (never the date of birth: the age above is worked out from it)
      p.profile_created_for, p.marital_status, p.children_count, p.height_cm, p.disability,
      p.mother_tongue, p.caste, p.sub_caste, p.sect, p.open_to_other_communities, p.gotra,
      p.manglik, p.rashi, p.nakshatra, p.birth_time, p.birth_place, p.horoscope_match,
      p.degree, p.employed_in, p.occupation, p.annual_income,
      p.country, p.state, p.city, p.residential_status, p.settling_abroad,
      p.family_type, p.family_status, p.family_values, p.father_occupation, p.mother_occupation,
      p.brothers, p.brothers_married, p.sisters, p.sisters_married,
      p.family_location, p.family_state, p.living_with_family,
      public.moderated_text(p.id, 'about_family', p.about_family) as about_family,
      -- For the "New" label and the "Usually replies" badge
      p.account_created,
      coalesce((select s.replies_usually from public.member_stats s where s.user_id = p.id), false) as replies_usually,
      -- For the alerts about new members
      coalesce(p.listed_at, p.account_created) as listed_at
    from public.profiles me
    join public.profiles p on p.id <> me.id
    where me.id = p_user_id
      and (p_ids is null or p.id = any (p_ids))
      and p.onboarding_complete = true
      and p.name is not null and p.name <> ''
      and not coalesce(p.is_banned, false)
      and not coalesce(p.is_paused, false)
      -- Opened the app recently (app_settings.inactive_hide_days)
      and coalesce(p.last_active_at, p.account_created, now())
          > now() - make_interval(days => coalesce((select inactive_hide_days from public.app_settings where id), 60))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = me.id))
      -- An interest that still counts keeps them out (one that expired doesn't)
      and (not p_exclude_liked or not exists (
        select 1 from public.likes l where l.liker_id = me.id and l.liked_id = p.id
          and public.interest_active(l.created_at, l.is_super_like)))
      -- Not someone they said they're not interested in
      and (not p_exclude_liked or not exists (
        select 1 from public.passed_profiles x where x.user_id = me.id and x.passed_id = p.id))
      and (not coalesce(p.settings_incognito, false) or exists (
        select 1 from public.likes l where l.liker_id = p.id and l.liked_id = me.id))
      and public.gender_preference_fits(me.interested_in, p.gender)
      and public.gender_preference_fits(p.interested_in, me.gender)
    order by p.last_active_at desc nulls last, p.id
    limit least(greatest(coalesce(p_limit, 5000), 1), 5000)
  ) c;
$function$;

-- The members to look at for alerts: who has a saved search or preferences
-- with alerts on, and when each last looked (the search function, service role)
create or replace function public.alert_members(p_limit integer default 500)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'since', a.since) order by a.since), '[]'::jsonb)
  from (
    select x.user_id, min(x.checked_at) as since
    from (
      select user_id, checked_at from public.saved_searches where alerts
      union all
      select user_id, checked_at from public.partner_preferences where alerts
    ) x
    join public.profiles p on p.id = x.user_id
    where p.onboarding_complete and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false)
    group by x.user_id
    -- Those looked at longest ago first, when there are more than one run takes
    order by min(x.checked_at)
    limit least(greatest(coalesce(p_limit, 500), 1), 5000)
  ) a;
$$;
revoke all on function public.alert_members(integer) from public, anon, authenticated;
grant execute on function public.alert_members(integer) to service_role;

-- ---- 6. Every morning: the alerts ------------------------------------------------------------------
--
-- Calls the search function with the push cron secret (send_push_cron_secret
-- in Vault), like send-push. Does nothing until project_url is set in Vault.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('search-alerts', '13 3 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/search',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_push_cron_secret')),
        body := '{"mode":"alerts"}'::jsonb,
        timeout_milliseconds := 120000)
      where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
        and exists (select 1 from vault.decrypted_secrets where name = 'send_push_cron_secret');
    $job$);
  end if;
end $$;
