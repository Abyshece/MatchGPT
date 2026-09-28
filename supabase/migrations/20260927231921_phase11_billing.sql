-- ============================================================================
-- Phase 11: MatchGPT+ (Pro) subscriptions through Razorpay
--
-- The `billing` edge function creates Razorpay subscriptions and confirms
-- checkouts; the `razorpay-webhook` function applies Razorpay's events. Both
-- use the service role. Signed-in users can only read their own
-- subscriptions and payments (Settings shows them).
--
-- Pro comes from subscriptions: sync_pro_status() sets the profile's
-- subscription_tier and subscription_renews_at from them. Pro given by hand
-- (Pro with no renewal date) is left alone.
-- ============================================================================

-- ---- Plans on sale ------------------------------------------------------------
-- Prices in paise (₹999 = 99900), as in the Terms. The billing function creates
-- the matching Razorpay plan the first time it's needed, once for test keys and
-- once for live keys, and saves its id here. Razorpay plans can't be changed,
-- so a new price clears the saved ids: new subscribers get a new plan, existing
-- ones keep theirs.
create table public.billing_plans (
  id text primary key check (id in ('monthly', 'yearly')),
  name text not null,
  amount integer not null check (amount >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  period text not null check (period in ('monthly', 'yearly')),
  -- billing cycles before the subscription ends; Razorpay allows up to 10 years
  total_count integer not null check (total_count between 1 and 120),
  razorpay_plan_id_test text,
  razorpay_plan_id_live text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (id, name, amount, period, total_count) values
  ('monthly', 'MatchGPT+ monthly', 99900, 'monthly', 120),
  ('yearly', 'MatchGPT+ yearly', 999900, 'yearly', 10);

create function public.billing_plans_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount is distinct from old.amount or new.period is distinct from old.period then
    new.razorpay_plan_id_test := null;
    new.razorpay_plan_id_live := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger billing_plans_before_update
  before update on public.billing_plans
  for each row execute function public.billing_plans_before_update();

-- ---- Subscriptions (one row per Razorpay subscription) -----------------------
-- status is Razorpay's: created (checkout not finished), authenticated (card or
-- UPI mandate approved; during a free trial), active, pending (a renewal failed
-- and Razorpay is retrying), halted (retries used up), cancelled, completed,
-- expired, paused. Kept after an account is deleted (user_id cleared) as a
-- record of what was charged.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  plan_id text not null references public.billing_plans(id),
  mode text not null check (mode in ('test', 'live')),
  razorpay_subscription_id text not null unique,
  status text not null default 'created' check (status in (
    'created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired', 'paused')),
  trial_ends_at timestamptz,
  current_start timestamptz,
  current_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  razorpay_updated_at timestamptz,  -- when the last applied Razorpay event happened (they can arrive out of order)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_plan_id_idx on public.subscriptions (plan_id);

-- ---- Payments (charges on a subscription) -------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  razorpay_payment_id text not null unique,
  razorpay_invoice_id text,
  invoice_url text,
  amount integer not null,  -- paise
  currency text not null default 'INR',
  status text not null,     -- Razorpay's: captured, failed, refunded, ...
  method text,              -- card, upi, emandate, ...
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id, paid_at desc);
create index payments_subscription_id_idx on public.payments (subscription_id);

-- ---- Webhook deliveries already handled (Razorpay may send one twice) ---------
create table public.billing_events (
  id text primary key,  -- Razorpay's X-Razorpay-Event-Id
  event text not null,
  razorpay_subscription_id text,
  received_at timestamptz not null default now()
);

-- ---- Access ---------------------------------------------------------------------
alter table public.billing_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.billing_plans, public.subscriptions, public.payments, public.billing_events
  from public, anon, authenticated;
grant select on public.subscriptions, public.payments to authenticated;

create policy "users read their own subscriptions" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users read their own payments" on public.payments
  for select to authenticated using (user_id = (select auth.uid()));

-- ---- Pro from subscriptions --------------------------------------------------------
-- Pro lasts to the end of what a subscription covers: the free trial, or the
-- period paid for (also while Razorpay retries a failed renewal). A
-- subscription cancelled during its trial keeps the trial. A 3-day grace
-- covers renewals that are late to confirm.
create function public.sync_pro_status(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  select max(case
      when s.status in ('active', 'pending') then coalesce(s.current_end, s.trial_ends_at, s.updated_at + interval '1 day')
      when s.status = 'authenticated' then coalesce(s.trial_ends_at, s.current_end, s.updated_at + interval '1 day')
      when s.status = 'cancelled' then s.trial_ends_at
    end)
    into v_until
  from public.subscriptions s
  where s.user_id = p_user_id;

  if v_until + interval '3 days' > now() then
    update public.profiles
       set subscription_tier = 'PRO', subscription_renews_at = v_until
     where id = p_user_id
       and (subscription_tier is distinct from 'PRO' or subscription_renews_at is distinct from v_until);
  else
    -- Only Pro that came from a subscription ends here
    update public.profiles
       set subscription_tier = 'FREE', subscription_renews_at = null
     where id = p_user_id and subscription_renews_at is not null;
  end if;
end;
$$;

-- Hourly: end Pro whose subscription period (plus the grace) is over and no
-- Razorpay event has extended it.
create function public.expire_pro_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer := 0;
begin
  for v_user in
    select id from public.profiles
     where subscription_tier = 'PRO' and subscription_renews_at < now() - interval '3 days'
  loop
    perform public.sync_pro_status(v_user);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.billing_plans_before_update() from public, anon, authenticated;
revoke all on function public.sync_pro_status(uuid) from public, anon, authenticated;
revoke all on function public.expire_pro_subscriptions() from public, anon, authenticated;
grant execute on function public.sync_pro_status(uuid) to service_role;
grant execute on function public.expire_pro_subscriptions() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pro-expiry', '41 * * * *', $job$select public.expire_pro_subscriptions()$job$);
    perform cron.schedule('billing-events-cleanup', '53 3 * * *',
      $job$delete from public.billing_events where received_at < now() - interval '90 days'$job$);
  end if;
end;
$$;
