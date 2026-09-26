-- ============================================================================
-- Close public data exposure (Phase 7 security fix)
--
-- 1. The profile/push views run with their owner's rights (skipping row-level
--    security), and the public "anon" key — which ships inside the website —
--    could read AND write through them: every user's email, phone number and
--    private answers were readable, and any profile could be edited or deleted.
-- 2. is_admin() trusted profiles.email, which every user can edit on their own
--    row, so anyone could make themselves an admin.
-- 3. Users could edit verification / plan / ban fields on their own profile.
-- 4. increment_push_failure() could be called by anyone.
-- ============================================================================

-- 1. Views --------------------------------------------------------------------
-- Only the server writes through them. The app reads eligible_profiles,
-- public_profiles and my_blocked_ids while signed in; visible_profiles is not
-- used by the app, and pending_pushes is read only by the send-push function
-- (service role).
revoke all on public.visible_profiles, public.public_profiles, public.eligible_profiles,
              public.pending_pushes, public.my_blocked_ids
  from anon, authenticated;
grant select on public.eligible_profiles, public.public_profiles, public.my_blocked_ids
  to authenticated;

-- 2. Admin check ------------------------------------------------------------------
-- Use the confirmed sign-in email (auth.users), not the editable profiles.email.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_emails a on lower(a.email) = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

drop policy "admins can read admin_emails" on public.admin_emails;
create policy "admins can read admin_emails"
  on public.admin_emails for select
  using (public.is_admin());

-- 3. Protected profile fields -----------------------------------------------------
-- Requests from the website (roles anon / authenticated) can't change these.
-- Admin functions (SECURITY DEFINER, run as their owner), the service role and
-- the dashboard are unaffected.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user creating their own row (profile-rescue screen) always starts
    -- unverified, on the free plan, unbanned, with their sign-in email.
    new.email := coalesce(auth.jwt() ->> 'email', new.email);
    new.account_created := now();
    new.is_verified := false;
    new.verification_status := 'unverified';
    new.subscription_tier := 'FREE';
    new.subscription_renews_at := null;
    new.is_banned := false;
    new.banned_at := null;
    new.ban_reason := null;
    return new;
  end if;

  if new.email is distinct from old.email
     or new.account_created is distinct from old.account_created
     or new.is_verified is distinct from old.is_verified
     or new.verification_status is distinct from old.verification_status
     or new.subscription_tier is distinct from old.subscription_tier
     or new.subscription_renews_at is distinct from old.subscription_renews_at
     or new.is_banned is distinct from old.is_banned
     or new.banned_at is distinct from old.banned_at
     or new.ban_reason is distinct from old.ban_reason
  then
    raise exception 'This profile field can only be changed by ShaadiGPT'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$$;

create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 4. Push failure counter -----------------------------------------------------------
-- Only the send-push function (service role) should call this.
revoke execute on function public.increment_push_failure(uuid) from public, anon, authenticated;
