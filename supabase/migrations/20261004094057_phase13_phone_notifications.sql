-- ============================================================================
-- Phase 13: notifications in the phone apps
--
-- The apps get notifications through Firebase Cloud Messaging (FCM), which
-- delivers to Android phones and, through Apple's push service, to iPhones.
-- A phone that allows notifications registers its FCM token for whoever is
-- signed in on it (register_push_device). send-push sends each queued
-- notification to the person's browsers (Web Push, as before) and phones:
-- pending_pushes now lists both, with the channel. Notifications more than a
-- day old are no longer sent. "Download my data" lists the phones and
-- browsers notifications go to. Signing a phone out, the 10-phone limit and
-- clearing the queue are in the next migration (…_phone_notifications_signout).
-- ============================================================================

-- ---- Phones -----------------------------------------------------------------------
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  -- The phone's FCM registration token: a phone has one, so it belongs to one account at a time
  token text not null unique check (length(token) between 20 and 4096),
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  failure_count integer not null default 0
);

create index push_devices_user_id_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;

-- People can see which of their phones get notifications (not the tokens);
-- adding and removing go through functions
create policy "users see own push devices" on public.push_devices
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_devices from anon, authenticated;
grant select (id, platform, app_version, created_at, updated_at) on public.push_devices to authenticated;

-- This phone gets the signed-in person's notifications from now on. If
-- someone else was signed in on it before, it's no longer theirs.
create function public.register_push_device(p_token text, p_platform text, p_app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'Unknown platform' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) not between 20 and 4096 then
    raise exception 'Not a notification token' using errcode = '22023';
  end if;

  insert into public.push_devices (user_id, platform, token, app_version)
  values (v_user, p_platform, p_token, left(p_app_version, 40))
  on conflict (token) do update
     set user_id = excluded.user_id,
         platform = excluded.platform,
         app_version = excluded.app_version,
         updated_at = now(),
         failure_count = 0;
end;
$$;

-- For send-push: phones that failed this time (busy or down); five in a row
-- and a phone is skipped until the app signs it up again
create function public.record_push_device_failures(p_device_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_devices set failure_count = failure_count + 1 where id = any(p_device_ids);
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
revoke all on function public.record_push_device_failures(uuid[]) from public, anon, authenticated;
grant execute on function public.register_push_device(text, text, text) to authenticated;
grant execute on function public.record_push_device_failures(uuid[]) to service_role;

-- ---- What send-push sends: each queued notification, once per browser and phone ----
-- (new columns at the end: channel 'web', 'android' or 'ios'; a phone's token)
create or replace view public.pending_pushes as
 select pq.id as queue_id,
        pq.user_id,
        pq.event_type,
        pq.title,
        pq.body,
        pq.data,
        ps.id as subscription_id,
        ps.endpoint,
        ps.p256dh,
        ps.auth,
        ps.failure_count,
        'web'::text as channel,
        null::text as device_token
   from public.push_queue pq
   join public.push_subscriptions ps on ps.user_id = pq.user_id
  where pq.sent_at is null
    and pq.scheduled_at <= now()
    and pq.scheduled_at > now() - interval '1 day'
    and ps.failure_count < 5
 union all
 select pq.id,
        pq.user_id,
        pq.event_type,
        pq.title,
        pq.body,
        pq.data,
        pd.id,
        null,
        null,
        null,
        pd.failure_count,
        pd.platform,
        pd.token
   from public.push_queue pq
   join public.push_devices pd on pd.user_id = pq.user_id
  where pq.sent_at is null
    and pq.scheduled_at <= now()
    and pq.scheduled_at > now() - interval '1 day'
    and pd.failure_count < 5;

-- ---- "Download my data": where notifications go -------------------------------------------
create or replace function public.export_my_data()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      'format_version', '1.2',
      'app', 'MatchGPT',
      'note', 'This export contains data we hold about your account. It does not include data about other users (e.g. their messages to you are excluded; only your messages are listed).'
    ),
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = uid
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
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.reports r
      where r.reporter_id = uid
    ),
    'verification_requests', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.verification_requests v
      where v.user_id = uid
    ),
    'blocks_created', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.blocks b
      where b.blocker_id = uid
    ),
    'search_history', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from public.search_history s
      where s.user_id = uid
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
          'sold_by', p.provider, 'reference', coalesce(p.store_order_id, p.razorpay_payment_id),
          'amount', p.amount, 'currency', p.currency, 'amount_unit', 'smallest currency unit (paise for INR)',
          'status', p.status, 'method', p.method, 'paid_at', p.paid_at,
          'refunded_amount', p.refunded_amount, 'refunded_at', p.refunded_at, 'invoice_url', p.invoice_url)
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
    )
  ) into result;

  return result;
end;
$function$;
