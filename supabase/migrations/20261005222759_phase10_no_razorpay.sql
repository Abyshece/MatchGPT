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

-- admin_list_payments() is not redefined here: the one in later migrations
-- (team roles, Spotlight and Super Interest) never used Razorpay's columns, and
-- a definition here would replace it when this runs after them.

-- ---- "Download my data" ----------------------------------------------------
-- Defined in 20261012090000_trust_and_support.sql, which reads the Razorpay
-- fields only while they exist, so it works before and after this migration
-- (a definition here would replace that newer one when this runs later).
