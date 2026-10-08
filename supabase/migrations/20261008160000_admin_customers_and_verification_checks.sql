-- ============================================================================
-- Admin: Customers (every member in one row) and verification checks
--
-- admin_customers(): members page by page, with everything about each one in
-- a single row: who they are, where, religion and community, education and
-- work, how they signed in and on which phones, verification, Shaadi24+, how
-- much of the profile is filled in, likes, matches, messages, reports and
-- blocks. Searched by name, email, phone, city or id; filtered (new this
-- week, Shaadi24+, free, verified, waiting for verification, not verified,
-- banned, paused, inactive for 30 days, profile not complete) and sorted
-- (newest, last active, name, least complete).
--
-- admin_verification_signals(): for each verification request waiting for a
-- decision, what tells whether it should pass: account age, a confirmed email
-- or Apple/Google sign-in, photos, sections complete, reports and blocks
-- against the member, earlier rejections, and links that another member has
-- used too. The admin panel weighs them (lib/verificationChecks.ts).
--
-- Both for admins only (is_admin()).
-- ============================================================================

-- A social link as written, compared without the scheme, "www."/"m.", the
-- query and a trailing slash: "https://www.instagram.com/priya/" and
-- "instagram.com/priya" are the same link
create or replace function public.norm_social_url(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    rtrim(lower(regexp_replace(split_part(split_part(btrim(coalesce(p_url, '')), '?', 1), '#', 1),
                               '^(https?://)?(www\.|m\.|mobile\.)?', '')), '/'),
    '');
$$;

