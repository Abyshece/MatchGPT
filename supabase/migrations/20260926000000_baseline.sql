-- ============================================================================
-- Baseline: the live ShaadiGPT database (Supabase project fmrbzzdjtarsaqvfukum)
-- as it stood on 2026-09-26, just before 20260926133139_close_public_data_exposure.
--
-- The schema was built by pasting 001_initial_schema.sql and later SQL files
-- (002–012) into the Supabase SQL editor, and only 001 was ever saved. This
-- file was regenerated from the live database catalog and replaces all of
-- them: applying the migrations in this folder, in order, rebuilds the
-- database from scratch (e.g. `npx supabase db reset` locally).
--
-- Not included: data (e.g. the admin_emails rows and the vault secret
-- "service_role_key" must be added by hand on a new project) and Supabase's
-- own schemas (auth, storage, realtime, vault, …) apart from the app's
-- objects in them.
-- ============================================================================

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;  -- installed but unused: no jobs are scheduled
create extension if not exists pg_net;   -- installed (in schema public on live) but unused

-- ============================================================================
-- Tables
-- ============================================================================
create table public.profiles (
  id uuid not null,
  email text,
  phone_number text,
  email_verified boolean default false,
  phone_verified boolean default false,
  account_created timestamp with time zone default now() not null,
  onboarding_complete boolean default false,
  verification_status text default 'unverified'::text,
  is_verified boolean default false,
  subscription_tier text default 'FREE'::text,
  subscription_renews_at timestamp with time zone,
  daily_search_count integer default 0,
  last_search_date date default CURRENT_DATE,
  daily_like_count integer default 0,
  last_like_date date default CURRENT_DATE,
  daily_super_like_count integer default 0,
  last_super_like_date date default CURRENT_DATE,
  name text,
  age integer,
  age_changed_once boolean default false,
  gender text,
  pronouns text,
  sexuality text,
  interested_in text,
  location text,
  hometown text,
  ethnicity text,
  race text,
  nationality_count integer,
  languages text,
  height text,
  body_type text,
  hair_color text,
  hair_type text,
  eye_color text,
  facial_hair text,
  makeup_routine text,
  clothing_style text,
  wears_glasses text,
  wears_lenses text,
  wears_jewelry text,
  body_hair text,
  has_tattoos text,
  dresses_well text,
  hygiene text,
  drinking text,
  smoking text,
  marijuana text,
  drugs text,
  covid_vaccine text,
  drives_car text,
  has_drivers_license text,
  living_preference text,
  favorite_drink text,
  can_cook text,
  baking_interest text,
  shopping_preference text,
  gym_routine text,
  sports_interest text,
  reading_interest text,
  hobbies text,
  is_organised text,
  snoring text,
  phone_type text,
  loves_travel text,
  travel_style text,
  next_travel_destination text,
  job_title text,
  work text,
  university text,
  education_level text,
  work_style text,
  religion text,
  politics text,
  zodiac text,
  therapy_history text,
  childhood_description text,
  music_genre text,
  family_health_history text,
  criminal_record text,
  future_plans text,
  dream_house_type text,
  love_language text,
  relationship_type text,
  dating_intention text,
  children text,
  family_plans text,
  pets text,
  marriage_timeline text,
  sex_style text,
  interracial_marriage text,
  siblings text,
  family_closeness text,
  financial_splitting text,
  conflict_resolution text,
  social_battery text,
  dietary_preferences text,
  attachment_style text,
  sleep_schedule text,
  financial_approach text,
  description text,
  linkedin text,
  instagram text,
  facebook text,
  twitter text,
  photo_urls text[] default ARRAY[]::text[],
  hidden_fields text[] default ARRAY[]::text[],
  settings_incognito boolean default false,
  settings_show_online boolean default true,
  settings_read_receipts boolean default true,
  settings_push_notifs boolean default true,
  settings_email_notifs boolean default true,
  last_active_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now() not null,
  terms_accepted_at timestamp with time zone,
  privacy_accepted_at timestamp with time zone,
  marketing_consent boolean default false,
  cookie_preferences jsonb default '{"analytics": false, "essential": true, "marketing": false}'::jsonb,
  settings_theme text default 'system'::text,
  is_banned boolean default false not null,
  banned_at timestamp with time zone,
  ban_reason text,
  is_paused boolean default false not null,
  paused_at timestamp with time zone
);

create table public.admin_emails (
  email text not null,
  added_at timestamp with time zone default now() not null,
  added_by uuid,
  notes text
);

create table public.verification_requests (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  linkedin_url text,
  instagram_url text,
  facebook_url text,
  twitter_url text,
  user_notes text,
  status text default 'pending'::text not null,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  admin_notes text,
  created_at timestamp with time zone default now() not null
);

create table public.admin_audit (
  id uuid default gen_random_uuid() not null,
  admin_id uuid not null,
  admin_email text not null,
  action text not null,
  target_user_id uuid,
  target_report_id uuid,
  details jsonb,
  created_at timestamp with time zone default now() not null
);


create table public.blocks (
  id uuid default uuid_generate_v4() not null,
  blocker_id uuid not null,
  blocked_id uuid not null,
  reason text,
  created_at timestamp with time zone default now() not null
);

