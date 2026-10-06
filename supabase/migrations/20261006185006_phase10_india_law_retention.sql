-- ============================================================================
-- Phase 10, part 11 (3 of 4): what's kept after an account is deleted or
-- content removed, and for how long, as Indian law asks (docs/legal/README.md).
-- Part 4 (…_phase10_india_law_purge) deletes it when its time is up.
-- ============================================================================

create table if not exists public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('registration', 'removed_content')),
  user_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  purge_after timestamptz not null
);
comment on table public.legal_holds is
  'Records Indian law requires after an account is deleted or content removed, seen only to answer lawful requests, deleted after purge_after (run_legal_retention())';
create index if not exists idx_legal_holds_purge on public.legal_holds (purge_after);
alter table public.legal_holds enable row level security;  -- no policies: only the server
revoke all on public.legal_holds from anon, authenticated;

-- The registration record, kept a year after the account is deleted: called by
-- the delete-account function before it deletes the account
create or replace function public.keep_registration_record(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ips jsonb := '[]'::jsonb;
begin
  -- The addresses the profile was set up and used from: where each consent
  -- was given, and what Supabase Auth logged at sign-in
  select coalesce(jsonb_agg(distinct host(ip_address)), '[]'::jsonb) into v_ips
    from public.consent_records where user_id = p_user_id and ip_address is not null;
  if to_regclass('auth.audit_log_entries') is not null then
    execute $q$
      select $2 || coalesce(jsonb_agg(distinct ip_address), '[]'::jsonb)
        from auth.audit_log_entries
       where payload ->> 'actor_id' = $1::text and coalesce(ip_address, '') <> ''
    $q$ into v_ips using p_user_id, v_ips;
  end if;

  insert into public.legal_holds (kind, user_id, data, purge_after)
  select 'registration', p_user_id,
         jsonb_build_object(
           'name', p.name, 'email', coalesce(u.email, p.email), 'date_of_birth', p.date_of_birth,
           'gender', p.gender, 'city', p.city, 'state', p.state, 'country', p.country,
           'profile_created_for', p.profile_created_for, 'joined', u.created_at,
           'deleted', now(), 'ip_addresses', v_ips),
         now() + interval '1 year'
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = p_user_id;
end;
$$;
revoke execute on function public.keep_registration_record(uuid) from public, anon, authenticated;
grant execute on function public.keep_registration_record(uuid) to service_role;

-- A ban removes a member's profile from everyone's view: what it removed (the
-- profile's text and the last 30 days of their messages) is kept 180 days
create or replace function public.admin_ban_user(target_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  admin_email_val text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can ban users';
  end if;

  select email into admin_email_val from public.profiles where id = auth.uid();

  insert into public.legal_holds (kind, user_id, data, purge_after)
  select 'removed_content', target_id,
         jsonb_build_object(
           'reason', reason, 'banned_by', auth.uid(),
           'profile', to_jsonb(p) - 'search_text',
           'messages', coalesce((select jsonb_agg(jsonb_build_object(
                                   'match_id', m.match_id, 'content', m.content, 'sent', m.created_at)
                                   order by m.created_at)
                              from public.messages m
                             where m.sender_id = target_id and m.created_at > now() - interval '30 days'), '[]'::jsonb)),
         now() + interval '180 days'
    from public.profiles p where p.id = target_id;

  update public.profiles
     set is_banned = true,
         banned_at = now(),
         ban_reason = reason
   where id = target_id;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), admin_email_val, 'ban_user', target_id, jsonb_build_object('reason', reason));
end;
$function$;
