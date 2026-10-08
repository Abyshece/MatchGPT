-- ============================================================================
-- Admin, part 7: team roles and two-step sign-in
--
-- Roles (admin_emails.role), each with the admin panel's sections it may use:
--   owner      everything, and Team (who's an admin, their roles, two-step
--              sign-in for everyone) and the "Shaadi24+ for everyone" switch
--   moderator  members, verification, moderation, reports, scam alerts,
--              complaints, enquiries
--   support    members, verification, reports, complaints, enquiries
--   content    profiles, messages, automatic messages, offers, blog, success
--              stories, growth, search insights
--   finance    finance and growth
-- Everyone gets the overview, errors and the app preview. The database
-- enforces it: every admin function and access rule checks admin_can(<its
-- section>), not just that the person is an admin.
--
-- Two-step sign-in (an authenticator app; Supabase's TOTP factors): any admin
-- can set it up. With app_settings.require_admin_two_step on, the admin
-- functions work only in a session signed in with it (aal2). Only an owner
-- who has it set up can switch the requirement on, so nobody is locked out.
--
-- Admin alerts now go only to admins whose role covers the section.
-- ============================================================================

alter table public.admin_emails add column if not exists role text not null default 'owner'
  check (role in ('owner', 'moderator', 'support', 'content', 'finance'));
alter table public.app_settings add column if not exists require_admin_two_step boolean not null default false;

-- The sections each role may use
create or replace function public.role_areas(p_role text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_role
    when 'owner' then array['dashboard', 'customers', 'verifications', 'profiles', 'moderation', 'reports', 'risk', 'grievances',
                            'messages', 'automations', 'offers', 'blog', 'stories', 'enquiries', 'growth', 'search', 'finance',
                            'errors', 'audit', 'app', 'team', 'owner']
    when 'moderator' then array['dashboard', 'customers', 'verifications', 'moderation', 'reports', 'risk', 'grievances',
                                'enquiries', 'errors', 'app']
    when 'support' then array['dashboard', 'customers', 'verifications', 'reports', 'grievances', 'enquiries', 'errors', 'app']
    when 'content' then array['dashboard', 'profiles', 'messages', 'automations', 'offers', 'blog', 'stories', 'growth', 'search',
                              'errors', 'app']
    when 'finance' then array['dashboard', 'finance', 'growth', 'errors', 'app']
    else '{}'::text[]
  end;
$$;

-- The signed-in admin's row, when their sign-in email is confirmed
create or replace function public.my_admin_row()
returns public.admin_emails
language sql
stable
security definer
set search_path = public
as $$
  select a.* from auth.users u
    join public.admin_emails a on lower(a.email) = lower(u.email)
   where u.id = auth.uid() and u.email_confirmed_at is not null
   limit 1;
$$;

-- Signed in with two-step sign-in, when it's required
create or replace function public.admin_two_step_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce((select s.require_admin_two_step from public.app_settings s limit 1), false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- May the signed-in admin use any of these sections?
create or replace function public.admin_can(p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select public.role_areas(r.role) && p_areas from public.my_admin_row() r where r.email is not null), false)
     and public.admin_two_step_ok();
$$;

-- Any admin (any role), signed in as required
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select r.email is not null from public.my_admin_row() r) is true and public.admin_two_step_ok();
$$;

-- For the app: on the team? which role and sections? is two-step sign-in needed now?
create or replace function public.admin_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when r.email is null then jsonb_build_object('listed', false)
    else jsonb_build_object(
      'listed', true,
      'role', r.role,
      'areas', to_jsonb(public.role_areas(r.role)),
      'two_step_required', coalesce((select s.require_admin_two_step from public.app_settings s limit 1), false),
      'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
      'two_step_ok', public.admin_two_step_ok())
  end
  from (select (public.my_admin_row()).*) r;
$$;

revoke all on function public.role_areas(text) from public, anon;
revoke all on function public.my_admin_row() from public, anon, authenticated;
revoke all on function public.admin_two_step_ok() from public, anon;
revoke all on function public.admin_can(text[]) from public, anon;
revoke all on function public.admin_status() from public, anon;
grant execute on function public.role_areas(text), public.admin_two_step_ok(), public.admin_can(text[]), public.admin_status() to authenticated;

-- ---- Every admin function checks its own section -------------------------------------------------
-- Each function's "if not public.is_admin()" becomes "if not public.admin_can(array[<sections>])".

do $$
declare
  m record;
  def text;
  found_one boolean;
begin
  for m in select * from (values
    ('admin_platform_stats', 'dashboard'), ('admin_sidebar_counts', 'dashboard'),
    ('admin_customers', 'customers'), ('admin_find_users', 'customers'), ('admin_search_users', 'customers'),
    ('admin_member_timeline', 'customers'), ('admin_verify_user', 'customers'), ('admin_correct_date_of_birth', 'customers'),
    ('admin_ban_user', 'customers'), ('admin_unban_user', 'customers'),
    ('admin_pending_verifications', 'verifications'), ('admin_review_verification', 'verifications'),
    ('admin_verification_signals', 'verifications'),
    ('admin_profile_stats', 'profiles'),
    ('admin_moderation_queue', 'moderation'), ('admin_moderate', 'moderation'), ('admin_set_review_before_showing', 'moderation'),
    ('admin_photos_to_fingerprint', 'moderation'',''risk'), ('admin_save_photo_fingerprints', 'moderation'',''risk'),
    ('admin_list_reports', 'reports'), ('admin_update_report', 'reports'),
    ('admin_risk_signals', 'risk'), ('admin_review_risk', 'risk'),
    ('admin_grievances', 'grievances'), ('admin_update_grievance', 'grievances'),
    ('admin_message_audience', 'messages'), ('admin_send_message', 'messages'), ('admin_list_messages', 'messages'),
    ('admin_automations', 'automations'), ('admin_save_automation', 'automations'), ('admin_run_automation', 'automations'),
    ('admin_enquiries', 'enquiries'), ('admin_update_enquiry', 'enquiries'),
    ('admin_growth', 'growth'), ('admin_search_insights', 'search'),
    ('admin_finance_summary', 'finance'), ('admin_list_payments', 'finance'),
    ('admin_list_errors', 'errors'), ('admin_mark_error_fixed', 'errors'),
    ('admin_set_pro_for_all', 'owner')
  ) as t(fn, areas)
  loop
    found_one := false;
    for def in
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = m.fn
    loop
      found_one := true;
      if position('public.is_admin()' in def) = 0 then
        raise exception 'public.% has no admin check to replace', m.fn;
      end if;
      execute replace(def, 'public.is_admin()', format('public.admin_can(array[''%s''])', m.areas));
    end loop;
    if not found_one then
      raise exception 'public.% not found', m.fn;
    end if;
  end loop;
end $$;

-- Nothing that checks for an admin is left to the plain "any admin" check, apart from these
do $$
declare
  leftover text;
begin
  select string_agg(p.proname, ', ') into leftover
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'admin\_%'
     and position('public.is_admin()' in pg_get_functiondef(p.oid)) > 0;
  if leftover is not null then
    raise exception 'Admin functions still checking only is_admin(): %', leftover;
  end if;
end $$;

-- ---- And every access rule ------------------------------------------------------------------------

drop policy if exists "admins can read audit log" on public.admin_audit;
create policy "admins can read audit log" on public.admin_audit
  for select to authenticated using ((select public.admin_can(array['audit', 'dashboard'])));

drop policy if exists "admins can read admin_emails" on public.admin_emails;
create policy "admins can read admin_emails" on public.admin_emails
  for select to authenticated using ((select public.admin_can(array['team'])));

drop policy if exists "Admins manage posts" on public.blog_posts;
create policy "Admins manage posts" on public.blog_posts
  for all to authenticated
  using ((select public.admin_can(array['blog']))) with check ((select public.admin_can(array['blog'])));

drop policy if exists "Admins see visits" on public.blog_views;
create policy "Admins see visits" on public.blog_views
  for select to authenticated using ((select public.admin_can(array['blog'])));

drop policy if exists "Admins manage offers" on public.offers;
create policy "Admins manage offers" on public.offers
  for all to authenticated
  using ((select public.admin_can(array['offers']))) with check ((select public.admin_can(array['offers'])));

drop policy if exists "Admins manage stories" on public.success_stories;
create policy "Admins manage stories" on public.success_stories
  for all to authenticated
  using ((select public.admin_can(array['stories']))) with check ((select public.admin_can(array['stories'])));

drop policy if exists "members see their own reports, admins see all" on public.reports;
create policy "members see their own reports, admins see all" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.admin_can(array['reports'])));