create table public.consent_records (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  email text,
  event_type text not null,
  consented boolean not null,
  document_version text,
  cookie_categories jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  email_hash text
);

create table public.data_export_log (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  exported_at timestamp with time zone default now() not null
);

create table public.deletion_audit (
  id uuid default gen_random_uuid() not null,
  deleted_user_id uuid not null,
  deleted_email text,
  reason text,
  requested_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  success boolean default false,
  error_message text,
  ip_address inet,
  user_agent text
);

create table public.likes (
  id uuid default uuid_generate_v4() not null,
  liker_id uuid not null,
  liked_id uuid not null,
  is_super_like boolean default false,
  created_at timestamp with time zone default now() not null
);

create table public.matches (
  id uuid default uuid_generate_v4() not null,
  user_a_id uuid not null,
  user_b_id uuid not null,
  created_at timestamp with time zone default now() not null,
  unmatched_at timestamp with time zone,
  unmatched_by uuid
);

create table public.messages (
  id uuid default uuid_generate_v4() not null,
  match_id uuid not null,
  sender_id uuid not null,
  content text not null,
  message_type text default 'text'::text,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.push_queue (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  event_type text not null,
  title text not null,
  body text not null,
  data jsonb,
  created_at timestamp with time zone default now() not null,
  scheduled_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  failed_count integer default 0 not null
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  last_active_at timestamp with time zone,
  failure_count integer default 0 not null
);

create table public.reports (
  id uuid default uuid_generate_v4() not null,
  reporter_id uuid not null,
  reported_id uuid not null,
  reason text not null,
  details text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now() not null,
  admin_notes text,
  resolved_at timestamp with time zone
);

create table public.search_history (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  prompt text default ''::text not null,
  filters jsonb default '{}'::jsonb not null,
  result_ids uuid[] default ARRAY[]::uuid[] not null,
  pool_size integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.standouts (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  candidate_id uuid not null,
  rank integer not null,
  for_date date default CURRENT_DATE not null,
  created_at timestamp with time zone default now() not null
);

-- ============================================================================
-- Constraints and indexes
-- ============================================================================
-- Primary keys, unique and check constraints
alter table public.admin_audit add constraint admin_audit_pkey PRIMARY KEY (id);
alter table public.admin_emails add constraint admin_emails_pkey PRIMARY KEY (email);
alter table public.blocks add constraint blocks_pkey PRIMARY KEY (id);
alter table public.blocks add constraint blocks_blocker_id_blocked_id_key UNIQUE (blocker_id, blocked_id);
alter table public.blocks add constraint blocks_check CHECK ((blocker_id <> blocked_id));
alter table public.consent_records add constraint consent_records_pkey PRIMARY KEY (id);
alter table public.data_export_log add constraint data_export_log_pkey PRIMARY KEY (id);
alter table public.deletion_audit add constraint deletion_audit_pkey PRIMARY KEY (id);
alter table public.likes add constraint likes_pkey PRIMARY KEY (id);
alter table public.likes add constraint likes_liker_id_liked_id_key UNIQUE (liker_id, liked_id);
alter table public.likes add constraint likes_check CHECK ((liker_id <> liked_id));
alter table public.matches add constraint matches_pkey PRIMARY KEY (id);
alter table public.matches add constraint matches_user_a_id_user_b_id_key UNIQUE (user_a_id, user_b_id);
alter table public.matches add constraint matches_check CHECK ((user_a_id < user_b_id));
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_content_length CHECK ((length(content) <= 4000));
alter table public.messages add constraint messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'date_proposal'::text])));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_age_check CHECK (((age IS NULL) OR ((age >= 18) AND (age <= 99))));
alter table public.profiles add constraint profiles_bio_length CHECK (((description IS NULL) OR (length(description) <= 2000)));
alter table public.profiles add constraint profiles_name_length CHECK (((name IS NULL) OR (length(name) <= 100)));
alter table public.profiles add constraint profiles_settings_theme_check CHECK ((settings_theme = ANY (ARRAY['system'::text, 'light'::text, 'dark'::text])));
alter table public.profiles add constraint profiles_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['FREE'::text, 'PRO'::text])));
alter table public.profiles add constraint profiles_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text])));
alter table public.push_queue add constraint push_queue_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);
alter table public.reports add constraint reports_pkey PRIMARY KEY (id);
alter table public.reports add constraint reports_details_length CHECK (((details IS NULL) OR (length(details) <= 2000)));
alter table public.reports add constraint reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'actioned'::text, 'dismissed'::text])));
alter table public.search_history add constraint search_history_pkey PRIMARY KEY (id);
alter table public.standouts add constraint standouts_pkey PRIMARY KEY (id);
alter table public.standouts add constraint standouts_user_id_candidate_id_for_date_key UNIQUE (user_id, candidate_id, for_date);
alter table public.standouts add constraint standouts_check CHECK ((user_id <> candidate_id));
alter table public.standouts add constraint standouts_rank_check CHECK (((rank >= 1) AND (rank <= 10)));
alter table public.verification_requests add constraint verification_requests_pkey PRIMARY KEY (id);
alter table public.verification_requests add constraint verification_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

