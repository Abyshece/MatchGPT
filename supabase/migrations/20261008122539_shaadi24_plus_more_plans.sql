-- ============================================================================
-- Shaadi24+ for a week, a month, three months or six months
--
-- The paywall offers four lengths side by side, each with what it saves on
-- the week's price. New plans: weekly, quarterly (three months) and
-- halfyearly (six months), alongside monthly. The yearly plan is no longer
-- offered (is_active false); its row stays for the history that points at it.
--
-- Prices in paise, as in the Terms (lib/billingService.ts DEFAULT_PLANS); the
-- stores charge their own, set in App Store Connect and Play Console:
--   App Store: shaadi24_plus_<id> in the "Shaadi24+" group
--   Google Play: the subscription "shaadi24_plus", base plan <id>
-- The app offers a plan once its store returns it, so a plan not set up yet
-- in a store simply doesn't show there.
--
-- The Finance tab's monthly recurring revenue counts each plan for a month.
-- ============================================================================

alter table public.billing_plans drop constraint billing_plans_id_check;
alter table public.billing_plans drop constraint billing_plans_period_check;
alter table public.billing_plans
  add constraint billing_plans_id_check check (id in ('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly')),
  add constraint billing_plans_period_check check (period in ('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'));

-- (A database that still has Razorpay's total_count, from before the apps
-- sold Shaadi24+, needs it filled in: 120, as the monthly plan had)
do $$
declare
  v_razorpay_count boolean := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'billing_plans' and column_name = 'total_count');
begin
  execute format($q$
    insert into public.billing_plans (id, name, amount, period, google_product_id, google_base_plan_id, apple_product_id%1$s)
    values
      ('weekly', 'Shaadi24+ 1 week', 34900, 'weekly', 'shaadi24_plus', 'weekly', 'shaadi24_plus_weekly'%2$s),
      ('quarterly', 'Shaadi24+ 3 months', 199900, 'quarterly', 'shaadi24_plus', 'quarterly', 'shaadi24_plus_quarterly'%2$s),
      ('halfyearly', 'Shaadi24+ 6 months', 299900, 'halfyearly', 'shaadi24_plus', 'halfyearly', 'shaadi24_plus_halfyearly'%2$s)
    on conflict (id) do update
      set name = excluded.name, amount = excluded.amount, period = excluded.period,
          google_product_id = excluded.google_product_id, google_base_plan_id = excluded.google_base_plan_id,
          apple_product_id = excluded.apple_product_id, is_active = true
  $q$,
    case when v_razorpay_count then ', total_count' else '' end,
    case when v_razorpay_count then ', 120' else '' end);
end;
$$;

update public.billing_plans set name = 'Shaadi24+ 1 month' where id = 'monthly';
update public.billing_plans set is_active = false where id = 'yearly';

create or replace function public.admin_finance_summary(p_months integer default 12, p_mode text default 'live')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_months integer := greatest(1, least(coalesce(p_months, 12), 36));
  v_mode text := case when p_mode = 'test' then 'test' else 'live' end;
  -- Months by the calendar in India
  v_this_month timestamp := date_trunc('month', now() at time zone 'Asia/Kolkata');
  v_from timestamp := v_this_month - make_interval(months => v_months - 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  with live as (
    -- Subscriptions giving Pro right now
    select s.*, (s.status = 'authenticated') as in_trial
      from public.subscriptions s
     where s.mode = v_mode
       and s.status in ('authenticated', 'active', 'pending')
       and coalesce(case when s.status = 'authenticated' then s.trial_ends_at end, s.current_end, s.trial_ends_at) > now()
  ),
  charges as (
    select p.*, public.payment_net(p) as net,
           date_trunc('month', p.paid_at at time zone 'Asia/Kolkata') as month
      from public.payments p
      left join public.subscriptions s on s.id = p.subscription_id
     where p.status in ('captured', 'refunded')
       and coalesce(s.mode, 'live') = v_mode
  ),
  months as (
    select generate_series(v_from, v_this_month, interval '1 month') as month
  ),
  by_month as (
    select m.month, c.provider,
           sum(c.amount)::bigint as gross,
           sum(c.refunded_amount)::bigint as refunds,
           sum(c.amount - c.refunded_amount - c.net)::bigint as fees,
           sum(c.net)::bigint as net,
           count(*) as charges
      from months m
      join charges c on c.currency = 'INR' and c.month = m.month
     group by m.month, c.provider
  )
  select jsonb_build_object(
    'currency', 'INR',
    'mode', v_mode,
    'time_zone', 'Asia/Kolkata',
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
    -- Monthly recurring revenue: paying subscriptions at their plan's price
    -- for a month (a week's times 52/12, three months' a third, and so on;
    -- store prices can differ a little by country)
    'mrr', (select coalesce(sum(round(b.amount * case b.period
                                                    when 'weekly' then 52 / 12.0
                                                    when 'quarterly' then 1 / 3.0
                                                    when 'halfyearly' then 1 / 6.0
                                                    when 'yearly' then 1 / 12.0
                                                    else 1 end)), 0)::bigint
              from live l join public.billing_plans b on b.id = l.plan_id
             where not l.in_trial),
    'cancelled_last_30_days', (select count(*) from public.subscriptions s
       where s.mode = v_mode and s.ended_at > now() - interval '30 days' and s.status in ('cancelled', 'expired', 'completed')),
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
        'fees', coalesce(sum(amount - refunded_amount - net), 0),
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
