-- ============================================================================
-- Trust and support: what other matrimony apps' members complain about, part 4
-- (docs/research/competitor-reviews.md)
--
--   - The Verified badge needs a selfie, taken doing a gesture we ask for, and
--     at least two photos on the profile; social media links are optional now.
--     The selfie is private (bucket verification-selfies): only the member and
--     the team who check verifications can open it, and the admin panel
--     removes it once the request is decided.
--   - A verification that isn't approved says why (reason_code, and the
--     team's note), and the member gets a message with "Try again".
--   - My requests (Settings): the member's verification requests, complaints
--     and reports, where each stands and the team's answer (my_requests()).
--     A message and a notification when a complaint or report is answered.
--   - "Agent or marriage bureau" is a reason to report someone.
--   - "Share my number" in chat (share_my_number(), messages of type
--     'contact'). Nobody can send one any other way.
--   - Members can't change chat messages any more: only the person a message
--     was sent to can mark it read. (Until now either person in a chat could
--     rewrite the other's messages.)
--   - Verification requests are written only through the functions here, and
--     a member no longer reads the team's notes on a report they made.
--   - "Download my data" adds partner preferences, saved searches, hidden
--     profiles, complaints and an "I found my match" story.
-- ============================================================================

-- ---- The selfie --------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-selfies', 'verification-selfies', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members add their verification selfie" on storage.objects;
create policy "Members add their verification selfie" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-selfies' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Members and the verification team see selfies" on storage.objects;
create policy "Members and the verification team see selfies" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-selfies'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select public.admin_can(array['verifications']))));

drop policy if exists "Members and the verification team remove selfies" on storage.objects;
create policy "Members and the verification team remove selfies" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification-selfies'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select public.admin_can(array['verifications']))));

alter table public.verification_requests
  add column if not exists selfie_path text,
  add column if not exists pose text,
  add column if not exists reason_code text;

alter table public.verification_requests drop constraint if exists verification_requests_reason_code_check;
alter table public.verification_requests add constraint verification_requests_reason_code_check
  check (reason_code is null or reason_code in (
    'selfie_unclear', 'selfie_mismatch', 'pose_missing', 'photos_unclear', 'need_two_photos',
    'links_not_yours', 'need_selfie', 'other'));

-- Written only by submit_verification_request() and admin_review_verification()
drop policy if exists "users insert own verification requests" on public.verification_requests;
revoke insert, update, delete on public.verification_requests from anon, authenticated;

-- The gesture for the selfie: one of 8, the same all day for a member, so it
-- can't be picked to suit an old photo (lib/verificationSelfie.ts has the words)
create or replace function public.verification_pose_for(p_user uuid, p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['thumbs_up', 'peace', 'hand_on_head', 'touch_ear', 'hand_on_cheek', 'three_fingers', 'open_palm', 'point_up'])
         [1 + ((hashtext(p_user::text || p_day::text)::bigint % 8) + 8) % 8];
$$;
revoke all on function public.verification_pose_for(uuid, date) from public, anon, authenticated;

create or replace function public.verification_pose()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null
              else public.verification_pose_for(auth.uid(), (now() at time zone 'Asia/Kolkata')::date) end;
$$;
revoke all on function public.verification_pose() from public, anon;
grant execute on function public.verification_pose() to authenticated;

-- The words a member is told when a request isn't approved (the app shows a
-- longer version with what to do: VERIFICATION_REASONS in lib/verificationSelfie.ts)
create or replace function public.verification_reason_text(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'selfie_unclear' then 'We couldn''t see your face clearly in the selfie.'
    when 'selfie_mismatch' then 'The selfie doesn''t look like the person in your profile photos.'
    when 'pose_missing' then 'The selfie didn''t show the gesture we asked for.'
    when 'photos_unclear' then 'Your profile photos don''t show your face clearly.'
    when 'need_two_photos' then 'The Verified badge needs two photos of you on your profile.'
    when 'links_not_yours' then 'The social media links didn''t look like yours.'
    when 'need_selfie' then 'Verification needs a selfie now.'
    else 'Something didn''t check out.'
  end;
$$;

-- An app from before the selfie: say what to do
create or replace function public.submit_verification_request(
  p_linkedin_url text, p_instagram_url text, p_facebook_url text, p_twitter_url text, p_user_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Please update Shaadi24: getting verified now takes a selfie.' using errcode = 'P0001';
end;
$$;

create or replace function public.submit_verification_request(
  p_selfie_path text, p_pose text,
  p_linkedin_url text, p_instagram_url text, p_facebook_url text, p_twitter_url text, p_user_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id uuid;
  v_linkedin text := nullif(btrim(coalesce(p_linkedin_url, '')), '');
  v_instagram text := nullif(btrim(coalesce(p_instagram_url, '')), '');
  v_facebook text := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_twitter text := nullif(btrim(coalesce(p_twitter_url, '')), '');
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_verified) then
    raise exception 'You''re verified already.';
  end if;
  if coalesce((select cardinality(photo_urls) from public.profiles where id = uid), 0) < 2 then
    raise exception 'Add a second photo of yourself to your profile first: the Verified badge needs two.'
      using hint = 'need_two_photos';
  end if;
  -- Today's gesture, or yesterday's for a selfie taken just before midnight
  if p_pose is null or p_pose not in (public.verification_pose_for(uid, v_today),
                                      public.verification_pose_for(uid, v_today - 1)) then
    raise exception 'Please take the selfie again, doing the gesture shown.' using hint = 'pose';
  end if;
  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects o
                     where o.bucket_id = 'verification-selfies' and o.name = p_selfie_path) then
    raise exception 'Please take your selfie again: it didn''t arrive.' using hint = 'selfie';
  end if;
  if length(coalesce(v_linkedin, '') || coalesce(v_instagram, '') || coalesce(v_facebook, '') || coalesce(v_twitter, '')) > 2000
     or length(coalesce(p_user_notes, '')) > 1000 then
    raise exception 'That''s too long.';
  end if;

  -- A request waiting for a decision is updated; otherwise a new one
  update public.verification_requests
     set selfie_path = p_selfie_path, pose = p_pose,
         linkedin_url = v_linkedin, instagram_url = v_instagram, facebook_url = v_facebook, twitter_url = v_twitter,
         user_notes = nullif(btrim(coalesce(p_user_notes, '')), ''), created_at = now()
   where user_id = uid and status = 'pending'
  returning id into v_id;
  if v_id is null then
    insert into public.verification_requests
      (user_id, selfie_path, pose, linkedin_url, instagram_url, facebook_url, twitter_url, user_notes)
    values (uid, p_selfie_path, p_pose, v_linkedin, v_instagram, v_facebook, v_twitter,
            nullif(btrim(coalesce(p_user_notes, '')), ''))
    returning id into v_id;
  end if;

  update public.profiles
     set verification_status = 'pending',
         linkedin = coalesce(v_linkedin, linkedin),
         instagram = coalesce(v_instagram, instagram),
         facebook = coalesce(v_facebook, facebook),
         twitter = coalesce(v_twitter, twitter)
   where id = uid;
  return v_id;
end;
$$;
revoke all on function public.submit_verification_request(text, text, text, text, text) from public, anon;
revoke all on function public.submit_verification_request(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_verification_request(text, text, text, text, text) to authenticated;
grant execute on function public.submit_verification_request(text, text, text, text, text, text, text) to authenticated;

-- What the verification team sees: the selfie and the gesture too
drop function if exists public.admin_pending_verifications();
create function public.admin_pending_verifications()
returns table(request_id uuid, user_id uuid, user_name text, user_email text, user_photo_urls text[],
              linkedin_url text, instagram_url text, facebook_url text, twitter_url text, user_notes text,
              requested_at timestamptz, selfie_path text, pose text)
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.admin_can(array['verifications']) then
    raise exception 'Forbidden';
  end if;
  return query
  select vr.id, vr.user_id, p.name, p.email, p.photo_urls,
         vr.linkedin_url, vr.instagram_url, vr.facebook_url, vr.twitter_url, vr.user_notes, vr.created_at,
         vr.selfie_path, vr.pose
    from public.verification_requests vr
    join public.profiles p on p.id = vr.user_id
   where vr.status = 'pending'
   order by vr.created_at asc;
end;
$$;
revoke all on function public.admin_pending_verifications() from public, anon;
grant execute on function public.admin_pending_verifications() to authenticated;

-- Approving needs the selfie and two photos; turning down needs a reason.
-- Either way the member is told (a message in the app and a notification).
drop function if exists public.admin_review_verification(uuid, text, text);
create function public.admin_review_verification(request_id uuid, decision text, notes text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_email text;
  v_req public.verification_requests;
  v_note text := nullif(btrim(coalesce(notes, '')), '');
begin
  if not public.admin_can(array['verifications']) then
    raise exception 'Forbidden: only admins can review verification requests';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', decision;
  end if;

  select * into v_req from public.verification_requests vr where vr.id = request_id for update;
  if v_req.id is null then
    raise exception 'Verification request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was decided already.';
  end if;

  if decision = 'approved' then
    if v_req.selfie_path is null then
      raise exception 'There''s no selfie with this request: turn it down with "Verification needs a selfie now".';
    end if;
    if coalesce((select cardinality(p.photo_urls) from public.profiles p where p.id = v_req.user_id), 0) < 2 then
      raise exception 'They have fewer than 2 photos now: turn it down with "needs two photos".';
    end if;
  else
    if p_reason is null or p_reason not in ('selfie_unclear', 'selfie_mismatch', 'pose_missing', 'photos_unclear',
                                            'need_two_photos', 'links_not_yours', 'need_selfie', 'other') then
      raise exception 'Choose why it isn''t approved.';
    end if;
    if p_reason = 'other' and v_note is null then
      raise exception 'Write a note for them: the reason is "Something else".';
    end if;
  end if;

  select email into v_admin_email from public.profiles where id = auth.uid();

  update public.verification_requests
     set status = decision, reviewed_by = auth.uid(), reviewed_at = now(), admin_notes = v_note,
         reason_code = case when decision = 'rejected' then p_reason end
   where id = request_id;

  update public.profiles
     set is_verified = (decision = 'approved'),
         verification_status = case when decision = 'approved' then 'verified' else 'unverified' end
   where id = v_req.user_id;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), v_admin_email,
          case when decision = 'approved' then 'approve_verification' else 'reject_verification' end,
          v_req.user_id, jsonb_build_object('request_id', request_id, 'notes', v_note, 'reason', p_reason));

  if decision = 'approved' then
    perform public.message_member(v_req.user_id, 'support', 'You''re verified',
      'Your profile shows the Verified badge now. Thank you for helping keep Shaadi24 real.',
      null, null, 'Verification approved', true);
  else
    perform public.message_member(v_req.user_id, 'support', 'Your verification needs another try',
      left(public.verification_reason_text(p_reason) || coalesce(' ' || v_note, ''), 400),
      'Try again', 'verify', 'Verification not approved', true);
  end if;
end;
$$;
revoke all on function public.admin_review_verification(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_verification(uuid, text, text, text) to authenticated;

-- ---- Messages from the team about a member's requests ------------------------
alter table public.admin_messages drop constraint if exists admin_messages_kind_check;
alter table public.admin_messages add constraint admin_messages_kind_check
  check (kind in ('campaign', 'moderation', 'automation', 'support'));
alter table public.admin_messages drop constraint if exists admin_messages_cta_target_check;
alter table public.admin_messages add constraint admin_messages_cta_target_check
  check (cta_target is null
         or cta_target ~ '^(profile(:(about|community|career|family|lifestyle|plans))?|verify|upgrade|search|requests)$');

-- ---- My requests -------------------------------------------------------------
-- What a member asked of us, and where it stands. A report says only whether
-- we acted, never what was done to the other member, and never the team's
-- notes about it.
create or replace function public.my_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verifications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'status', v.status, 'created_at', v.created_at, 'reviewed_at', v.reviewed_at,
               'reason_code', v.reason_code, 'note', case when v.status = 'rejected' then v.admin_notes end,
               'selfie', v.selfie_path is not null)
             order by v.created_at desc)
        from (select * from public.verification_requests
               where user_id = auth.uid() order by created_at desc limit 20) v), '[]'::jsonb),
    'complaints', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'ticket', g.ticket, 'category', g.category, 'status', g.status,
               'created_at', g.created_at, 'due_at', g.due_at, 'resolved_at', g.resolved_at,
               'resolution', g.resolution)
             order by g.created_at desc)
        from (select * from public.grievances
               where user_id = auth.uid() order by created_at desc limit 50) g), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', p.name, 'reason', r.reason,
               'outcome', case when r.status in ('resolved', 'actioned') then 'acted'
                               when r.status in ('dismissed', 'reviewed') then 'no_breach'
                               else 'open' end,
               'created_at', r.created_at, 'resolved_at', r.resolved_at)
             order by r.created_at desc)
        from (select * from public.reports
               where reporter_id = auth.uid() order by created_at desc limit 50) r
        left join public.profiles p on p.id = r.reported_id), '[]'::jsonb)
  );