-- Foreign keys
alter table public.admin_audit add constraint admin_audit_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES profiles(id);
alter table public.admin_emails add constraint admin_emails_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id);
alter table public.blocks add constraint blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.blocks add constraint blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.consent_records add constraint consent_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.data_export_log add constraint data_export_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.likes add constraint likes_liked_id_fkey FOREIGN KEY (liked_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.likes add constraint likes_liker_id_fkey FOREIGN KEY (liker_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.matches add constraint matches_unmatched_by_fkey FOREIGN KEY (unmatched_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.matches add constraint matches_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.matches add constraint matches_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.push_queue add constraint push_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reports add constraint reports_reported_id_fkey FOREIGN KEY (reported_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.reports add constraint reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.search_history add constraint search_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.standouts add constraint standouts_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.standouts add constraint standouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.verification_requests add constraint verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
alter table public.verification_requests add constraint verification_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_admin_audit_admin ON public.admin_audit USING btree (admin_id, created_at DESC);
CREATE INDEX idx_admin_audit_target ON public.admin_audit USING btree (target_user_id, created_at DESC);
CREATE INDEX idx_blocks_blocked ON public.blocks USING btree (blocked_id);
CREATE INDEX idx_blocks_blocker ON public.blocks USING btree (blocker_id);
CREATE INDEX idx_consent_records_event_type ON public.consent_records USING btree (event_type, created_at DESC);
CREATE INDEX idx_consent_records_user_id ON public.consent_records USING btree (user_id, created_at DESC);
CREATE INDEX idx_data_export_log_user_time ON public.data_export_log USING btree (user_id, exported_at DESC);
CREATE INDEX idx_deletion_audit_completed ON public.deletion_audit USING btree (completed_at DESC);
CREATE INDEX idx_deletion_audit_email ON public.deletion_audit USING btree (deleted_email);
CREATE INDEX idx_likes_liked ON public.likes USING btree (liked_id);
CREATE INDEX idx_likes_liker ON public.likes USING btree (liker_id);
CREATE INDEX idx_matches_user_a ON public.matches USING btree (user_a_id);
CREATE INDEX idx_matches_user_b ON public.matches USING btree (user_b_id);
CREATE INDEX idx_messages_match ON public.messages USING btree (match_id, created_at);
CREATE INDEX idx_profiles_age ON public.profiles USING btree (age);
CREATE INDEX idx_profiles_gender ON public.profiles USING btree (gender);
CREATE INDEX idx_profiles_interested_in ON public.profiles USING btree (interested_in);
CREATE INDEX idx_profiles_is_banned ON public.profiles USING btree (is_banned) WHERE (is_banned = true);
CREATE INDEX idx_profiles_last_active_at ON public.profiles USING btree (last_active_at DESC);
CREATE INDEX idx_profiles_location ON public.profiles USING btree (location);
CREATE INDEX idx_profiles_subscription_tier ON public.profiles USING btree (subscription_tier);
CREATE INDEX idx_push_queue_pending ON public.push_queue USING btree (scheduled_at) WHERE (sent_at IS NULL);
CREATE INDEX idx_push_queue_user ON public.push_queue USING btree (user_id, created_at DESC);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_reports_reported ON public.reports USING btree (reported_id);
CREATE INDEX idx_reports_status ON public.reports USING btree (status);
CREATE INDEX idx_search_history_user_created ON public.search_history USING btree (user_id, created_at DESC);
CREATE INDEX idx_standouts_user_date ON public.standouts USING btree (user_id, for_date DESC, rank);
CREATE UNIQUE INDEX idx_one_pending_verification_per_user ON public.verification_requests USING btree (user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_verification_requests_status ON public.verification_requests USING btree (status, created_at DESC);

-- ============================================================================
-- Functions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_ban_user(target_id uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_email_val text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can ban users';
  end if;

  select email into admin_email_val from public.profiles where id = auth.uid();

  update public.profiles
     set is_banned = true,
         banned_at = now(),
         ban_reason = reason
   where id = target_id;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), admin_email_val, 'ban_user', target_id, jsonb_build_object('reason', reason));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_pending_verifications()
 RETURNS TABLE(request_id uuid, user_id uuid, user_name text, user_email text, user_photo_urls text[], linkedin_url text, instagram_url text, facebook_url text, twitter_url text, user_notes text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    vr.id,
    vr.user_id,
    p.name,
    p.email,
    p.photo_urls,
    vr.linkedin_url,
    vr.instagram_url,
    vr.facebook_url,
    vr.twitter_url,
    vr.user_notes,
    vr.created_at
  from public.verification_requests vr
  join public.profiles p on p.id = vr.user_id
  where vr.status = 'pending'
  order by vr.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'banned_users', (select count(*) from public.profiles where is_banned = true),
    'verified_users', (select count(*) from public.profiles where is_verified = true),
    'pro_users', (select count(*) from public.profiles where subscription_tier = 'PRO'),
    'total_matches', (select count(*) from public.matches),
    'total_messages', (select count(*) from public.messages),
    'total_likes', (select count(*) from public.likes),
    'super_likes', (select count(*) from public.likes where is_super_like = true),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'total_blocks', (select count(*) from public.blocks),
    'blocks_today', (select count(*) from public.blocks where created_at > now() - interval '24 hours'),
    -- FIX: account_created is `timestamp with time zone`, so use a direct
    -- interval comparison. The old `extract(epoch ...) * 1000` math returned
    -- a bigint-in-ms which cannot be compared against a timestamp value.
    'signups_today', (select count(*) from public.profiles where account_created > now() - interval '24 hours'),
    'signups_week', (select count(*) from public.profiles where account_created > now() - interval '7 days'),
    'matches_today', (select count(*) from public.matches where created_at > now() - interval '24 hours'),
    'matches_week', (select count(*) from public.matches where created_at > now() - interval '7 days'),
    'messages_today', (select count(*) from public.messages where created_at > now() - interval '24 hours')
  ) into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_verification(request_id uuid, decision text, notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_email_val text;
  req_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can review verification requests';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: %', decision;
  end if;

  select email into admin_email_val from public.profiles where id = auth.uid();

  -- Get the user_id of the requester so we can update their profile
  select user_id into req_user_id from public.verification_requests where id = request_id;
  if req_user_id is null then
    raise exception 'Verification request not found';
  end if;

  -- Update the request row
  update public.verification_requests
     set status = decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         admin_notes = notes
   where id = request_id;

  -- Update the user's profile
  if decision = 'approved' then
    update public.profiles
       set is_verified = true,
           verification_status = 'verified'
     where id = req_user_id;
  else
    -- rejected
    update public.profiles
       set is_verified = false,
           verification_status = 'unverified'
     where id = req_user_id;
  end if;

  -- Audit
  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (
    auth.uid(),
    admin_email_val,
    case when decision = 'approved' then 'approve_verification' else 'reject_verification' end,
    req_user_id,
    jsonb_build_object('request_id', request_id, 'notes', notes)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_unban_user(target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_email_val text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can unban users';
  end if;

  select email into admin_email_val from public.profiles where id = auth.uid();

  update public.profiles
     set is_banned = false,
         banned_at = null,
         ban_reason = null
   where id = target_id;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id)
  values (auth.uid(), admin_email_val, 'unban_user', target_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_report(report_id uuid, new_status text, notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_email_val text;
  action_name text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can update reports';
  end if;

  if new_status not in ('pending', 'resolved', 'dismissed') then
    raise exception 'Invalid status: %', new_status;
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
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_verify_user(target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_email_val text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can verify users';
  end if;

  select email into admin_email_val from public.profiles where id = auth.uid();

  update public.profiles
     set is_verified = true,
         verification_status = 'verified'
   where id = target_id;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id)
  values (auth.uid(), admin_email_val, 'verify_user', target_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.block_if_banned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  banned boolean;
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then return new; end if;

  select is_banned into banned from public.profiles where id = uid;
  if coalesce(banned, false) = true then
    raise exception 'Your account has been suspended. Contact support if you believe this is an error.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_for_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reciprocal_exists boolean;
  user_a uuid;
  user_b uuid;
begin
  -- check if the liked user has already liked the liker
  select exists(
    select 1 from public.likes
    where liker_id = new.liked_id and liked_id = new.liker_id
  ) into reciprocal_exists;

  if reciprocal_exists then
    -- order the pair lexicographically
    if new.liker_id < new.liked_id then
      user_a := new.liker_id;
      user_b := new.liked_id;
    else
      user_a := new.liked_id;
      user_b := new.liker_id;
    end if;

    insert into public.matches (user_a_id, user_b_id)
    values (user_a, user_b)
    on conflict (user_a_id, user_b_id) do nothing;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_like_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recent_count integer;
begin
  -- Allow max 60 likes per user per hour (10x the daily free limit, very generous)
  select count(*) into recent_count
  from public.likes
  where liker_id = new.liker_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 60 then
    raise exception 'Rate limit exceeded: too many likes in the last hour.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recent_count integer;
begin
  -- Allow max 200 messages per user per hour (≈3/minute average)
  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 200 then
    raise exception 'Rate limit exceeded: too many messages in the last hour. Try again later.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recent_count integer;
begin
  -- Max 10 reports per user per day. Anyone reporting more than this is
  -- almost certainly abusing the report system.
  select count(*) into recent_count
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > now() - interval '24 hours';

  if recent_count >= 10 then
    raise exception 'Daily report limit reached. Contact support if you need to report more.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_match_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_a_name text;
  user_b_name text;
  user_a_push_enabled boolean;
  user_b_push_enabled boolean;
begin
  -- Look up names and notification preferences
  select name, settings_push_notifs into user_a_name, user_a_push_enabled
    from public.profiles where id = new.user_a_id;
  select name, settings_push_notifs into user_b_name, user_b_push_enabled
    from public.profiles where id = new.user_b_id;

  -- Notify A about B (if A has pushes enabled)
  if coalesce(user_a_push_enabled, true) then
    insert into public.push_queue (user_id, event_type, title, body, data)
    values (
      new.user_a_id,
      'new_match',
      'It''s a match! 🎉',
      format('You and %s liked each other. Say hello!', coalesce(user_b_name, 'someone')),
      jsonb_build_object('match_id', new.id, 'other_user_id', new.user_b_id, 'deep_link', '/matches')
    );
  end if;

  -- Notify B about A (if B has pushes enabled)
  if coalesce(user_b_push_enabled, true) then
    insert into public.push_queue (user_id, event_type, title, body, data)
    values (
      new.user_b_id,
      'new_match',
      'It''s a match! 🎉',
      format('You and %s liked each other. Say hello!', coalesce(user_a_name, 'someone')),
      jsonb_build_object('match_id', new.id, 'other_user_id', new.user_a_id, 'deep_link', '/matches')
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_message_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recipient_id uuid;
  sender_name text;
  recipient_push_enabled boolean;
begin
  -- Figure out who the recipient is (the user in the match who isn't the sender)
  select case
    when m.user_a_id = new.sender_id then m.user_b_id
    else m.user_a_id
  end into recipient_id
  from public.matches m where m.id = new.match_id;

  if recipient_id is null then return new; end if;

  select name into sender_name
    from public.profiles where id = new.sender_id;

  select settings_push_notifs into recipient_push_enabled
    from public.profiles where id = recipient_id;

  if not coalesce(recipient_push_enabled, true) then return new; end if;

  -- Don't include the message content in the push for privacy reasons
  -- (it shows on the lock screen). Just say "you have a new message".
  insert into public.push_queue (user_id, event_type, title, body, data)
  values (
    recipient_id,
    'new_message',
    format('💬 %s sent you a message', coalesce(sender_name, 'Someone')),
    'Open ShaadiGPT to read it',
    jsonb_build_object('match_id', new.match_id, 'sender_id', new.sender_id, 'deep_link', '/matches')
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_superlike_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recipient_push_enabled boolean;
begin
  -- Only fire on SUPER likes, not regular likes (those are too frequent)
  if not new.is_super_like then return new; end if;

  select settings_push_notifs into recipient_push_enabled
    from public.profiles where id = new.liked_id;

  if not coalesce(recipient_push_enabled, true) then return new; end if;

  insert into public.push_queue (user_id, event_type, title, body, data)
  values (
    new.liked_id,
    'super_like',
    '⭐ Someone super-liked you!',
    'Open ShaadiGPT to see who.',
    jsonb_build_object('liker_id', new.liker_id, 'deep_link', '/likes')
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'format_version', '1.0',
      'app', 'ShaadiGPT',
      'note', 'This export contains data we hold about your account. It does not include data about other users (e.g. their messages to you are excluded; only your messages are listed).'
    ),
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = uid
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
      where m.user_a = uid or m.user_b = uid
    ),
    'messages_sent', (
      select coalesce(jsonb_agg(to_jsonb(msg)), '[]'::jsonb)
      from public.messages msg
      where msg.sender_id = uid
    ),
    'reports_filed', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.reports r
      where r.reporter_id = uid
    ),
    'verification_requests', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.verification_requests v
      where v.user_id = uid
    ),
    'blocks_created', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.blocks b
      where b.blocker_id = uid
    ),
    'search_history', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from public.search_history s
      where s.user_id = uid
    ),
    'consent_records', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.consent_records c
      where c.user_id = uid
    )
  ) into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_likes_received(p_user_id uuid)
 RETURNS TABLE(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamp with time zone, liker_name text, liker_age integer, liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean, liker_hidden_fields text[], liker_description text)
 LANGUAGE sql
 STABLE
AS $function$
  select
    l.id, l.liker_id, l.is_super_like, l.created_at,
    p.name, p.age, p.location, p.photo_urls,
    p.subscription_tier, p.is_verified, p.hidden_fields, p.description
  from public.likes l
  join public.profiles p on p.id = l.liker_id
  where l.liked_id = p_user_id
    -- not blocked in either direction
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = l.liker_id)
         or (b.blocker_id = l.liker_id and b.blocked_id = p_user_id)
    )
    -- not already matched (after match formed, the like still exists but
    -- we don't show it as a pending like anymore)
    and not exists (
      select 1 from public.matches m
      where m.unmatched_at is null
        and (
          (m.user_a_id = p_user_id and m.user_b_id = l.liker_id)
          or (m.user_a_id = l.liker_id and m.user_b_id = p_user_id)
        )
    )
    -- liker still has a complete profile
    and p.onboarding_complete = true
    and p.name is not null
    and p.name <> ''
  order by l.is_super_like desc, l.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_matches_with_profile(p_user_id uuid)
 RETURNS TABLE(match_id uuid, matched_at timestamp with time zone, other_user_id uuid, other_name text, other_age integer, other_location text, other_photos text[], other_subscription_tier text, other_is_verified boolean, other_hidden_fields text[], last_message_content text, last_message_at timestamp with time zone, last_message_sender_id uuid, unread_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with my_matches as (
    select
      m.id as match_id,
      m.created_at as matched_at,
      case when m.user_a_id = p_user_id then m.user_b_id else m.user_a_id end as other_user_id
    from public.matches m
    where m.unmatched_at is null
      and (m.user_a_id = p_user_id or m.user_b_id = p_user_id)
  ),
  with_profile as (
    select
      mm.match_id, mm.matched_at, mm.other_user_id,
      p.name, p.age, p.location, p.photo_urls,
      p.subscription_tier, p.is_verified, p.hidden_fields
    from my_matches mm
    join public.profiles p on p.id = mm.other_user_id
    -- exclude blocked
    where not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = mm.other_user_id)
         or (b.blocker_id = mm.other_user_id and b.blocked_id = p_user_id)
    )
  ),
  with_last_message as (
    select distinct on (wp.match_id)
      wp.*,
      msg.content as last_msg_content,
      msg.created_at as last_msg_at,
      msg.sender_id as last_msg_sender
    from with_profile wp
    left join public.messages msg on msg.match_id = wp.match_id
    order by wp.match_id, msg.created_at desc nulls last
  ),
  with_unread as (
    select
      wlm.*,
      coalesce((
        select count(*) from public.messages mm2
        where mm2.match_id = wlm.match_id
          and mm2.sender_id <> p_user_id
          and mm2.read_at is null
      ), 0) as unread_count
    from with_last_message wlm
  )
  select
    match_id, matched_at, other_user_id,
    name, age, location, photo_urls,
    subscription_tier, is_verified, hidden_fields,
    last_msg_content, last_msg_at, last_msg_sender,
    unread_count
  from with_unread
  order by coalesce(last_msg_at, matched_at) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, account_created)
  values (new.id, new.email, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_push_failure(sub_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.push_subscriptions
     set failure_count = failure_count + 1
   where id = sub_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_match_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_count int;
begin
  update public.messages
  set read_at = now()
  where match_id = p_match_id
    and sender_id <> auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_verification_request(p_linkedin_url text, p_instagram_url text, p_facebook_url text, p_twitter_url text, p_user_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  new_id uuid;
  link_count int := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  -- Require at least 2 of 4 social links (some platforms might not exist for everyone)
  if coalesce(trim(p_linkedin_url), '') <> '' then link_count := link_count + 1; end if;
  if coalesce(trim(p_instagram_url), '') <> '' then link_count := link_count + 1; end if;
  if coalesce(trim(p_facebook_url), '') <> '' then link_count := link_count + 1; end if;
  if coalesce(trim(p_twitter_url), '') <> '' then link_count := link_count + 1; end if;

  if link_count < 2 then
    raise exception 'Please provide at least 2 social media profile links';
  end if;

  -- If user already has a pending request, update it instead of creating new
  if exists (select 1 from public.verification_requests where user_id = uid and status = 'pending') then
    update public.verification_requests
       set linkedin_url = nullif(trim(p_linkedin_url), ''),
           instagram_url = nullif(trim(p_instagram_url), ''),
           facebook_url = nullif(trim(p_facebook_url), ''),
           twitter_url = nullif(trim(p_twitter_url), ''),
           user_notes = nullif(trim(p_user_notes), ''),
           created_at = now()
     where user_id = uid and status = 'pending'
     returning id into new_id;
  else
    insert into public.verification_requests (
      user_id, linkedin_url, instagram_url, facebook_url, twitter_url, user_notes
    ) values (
      uid,
      nullif(trim(p_linkedin_url), ''),
      nullif(trim(p_instagram_url), ''),
      nullif(trim(p_facebook_url), ''),
      nullif(trim(p_twitter_url), ''),
      nullif(trim(p_user_notes), '')
    )
    returning id into new_id;
  end if;

  -- Also flip the user's profile verification_status to 'pending'
  update public.profiles
     set verification_status = 'pending'
   where id = uid;

  -- Mirror the social URLs onto the profile (some are already there, this keeps them in sync)
  update public.profiles
     set linkedin = coalesce(nullif(trim(p_linkedin_url), ''), linkedin),
         instagram = coalesce(nullif(trim(p_instagram_url), ''), instagram),
         facebook = coalesce(nullif(trim(p_facebook_url), ''), facebook),
         twitter = coalesce(nullif(trim(p_twitter_url), ''), twitter)
   where id = uid;

  return new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unmatch(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  update public.matches
  set unmatched_at = now(),
      unmatched_by = auth.uid()
  where id = p_match_id
    and unmatched_at is null
    and (user_a_id = auth.uid() or user_b_id = auth.uid());
end;
$function$
;

-- As it was before 20260926133139_close_public_data_exposure (which replaces it).
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.admin_emails a on a.email = p.email
    where p.id = auth.uid()
  );
$function$
;

-- ============================================================================
-- Triggers
-- ============================================================================
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER block_banned_likes BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION block_if_banned();
CREATE TRIGGER likes_rate_limit BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION enforce_like_rate_limit();
CREATE TRIGGER on_like_created AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION check_for_match();
CREATE TRIGGER trg_superlike_push AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION enqueue_superlike_push();
CREATE TRIGGER trg_match_push AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION enqueue_match_push();
CREATE TRIGGER block_banned_messages BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION block_if_banned();
CREATE TRIGGER messages_rate_limit BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();
CREATE TRIGGER trg_message_push AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION enqueue_message_push();
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER block_banned_reports BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION block_if_banned();
CREATE TRIGGER reports_rate_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION enforce_report_rate_limit();
CREATE TRIGGER block_banned_verifications BEFORE INSERT ON public.verification_requests FOR EACH ROW EXECUTE FUNCTION block_if_banned();

-- ============================================================================
-- Views (owned by postgres, so they read profiles past row-level security)
-- ============================================================================
create view public.eligible_profiles as
 SELECT id,
    name,
    age,
    location,
    hometown,
    description,
    photo_urls,
    is_verified,
    subscription_tier,
    pronouns,
    gender,
    sexuality,
    interested_in,
    ethnicity,
    race,
    religion,
    politics,
    zodiac,
    height,
    body_type,
    hair_color,
    eye_color,
    drinking,
    smoking,
    marijuana,
    drugs,
    dating_intention,
    relationship_type,
    marriage_timeline,
    children,
    family_plans,
    pets,
    hobbies,
    travel_style,
    music_genre,
    sports_interest,
    reading_interest,
    languages,
    job_title,
    work,
    work_style,
    education_level,
    university,
    love_language,
    attachment_style,
    social_battery,
    conflict_resolution,
    financial_approach,
    hidden_fields,
    last_active_at,
    linkedin,
    instagram,
    facebook,
    twitter,
    settings_incognito,
    settings_show_online,
    onboarding_complete
   FROM profiles
  WHERE onboarding_complete = true AND name IS NOT NULL AND name <> ''::text AND COALESCE(is_banned, false) = false AND COALESCE(is_paused, false) = false;

create view public.my_blocked_ids as
 SELECT blocks.blocked_id AS other_id
   FROM blocks
  WHERE blocks.blocker_id = auth.uid()
UNION
 SELECT blocks.blocker_id AS other_id
   FROM blocks
  WHERE blocks.blocked_id = auth.uid();

create view public.pending_pushes as
 SELECT pq.id AS queue_id,
    pq.user_id,
    pq.event_type,
    pq.title,
    pq.body,
    pq.data,
    ps.id AS subscription_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    ps.failure_count
   FROM push_queue pq
     JOIN push_subscriptions ps ON ps.user_id = pq.user_id
  WHERE pq.sent_at IS NULL AND pq.scheduled_at <= now() AND ps.failure_count < 5;

create view public.public_profiles as
 SELECT id,
    name,
    age,
    location,
    hometown,
    description,
    photo_urls,
    is_verified,
    subscription_tier,
    pronouns,
    gender,
    ethnicity,
    religion,
    height,
    body_type,
    drinking,
    smoking,
    dating_intention,
    relationship_type,
    marriage_timeline,
    children,
    family_plans,
    hobbies,
    languages,
    job_title,
    work,
    education_level,
    hidden_fields,
    last_active_at,
    linkedin,
    instagram,
    facebook,
    twitter,
    is_banned,
    is_paused
   FROM profiles;

create view public.visible_profiles as
 SELECT id,
    email,
    phone_number,
    email_verified,
    phone_verified,
    account_created,
    onboarding_complete,
    verification_status,
    is_verified,
    subscription_tier,
    subscription_renews_at,
    daily_search_count,
    last_search_date,
    daily_like_count,
    last_like_date,
    daily_super_like_count,
    last_super_like_date,
    name,
    age,
    age_changed_once,
    gender,
    pronouns,
    sexuality,
    interested_in,
    location,
    hometown,
    ethnicity,
    race,
    nationality_count,
    languages,
    height,
    body_type,
    hair_color,
    hair_type,
    eye_color,
    facial_hair,
    makeup_routine,
    clothing_style,
    wears_glasses,
    wears_lenses,
    wears_jewelry,
    body_hair,
    has_tattoos,
    dresses_well,
    hygiene,
    drinking,
    smoking,
    marijuana,
    drugs,
    covid_vaccine,
    drives_car,
    has_drivers_license,
    living_preference,
    favorite_drink,
    can_cook,
    baking_interest,
    shopping_preference,
    gym_routine,
    sports_interest,
    reading_interest,
    hobbies,
    is_organised,
    snoring,
    phone_type,
    loves_travel,
    travel_style,
    next_travel_destination,
    job_title,
    work,
    university,
    education_level,
    work_style,
    religion,
    politics,
    zodiac,
    therapy_history,
    childhood_description,
    music_genre,
    family_health_history,
    criminal_record,
    future_plans,
    dream_house_type,
    love_language,
    relationship_type,
    dating_intention,
    children,
    family_plans,
    pets,
    marriage_timeline,
    sex_style,
    interracial_marriage,
    siblings,
    family_closeness,
    financial_splitting,
    conflict_resolution,
    social_battery,
    dietary_preferences,
    attachment_style,
    sleep_schedule,
    financial_approach,
    description,
    linkedin,
    instagram,
    facebook,
    twitter,
    photo_urls,
    hidden_fields,
    settings_incognito,
    settings_show_online,
    settings_read_receipts,
    settings_push_notifs,
    settings_email_notifs,
    last_active_at,
    updated_at,
    terms_accepted_at,
    privacy_accepted_at,
    marketing_consent,
    cookie_preferences,
    settings_theme,
    is_banned,
    banned_at,
    ban_reason
   FROM profiles
  WHERE NOT is_banned;

-- ============================================================================
-- Row-level security
-- ============================================================================
alter table public.admin_audit enable row level security;
alter table public.admin_emails enable row level security;
alter table public.blocks enable row level security;
alter table public.consent_records enable row level security;
alter table public.data_export_log enable row level security;
alter table public.deletion_audit enable row level security;  -- no policies: service role only
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.profiles enable row level security;
alter table public.push_queue enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reports enable row level security;
alter table public.search_history enable row level security;
alter table public.standouts enable row level security;
alter table public.verification_requests enable row level security;

create policy "admins can read audit log" on public.admin_audit for select to public
  using (is_admin());

-- As it was before 20260926133139_close_public_data_exposure (which replaces it).
create policy "admins can read admin_emails" on public.admin_emails for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.email IN ( SELECT admin_emails_1.email
           FROM admin_emails admin_emails_1))))));

