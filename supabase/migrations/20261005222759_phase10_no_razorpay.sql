-- ============================================================================
-- Phase 10: Shaadi24+ is sold only in the apps, so Razorpay goes
--
-- The owner decided Shaadi24+ is sold only through Google Play and the App
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

-- ---- "Download my data" ----------------------------------------------------
-- Defined in 20261012090000_trust_and_support.sql, which reads the Razorpay
-- fields only while they exist, so it works before and after this migration
-- (a definition here would replace that newer one when this runs later).