$$;
revoke all on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;

-- A complaint answered: tell the member who made it while signed in
create or replace function public.admin_update_grievance(p_id uuid, p_status text, p_resolution text default null)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_email text;
  v_old public.grievances;
begin
  if not public.admin_can(array['grievances']) then
    raise exception 'Forbidden: only admins can answer complaints';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'rejected') then
    raise exception 'Unknown status %', p_status;
  end if;
  select * into v_old from public.grievances where id = p_id for update;
  if v_old.id is null then
    raise exception 'No such complaint';
  end if;
  update public.grievances
     set status = p_status,
         resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
         resolved_at = case when p_status in ('resolved', 'rejected') then coalesce(resolved_at, now()) else null end,
         handled_by = auth.uid()
   where id = p_id;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(v_email, ''), 'grievance_' || p_status,
          jsonb_build_object('grievance_id', p_id, 'resolution', p_resolution));

  if p_status in ('resolved', 'rejected') and v_old.status not in ('resolved', 'rejected')
     and v_old.user_id is not null and exists (select 1 from public.profiles where id = v_old.user_id) then
    perform public.message_member(v_old.user_id, 'support',
      format('Your complaint %s has an answer', v_old.ticket),
      'Read it in Settings → My requests.',
      'Read it', 'requests', 'Complaint answered', true);
  end if;