create policy "users delete own blocks" on public.blocks for delete to authenticated
  using ((auth.uid() = blocker_id));
create policy "users insert own blocks" on public.blocks for insert to authenticated
  with check ((auth.uid() = blocker_id));
create policy "users see own blocks" on public.blocks for select to authenticated
  using ((auth.uid() = blocker_id));

create policy "users insert own consent" on public.consent_records for insert to public
  with check (((auth.uid() = user_id) OR (user_id IS NULL)));
create policy "users see own consent" on public.consent_records for select to public
  using ((auth.uid() = user_id));

create policy "users insert own export log" on public.data_export_log for insert to public
  with check ((user_id = auth.uid()));
create policy "users see own export log" on public.data_export_log for select to public
  using ((user_id = auth.uid()));

create policy "users delete own likes" on public.likes for delete to authenticated
  using ((auth.uid() = liker_id));
create policy "users insert own likes" on public.likes for insert to authenticated
  with check ((auth.uid() = liker_id));
create policy "users see own likes" on public.likes for select to authenticated
  using (((auth.uid() = liker_id) OR (auth.uid() = liked_id)));

create policy "users see own matches" on public.matches for select to authenticated
  using (((auth.uid() = user_a_id) OR (auth.uid() = user_b_id)));
create policy "users update own matches" on public.matches for update to authenticated
  using (((auth.uid() = user_a_id) OR (auth.uid() = user_b_id)))
  with check (((auth.uid() = user_a_id) OR (auth.uid() = user_b_id)));

