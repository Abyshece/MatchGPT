-- ============================================================================
-- Payments and reliability: what other matrimony apps' members complain about,
-- part 5 (docs/research/competitor-reviews.md). Only adds; it needs
-- 20261012090100_trust_and_support_part_2.sql first (team messages of kind
-- 'support' that open My requests).
--
--   - A reminder before Shaadi24+ charges again: 3 days before a plan renews
--     (1 day for the weekly plan), and before a free trial turns into the first
--     charge, with the price, the store and where to cancel
--     (renewal_reminders(); daily job 'renewal-reminders', 10:07 India time)
--   - Your week (my_week()): in the last 7 days, likes, new matches, messages,
--     the Standouts the member was picked for, and new members near them; a
--     notification on Monday mornings ('your-week'), only when there's news
--   - Report a problem (problem_reports, report_problem()): what went wrong,
--     with the screen, app version and device; the team answers in Admin →
--     Errors (admin_list_problems(), admin_answer_problem()) and the member
--     reads it in Settings → My requests
--   - The oldest app that still works (app_settings.min_app_build; app_config()
--     for the app, admin_set_min_app_build() for the owner): an older app asks
--     to be updated, so a broken release can be stopped
--   - Download my data includes problem reports (format 1.6)
-- ============================================================================

-- ---- A reminder before Shaadi24+ charges again ---------------------------------
alter table public.subscriptions add column if not exists renewal_reminded_for timestamptz;

-- "₹999 a month", "₹1,999 for 3 months" (amounts in paise; whole rupees)
create or replace function public.plan_price_words(p_amount integer, p_currency text, p_period text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_currency = 'INR' then '₹' else p_currency || ' ' end
         || trim(to_char(p_amount / 100.0, 'FM99,99,99,990.##'))
         || case p_period
              when 'weekly' then ' a week'
              when 'monthly' then ' a month'
              when 'quarterly' then ' for 3 months'
              when 'halfyearly' then ' for 6 months'
              when 'yearly' then ' a year'
              else '' end;
$$;

create or replace function public.renewal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_sent integer := 0;
  v_day text;
  v_store text;
  v_where text;
  v_price text;
begin
  for r in
    select s.id, s.user_id, s.provider, s.status, bp.amount, bp.currency, bp.period,
           case when s.status = 'authenticated' then s.trial_ends_at else s.current_end end as due
      from public.subscriptions s
      join public.billing_plans bp on bp.id = s.plan_id
      join public.profiles p on p.id = s.user_id
     where s.status in ('authenticated', 'active')
       and s.provider in ('google_play', 'app_store')
       and coalesce(s.auto_renew, true) and not s.cancel_at_period_end
  loop
    continue when r.due is null or r.due <= now() + interval '2 hours'
                  or r.due > now() + case when r.period = 'weekly' then interval '1 day' else interval '3 days' end;
    continue when exists (select 1 from public.subscriptions x where x.id = r.id and x.renewal_reminded_for = r.due);

    v_day := to_char(r.due at time zone 'Asia/Kolkata', 'FMDD Mon');
    v_store := case r.provider when 'google_play' then 'Google Play' else 'the App Store' end;
    v_where := case r.provider when 'google_play' then 'the Play Store → Payments & subscriptions'
                               else 'iPhone Settings → your name → Subscriptions' end;
    v_price := public.plan_price_words(r.amount, r.currency, r.period);

    if r.status = 'authenticated' then
      perform public.message_member(r.user_id, 'support', format('Your free trial ends on %s', v_day),
        format('Then Shaadi24+ is %s, charged by %s. To stop it, cancel in %s before then.', v_price, v_store, v_where),
        null, null, 'Trial ends', true);
    else
      perform public.message_member(r.user_id, 'support', format('Shaadi24+ renews on %s', v_day),
        format('%s, charged by %s. To stop it, cancel in %s before then.', v_price, v_store, v_where),
        null, null, 'Renewal reminder', true);
    end if;
    update public.subscriptions set renewal_reminded_for = r.due where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.renewal_reminders() from public, anon, authenticated;

select cron.schedule('renewal-reminders', '37 4 * * *', $$select public.renewal_reminders();$$);

-- ---- Your week -------------------------------------------------------------------
-- What happened for a member in the last 7 days. Likes and matches with people
-- they blocked, or who blocked them, don't count.
create or replace function public.week_for(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select id, state, gender, interested_in from public.profiles where id = p_user
  ), blocked as (
    select b.blocked_id as other from public.blocks b where b.blocker_id = p_user
    union select b.blocker_id from public.blocks b where b.blocked_id = p_user
  )
  select jsonb_build_object(
    'likes', (select count(*) from public.likes l
               where l.liked_id = p_user and l.created_at > now() - interval '7 days'
                 and l.liker_id not in (select other from blocked)),
    'matches', (select count(*) from public.matches m
                 where (m.user_a_id = p_user or m.user_b_id = p_user) and m.created_at > now() - interval '7 days'
                   and m.unmatched_at is null),
    'messages', (select count(*) from public.messages msg
                   join public.matches m on m.id = msg.match_id
                  where (m.user_a_id = p_user or m.user_b_id = p_user) and m.unmatched_at is null
                    and msg.sender_id <> p_user and msg.created_at > now() - interval '7 days'),
    'standouts', (select count(distinct s.user_id) from public.standouts s
                   where s.candidate_id = p_user and s.created_at > now() - interval '7 days'
                     and s.user_id not in (select other from blocked)),
    'new_near', (select count(*) from public.profiles p, me
                  where p.id <> me.id and p.listed_at > now() - interval '7 days'
                    and p.onboarding_complete and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false)
                    and me.state is not null and p.state = me.state
                    and public.gender_preference_fits(me.interested_in, p.gender)
                    and public.gender_preference_fits(p.interested_in, me.gender)
                    and p.id not in (select other from blocked))
  );
