-- ============================================================================
-- Admin, part 6: automatic messages
--
-- Messages from the team that send themselves (Admin → Automatic messages),
-- in the app and as a notification, each to the members it's for:
--
--   welcome             finished sign-up in the last 3 days
--   no_photo            finished sign-up a day ago or more, and no photo yet
--   profile_incomplete  2 days in, fewer than 3 of the 6 profile sections
--                       complete (again after 14 days if still so)
--   verify              3 days in, not verified, not waiting to be
--   inactive_7          not seen for 7 days (again only after they've been
--   inactive_30         back), and for 30 days (the week's one stops then)
--
-- A member gets one automatic message a day at most: the first of these due.
-- Each is on or off, with its own words and button. run_automations() runs
-- every hour (pg_cron), between 9 in the morning and 9 at night India time,
-- 500 members an automation a run at most. Notifications only go to members
-- who left them on. Every send is kept, for the counts in the admin panel.
--
-- Also: messages from Admin → Messages no longer notify members who turned
-- notifications off (they still see them in the app).
-- ============================================================================

create table if not exists public.automations (
  id text primary key check (id in ('welcome', 'no_photo', 'profile_incomplete', 'verify', 'inactive_7', 'inactive_30')),
  sort integer not null,
  enabled boolean not null default true,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  cta_label text check (cta_label is null or char_length(btrim(cta_label)) between 1 and 40),
  cta_target text check (cta_target is null or cta_target ~ '^(profile(:(about|community|career|family|lifestyle|plans))?|verify|upgrade|search)$'),
  push boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.automations enable row level security;
revoke all on public.automations from anon, authenticated;

insert into public.automations (id, sort, title, body, cta_label, cta_target) values
  ('welcome', 1, 'Welcome to Shaadi24 💍',
   'Describe the person you hope to marry in your own words, and we''ll find the people who fit you best.', 'Start searching', 'search'),
  ('no_photo', 2, 'Add a photo to be seen',
   'Profiles with a photo get many more likes. Add one clear photo of yourself; our team checks it before others see it.', 'Add a photo', 'profile'),
  ('profile_incomplete', 3, 'A fuller profile, better matches',
   'Members who fill in more of their profile get better matches, and extra free searches every day.', 'Fill in my profile', 'profile'),
  ('verify', 4, 'Get the Verified badge',
   'Verified profiles are trusted more. It takes a minute: link a social profile and our team checks it.', 'Get verified', 'verify'),
  ('inactive_7', 5, 'New people may fit you',
   'New members have joined since you last looked. Search again to see who fits you best.', 'Search now', 'search'),
  ('inactive_30', 6, 'We''ve missed you',
   'Many new members have joined Shaadi24 this month. Have another look; the right person may be waiting.', 'Search now', 'search')
on conflict (id) do nothing;

create table if not exists public.automation_sends (
  id bigint generated always as identity primary key,
  automation_id text not null references public.automations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.admin_messages (id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists automation_sends_user on public.automation_sends (automation_id, user_id, sent_at desc);
create index if not exists automation_sends_member on public.automation_sends (user_id, sent_at desc);
alter table public.automation_sends enable row level security;
revoke all on public.automation_sends from anon, authenticated;

-- Who each automation is for, right now
create or replace function public.automation_audience(p_id text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
    left join lateral (
      select max(s.sent_at) as last_sent from public.automation_sends s where s.automation_id = p_id and s.user_id = p.id
    ) sent on true
   where coalesce(p.onboarding_complete, false)
     and not coalesce(p.is_banned, false)
     and not coalesce(p.is_paused, false)
     -- one automatic message a day at most
     and not exists (select 1 from public.automation_sends d where d.user_id = p.id and d.sent_at > now() - interval '1 day')
     and case p_id
           when 'welcome' then sent.last_sent is null and p.account_created > now() - interval '3 days'
           when 'no_photo' then sent.last_sent is null and p.account_created < now() - interval '1 day'
             and coalesce(cardinality(p.photo_urls), 0) = 0
           when 'profile_incomplete' then p.account_created < now() - interval '2 days'
             and (sent.last_sent is null or sent.last_sent < now() - interval '14 days')
             and (select count(*) filter (where (s->>'complete')::boolean) from jsonb_array_elements(public.profile_sections(p)) s) < 3
           when 'verify' then sent.last_sent is null and p.account_created < now() - interval '3 days'
             and not coalesce(p.is_verified, false)
             and not exists (select 1 from public.verification_requests v where v.user_id = p.id and v.status = 'pending')
           when 'inactive_7' then coalesce(p.last_active_at, p.account_created) < now() - interval '7 days'
             and coalesce(p.last_active_at, p.account_created) >= now() - interval '30 days'
             and (sent.last_sent is null or sent.last_sent < coalesce(p.last_active_at, p.account_created))
           when 'inactive_30' then coalesce(p.last_active_at, p.account_created) < now() - interval '30 days'
             and (sent.last_sent is null or sent.last_sent < coalesce(p.last_active_at, p.account_created))
           else false
         end;
$$;
revoke all on function public.automation_audience(text) from public, anon, authenticated;

-- Send what's due. p_force: at any hour (the admin's "Send now"); otherwise 9am–9pm India time only
create or replace function public.run_automations(p_force boolean default false, p_only text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto public.automations;
  v_user uuid;
  v_msg uuid;
  v_sent jsonb := '{}'::jsonb;
  v_n integer;
  v_hour integer := extract(hour from now() at time zone 'Asia/Kolkata');
begin
  if not p_force and (v_hour < 9 or v_hour >= 21) then
    return jsonb_build_object('skipped', 'quiet hours');
  end if;
  for v_auto in select * from public.automations where enabled and (p_only is null or id = p_only) order by sort loop
    v_n := 0;
    for v_user in select a.user_id from public.automation_audience(v_auto.id) a limit 500 loop
      v_msg := public.message_member(v_user, 'automation', v_auto.title, v_auto.body, v_auto.cta_label, v_auto.cta_target,
                                     'Automatic: ' || v_auto.id, v_auto.push);
      insert into public.automation_sends (automation_id, user_id, message_id) values (v_auto.id, v_user, v_msg);
      v_n := v_n + 1;
    end loop;
    v_sent := v_sent || jsonb_build_object(v_auto.id, v_n);
  end loop;
  return jsonb_build_object('sent', v_sent);
end;
$$;
revoke all on function public.run_automations(boolean, text) from public, anon, authenticated;

-- ---- Admin ------------------------------------------------------------------------------------------

create or replace function public.admin_automations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'enabled', a.enabled, 'title', a.title, 'body', a.body, 'cta_label', a.cta_label,
             'cta_target', a.cta_target, 'push', a.push, 'updated_at', a.updated_at,
             'waiting', (select count(*) from public.automation_audience(a.id)),
             'sent', (select count(*) from public.automation_sends s where s.automation_id = a.id),
             'sent_7', (select count(*) from public.automation_sends s where s.automation_id = a.id and s.sent_at > now() - interval '7 days'),
             'seen', (select count(*) from public.automation_sends s join public.member_messages mm on mm.message_id = s.message_id
                       where s.automation_id = a.id and mm.seen_at is not null),
             'clicked', (select count(*) from public.automation_sends s join public.member_messages mm on mm.message_id = s.message_id
                          where s.automation_id = a.id and mm.clicked_at is not null),
             'last_sent', (select max(s.sent_at) from public.automation_sends s where s.automation_id = a.id))
           order by a.sort), '[]'::jsonb)
      from public.automations a);
end;
$$;

create or replace function public.admin_save_automation(p_id text, p_enabled boolean, p_title text, p_body text,
                                                        p_cta_label text, p_cta_target text, p_push boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  update public.automations
     set enabled = p_enabled, title = btrim(p_title), body = btrim(p_body),
         cta_label = nullif(btrim(coalesce(p_cta_label, '')), ''), cta_target = nullif(btrim(coalesce(p_cta_target, '')), ''),
         push = p_push, updated_by = auth.uid(), updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'No such automatic message';
  end if;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'save_automation', jsonb_build_object('automation', p_id, 'enabled', p_enabled));
end;
$$;

-- "Send now": to those it's due for, at any hour
create or replace function public.admin_run_automation(p_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  if not exists (select 1 from public.automations where id = p_id and enabled) then
    raise exception 'Turn it on first';
  end if;
  v_result := public.run_automations(true, p_id);
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'run_automation', jsonb_build_object('automation', p_id, 'sent', v_result -> 'sent' -> p_id));
  return coalesce((v_result -> 'sent' ->> p_id)::integer, 0);
end;
$$;

revoke all on function public.admin_automations() from public, anon;
revoke all on function public.admin_save_automation(text, boolean, text, text, text, text, boolean) from public, anon;
revoke all on function public.admin_run_automation(text) from public, anon;
grant execute on function public.admin_automations(), public.admin_save_automation(text, boolean, text, text, text, text, boolean),
  public.admin_run_automation(text) to authenticated;

-- ---- Every hour --------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'run-automations';
    perform cron.schedule('run-automations', '7 * * * *', 'select public.run_automations()');
  end if;
end $$;

-- ---- Messages from Admin → Messages: notifications only to members who left them on ---------------

create or replace function public.admin_send_message(
  p_title text, p_body text, p_cta_label text, p_cta_target text,
  p_audience jsonb, p_audience_label text, p_push boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.admin_messages;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  insert into public.admin_messages (title, body, cta_label, cta_target, audience, audience_label, pushed, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_cta_label, '')), ''), nullif(btrim(coalesce(p_cta_target, '')), ''),
          p_audience, coalesce(nullif(btrim(p_audience_label), ''), p_audience->>'kind'), coalesce(p_push, true), auth.uid())
  returning * into v_message;

  insert into public.member_messages (message_id, user_id)
  select v_message.id, a.user_id from public.message_audience(p_audience) a;
  get diagnostics v_count = row_count;

  update public.admin_messages set recipients = v_count where id = v_message.id;

  if coalesce(p_push, true) then
    insert into public.push_queue (user_id, event_type, title, body, data)
    select mm.user_id, 'admin_message', v_message.title, v_message.body,
           jsonb_build_object('message_id', v_message.id, 'target', v_message.cta_target)
      from public.member_messages mm
      join public.profiles p on p.id = mm.user_id
     where mm.message_id = v_message.id
       and coalesce(p.settings_push_notifs, true);
  end if;

  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'send_message',
          jsonb_build_object('message_id', v_message.id, 'title', v_message.title, 'audience', v_message.audience_label, 'recipients', v_count));

  return jsonb_build_object('id', v_message.id, 'recipients', v_count);
end;
$$;
