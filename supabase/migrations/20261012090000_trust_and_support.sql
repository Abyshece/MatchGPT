-- ============================================================================
-- Trust and support: what other matrimony apps' members complain about, part 4
-- (docs/research/competitor-reviews.md). In two files: this one only adds;
-- …_trust_and_support_part_2.sql replaces what has to be dropped first (two
-- admin functions, two check constraints, a policy) and what depends on it.
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

create policy "Members add their verification selfie" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-selfies' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members and the verification team see selfies" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-selfies'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select public.admin_can(array['verifications']))));

create policy "Members and the verification team remove selfies" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification-selfies'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select public.admin_can(array['verifications']))));

alter table public.verification_requests
  add column if not exists selfie_path text,
  add column if not exists pose text,
  add column if not exists reason_code text;

alter table public.verification_requests add constraint verification_requests_reason_code_check
  check (reason_code is null or reason_code in (
    'selfie_unclear', 'selfie_mismatch', 'pose_missing', 'photos_unclear', 'need_two_photos',
    'links_not_yours', 'need_selfie', 'other'));

-- Written only by submit_verification_request() and admin_review_verification():
-- members read their own (the policy), nothing more
revoke all on table public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;

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

-- A member sees their own reports without the team's notes, and makes one
-- only with who, why and what happened (the admin panel reads them through
-- admin_list_reports())
revoke all on table public.reports from anon, authenticated;
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

-- ---- Chat messages can't be changed, except marked read --------------------------
-- (members could rewrite any message in their chats; now only read_at, which
-- mark_messages_read() sets)
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;

-- A number goes into a chat only through share_my_number() (…_trust_and_support_part_2.sql)
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
create trigger messages_contact_by_share before insert on public.messages
  for each row execute function public.refuse_unshared_contact();

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