$$;
revoke all on function public.week_for(uuid) from public, anon, authenticated;

create or replace function public.my_week()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else public.week_for(auth.uid()) end;
$$;
revoke all on function public.my_week() from public, anon;
grant execute on function public.my_week() to authenticated;

-- "3 likes, 1 new match and 12 new members near you" (null when nothing happened)
create or replace function public.week_words(p_week jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with parts as (
    select array_remove(array[
      case (p_week->>'likes')::int when 0 then null when 1 then '1 like' else (p_week->>'likes') || ' likes' end,
      case (p_week->>'matches')::int when 0 then null when 1 then '1 new match' else (p_week->>'matches') || ' new matches' end,
      case (p_week->>'messages')::int when 0 then null when 1 then '1 message' else (p_week->>'messages') || ' messages' end,
      case (p_week->>'standouts')::int when 0 then null when 1 then 'picked for 1 person''s Standouts'
        else 'picked for ' || (p_week->>'standouts') || ' people''s Standouts' end,
      case (p_week->>'new_near')::int when 0 then null when 1 then '1 new member near you'
        else (p_week->>'new_near') || ' new members near you' end
    ], null) as a
  )
  select case cardinality(a)
           when 0 then null
           when 1 then a[1]
           else array_to_string(a[1:cardinality(a) - 1], ', ') || ' and ' || a[cardinality(a)]
         end
    from parts;
$$;

-- Monday mornings: each member active in the last 30 days, with news, gets one notification
create or replace function public.send_your_week()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_words text;
  v_sent integer := 0;
begin
  for r in
    select p.id
      from public.profiles p
     where p.onboarding_complete and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false)
       and coalesce(p.settings_push_notifs, true)
       and coalesce(p.last_active_at, p.account_created) > now() - interval '30 days'
  loop
    v_words := public.week_words(public.week_for(r.id));
    continue when v_words is null;
    insert into public.push_queue (user_id, event_type, title, body, data)
    values (r.id, 'your_week', 'Your week on Shaadi24', upper(left(v_words, 1)) || substr(v_words, 2) || '.',
            jsonb_build_object('deep_link', '/search'));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.send_your_week() from public, anon, authenticated;

