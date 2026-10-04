-- ============================================================================
-- Phase 10: admins hear about new reports and verification requests
--
-- The Terms promise that reports are reviewed within 24 hours, and new
-- members can't search after 72 hours until they're verified. So each new
-- report, and each new verification request, queues a notification for every
-- admin (their phones and browsers, through send-push), except the admin who
-- sent it and admins who turned notifications off. What it says is generic:
-- the reason of a report, never names or what was written.
-- ============================================================================

create or replace function public.notify_admins(
  p_event_type text, p_title text, p_body text, p_data jsonb, p_except uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.push_queue (user_id, event_type, title, body, data)
  select p.id, p_event_type, p_title, p_body, p_data
    from public.admin_emails a
    join auth.users u on lower(u.email) = lower(a.email) and u.email_confirmed_at is not null
    join public.profiles p on p.id = u.id
   where p.id is distinct from p_except
     and coalesce(p.settings_push_notifs, true);
$function$;

-- A new report: its reason (the app's words for it), more urgent when someone may be under 18
create or replace function public.enqueue_admin_report_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := case new.reason
    when 'spam' then 'Spam or scam'
    when 'fake_profile' then 'Fake or impersonation'
    when 'inappropriate_content' then 'Inappropriate photos or content'
    when 'harassment' then 'Harassment or threats'
    when 'underage' then 'Underage user'
    else 'Other'
  end;
begin
  perform public.notify_admins(
    'admin_report',
    case when new.reason = 'underage' then '🚨 Report: someone may be under 18' else '🚩 New report to review' end,
    format('Reason: %s. Open Admin → Reports.', v_reason),
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'reports', 'report_id', new.id),
    new.reporter_id);
  return new;
end;
$function$;

create or replace trigger trg_report_admin_push
  after insert on public.reports
  for each row execute function public.enqueue_admin_report_push();

-- A new verification request (an updated one that's still waiting doesn't ask again)
create or replace function public.enqueue_admin_verification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.notify_admins(
    'admin_verification',
    '🪪 New verification request',
    'Someone sent their profile links to be checked. Open Admin → Verifications.',
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'verifications', 'request_id', new.id),
    new.user_id);
  return new;
end;
$function$;

create or replace trigger trg_verification_admin_push
  after insert on public.verification_requests
  for each row execute function public.enqueue_admin_verification_push();

-- Only the triggers use these
revoke all on function public.notify_admins(text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_admin_report_push() from public, anon, authenticated;
revoke all on function public.enqueue_admin_verification_push() from public, anon, authenticated;