create or replace function public.admin_customers(
  p_query text default '',
  p_filter text default 'all',
  p_sort text default 'joined',
  p_limit integer default 50,
  p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := coalesce(btrim(p_query), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  with base as (
    select p.*,
           (select count(*) filter (where (s->>'complete')::boolean) from jsonb_array_elements(public.profile_sections(p)) s)::int as sections_done,
           (select coalesce(sum((s->>'answered')::int), 0) from jsonb_array_elements(public.profile_sections(p)) s)::int as answers,
           (select coalesce(sum((s->>'total')::int), 0) from jsonb_array_elements(public.profile_sections(p)) s)::int as answers_total
      from public.profiles p
     where q = ''
        or p.name ilike '%' || q || '%'
        or p.email ilike '%' || q || '%'
        or coalesce(p.phone_number, '') ilike '%' || q || '%'
        or coalesce(p.city, '') ilike '%' || q || '%'
        or p.id::text = q
  ),
  filtered as (
    select b.*
      from base b
     where case coalesce(p_filter, 'all')
             when 'new' then b.account_created > now() - interval '7 days'
             when 'pro' then b.subscription_tier = 'PRO'
             when 'free' then coalesce(b.subscription_tier, 'FREE') <> 'PRO'
             when 'verified' then coalesce(b.is_verified, false)
             when 'pending' then b.verification_status = 'pending'
             when 'unverified' then not coalesce(b.is_verified, false)
             when 'banned' then coalesce(b.is_banned, false)
             when 'paused' then coalesce(b.is_paused, false)
             when 'inactive' then coalesce(b.last_active_at, b.account_created) < now() - interval '30 days'
             when 'incomplete' then b.sections_done < 6
             else true
           end
  ),
  page as (
    select f.*,
           count(*) over () as total,
           row_number() over (order by
             case when p_sort = 'name' then lower(f.name) end asc nulls last,
             case when p_sort = 'active' then f.last_active_at end desc nulls last,
             case when p_sort = 'complete' then f.answers::numeric / nullif(f.answers_total, 0) end asc nulls first,
             f.account_created desc) as rn
      from filtered f
     order by rn
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
           'total', coalesce(max(pg.total), (select count(*) from filtered)),
           'rows', coalesce(jsonb_agg(jsonb_build_object(
             'id', pg.id,
             'name', pg.name,
             'email', pg.email,
             'phone', pg.phone_number,
             'gender', pg.gender,
             'age', pg.age,
             'date_of_birth', pg.date_of_birth,
             'created_for', pg.profile_created_for,
             'marital_status', pg.marital_status,
             'height_cm', pg.height_cm,
             'city', pg.city,
             'state', pg.state,
             'country', pg.country,
             'religion', pg.religion,
             'caste', pg.caste,
             'mother_tongue', pg.mother_tongue,
             'education', pg.education_level,
             'occupation', pg.occupation,
             'income', pg.annual_income,
             'joined', pg.account_created,
             'last_active', pg.last_active_at,
             'sign_in', (select u.raw_app_meta_data->>'provider' from auth.users u where u.id = pg.id),
             'email_confirmed', (select u.email_confirmed_at is not null from auth.users u where u.id = pg.id),
             'phones', (select coalesce(jsonb_agg(distinct d.platform), '[]'::jsonb) from public.push_devices d where d.user_id = pg.id),
             'verified', coalesce(pg.is_verified, false),
             'verification', pg.verification_status,
             'tier', coalesce(pg.subscription_tier, 'FREE'),
             'renews', pg.subscription_renews_at,
             'plan', (select s.plan_id from public.subscriptions s where s.user_id = pg.id order by s.created_at desc limit 1),
             'plan_status', (select s.status from public.subscriptions s where s.user_id = pg.id order by s.created_at desc limit 1),
             'store', (select s.provider from public.subscriptions s where s.user_id = pg.id order by s.created_at desc limit 1),
             'sections_done', pg.sections_done,
             'answers', pg.answers,
             'answers_total', pg.answers_total,
             'photos', coalesce(array_length(pg.photo_urls, 1), 0),
             'likes_sent', (select count(*) from public.likes l where l.liker_id = pg.id),
             'likes_received', (select count(*) from public.likes l where l.liked_id = pg.id),
             'matches', (select count(*) from public.matches m where (m.user_a_id = pg.id or m.user_b_id = pg.id) and m.unmatched_at is null),
             'messages', (select count(*) from public.messages ms where ms.sender_id = pg.id),
             'reports', (select count(*) from public.reports r where r.reported_id = pg.id),
             'blocked_by', (select count(*) from public.blocks b where b.blocked_id = pg.id),
             'banned', coalesce(pg.is_banned, false),
             'ban_reason', pg.ban_reason,
             'paused', coalesce(pg.is_paused, false),
             'marketing', coalesce(pg.marketing_consent, false),
             'searches_today', coalesce(pg.daily_search_count, 0),
             'likes_today', coalesce(pg.daily_like_count, 0)
           ) order by pg.rn), '[]'::jsonb))
    into v_result
    from page pg;

  return v_result;
end;
$$;

create or replace function public.admin_verification_signals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', vr.id,
           'user_id', p.id,
           'gender', p.gender,
           'age', p.age,
           'city', p.city,
           'country', p.country,
           'joined', p.account_created,
           'email_confirmed', (select u.email_confirmed_at is not null from auth.users u where u.id = p.id),
           'sign_in', (select u.raw_app_meta_data->>'provider' from auth.users u where u.id = p.id),
           'photos', coalesce(array_length(p.photo_urls, 1), 0),
           'sections_done', (select count(*) filter (where (s->>'complete')::boolean) from jsonb_array_elements(public.profile_sections(p)) s),
           'onboarded', coalesce(p.onboarding_complete, false),
           'reports', (select count(*) from public.reports r where r.reported_id = p.id),
           'blocked_by', (select count(*) from public.blocks b where b.blocked_id = p.id),
           'rejections', (select count(*) from public.verification_requests v2 where v2.user_id = p.id and v2.status = 'rejected'),
           'shared', (
             select coalesce(jsonb_agg(distinct jsonb_build_object('link', mine.url, 'name', o.name, 'user_id', o.id)), '[]'::jsonb)
               from unnest(array[vr.linkedin_url, vr.instagram_url, vr.facebook_url, vr.twitter_url]) as mine(url)
               join public.verification_requests v3
                 on v3.user_id <> vr.user_id
                and public.norm_social_url(mine.url) in (
                      public.norm_social_url(v3.linkedin_url), public.norm_social_url(v3.instagram_url),
                      public.norm_social_url(v3.facebook_url), public.norm_social_url(v3.twitter_url))
               join public.profiles o on o.id = v3.user_id
              where public.norm_social_url(mine.url) is not null)
         ) order by vr.created_at), '[]'::jsonb)
    into v_result
    from public.verification_requests vr
    join public.profiles p on p.id = vr.user_id
   where vr.status = 'pending';

  return v_result;
end;
$$;

revoke all on function public.admin_customers(text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_verification_signals() from public, anon;
grant execute on function public.admin_customers(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_verification_signals() to authenticated;
grant execute on function public.norm_social_url(text) to authenticated;
