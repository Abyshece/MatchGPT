-- Phase 8: Active Status privacy, admin lookups, push notification schedule.
--
-- 1. Active Status off hides your last-active time from other users (the
--    search views returned it to every signed-in browser).
-- 2. The admin Users and Reports tabs read `profiles`, which only returns your
--    own row, so admins only ever saw themselves. Admin-only lookups instead.
-- 3. Push notifications were queued but never sent: nothing ran send-push, the
--    Vault key it would have used was a placeholder, and it had no Web Push
--    (VAPID) keys. Now a cron job calls send-push every minute when something
--    is queued. What it needs lives in Supabase Vault:
--      send_push_cron_secret  random, created below; the job sends it and
--                             send-push checks it
--      vapid_public_key,      the Web Push key pair; send-push creates it on
--      vapid_private_key      its first run
--      project_url            per environment, not in this file:
--                             select vault.create_secret('https://<ref>.supabase.co', 'project_url');

-- ---------------------------------------------------------------------------
-- 1. Active Status: null out last_active_at when the person turned it off
-- ---------------------------------------------------------------------------
create or replace view public.eligible_profiles as
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
    CASE WHEN settings_show_online IS FALSE THEN NULL ELSE last_active_at END AS last_active_at,
    linkedin,
    instagram,
    facebook,
    twitter,
    settings_incognito,
    settings_show_online,
    onboarding_complete
   FROM profiles
  WHERE onboarding_complete = true AND name IS NOT NULL AND name <> ''::text AND COALESCE(is_banned, false) = false AND COALESCE(is_paused, false) = false;

create or replace view public.public_profiles as
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
    CASE WHEN settings_show_online IS FALSE THEN NULL ELSE last_active_at END AS last_active_at,
    linkedin,
    instagram,
    facebook,
    twitter,
    is_banned,
    is_paused
   FROM profiles;

-- ---------------------------------------------------------------------------
-- 2. Admin lookups (each checks is_admin() first)
-- ---------------------------------------------------------------------------
create or replace function public.admin_search_users(p_query text default '', p_limit integer default 50)
returns table (
  id uuid, email text, name text, age integer, location text, subscription_tier text,
  is_verified boolean, is_banned boolean, banned_at timestamptz, ban_reason text,
  account_created timestamptz, daily_search_count integer, daily_like_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := coalesce(trim(p_query), '');
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select p.id, p.email, p.name, p.age, p.location, p.subscription_tier,
         p.is_verified, p.is_banned, p.banned_at, p.ban_reason,
         p.account_created, p.daily_search_count, p.daily_like_count
    from public.profiles p
   where q = '' or p.name ilike '%' || q || '%' or p.email ilike '%' || q || '%'
   order by p.account_created desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.admin_list_reports(p_pending_only boolean default true)
returns table (
  id uuid, reporter_id uuid, reported_id uuid, reason text, details text, status text,
  admin_notes text, resolved_at timestamptz, created_at timestamptz,
  reporter_email text, reporter_name text, reported_email text, reported_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select r.id, r.reporter_id, r.reported_id, r.reason, r.details, r.status,
         r.admin_notes, r.resolved_at, r.created_at,
         rp.email, rp.name, dp.email, dp.name
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles dp on dp.id = r.reported_id
   where not coalesce(p_pending_only, true) or r.status = 'pending'
   order by r.created_at desc
   limit 100;
end;
$$;

revoke execute on function public.admin_search_users(text, integer), public.admin_list_reports(boolean)
  from public, anon;
grant execute on function public.admin_search_users(text, integer), public.admin_list_reports(boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push notifications
-- ---------------------------------------------------------------------------
-- The cron job's shared secret, generated inside the database.
do $$
begin
  if to_regclass('vault.secrets') is not null
     and not exists (select 1 from vault.secrets where name = 'send_push_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'send_push_cron_secret',
      'send-push cron job: the job sends it, the function checks it');
  end if;
end $$;

-- For send-push only (service role): its cron secret and VAPID keys.
create or replace function public.send_push_config()
returns table (cron_secret text, vapid_public_key text, vapid_private_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'send_push_cron_secret'),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'vapid_public_key'),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'vapid_private_key');
end;
$$;

-- For send-push only: store the key pair it generated. First writer wins, so
-- two runs at once can't leave a mismatched pair.
create or replace function public.save_vapid_keys(p_public_key text, p_private_key text)
returns table (vapid_public_key text, vapid_private_key text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.save_vapid_keys'));
  if not exists (select 1 from vault.secrets s where s.name = 'vapid_private_key') then
    perform vault.create_secret(p_public_key, 'vapid_public_key', 'Web Push (VAPID) public key');
    perform vault.create_secret(p_private_key, 'vapid_private_key', 'Web Push (VAPID) private key');
  end if;

  return query
  select
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'vapid_public_key'),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'vapid_private_key');
end;
$$;

-- For browsers subscribing to push: the public half only.
create or replace function public.vapid_public_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'vapid_public_key');
end;
$$;

revoke execute on function public.send_push_config(), public.save_vapid_keys(text, text)
  from public, anon, authenticated;
grant execute on function public.send_push_config(), public.save_vapid_keys(text, text) to service_role;
revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

-- Every minute: call send-push if something is queued, or once to create the
-- VAPID keys. Does nothing until project_url is set in Vault.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('send-push', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_push_cron_secret')),
        body := '{}'::jsonb)
      where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
        and (exists (select 1 from public.pending_pushes)
             or not exists (select 1 from vault.secrets where name = 'vapid_private_key'));
    $job$);
  end if;
end $$;
