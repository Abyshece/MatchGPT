-- ============================================================================
-- Phase 13: notifications in the phone apps, part two
--
-- Signing out (or turning notifications off in Settings) takes the phone off
-- the person's list (unregister_push_device); an account keeps its 10 most
-- recently signed-up phones; the notification queue is cleared after a week.
-- Safe to run again.
-- ============================================================================

-- This phone gets the signed-in person's notifications from now on. If
-- someone else was signed in on it before, it's no longer theirs. An account
-- keeps this phone and its nine others most recently signed up.
create or replace function public.register_push_device(p_token text, p_platform text, p_app_version text default null)
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

  delete from public.push_devices d
   where d.user_id = v_user
     and d.token <> p_token
     and d.id not in (select x.id from public.push_devices x where x.user_id = v_user and x.token <> p_token
                       order by x.updated_at desc, x.created_at desc limit 9);
end;
$$;

-- Signing out (or turning notifications off): this phone stops getting this
-- person's notifications.
create or replace function public.unregister_push_device(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_devices where token = p_token and user_id = (select auth.uid());
$$;

revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;

-- ---- The queue keeps a week ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('push-queue-cleanup', '23 4 * * *',
      $job$delete from public.push_queue where created_at < now() - interval '7 days'$job$);
  end if;
end $$;
