-- ============================================================================
-- Phase 13: MatchGPT+ bought inside the phone apps, and one finance record
--
-- The apps sell MatchGPT+ through Google Play and the App Store (the stores'
-- rules); the website keeps Razorpay. Whoever sold it, every subscription and
-- every charge lands in the same two tables:
--   subscriptions  one row per subscription. provider: razorpay, google_play
--                  or app_store. A store's is keyed by store_subscription_id:
--                  Google's purchase token, Apple's original transaction id.
--   payments       one row per charge: the store's order id (Google's GPA.…
--                  order, Apple's transaction id), what the customer paid, the
--                  fee taken (Razorpay's actual fee; the stores' commission,
--                  estimated), and any refund.
-- The store-billing and store-notifications edge functions keep them in step
-- with the stores, and sync_pro_status() turns Pro on and off as before.
-- Admins read the totals with admin_finance_summary() and every charge with
-- admin_list_payments(). People see their own charges, but not our fees.
-- ============================================================================

-- ---- Plans: the matching store products -----------------------------------------
-- Play Console: one subscription "matchgpt_plus" with base plans "monthly" and
-- "yearly". App Store Connect: two auto-renewable subscriptions in one group.
alter table public.billing_plans
  add column google_product_id text,
  add column google_base_plan_id text,
  add column apple_product_id text;

update public.billing_plans
   set google_product_id = 'matchgpt_plus',
       google_base_plan_id = id,
       apple_product_id = 'matchgpt_plus_' || id;

-- ---- Subscriptions from any seller -------------------------------------------------
alter table public.subscriptions
  add column provider text not null default 'razorpay'
    check (provider in ('razorpay', 'google_play', 'app_store')),
  add column store_subscription_id text,
  add column store_product_id text,
  add column auto_renew boolean,
  -- when the store's newest state we applied was true (notifications can come out of order)
  add column store_updated_at timestamptz;

alter table public.subscriptions alter column razorpay_subscription_id drop not null;
alter table public.subscriptions add constraint subscriptions_seller_id check (
  case provider when 'razorpay' then razorpay_subscription_id is not null
                else store_subscription_id is not null end);
alter table public.subscriptions add constraint subscriptions_store_subscription_key
  unique (provider, store_subscription_id);

-- ---- Payments from any seller ---------------------------------------------------------
-- Amounts are in the currency's smallest unit (paise for INR). fee_amount is
-- what the seller kept: Razorpay's fee as charged, or the store's commission
-- estimated from STORE_FEE_PERCENT_* (fee_estimated); the stores' own payout
-- reports are the final word.
alter table public.payments
  add column provider text not null default 'razorpay'
    check (provider in ('razorpay', 'google_play', 'app_store')),
  add column store_order_id text,
  add column fee_amount integer check (fee_amount >= 0),
  add column fee_estimated boolean not null default false,
  add column refunded_amount integer not null default 0 check (refunded_amount >= 0),
  add column refunded_at timestamptz;

alter table public.payments alter column razorpay_payment_id drop not null;
alter table public.payments add constraint payments_seller_id check (
  case provider when 'razorpay' then razorpay_payment_id is not null
                else store_order_id is not null end);
alter table public.payments add constraint payments_store_order_key unique (provider, store_order_id);
alter table public.payments add constraint payments_refund_within_amount check (refunded_amount <= amount);

-- Razorpay refunds so far were whole: record them as refunded amounts
update public.payments
   set refunded_amount = amount, refunded_at = coalesce(refunded_at, created_at)
 where status = 'refunded' and refunded_amount = 0;

create index payments_paid_at_idx on public.payments (paid_at desc);

-- People read their own payments, without our fees
revoke select on public.payments from authenticated;
grant select (id, user_id, subscription_id, provider, razorpay_payment_id, razorpay_invoice_id, invoice_url,
              store_order_id, amount, currency, status, method, paid_at, refunded_amount, refunded_at, created_at)
  on public.payments to authenticated;

-- ---- Admin: the money ----------------------------------------------------------------
-- What a charge brought in after refunds and the seller's fee (a partly
-- refunded charge keeps that share of its fee).
create function public.payment_net(p public.payments)
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

