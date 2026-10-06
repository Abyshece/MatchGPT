-- ============================================================================
-- Phase 10, part 11 (4 of 4): every day, delete what Indian law no longer asks
-- Shaadi24 to keep (the periods are in docs/legal/README.md and the Privacy
-- Policy, section 6)
-- ============================================================================

create or replace function public.run_legal_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_holds int; v_deletions int; v_consents int; v_grievances int;
begin
  delete from public.legal_holds where purge_after < now();
  get diagnostics v_holds = row_count;
  -- The log of deleted accounts (their email and the address the request came from): a year
  delete from public.deletion_audit where requested_at < now() - interval '1 year';
  get diagnostics v_deletions = row_count;
  -- Consents of accounts that no longer exist: up to 3 years
  delete from public.consent_records c
   where c.created_at < now() - interval '3 years'
     and (c.user_id is null or not exists (select 1 from auth.users u where u.id = c.user_id));
  get diagnostics v_consents = row_count;
  -- Complaints: 3 years after they were closed
  delete from public.grievances where status in ('resolved', 'rejected') and resolved_at < now() - interval '3 years';
  get diagnostics v_grievances = row_count;
  return jsonb_build_object('legal_holds', v_holds, 'deletion_audit', v_deletions,
                            'consent_records', v_consents, 'grievances', v_grievances);
end;
$$;
revoke execute on function public.run_legal_retention() from public, anon, authenticated;
grant execute on function public.run_legal_retention() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('legal-retention', '23 21 * * *', $job$select public.run_legal_retention()$job$);
  end if;
end $$;
