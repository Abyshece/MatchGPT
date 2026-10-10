-- ============================================================================
-- Trust and support, part 2 (after 20261012090000_trust_and_support.sql): what
-- has to be dropped or replaced first.
--   - The admin's list of verification requests returns the selfie and the
--     gesture, and a decision takes a reason (new return type and signature)
--   - Team messages of kind 'support' with a "My requests" button; answering
--     a complaint or a report sends one
--   - Chat messages of type 'contact' (Share my number)
--   - Only the person a message was sent to marks it read
--   - The old rule letting members write verification requests goes
-- ============================================================================

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

-- ---- Share my number ------------------------------------------------------------
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'date_proposal', 'contact'));

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

-- ---- Only the person a message was sent to marks it read -----------------------
drop policy if exists "users update messages in own matches" on public.messages;
create policy "recipients mark messages read" on public.messages
  for update to authenticated
  using (sender_id <> (select auth.uid())
         and exists (select 1 from public.matches m
                      where m.id = messages.match_id
                        and (m.user_a_id = (select auth.uid()) or m.user_b_id = (select auth.uid()))))
  with check (sender_id <> (select auth.uid()));

-- Members write verification requests only through submit_verification_request()
drop policy if exists "users insert own verification requests" on public.verification_requests;