-- The Finance tab: subscribers now, recurring revenue, and money by month and
-- seller. Rupee totals count INR charges only; other currencies (people paying
-- abroad through a store) are totalled separately in other_currencies.
create function public.admin_finance_summary(p_months integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_months integer := greatest(1, least(coalesce(p_months, 12), 36));
  v_from timestamptz := date_trunc('month', now()) - make_interval(months => v_months - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  with live as (
    -- Subscriptions giving Pro right now
    select s.*, (s.status = 'authenticated') as in_trial
      from public.subscriptions s
     where s.status in ('authenticated', 'active', 'pending')
       and coalesce(case when s.status = 'authenticated' then s.trial_ends_at end, s.current_end, s.trial_ends_at) > now()
  ),
  charges as (
    select p.*, public.payment_net(p) as net
      from public.payments p
     where p.status in ('captured', 'refunded')
  ),
  months as (
    select generate_series(v_from, date_trunc('month', now()), interval '1 month') as month
  ),
  by_month as (
    select m.month, c.provider,
           sum(c.amount)::bigint as gross,
           sum(c.refunded_amount)::bigint as refunds,
           sum(c.amount - c.refunded_amount - c.net)::bigint as fees,
           sum(c.net)::bigint as net,
           count(*) as charges
      from months m
      join charges c on c.currency = 'INR' and date_trunc('month', c.paid_at) = m.month
     group by m.month, c.provider
  )
  select jsonb_build_object(
    'currency', 'INR',
    'generated_at', now(),
    'subscribers', (select jsonb_build_object(
        'total', count(*),
        'paying', count(*) filter (where not in_trial),
        'in_trial', count(*) filter (where in_trial),
        'ending', count(*) filter (where cancel_at_period_end),
        'by_provider', coalesce((select jsonb_object_agg(provider, n) from (
            select provider, count(*) as n from live group by provider) x), '{}'::jsonb),
        'by_plan', coalesce((select jsonb_object_agg(plan_id, n) from (
            select plan_id, count(*) as n from live group by plan_id) x), '{}'::jsonb))
      from live),
    -- Monthly recurring revenue: paying subscriptions at their plan's price,
    -- yearly ones as a twelfth (store prices can differ a little by country)
    'mrr', (select coalesce(sum(case when b.period = 'yearly' then round(b.amount / 12.0) else b.amount end), 0)::bigint
              from live l join public.billing_plans b on b.id = l.plan_id
             where not l.in_trial),
    'cancelled_last_30_days', (select count(*) from public.subscriptions s
       where s.ended_at > now() - interval '30 days' and s.status in ('cancelled', 'expired', 'completed')),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'gross', coalesce((select sum(gross) from by_month b where b.month = m.month), 0),
        'refunds', coalesce((select sum(refunds) from by_month b where b.month = m.month), 0),
        'fees', coalesce((select sum(fees) from by_month b where b.month = m.month), 0),
        'net', coalesce((select sum(net) from by_month b where b.month = m.month), 0),
        'charges', coalesce((select sum(charges) from by_month b where b.month = m.month), 0),
        'by_provider', coalesce((select jsonb_object_agg(provider, jsonb_build_object(
            'gross', gross, 'refunds', refunds, 'fees', fees, 'net', net, 'charges', charges))
          from by_month b where b.month = m.month), '{}'::jsonb))
        order by m.month) from months m), '[]'::jsonb),
    'all_time', (select jsonb_build_object(
        'gross', coalesce(sum(amount), 0), 'refunds', coalesce(sum(refunded_amount), 0),
        'net', coalesce(sum(net), 0), 'charges', count(*))
      from charges where currency = 'INR'),
    'other_currencies', coalesce((select jsonb_object_agg(currency, jsonb_build_object(
        'gross', gross, 'refunds', refunds, 'net', net, 'charges', n)) from (
        select currency, sum(amount) as gross, sum(refunded_amount) as refunds, sum(net) as net, count(*) as n
          from charges where currency <> 'INR' group by currency) x), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Every charge, newest first, with who paid: for the Finance tab's list and
-- its CSV export.
create function public.admin_list_payments(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_provider text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid, paid_at timestamptz, provider text, order_id text, plan_id text,
  user_id uuid, user_name text, user_email text,
  amount integer, currency text, status text, method text,
  fee_amount integer, fee_estimated boolean, refunded_amount integer, refunded_at timestamptz,
  net_amount integer, mode text
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
    select p.id, p.paid_at, p.provider,
           coalesce(p.store_order_id, p.razorpay_payment_id) as order_id,
           s.plan_id, p.user_id, pr.name, u.email::text,
           p.amount, p.currency, p.status, p.method,
           p.fee_amount, p.fee_estimated, p.refunded_amount, p.refunded_at,
           public.payment_net(p), s.mode
      from public.payments p
      left join public.subscriptions s on s.id = p.subscription_id
      left join public.profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
     where (p_from is null or p.paid_at >= p_from)
       and (p_to is null or p.paid_at < p_to)
       and (p_provider is null or p.provider = p_provider)
     order by p.paid_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 100), 5000))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.payment_net(public.payments) from public, anon, authenticated;
revoke all on function public.admin_finance_summary(integer) from public, anon;
revoke all on function public.admin_list_payments(timestamptz, timestamptz, text, integer, integer) from public, anon;
grant execute on function public.payment_net(public.payments) to service_role;
grant execute on function public.admin_finance_summary(integer) to authenticated;
grant execute on function public.admin_list_payments(timestamptz, timestamptz, text, integer, integer) to authenticated;