select cron.schedule('your-week', '43 3 * * 1', $$select public.send_your_week();$$);

-- ---- Report a problem ----------------------------------------------------------------
create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  screen text check (screen is null or char_length(screen) <= 120),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  platform text check (platform is null or platform in ('web', 'android', 'ios')),
  device text check (device is null or char_length(device) <= 300),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer text check (answer is null or char_length(answer) <= 2000),
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists problem_reports_user_idx on public.problem_reports (user_id, created_at desc);
create index if not exists problem_reports_open_idx on public.problem_reports (created_at desc) where status = 'open';

alter table public.problem_reports enable row level security;
revoke all on table public.problem_reports from anon, authenticated;
grant select (id, user_id, details, screen, app_version, platform, status, answer, answered_at, created_at)
  on public.problem_reports to authenticated;
create policy "members see their own problem reports" on public.problem_reports
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.report_problem(
  p_details text, p_screen text default null, p_app_version text default null,
  p_platform text default null, p_device text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if char_length(btrim(coalesce(p_details, ''))) < 10 then
    raise exception 'Please tell us what happened (at least 10 characters).';
  end if;
  if (select count(*) from public.problem_reports
       where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve reported several problems today. We''re looking into them.';
  end if;
  insert into public.problem_reports (user_id, details, screen, app_version, platform, device)
  values (uid, left(btrim(p_details), 2000), left(nullif(btrim(coalesce(p_screen, '')), ''), 120),
          left(nullif(btrim(coalesce(p_app_version, '')), ''), 40),
          case when p_platform in ('web', 'android', 'ios') then p_platform end,
          left(nullif(btrim(coalesce(p_device, '')), ''), 300))
  returning id into v_id;

  perform public.notify_admins('admin_problem', 'A member reported a problem',
    left(btrim(p_details), 120) || ' Open Admin → Errors.',
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'errors', 'problem_id', v_id), uid);
  return v_id;
end;
$$;
revoke all on function public.report_problem(text, text, text, text, text) from public, anon;
grant execute on function public.report_problem(text, text, text, text, text) to authenticated;

create or replace function public.admin_list_problems(p_open_only boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.admin_can(array['errors']) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'user_id', r.user_id, 'name', p.name, 'details', r.details, 'screen', r.screen,
             'app_version', r.app_version, 'platform', r.platform, 'device', r.device, 'status', r.status,
             'answer', r.answer, 'answered_at', r.answered_at, 'created_at', r.created_at)
           order by r.created_at desc)
      from (select * from public.problem_reports
             where not coalesce(p_open_only, true) or status = 'open'
             order by created_at desc limit 200) r
      left join public.profiles p on p.id = r.user_id), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_problems(boolean) from public, anon;
grant execute on function public.admin_list_problems(boolean) to authenticated;

-- An answer goes to the member (a message that opens My requests); closing
-- without an answer just takes it off the list
create or replace function public.admin_answer_problem(p_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.problem_reports;
  v_answer text := nullif(btrim(coalesce(p_answer, '')), '');
  v_email text;
begin
  if not public.admin_can(array['errors']) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.problem_reports
     set status = case when v_answer is null then 'closed' else 'answered' end,
         answer = coalesce(left(v_answer, 2000), answer),
         answered_at = now(), answered_by = auth.uid()
   where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No such problem report';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), coalesce(v_email, ''), case when v_answer is null then 'close_problem' else 'answer_problem' end,
          v_row.user_id, jsonb_build_object('problem_id', p_id, 'answer', v_answer));
  if v_answer is not null then
    perform public.message_member(v_row.user_id, 'support', 'We''ve answered your problem report',
      'Read it in Settings → My requests.', 'Read it', 'requests', 'Problem answered', true);
  end if;
end;
$$;
revoke all on function public.admin_answer_problem(uuid, text) from public, anon;
grant execute on function public.admin_answer_problem(uuid, text) to authenticated;

