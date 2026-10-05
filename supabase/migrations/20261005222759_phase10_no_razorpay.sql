-- ============================================================================
-- Phase 10: MatchGPT+ is sold only in the apps, so Razorpay goes
--
-- The owner decided MatchGPT+ is sold only through Google Play and the App
-- Store. What the database kept for Razorpay goes with it:
--   - its ids on plans, subscriptions, payments and webhook deliveries, and
--     its invoices;
--   - total_count, the number of billing cycles a Razorpay subscription ran;
--   - live_since, which kept the first of two website checkouts that went
--     through at once.
-- Every subscription and payment is now sold by a store, with that store's
-- id.
--
-- Nothing is lost: this stops if a Razorpay subscription or payment is left.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.subscriptions where provider = 'razorpay')
     or exists (select 1 from public.payments where provider = 'razorpay') then
    raise exception 'There are Razorpay subscriptions or payments: keep them before removing Razorpay';
  end if;
end;
$$;

-- ---- Plans ------------------------------------------------------------------
create or replace function public.billing_plans_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.billing_plans
  drop column razorpay_plan_id_test,
  drop column razorpay_plan_id_live,
  drop column total_count;

-- ---- Subscriptions ----------------------------------------------------------
drop trigger subscriptions_set_live_since on public.subscriptions;
drop function public.subscriptions_set_live_since();

alter table public.subscriptions
  drop constraint subscriptions_seller_id,
  drop constraint subscriptions_provider_check,
  drop column razorpay_subscription_id,
  drop column razorpay_updated_at,
  drop column live_since,
  alter column provider drop default,
  alter column store_subscription_id set not null,
  add constraint subscriptions_provider_check check (provider in ('google_play', 'app_store'));

-- ---- Payments ---------------------------------------------------------------
-- (members keep reading their own payments' other columns)
alter table public.payments
  drop constraint payments_seller_id,
  drop constraint payments_provider_check,
  drop column razorpay_payment_id,
  drop column razorpay_invoice_id,
  drop column invoice_url,
  alter column provider drop default,
  alter column store_order_id set not null,
  add constraint payments_provider_check check (provider in ('google_play', 'app_store'));

-- ---- Store notifications already handled ------------------------------------
alter table public.billing_events drop column razorpay_subscription_id;

-- ---- Admin: the money -------------------------------------------------------
-- What a charge brought in: what's left after refunds, less the store's
-- commission on it (the stores give back their commission on what they refund)
create or replace function public.payment_net(p public.payments)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (p.amount - p.refunded_amount)
       - case when p.amount > 0
              then round(coalesce(p.fee_amount, 0)::numeric * (p.amount - p.refunded_amount) / p.amount)::integer
              else 0 end;
$$;

create or replace function public.admin_list_payments(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_provider text default null,
  p_mode text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid, paid_at timestamptz, provider text, order_id text, plan_id text, user_id uuid, user_name text,
  user_email text, amount integer, currency text, status text, method text, fee_amount integer,
  fee_estimated boolean, refunded_amount integer, refunded_at timestamptz, net_amount integer, mode text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.id, p.paid_at, p.provider, p.store_order_id as order_id,
           s.plan_id, p.user_id, pr.name, u.email::text,
           p.amount, p.currency, p.status, p.method,
           p.fee_amount, p.fee_estimated, p.refunded_amount, p.refunded_at,
           case when p.status in ('captured', 'refunded') then public.payment_net(p) else 0 end,
           coalesce(s.mode, 'live')
      from public.payments p
      left join public.subscriptions s on s.id = p.subscription_id
      left join public.profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
     where (p_from is null or p.paid_at >= p_from)
       and (p_to is null or p.paid_at < p_to)
       and (p_provider is null or p.provider = p_provider)
       and (p_mode is null or coalesce(s.mode, 'live') = p_mode)
     order by p.paid_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 100), 5000))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ---- "Download my data": payments without the Razorpay fields ---------------
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
      'format_version', '1.4',
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
          'sold_by', p.provider, 'reference', p.store_order_id,
          'amount', p.amount, 'currency', p.currency, 'amount_unit', 'smallest currency unit (paise for INR)',
          'status', p.status, 'method', p.method, 'paid_at', p.paid_at,
          'refunded_amount', p.refunded_amount, 'refunded_at', p.refunded_at)
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