end;
$$;

-- A report looked into: tell the member who made it whether we acted
create or replace function public.admin_update_report(report_id uuid, new_status text, notes text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  admin_email_val text;
  action_name text;
  v_old public.reports;
begin
  if not public.admin_can(array['reports']) then
    raise exception 'Forbidden: only admins can update reports';
  end if;
  if new_status not in ('pending', 'resolved', 'dismissed') then
    raise exception 'Invalid status: %', new_status;
  end if;

  select * into v_old from public.reports r where r.id = report_id for update;
  if v_old.id is null then
    raise exception 'Report not found';
  end if;
  select email into admin_email_val from public.profiles where id = auth.uid();

  update public.reports
     set status = new_status,
         resolved_at = case when new_status in ('resolved', 'dismissed') then now() else null end,
         admin_notes = notes
   where id = report_id;

  action_name := case when new_status = 'dismissed' then 'dismiss_report' else 'resolve_report' end;
  insert into public.admin_audit (admin_id, admin_email, action, target_report_id, details)
  values (auth.uid(), admin_email_val, action_name, report_id, jsonb_build_object('new_status', new_status, 'notes', notes));

  if new_status in ('resolved', 'dismissed') and coalesce(v_old.status, 'pending') not in ('resolved', 'dismissed', 'actioned') then
    perform public.message_member(v_old.reporter_id, 'support', 'We''ve looked into your report',
      case when new_status = 'resolved'
        then 'Thank you. We acted on what you reported. See Settings → My requests.'
        else 'Thank you. We didn''t find a breach of our rules this time. You can block anyone you don''t want to hear from.' end,
      'See it', 'requests', 'Report answered', true);
  end if;
end;
$$;

-- A member sees their own reports without the team's notes, and makes one
-- only with who, why and what happened (the admin panel reads them through
-- admin_list_reports())
revoke select, insert, update, delete on public.reports from anon, authenticated;
grant select (id, reporter_id, reported_id, reason, details, status, created_at, resolved_at) on public.reports to authenticated;
grant insert (reporter_id, reported_id, reason, details) on public.reports to authenticated;

-- ---- Reporting an agent or a marriage bureau ----------------------------------
create or replace function public.enqueue_admin_report_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := case new.reason
    when 'spam' then 'Spam or scam'
    when 'fake_profile' then 'Fake profile or impersonation'
    when 'agent_bureau' then 'Agent or marriage bureau'
    when 'inappropriate_content' then 'Inappropriate photos or content'
    when 'intimate_images' then 'Intimate or morphed photos'
    when 'harassment' then 'Harassment or threats'
    when 'dowry' then 'Dowry or money demands'
    when 'underage' then 'Underage user'
    else 'Other'
  end;
begin
  perform public.notify_admins(
    'admin_report',
    case new.reason
      when 'underage' then '🚨 Report: someone may be under age'
      when 'intimate_images' then '🚨 Report: intimate photos, act within 2 hours'
      when 'fake_profile' then '🚩 Report: fake profile or impersonation'
      when 'agent_bureau' then '🚩 Report: an agent or marriage bureau'
      else '🚩 New report to review' end,
    format('Reason: %s. Open Admin → Reports.', v_reason),
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'reports', 'report_id', new.id),
    new.reporter_id);
  return new;
