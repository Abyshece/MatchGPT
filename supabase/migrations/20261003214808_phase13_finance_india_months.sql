-- ============================================================================
-- Phase 13: the Finance tab counts months in India time
--
-- admin_finance_summary() put each charge in its UTC month, so a payment made
-- in the first five and a half hours of the 1st (India time) landed in the
-- month before. Months now run from midnight to midnight India time
-- (Asia/Kolkata), as the books and GST returns do; all_time also gives the
-- fees. admin_list_payments() gives a net of 0 for a charge that didn't go
-- through (failed, or only authorised), rather than its full amount.
-- ============================================================================

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
    -- Monthly recurring revenue: paying subscriptions at their plan's price,
    -- yearly ones as a twelfth (store prices can differ a little by country)
    'mrr', (select coalesce(sum(case when b.period = 'yearly' then round(b.amount / 12.0) else b.amount end), 0)::bigint
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

-- Every charge, newest first, with who paid: for the Finance tab's list and
-- its CSV export. p_mode: 'live' or 'test' (null: both).
create or replace function public.admin_list_payments(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_provider text default null,
  p_mode text default null,
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