-- My requests: problem reports too
create or replace function public.my_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'status', v.status, 'created_at', v.created_at, 'reviewed_at', v.reviewed_at,
               'reason_code', v.reason_code, 'note', case when v.status = 'rejected' then v.admin_notes end,
               'selfie', v.selfie_path is not null)
             order by v.created_at desc)
        from (select * from public.verification_requests
               where user_id = auth.uid() order by created_at desc limit 20) v), '[]'::jsonb),
    'complaints', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'ticket', g.ticket, 'category', g.category, 'status', g.status,
               'created_at', g.created_at, 'due_at', g.due_at, 'resolved_at', g.resolved_at,
               'resolution', g.resolution)
             order by g.created_at desc)
        from (select * from public.grievances
               where user_id = auth.uid() order by created_at desc limit 50) g), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', p.name, 'reason', r.reason,
               'outcome', case when r.status in ('resolved', 'actioned') then 'acted'
                               when r.status in ('dismissed', 'reviewed') then 'no_breach'
                               else 'open' end,
               'created_at', r.created_at, 'resolved_at', r.resolved_at)
             order by r.created_at desc)
        from (select * from public.reports
               where reporter_id = auth.uid() order by created_at desc limit 50) r
        left join public.profiles p on p.id = r.reported_id), '[]'::jsonb),
    'problems', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'details', x.details, 'status', x.status, 'answer', x.answer,
               'created_at', x.created_at, 'answered_at', x.answered_at)
             order by x.created_at desc)
        from (select * from public.problem_reports
               where user_id = auth.uid() order by created_at desc limit 50) x), '[]'::jsonb)
  );
$$;

-- ---- The oldest app that still works -------------------------------------------------
-- The app's build number (major × 10000 + minor × 100 + patch, the same on
-- both phones: scripts/app-version.mjs). 0: every version works.
alter table public.app_settings add column if not exists min_app_build integer not null default 0
  check (min_app_build >= 0);

create or replace function public.app_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('min_app_build', coalesce((select min_app_build from public.app_settings limit 1), 0));
$$;
revoke all on function public.app_config() from public;
grant execute on function public.app_config() to anon, authenticated;

create or replace function public.admin_set_min_app_build(p_build integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not public.admin_can(array['owner']) then
    raise exception 'Only the owner can change this.' using errcode = '42501';
  end if;
  if p_build is null or p_build < 0 or p_build > 999999 then
    raise exception 'A build number like 10203 (version 1.2.3), or 0 for every version.';
  end if;
  update public.app_settings set min_app_build = p_build, updated_at = now() where id;  -- the one row
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(v_email, ''), 'set_min_app_build', jsonb_build_object('min_app_build', p_build));
end;
$$;
revoke all on function public.admin_set_min_app_build(integer) from public, anon;
grant execute on function public.admin_set_min_app_build(integer) to authenticated;