end;
$$;

-- ---- Share my number ------------------------------------------------------------
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'date_proposal', 'contact'));

create or replace function public.refuse_unshared_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.message_type = 'contact' and coalesce(current_setting('shaadi24.sharing_number', true), '') <> 'on' then
    raise exception 'Share your number with "Share my number".' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_contact_by_share on public.messages;
create trigger messages_contact_by_share before insert on public.messages
  for each row execute function public.refuse_unshared_contact();

-- The member's own number, written out in full, into a chat with a match.
-- An Indian mobile number (10 digits, with or without +91 or 0) becomes
-- +91XXXXXXXXXX; another country's needs + and its code. With p_remember the
-- number is kept on the profile (never shown to anyone) for next time.
create or replace function public.share_my_number(p_match_id uuid, p_phone text, p_remember boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_phone text;
  v_row public.messages;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.matches m
                  where m.id = p_match_id and uid in (m.user_a_id, m.user_b_id) and m.unmatched_at is null) then
    raise exception 'You can share your number only with a match.';
  end if;
  if v_digits ~ '^(\+?91|0)?[6-9][0-9]{9}$' then
    v_phone := '+91' || right(v_digits, 10);
  elsif v_digits ~ '^\+[1-9][0-9]{7,14}$' then
    v_phone := v_digits;
  else
    raise exception 'That doesn''t look like a mobile number. Use 10 digits, or + and the country code.';
  end if;
  if exists (select 1 from public.messages
              where match_id = p_match_id and sender_id = uid and message_type = 'contact' and content = v_phone) then
    raise exception 'You''ve shared this number in this chat already.';
  end if;

  perform set_config('shaadi24.sharing_number', 'on', true);
  insert into public.messages (match_id, sender_id, content, message_type)
  values (p_match_id, uid, v_phone, 'contact')
  returning * into v_row;
  perform set_config('shaadi24.sharing_number', '', true);

  if coalesce(p_remember, false) then
    update public.profiles set phone_number = v_phone where id = uid;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.share_my_number(uuid, text, boolean) from public, anon;
