-- ============================================================================
-- Search limits, like Claude's usage limits
--
-- Every AI search counts toward three limits, each with its own reset:
--   window  so many searches in 5 hours, the window starting with the first
--           search after the last one ended (app_settings.search_window_hours)
--   day     so many a day, midnight to midnight India time; free accounts get
--           one more for each profile section they've completed (search_bonus)
--   week    so many a week, from Friday 6 in the evening India time to the
--           next (app_settings.search_week_reset_dow / _hour)
-- A search goes ahead only while none is used up; the member is told which
-- one stopped them and when they can search again. Free accounts and
-- Shaadi24+ subscribers each have their numbers (search_limits; empty = no
-- limit), which owners change in Admin → Search insights.
--
-- Before this, free accounts had 3 a day plus the bonus (from midnight UTC)
-- and Shaadi24+ was unlimited.
-- ============================================================================

alter table public.app_settings
  add column if not exists search_window_hours smallint not null default 5
    check (search_window_hours between 1 and 24),
  add column if not exists search_week_reset_dow smallint not null default 5
    check (search_week_reset_dow between 0 and 6),        -- 0 Sunday … 5 Friday, 6 Saturday
  add column if not exists search_week_reset_hour smallint not null default 18
    check (search_week_reset_hour between 0 and 23);      -- India time

