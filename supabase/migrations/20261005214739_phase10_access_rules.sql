-- ============================================================================
-- Phase 10: tidier access rules (Supabase's advisor)
--
-- Reports and verification requests each had two rules for reading (your own;
-- admins all), both checked on every row: now one rule each. The admin tables'
-- rules and these applied to everyone, signed out included; now to signed-in
-- members, and signed-out visitors have no access to these four tables at all
-- (the rules already kept every row from them). is_admin() is no longer
-- callable signed out. Nothing changes for members or admins. Safe to run again.
-- ============================================================================

-- ---- Reports: your own, or all of them for admins ---------------------------------------
drop policy if exists "admins can read all reports" on public.reports;
drop policy if exists "users see own reports" on public.reports;
drop policy if exists "members see their own reports, admins see all" on public.reports;
create policy "members see their own reports, admins see all" on public.reports
  for select to authenticated
  using ((select auth.uid()) = reporter_id or (select public.is_admin()));

-- ---- Verification requests: the same ----------------------------------------------------
drop policy if exists "admins see all verification requests" on public.verification_requests;
drop policy if exists "users see own verification requests" on public.verification_requests;
drop policy if exists "members see their own verification requests, admins see all" on public.verification_requests;
create policy "members see their own verification requests, admins see all" on public.verification_requests
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
alter policy "users insert own verification requests" on public.verification_requests to authenticated;

-- ---- The admin tables: signed-in admins --------------------------------------------------
alter policy "admins can read audit log" on public.admin_audit to authenticated using ((select public.is_admin()));
alter policy "admins can read admin_emails" on public.admin_emails to authenticated using ((select public.is_admin()));

-- ---- Signed out: nothing here ------------------------------------------------------------
revoke all on table public.reports, public.verification_requests, public.admin_audit, public.admin_emails from anon;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