drop policy if exists "members see their own verification requests, admins see all" on public.verification_requests;
create policy "members see their own verification requests, admins see all" on public.verification_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.admin_can(array['verifications'])));

drop policy if exists "Admins add blog pictures" on storage.objects;
create policy "Admins add blog pictures" on storage.objects
  for insert to authenticated with check (bucket_id = 'blog' and (select public.admin_can(array['blog', 'stories'])));
drop policy if exists "Admins see blog pictures" on storage.objects;
create policy "Admins see blog pictures" on storage.objects
  for select to authenticated using (bucket_id = 'blog' and (select public.admin_can(array['blog', 'stories'])));
drop policy if exists "Admins remove blog pictures" on storage.objects;
create policy "Admins remove blog pictures" on storage.objects
  for delete to authenticated using (bucket_id = 'blog' and (select public.admin_can(array['blog', 'stories'])));

-- ---- Admin alerts: only to admins whose role covers the section -------------------------------------

create or replace function public.notify_admins(p_event_type text, p_title text, p_body text, p_data jsonb, p_except uuid default null)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.push_queue (user_id, event_type, title, body, data)
  select p.id, p_event_type, p_title, p_body, p_data
    from public.admin_emails a
    join auth.users u on lower(u.email) = lower(a.email) and u.email_confirmed_at is not null
    join public.profiles p on p.id = u.id
   where p.id is distinct from p_except
     and coalesce(p.settings_push_notifs, true)
     and coalesce(p_data ->> 'admin_tab', 'reports') = any (public.role_areas(a.role));