create table if not exists public.search_limits (
  plan text primary key check (plan in ('free', 'plus')),
  per_window integer check (per_window is null or per_window between 1 and 1000),
  per_day integer check (per_day is null or per_day between 1 and 1000),   -- free: before the profile bonus
  per_week integer check (per_week is null or per_week between 1 and 10000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.search_limits enable row level security;  -- only through the functions below
revoke all on public.search_limits from anon, authenticated;
insert into public.search_limits (plan, per_window, per_day, per_week) values
  ('free', 3, 3, 30),
  ('plus', 15, 50, 200)
on conflict (plan) do nothing;

-- Each member's counts (one row each, written only by search_allowance())
create table if not exists public.search_usage (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz,
  window_count integer not null default 0,
  day date,                         -- India date
  day_count integer not null default 0,
  week_started_at timestamptz,
  week_count integer not null default 0,
  limited_at timestamptz,           -- the last time a search was refused, and by which limit
  limited_by text check (limited_by in ('window', 'day', 'week')),
  updated_at timestamptz not null default now()
);
alter table public.search_usage enable row level security;
revoke all on public.search_usage from anon, authenticated;
create index if not exists search_usage_limited on public.search_usage (limited_at) where limited_at is not null;

-- When the week that p_at falls in began: the last Friday 6 pm India time (or the day and hour set)
create or replace function public.search_week_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public
as $$
  with s as (
    select coalesce((select a.search_week_reset_dow from public.app_settings a limit 1), 5) as dow,
           coalesce((select a.search_week_reset_hour from public.app_settings a limit 1), 18) as hr,
           (p_at at time zone 'Asia/Kolkata') as local_at
  ), c as (
    select date_trunc('day', s.local_at)
             - make_interval(days => ((extract(dow from s.local_at)::int - s.dow + 7) % 7))
             + make_interval(hours => s.hr) as start_local,
           s.local_at
      from s
  )
  select (case when c.start_local > c.local_at then c.start_local - interval '7 days' else c.start_local end)
           at time zone 'Asia/Kolkata'
    from c;
$$;

-- A member's searches: how many are left, until when, and (p_consume) using one up.
-- 'allowed': with p_consume, whether this search went ahead; without, whether one can now.
create or replace function public.search_allowance(p_user uuid, p_consume boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_tier text;
  v_bonus integer;
  v_plan text;
  v_lim public.search_limits;
  v_hours integer := coalesce((select s.search_window_hours from public.app_settings s limit 1), 5);
  v_u public.search_usage;
  v_today date := (v_now at time zone 'Asia/Kolkata')::date;
  v_week timestamptz := public.search_week_start(v_now);
  w_used integer; w_start timestamptz; w_resets timestamptz; w_limit integer;
  d_used integer; d_limit integer; d_resets timestamptz;
  k_used integer; k_limit integer; k_resets timestamptz;
  v_blocked text; v_blocked_until timestamptz;
  v_allowed boolean;
  v_remaining integer; v_until timestamptz; v_by text;
begin
  select subscription_tier, coalesce(search_bonus, 0) into v_tier, v_bonus from public.profiles where id = p_user;
  if not found then
    raise exception 'Profile not found';
  end if;
  v_plan := case when v_tier = 'PRO' then 'plus' else 'free' end;
  select * into v_lim from public.search_limits where plan = v_plan;

  if p_consume then
    insert into public.search_usage (user_id) values (p_user) on conflict (user_id) do nothing;
    select * into v_u from public.search_usage where user_id = p_user for update;
  else
    select * into v_u from public.search_usage where user_id = p_user;
  end if;

  -- The window: from the first search after the last window ended
  if v_u.window_started_at is not null and v_now < v_u.window_started_at + make_interval(hours => v_hours) then
    w_used := v_u.window_count;
    w_start := v_u.window_started_at;
  else
    w_used := 0;
    w_start := null;
  end if;
  w_limit := v_lim.per_window;

  d_used := case when v_u.day = v_today then v_u.day_count else 0 end;
  d_limit := case when v_lim.per_day is null then null
                  when v_plan = 'free' then v_lim.per_day + v_bonus
                  else v_lim.per_day end;
  d_resets := (v_today + 1)::timestamp at time zone 'Asia/Kolkata';

  k_used := case when v_u.week_started_at = v_week then v_u.week_count else 0 end;
  k_limit := v_lim.per_week;
  k_resets := v_week + interval '7 days';

  -- Used up?
  v_allowed := not ((w_limit is not null and w_used >= w_limit)
                 or (d_limit is not null and d_used >= d_limit)
                 or (k_limit is not null and k_used >= k_limit));

  if p_consume then
    if v_allowed then
      w_start := coalesce(w_start, v_now);
      w_used := w_used + 1;
      d_used := d_used + 1;
      k_used := k_used + 1;
      update public.search_usage
         set window_started_at = w_start, window_count = w_used,
             day = v_today, day_count = d_used,
             week_started_at = v_week, week_count = k_used,
             updated_at = v_now
       where user_id = p_user;
      -- The day's count on the profile too (Admin → Customers, and apps from before this)
      update public.profiles set daily_search_count = d_used, last_search_date = v_today where id = p_user;
    end if;
  end if;
  w_resets := w_start + make_interval(hours => v_hours);  -- null while no window is running

  -- Used up now: searching again waits for the last of those limits to reset
  if w_limit is not null and w_used >= w_limit then
    v_blocked := 'window'; v_blocked_until := w_resets;
  end if;
  if d_limit is not null and d_used >= d_limit and (v_blocked_until is null or d_resets > v_blocked_until) then
    v_blocked := 'day'; v_blocked_until := d_resets;
  end if;
  if k_limit is not null and k_used >= k_limit and (v_blocked_until is null or k_resets > v_blocked_until) then
    v_blocked := 'week'; v_blocked_until := k_resets;
  end if;
  if p_consume and not v_allowed then
    update public.search_usage set limited_at = v_now, limited_by = v_blocked, updated_at = v_now where user_id = p_user;
  end if;

  -- Left: the fewest of the three, until that limit resets (the later one when two leave the same)
  if w_limit is not null then
    v_remaining := greatest(w_limit - w_used, 0); v_by := 'window'; v_until := w_resets;
  end if;
  if d_limit is not null and (v_remaining is null or greatest(d_limit - d_used, 0) < v_remaining
                              or (greatest(d_limit - d_used, 0) = v_remaining and d_resets > coalesce(v_until, '-infinity'))) then
    v_remaining := greatest(d_limit - d_used, 0); v_by := 'day'; v_until := d_resets;
  end if;
  if k_limit is not null and (v_remaining is null or greatest(k_limit - k_used, 0) < v_remaining
                              or (greatest(k_limit - k_used, 0) = v_remaining and k_resets > coalesce(v_until, '-infinity'))) then
    v_remaining := greatest(k_limit - k_used, 0); v_by := 'week'; v_until := k_resets;
  end if;

  return jsonb_build_object(
    'allowed', case when p_consume then v_allowed else v_blocked is null end,
    'plan', v_plan,
    'remaining', v_remaining,           -- null: no limits at all
    'remaining_by', v_by,
    'remaining_until', v_until,         -- null for the window before it starts
    'limited_by', v_blocked,
    'next_search_at', v_blocked_until,
    'limit', d_limit,                   -- the day's, for apps from before this
    'window', jsonb_build_object('used', w_used, 'limit', w_limit, 'hours', v_hours, 'resets_at', w_resets),
    'day', jsonb_build_object('used', d_used, 'limit', d_limit,
                              'bonus', case when v_plan = 'free' then v_bonus else 0 end, 'resets_at', d_resets),
    'week', jsonb_build_object('used', k_used, 'limit', k_limit, 'resets_at', k_resets),
    'plans', (select jsonb_object_agg(l.plan, jsonb_build_object('per_window', l.per_window, 'per_day', l.per_day, 'per_week', l.per_week))
                from public.search_limits l),
    'week_reset', jsonb_build_object('dow', coalesce((select a.search_week_reset_dow from public.app_settings a limit 1), 5),
                                     'hour', coalesce((select a.search_week_reset_hour from public.app_settings a limit 1), 18)));
end;
$$;
revoke all on function public.search_allowance(uuid, boolean) from public, anon, authenticated;

-- The search function's (service role): one search used, if any is left
create or replace function public.consume_search(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.search_allowance(p_user_id, true);
$$;
revoke execute on function public.consume_search(uuid) from public, anon, authenticated;
grant execute on function public.consume_search(uuid) to service_role;

-- The signed-in member's own, for the app
create or replace function public.my_search_allowance()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.search_allowance(auth.uid(), false) where auth.uid() is not null;
$$;
revoke all on function public.my_search_allowance() from public, anon;
grant execute on function public.my_search_allowance() to authenticated;

-- My Profile's "searches a day" follows the plans' numbers: the member's own
-- (free: with the profile bonus) and the free plan's before the bonus. null:
-- no daily limit
create or replace function public.my_profile_sections()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'sections', public.profile_sections(p),
           'bonus', p.search_bonus,
           'daily_searches', case when p.subscription_tier = 'PRO'
                                  then (select l.per_day from public.search_limits l where l.plan = 'plus')
                                  else (select l.per_day + p.search_bonus from public.search_limits l where l.plan = 'free') end,
           'free_daily_searches', (select l.per_day from public.search_limits l where l.plan = 'free'))
    from public.profiles p
   where p.id = auth.uid();
$$;

-- ---- Admin → Search insights ------------------------------------------------------------------------

create or replace function public.admin_search_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_can(array['search', 'owner']) then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'window_hours', coalesce((select a.search_window_hours from public.app_settings a limit 1), 5),
    'week_reset_dow', coalesce((select a.search_week_reset_dow from public.app_settings a limit 1), 5),
    'week_reset_hour', coalesce((select a.search_week_reset_hour from public.app_settings a limit 1), 18),
    'plans', (select jsonb_object_agg(l.plan, jsonb_build_object('per_window', l.per_window, 'per_day', l.per_day,
                                                                  'per_week', l.per_week, 'updated_at', l.updated_at))
                from public.search_limits l),
    'can_edit', public.admin_can(array['owner']),
    'week_started_at', public.search_week_start(now()),
    -- Members stopped by a limit in the last 7 days, by the limit that stopped them last
    'limited_7d', (select jsonb_build_object('members', count(*),
                                             'window', count(*) filter (where u.limited_by = 'window'),
                                             'day', count(*) filter (where u.limited_by = 'day'),
                                             'week', count(*) filter (where u.limited_by = 'week'))
                     from public.search_usage u where u.limited_at > now() - interval '7 days'),
    'searching_this_week', (select count(*) from public.search_usage u
                             where u.week_started_at = public.search_week_start(now()) and u.week_count > 0));
end;
$$;

-- Owners only. {window_hours, week_reset_dow, week_reset_hour, plans: {free: {per_window, per_day, per_week}, plus: {…}}};
-- a number left out or null means no limit
create or replace function public.admin_set_search_limits(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_p jsonb;
begin
  if not public.admin_can(array['owner']) then
    raise exception 'Forbidden';
  end if;
  update public.app_settings
     set search_window_hours = coalesce((p_settings ->> 'window_hours')::smallint, search_window_hours),
         search_week_reset_dow = coalesce((p_settings ->> 'week_reset_dow')::smallint, search_week_reset_dow),
         search_week_reset_hour = coalesce((p_settings ->> 'week_reset_hour')::smallint, search_week_reset_hour),
         updated_at = now()
   where id;
  foreach v_plan in array array['free', 'plus'] loop
    v_p := p_settings -> 'plans' -> v_plan;
    continue when v_p is null;
    update public.search_limits
       set per_window = nullif(v_p ->> 'per_window', '')::integer,
           per_day = nullif(v_p ->> 'per_day', '')::integer,
           per_week = nullif(v_p ->> 'per_week', '')::integer,
           updated_by = auth.uid(), updated_at = now()
     where plan = v_plan;
  end loop;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'set_search_limits', p_settings);
end;
$$;

revoke all on function public.admin_search_limits() from public, anon;
revoke all on function public.admin_set_search_limits(jsonb) from public, anon;
grant execute on function public.admin_search_limits(), public.admin_set_search_limits(jsonb) to authenticated;