-- ---- "Download my data": problem reports too ---------------------------------------
-- (as in 20261012090000_trust_and_support.sql, with problem_reports; reads the
-- Razorpay fields of payments only while they exist)
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  uid uuid;
  result jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'export_metadata', jsonb_build_object(
      'exported_at', now(),
      'user_id', uid,
      'format_version', '1.6',
      'app', 'Shaadi24',
      'note', 'This export contains data we hold about your account. It does not include data about other users (e.g. their messages to you are excluded; only your messages are listed). A verification selfie is not included: we delete it once your request is decided.'
    ),
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = uid
    ),
    'partner_preferences', (
      select to_jsonb(pp) - 'new_ids' from public.partner_preferences pp where pp.user_id = uid
    ),
    'likes_sent', (
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.likes l where l.liker_id = uid
    ),
    'likes_received_count', (
      -- Only count, not detail — would leak info about who likes you (others' data)
      select count(*) from public.likes where liked_id = uid
    ),
    'matches', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.matches m
      where m.user_a_id = uid or m.user_b_id = uid
    ),
    'messages_sent', (
      select coalesce(jsonb_agg(to_jsonb(msg)), '[]'::jsonb)
      from public.messages msg
      where msg.sender_id = uid
    ),
    'reports_filed', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'admin_notes'), '[]'::jsonb)
      from public.reports r
      where r.reporter_id = uid
    ),
    'complaints', (
      select coalesce(jsonb_agg(to_jsonb(g) - 'handled_by' order by g.created_at), '[]'::jsonb)
      from public.grievances g
      where g.user_id = uid
    ),
    'problem_reports', (
      select coalesce(jsonb_agg(to_jsonb(x) - 'answered_by' order by x.created_at), '[]'::jsonb)
      from public.problem_reports x
      where x.user_id = uid
    ),
    'verification_requests', (
      select coalesce(jsonb_agg(to_jsonb(v) - 'reviewed_by'), '[]'::jsonb)
      from public.verification_requests v
      where v.user_id = uid
    ),
    'blocks_created', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.blocks b
      where b.blocker_id = uid
    ),
    'hidden_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('profile_id', h.passed_id, 'hidden_at', h.created_at)
                                order by h.created_at), '[]'::jsonb)
      from public.passed_profiles h
      where h.user_id = uid
    ),
    'search_history', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from public.search_history s
      where s.user_id = uid
    ),
    'saved_searches', (
      select coalesce(jsonb_agg(to_jsonb(s) - 'new_ids' order by s.created_at), '[]'::jsonb)
      from public.saved_searches s
      where s.user_id = uid
    ),
    'found_my_match_story', (
      select coalesce(jsonb_agg(jsonb_build_object('names', st.names, 'story', st.story,
                                                   'published', st.published, 'told_at', st.created_at)), '[]'::jsonb)
      from public.success_stories st
      where st.created_by = uid
    ),
    'consent_records', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.consent_records c
      where c.user_id = uid
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', s.provider, 'plan', s.plan_id, 'status', s.status, 'test', s.mode = 'test',
          'trial_ends_at', s.trial_ends_at, 'period_start', s.current_start, 'period_end', s.current_end,
          'renews', coalesce(s.auto_renew, not s.cancel_at_period_end), 'ended_at', s.ended_at,
          'started_at', s.created_at) order by s.created_at), '[]'::jsonb)
      from public.subscriptions s
      where s.user_id = uid
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', p.provider, 'reference', coalesce(p.store_order_id, to_jsonb(p) ->> 'razorpay_payment_id'),
          'amount', p.amount, 'currency', p.currency, 'amount_unit', 'smallest currency unit (paise for INR)',
          'status', p.status, 'method', p.method, 'paid_at', p.paid_at,
          'refunded_amount', p.refunded_amount, 'refunded_at', p.refunded_at)
          || case when to_jsonb(p) ? 'invoice_url'
                  then jsonb_build_object('invoice_url', to_jsonb(p) -> 'invoice_url') else '{}'::jsonb end
          order by p.paid_at), '[]'::jsonb)
      from public.payments p
      where p.user_id = uid
    ),
    -- Where notifications go: phones with the app, and browsers
    'notification_devices', jsonb_build_object(
      'phones', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'platform', d.platform, 'app_version', d.app_version,
            'added_at', d.created_at, 'last_signed_up_at', d.updated_at) order by d.created_at), '[]'::jsonb)
        from public.push_devices d
        where d.user_id = uid
      ),
      'browsers', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'browser', ps.user_agent, 'added_at', ps.created_at) order by ps.created_at), '[]'::jsonb)
        from public.push_subscriptions ps
        where ps.user_id = uid
      )
    ),
    -- Sign in with Apple: since when a token is kept to end it when the
    -- account is deleted (not the token itself)
    'sign_in_with_apple', (
      select jsonb_build_object('token_kept_since', t.created_at, 'last_updated_at', t.updated_at)
      from public.apple_sign_in_tokens t
      where t.user_id = uid
    )
  ) into result;

  return result;
end;
$$;
