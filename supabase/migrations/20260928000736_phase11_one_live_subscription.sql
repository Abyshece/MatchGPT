-- ============================================================================
-- Phase 11: one live MatchGPT+ subscription per person
--
-- If someone finishes two checkouts at once (say, in two tabs), the billing
-- functions keep the subscription that went through first, and cancel and
-- refund the other. live_since records when each one first went through
-- (approved, or approved and charged); the database sets it.
-- ============================================================================

alter table public.subscriptions add column live_since timestamptz;

create or replace function public.subscriptions_set_live_since()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.live_since is null and new.status in ('authenticated', 'active', 'pending', 'paused') then
    new.live_since := clock_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.subscriptions_set_live_since() from public, anon, authenticated;

create trigger subscriptions_set_live_since
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_set_live_since();

update public.subscriptions
   set live_since = coalesce(razorpay_updated_at, updated_at)
 where live_since is null and status in ('authenticated', 'active', 'pending', 'paused');
