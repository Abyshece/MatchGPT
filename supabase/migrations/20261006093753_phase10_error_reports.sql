-- ============================================================================
-- Phase 10: error reports, kept in our own database
--
-- When the app or the website hits an error it reports it (report_error, from
-- lib/errorReports.ts): the error and where in the code it came from, the
-- screen, the app version and the kind of device and browser. Not who it
-- happened to: no account and no IP address are kept, and the app blanks out
-- emails, phone numbers, ids and tokens before sending.
--
-- The same error on the same day adds up on one row. The table never holds
-- more than 5,000 rows: once full, a new error takes the place of the one seen
-- longest ago (errors marked fixed first). At most 20 new errors a minute and
-- 1,000 a day are kept, so a loop or a flood can't fill it.
--
-- Admins see them in Admin → Errors (admin_list_errors) and can mark one
-- fixed (admin_mark_error_fixed, in the audit log); it comes back if it
-- happens again.
-- ============================================================================

create table public.error_reports (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  day date not null default ((now() at time zone 'utc')::date),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times integer not null default 1 check (times >= 1),
  platform text not null check (platform in ('web', 'android', 'ios')),
  app_version text check (char_length(app_version) <= 40),
  screen text check (char_length(screen) <= 120),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 3000),
  user_agent text check (char_length(user_agent) <= 300),
  fixed_at timestamptz,
  unique (fingerprint, day)
);
create index error_reports_last_seen_idx on public.error_reports (last_seen_at desc);

-- Only the functions below (which run as the table's owner) reach it
alter table public.error_reports enable row level security;
revoke all on public.error_reports from anon, authenticated;

-- ---- Reporting ------------------------------------------------------------------------
create or replace function public.report_error(
  p_platform text,
  p_message text,
  p_stack text default null,
  p_screen text default null,
  p_app_version text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := left(trim(coalesce(p_message, '')), 500);
  v_stack text := nullif(left(coalesce(p_stack, ''), 3000), '');
  v_today date := (now() at time zone 'utc')::date;
  v_fingerprint text;
  v_slot bigint;
begin
  if v_message = '' or p_platform is null or p_platform not in ('web', 'android', 'ios') then
    return;
  end if;
  -- An error is its message and the line of code it came from
  v_fingerprint := md5(p_platform || '|' || left(v_message, 200) || '|'
                       || coalesce(split_part(coalesce(v_stack, ''), E'\n', 2), ''));

  -- Seen today already: it adds up
  update public.error_reports
     set times = times + 1,
         last_seen_at = now(),
         fixed_at = null,
         app_version = coalesce(left(p_app_version, 40), app_version)
   where fingerprint = v_fingerprint and day = v_today;
  if found then
    return;
  end if;

  -- A loop or a flood can't fill the table
  if (select count(*) from public.error_reports where first_seen_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.error_reports where day = v_today) >= 1000 then
    return;
  end if;

  -- Room for 5,000: then a new error takes the place of the one seen longest ago
  if (select count(*) from public.error_reports) >= 5000 then
    select e.id into v_slot
      from public.error_reports e
     order by (e.fixed_at is null), e.last_seen_at
     limit 1
     for update skip locked;
    if v_slot is null then
      return;
    end if;
    update public.error_reports
       set fingerprint = v_fingerprint, day = v_today, first_seen_at = now(), last_seen_at = now(), times = 1,
           platform = p_platform, app_version = left(p_app_version, 40), screen = left(p_screen, 120),
           message = v_message, stack = v_stack, user_agent = left(p_user_agent, 300), fixed_at = null
     where id = v_slot;
    return;
  end if;

  insert into public.error_reports (fingerprint, day, platform, app_version, screen, message, stack, user_agent)
  values (v_fingerprint, v_today, p_platform, left(p_app_version, 40), left(p_screen, 120), v_message, v_stack,
          left(p_user_agent, 300))
  on conflict (fingerprint, day) do update
     set times = public.error_reports.times + 1, last_seen_at = now(), fixed_at = null;
end;
$$;

revoke all on function public.report_error(text, text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text, text) to anon, authenticated;

-- ---- Admin → Errors ---------------------------------------------------------------------
-- Each error once (all its days together), most recent first
create or replace function public.admin_list_errors(p_include_fixed boolean default false, p_limit integer default 200)
returns table (
  id bigint, platform text, app_version text, screen text, message text, stack text, user_agent text,
  times integer, days integer, first_seen_at timestamptz, last_seen_at timestamptz, fixed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can see the error reports' using errcode = '42501';
  end if;
  return query
    select g.id, g.platform, g.app_version, g.screen, g.message, g.stack, g.user_agent,
           g.times, g.days, g.first_seen_at, g.last_seen_at, g.fixed_at
      from (
        select distinct on (e.fingerprint)
               e.id, e.platform, e.app_version, e.screen, e.message, e.stack, e.user_agent,
               (sum(e.times) over w)::integer as times,
               (count(*) over w)::integer as days,
               min(e.first_seen_at) over w as first_seen_at,
               max(e.last_seen_at) over w as last_seen_at,
               e.fixed_at
          from public.error_reports e
        window w as (partition by e.fingerprint)
         order by e.fingerprint, e.last_seen_at desc
      ) g
     where p_include_fixed or g.fixed_at is null
     order by g.last_seen_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;

-- Marks an error fixed (every day it was seen); it shows again if it happens again
create or replace function public.admin_mark_error_fixed(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_message text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can mark errors fixed' using errcode = '42501';
  end if;
  select e.fingerprint, e.message into v_fingerprint, v_message from public.error_reports e where e.id = p_id;
  if v_fingerprint is null then
    raise exception 'No such error' using errcode = 'P0002';
  end if;
  update public.error_reports set fixed_at = now() where fingerprint = v_fingerprint and fixed_at is null;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  select auth.uid(), coalesce(p.email, ''), 'mark_error_fixed', jsonb_build_object('error', left(v_message, 120))
    from public.profiles p
   where p.id = auth.uid();
end;
$$;

revoke all on function public.admin_list_errors(boolean, integer) from public, anon;
revoke all on function public.admin_mark_error_fixed(bigint) from public, anon;
grant execute on function public.admin_list_errors(boolean, integer) to authenticated;
grant execute on function public.admin_mark_error_fixed(bigint) to authenticated;