create policy "users see own messages" on public.messages for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = auth.uid()) OR (m.user_b_id = auth.uid())) AND (m.unmatched_at IS NULL)))));
create policy "users send messages in own matches" on public.messages for insert to authenticated
  with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = auth.uid()) OR (m.user_b_id = auth.uid())) AND (m.unmatched_at IS NULL))))));
create policy "users update messages in own matches" on public.messages for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = auth.uid()) OR (m.user_b_id = auth.uid()))))));

create policy "users can insert own profile" on public.profiles for insert to public
  with check ((auth.uid() = id));
create policy "users can update own profile" on public.profiles for update to authenticated
  using ((auth.uid() = id))
  with check ((auth.uid() = id));
create policy "users see own profile" on public.profiles for select to public
  using ((auth.uid() = id));

create policy "users see own push queue" on public.push_queue for select to public
  using ((auth.uid() = user_id));

create policy "users delete own push subs" on public.push_subscriptions for delete to public
  using ((auth.uid() = user_id));
create policy "users insert own push subs" on public.push_subscriptions for insert to public
  with check ((auth.uid() = user_id));
create policy "users see own push subs" on public.push_subscriptions for select to public
  using ((auth.uid() = user_id));

create policy "admins can read all reports" on public.reports for select to public
  using (is_admin());