$function$;

-- ---- Team (owners) -------------------------------------------------------------------------------------

create or replace function public.admin_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_can(array['team']) then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'require_two_step', coalesce((select s.require_admin_two_step from public.app_settings s limit 1), false),
    'me', (select lower(u.email) from auth.users u where u.id = auth.uid()),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', a.email, 'role', a.role, 'notes', a.notes, 'added_at', a.added_at,
               'name', p.name, 'signed_up', u.id is not null, 'last_sign_in', u.last_sign_in_at,
               'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
             order by case a.role when 'owner' then 0 else 1 end, lower(a.email)), '[]'::jsonb)
        from public.admin_emails a
        left join auth.users u on lower(u.email) = lower(a.email)
        left join public.profiles p on p.id = u.id));
end;
$$;

create or replace function public.admin_team_save(p_email text, p_role text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_old text;
begin
  if not public.admin_can(array['team']) then
    raise exception 'Forbidden';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That isn''t an email address';
  end if;
  if p_role not in ('owner', 'moderator', 'support', 'content', 'finance') then
    raise exception 'Unknown role';
  end if;
  select role into v_old from public.admin_emails where lower(email) = v_email;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.admin_emails where role = 'owner') <= 1 then
    raise exception 'Shaadi24 needs at least one owner';
  end if;
  if v_old is null then
    insert into public.admin_emails (email, role, notes, added_by) values (v_email, p_role, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid());
  else
    update public.admin_emails set role = p_role, notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes) where lower(email) = v_email;
  end if;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), case when v_old is null then 'add_admin' else 'change_admin_role' end,
          jsonb_build_object('email', v_email, 'role', p_role, 'was', v_old));
end;
$$;

create or replace function public.admin_team_remove(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_role text;
begin
  if not public.admin_can(array['team']) then
    raise exception 'Forbidden';
  end if;
  select role into v_role from public.admin_emails where lower(email) = v_email;
  if v_role is null then
    raise exception 'Not an admin';
  end if;
  if v_email = (select lower(u.email) from auth.users u where u.id = auth.uid()) then
    raise exception 'You can''t remove yourself';
  end if;
  if v_role = 'owner' and (select count(*) from public.admin_emails where role = 'owner') <= 1 then
    raise exception 'Shaadi24 needs at least one owner';
  end if;
  delete from public.admin_emails where lower(email) = v_email;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'remove_admin', jsonb_build_object('email', v_email, 'role', v_role));
end;
$$;

-- Only an owner signed in with two-step sign-in can require it (so it's known to work)
create or replace function public.admin_set_require_two_step(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can(array['team']) then
    raise exception 'Forbidden';
  end if;
  if p_on and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Set up two-step sign-in for yourself first, and sign in with it';
  end if;
  update public.app_settings set require_admin_two_step = p_on, updated_at = now() where id;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'set_require_two_step', jsonb_build_object('on', p_on));
end;
$$;

-- An admin who lost their phone: an owner clears their authenticator and signs them out
-- everywhere (the phone may still be signed in); they sign in and set it up again
create or replace function public.admin_team_reset_two_step(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_removed integer;
begin
  if not public.admin_can(array['team']) then
    raise exception 'Forbidden';
  end if;
  if not exists (select 1 from public.admin_emails where lower(email) = v_email) then
    raise exception 'Not an admin';
  end if;
  delete from auth.mfa_factors f using auth.users u where f.user_id = u.id and lower(u.email) = v_email;
  get diagnostics v_removed = row_count;
  delete from auth.sessions s using auth.users u where s.user_id = u.id and lower(u.email) = v_email;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'reset_admin_two_step', jsonb_build_object('email', v_email));
  return v_removed;
end;
$$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.admin_team_save(text, text, text) from public, anon;
revoke all on function public.admin_team_remove(text) from public, anon;
revoke all on function public.admin_set_require_two_step(boolean) from public, anon;
revoke all on function public.admin_team_reset_two_step(text) from public, anon;
grant execute on function public.admin_team(), public.admin_team_save(text, text, text), public.admin_team_remove(text),
  public.admin_set_require_two_step(boolean), public.admin_team_reset_two_step(text) to authenticated;
