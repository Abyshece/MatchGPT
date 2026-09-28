-- ============================================================================
-- Phase 11 follow-up: a cancelled subscription keeps its free trial only if it
-- was cancelled during the trial (never charged, so no billing period started).
-- Before, one cancelled after being charged could count its trial end date.
-- ============================================================================

create or replace function public.sync_pro_status(p_user_id uuid)
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
      when s.status = 'cancelled' and s.current_start is null then s.trial_ends_at
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

revoke all on function public.sync_pro_status(uuid) from public, anon, authenticated;
grant execute on function public.sync_pro_status(uuid) to service_role;