create policy "users insert own reports" on public.reports for insert to authenticated
  with check ((auth.uid() = reporter_id));
create policy "users see own reports" on public.reports for select to authenticated
  using ((auth.uid() = reporter_id));

create policy "search_history_delete_own" on public.search_history for delete to public
  using ((auth.uid() = user_id));
create policy "search_history_insert_own" on public.search_history for insert to public
  with check ((auth.uid() = user_id));
create policy "search_history_select_own" on public.search_history for select to public
  using ((auth.uid() = user_id));

create policy "users delete own standouts" on public.standouts for delete to public
  using ((auth.uid() = user_id));
create policy "users insert own standouts" on public.standouts for insert to public
  with check ((auth.uid() = user_id));
create policy "users see own standouts" on public.standouts for select to public
  using ((auth.uid() = user_id));

create policy "admins see all verification requests" on public.verification_requests for select to public
  using (is_admin());
create policy "users insert own verification requests" on public.verification_requests for insert to public
  with check ((auth.uid() = user_id));
create policy "users see own verification requests" on public.verification_requests for select to public
  using ((auth.uid() = user_id));

-- ============================================================================
-- Storage: public "photos" bucket, each user writes only to <their id>/…
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos publicly readable" on storage.objects for select to public
  using ((bucket_id = 'photos'::text));
create policy "users upload to own photo folder" on storage.objects for insert to authenticated
  with check (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "users update own photos" on storage.objects for update to authenticated
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "users delete own photos" on storage.objects for delete to authenticated
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ============================================================================
-- Realtime: tables whose changes are broadcast to subscribed clients
-- ============================================================================
alter publication supabase_realtime add table
  public.blocks, public.likes, public.matches, public.messages,
  public.profiles, public.reports, public.verification_requests;