grant execute on function public.share_my_number(uuid, text, boolean) to authenticated;

-- ---- Chat messages can't be changed, except marked read by the recipient --------
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
drop policy if exists "users update messages in own matches" on public.messages;
drop policy if exists "recipients mark messages read" on public.messages;
create policy "recipients mark messages read" on public.messages
  for update to authenticated
  using (sender_id <> (select auth.uid())
         and exists (select 1 from public.matches m
                      where m.id = messages.match_id
                        and (m.user_a_id = (select auth.uid()) or m.user_b_id = (select auth.uid()))))
  with check (sender_id <> (select auth.uid()));

-- ---- "Download my data" ---------------------------------------------------------
-- Reads the Razorpay fields of payments only while they exist, so this works
-- before and after 20261005222759_phase10_no_razorpay.sql removes them.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  uid uuid;
  result jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'export_metadata', jsonb_build_object(
      'exported_at', now(),
      'user_id', uid,
      'format_version', '1.5',
      'app', 'Shaadi24',
      'note', 'This export contains data we hold about your account. It does not include data about other users (e.g. their messages to you are excluded; only your messages are listed). A verification selfie is not included: we delete it once your request is decided.'
    ),
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = uid
    ),
    'partner_preferences', (
      select to_jsonb(pp) - 'new_ids' from public.partner_preferences pp where pp.user_id = uid
    ),
    'likes_sent', (
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.likes l where l.liker_id = uid
    ),
    'likes_received_count', (
      -- Only count, not detail — would leak info about who likes you (others' data)
      select count(*) from public.likes where liked_id = uid
    ),
    'matches', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.matches m
      where m.user_a_id = uid or m.user_b_id = uid
    ),
    'messages_sent', (
      select coalesce(jsonb_agg(to_jsonb(msg)), '[]'::jsonb)
      from public.messages msg
      where msg.sender_id = uid
    ),
    'reports_filed', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'admin_notes'), '[]'::jsonb)
      from public.reports r
      where r.reporter_id = uid
    ),
    'complaints', (
      select coalesce(jsonb_agg(to_jsonb(g) - 'handled_by' order by g.created_at), '[]'::jsonb)
      from public.grievances g
      where g.user_id = uid
    ),
    'verification_requests', (
      select coalesce(jsonb_agg(to_jsonb(v) - 'reviewed_by'), '[]'::jsonb)
      from public.verification_requests v
      where v.user_id = uid
    ),
    'blocks_created', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.blocks b
      where b.blocker_id = uid
    ),
    'hidden_profiles', (
      select coalesce(jsonb_agg(jsonb_build_object('profile_id', h.passed_id, 'hidden_at', h.created_at)
                                order by h.created_at), '[]'::jsonb)
      from public.passed_profiles h
      where h.user_id = uid
    ),
    'search_history', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from public.search_history s
      where s.user_id = uid
    ),
    'saved_searches', (
      select coalesce(jsonb_agg(to_jsonb(s) - 'new_ids' order by s.created_at), '[]'::jsonb)
      from public.saved_searches s
      where s.user_id = uid
    ),
    'found_my_match_story', (
      select coalesce(jsonb_agg(jsonb_build_object('names', st.names, 'story', st.story,
                                                   'published', st.published, 'told_at', st.created_at)), '[]'::jsonb)
      from public.success_stories st
      where st.created_by = uid
    ),
    'consent_records', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.consent_records c
      where c.user_id = uid
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', s.provider, 'plan', s.plan_id, 'status', s.status, 'test', s.mode = 'test',
          'trial_ends_at', s.trial_ends_at, 'period_start', s.current_start, 'period_end', s.current_end,
          'renews', coalesce(s.auto_renew, not s.cancel_at_period_end), 'ended_at', s.ended_at,
          'started_at', s.created_at) order by s.created_at), '[]'::jsonb)
      from public.subscriptions s
      where s.user_id = uid
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', p.provider, 'reference', coalesce(p.store_order_id, to_jsonb(p) ->> 'razorpay_payment_id'),
          'amount', p.amount, 'currency', p.currency, 'amount_unit', 'smallest currency unit (paise for INR)',
          'status', p.status, 'method', p.method, 'paid_at', p.paid_at,
          'refunded_amount', p.refunded_amount, 'refunded_at', p.refunded_at)
          || case when to_jsonb(p) ? 'invoice_url'
                  then jsonb_build_object('invoice_url', to_jsonb(p) -> 'invoice_url') else '{}'::jsonb end
          order by p.paid_at), '[]'::jsonb)
      from public.payments p
      where p.user_id = uid
    ),
    -- Where notifications go: phones with the app, and browsers
    'notification_devices', jsonb_build_object(
      'phones', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'platform', d.platform, 'app_version', d.app_version,
            'added_at', d.created_at, 'last_signed_up_at', d.updated_at) order by d.created_at), '[]'::jsonb)
        from public.push_devices d
        where d.user_id = uid
      ),
      'browsers', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'browser', ps.user_agent, 'added_at', ps.created_at) order by ps.created_at), '[]'::jsonb)
        from public.push_subscriptions ps
        where ps.user_id = uid
      )
    ),
    -- Sign in with Apple: since when a token is kept to end it when the
    -- account is deleted (not the token itself)
    'sign_in_with_apple', (
      select jsonb_build_object('token_kept_since', t.created_at, 'last_updated_at', t.updated_at)
      from public.apple_sign_in_tokens t
      where t.user_id = uid
    )
  ) into result;

  return result;
end;
$$;
