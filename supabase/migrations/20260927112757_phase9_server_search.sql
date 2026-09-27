-- Phase 9, part 1: search runs on the server.
--
-- Until now the browser downloaded every eligible profile (the
-- eligible_profiles view, at most 1,000 rows), scored them itself and kept its
-- own search count, so the daily limit could be skipped, and every signed-in
-- user could read everyone's answers, including fields they had marked hidden.
-- The `search` edge function now does that work with the functions below, and
-- the website only receives the results, without hidden fields.
--
-- 1. search_candidates(): the people a user may be shown (service role only)
-- 2. consume_search(): the daily search limit, counted by the server
-- 3. get_profile_cards(): name and photo of people you liked, matched or
--    blocked (replaces reading public_profiles)
-- 4. "Likes You" and "Matches" leave out a hidden name, age or location
-- 5. Users can no longer reset their own search counter
--
-- The views the website used until now are dropped in part 2, once the
-- website no longer reads them.

-- ---------------------------------------------------------------------------
-- 1. Search pool
-- ---------------------------------------------------------------------------

-- Does someone whose preference is p_preference want someone of gender
-- p_target? The same rule the website used: no preference, "everyone" or
-- "all" fits anyone, an unknown gender fits any preference, and whole words
-- only (checked for women first, so "female" is never read as "male").
create or replace function public.gender_preference_fits(p_preference text, p_target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_preference, '') = ''
      or lower(p_preference) like '%everyone%'
      or lower(p_preference) like '%all%' then true
    when lower(p_target) ~ '\m(woman|women|female|girls?|ladies)\M'
      then lower(p_preference) ~ '\m(woman|women|female|girls?|ladies)\M'
    when lower(p_target) ~ '\m(man|men|male|guys?)\M'
      then lower(p_preference) ~ '\m(man|men|male|guys?)\M'
    when lower(p_target) ~ '\mnon-?binary\M'
      then lower(p_preference) ~ '\mnon-?binary\M'
    else true
  end;
$$;

-- Everyone p_user_id may be shown in search or Standouts, as JSON (a single
-- value, so the API's 1,000-row cap doesn't apply): finished, unbanned,
-- unpaused profiles, not blocked either way, whose gender preferences fit both
-- ways; incognito people only if they liked p_user_id. p_ids narrows it to
-- those people (today's saved Standouts); p_exclude_liked leaves out people
-- p_user_id already liked. The most recently active p_limit (at most 5,000)
-- are returned. Only the columns search reads or shows.
create or replace function public.search_candidates(
  p_user_id uuid,
  p_ids uuid[] default null,
  p_exclude_liked boolean default false,
  p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  from (
    select
      p.id, p.name, p.age, p.location, p.hometown, p.description, p.photo_urls,
      p.is_verified, p.subscription_tier, p.gender, p.interested_in, p.hidden_fields,
      case when p.settings_show_online is false then null else p.last_active_at end as last_active_at,
      p.settings_show_online, p.linkedin, p.instagram,
      p.job_title, p.work, p.work_style, p.university, p.education_level,
      p.height, p.body_type, p.hair_color, p.eye_color, p.clothing_style, p.has_tattoos,
      p.ethnicity, p.religion, p.politics, p.zodiac, p.languages,
      p.relationship_type, p.dating_intention, p.marriage_timeline, p.children, p.family_plans,
      p.interracial_marriage, p.family_closeness, p.pets,
      p.drinking, p.smoking, p.marijuana, p.drugs,
      p.gym_routine, p.dietary_preferences, p.sleep_schedule, p.living_preference, p.can_cook,
      p.hobbies, p.travel_style, p.music_genre, p.sports_interest, p.reading_interest,
      p.loves_travel, p.next_travel_destination, p.favorite_drink, p.future_plans, p.dream_house_type,
      p.love_language, p.social_battery, p.attachment_style, p.conflict_resolution,
      p.financial_approach
    from public.profiles me
    join public.profiles p on p.id <> me.id
    where me.id = p_user_id
      and (p_ids is null or p.id = any (p_ids))
      and p.onboarding_complete = true
      and p.name is not null and p.name <> ''
      and not coalesce(p.is_banned, false)
      and not coalesce(p.is_paused, false)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = me.id))
      and (not p_exclude_liked or not exists (
        select 1 from public.likes l where l.liker_id = me.id and l.liked_id = p.id))
      and (not coalesce(p.settings_incognito, false) or exists (
        select 1 from public.likes l where l.liker_id = p.id and l.liked_id = me.id))
      and public.gender_preference_fits(me.interested_in, p.gender)
      and public.gender_preference_fits(p.interested_in, me.gender)
    order by p.last_active_at desc nulls last, p.id
    limit least(greatest(coalesce(p_limit, 5000), 1), 5000)
  ) c;
$$;

-- ---------------------------------------------------------------------------
-- 2. Daily search limit: free accounts get 3 searches per day (UTC), Pro is
--    unlimited. Returns {"allowed": bool, "remaining": searches left today,
--    or null when unlimited}; an allowed search is counted.
-- ---------------------------------------------------------------------------
create or replace function public.consume_search(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_limit constant integer := 3;
  v_tier text;
  v_count integer;
  v_date date;
begin
  select subscription_tier, coalesce(daily_search_count, 0), last_search_date
    into v_tier, v_count, v_date
    from public.profiles
   where id = p_user_id
     for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  if v_tier = 'PRO' then
    return jsonb_build_object('allowed', true, 'remaining', null);
  end if;

  if v_date is distinct from current_date then
    v_count := 0;
  end if;
  if v_count >= daily_limit then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  update public.profiles
     set daily_search_count = v_count + 1,
         last_search_date = current_date
   where id = p_user_id;
  return jsonb_build_object('allowed', true, 'remaining', daily_limit - v_count - 1);
end;
$$;

revoke execute on function public.gender_preference_fits(text, text) from public, anon, authenticated;
revoke execute on function public.search_candidates(uuid, uuid[], boolean, integer), public.consume_search(uuid)
  from public, anon, authenticated;
grant execute on function public.search_candidates(uuid, uuid[], boolean, integer), public.consume_search(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Profile cards for people the caller liked, is or was matched with, or
--    blocked (liked list, new-match popup, blocked list). Not for banned
--    people or anyone who blocked the caller; a hidden name, age or location
--    comes back empty.
-- ---------------------------------------------------------------------------
create or replace function public.get_profile_cards(p_ids uuid[])
returns table(
  id uuid, name text, age integer, location text, description text, photo_urls text[],
  is_verified boolean, subscription_tier text, hidden_fields text[])
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    p.description, p.photo_urls, p.is_verified, p.subscription_tier, p.hidden_fields
  from public.profiles p
  where p.id = any (p_ids)
    and p.id <> auth.uid()
    and not coalesce(p.is_banned, false)
    and not exists (
      select 1 from public.blocks b where b.blocker_id = p.id and b.blocked_id = auth.uid())
    and (
      exists (select 1 from public.likes l where l.liker_id = auth.uid() and l.liked_id = p.id)
      or exists (
        select 1 from public.matches m
        where (m.user_a_id = auth.uid() and m.user_b_id = p.id)
           or (m.user_a_id = p.id and m.user_b_id = auth.uid()))
      or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
    );
$$;

revoke execute on function public.get_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_profile_cards(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Likes You" and "Matches": same as before, but a hidden name, age or
--    location comes back empty.
-- ---------------------------------------------------------------------------
create or replace function public.get_likes_received(p_user_id uuid)
 returns table(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamp with time zone, liker_name text, liker_age integer, liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean, liker_hidden_fields text[], liker_description text)
 language sql
 stable
 security definer
 set search_path = public
as $function$
  select
    l.id, l.liker_id, l.is_super_like, l.created_at,
    case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    p.photo_urls, p.subscription_tier, p.is_verified, p.hidden_fields, p.description
  from public.likes l
  join public.profiles p on p.id = l.liker_id
  where l.liked_id = p_user_id
    -- only your own inbox
    and p_user_id = auth.uid()
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
$function$;

create or replace function public.get_matches_with_profile(p_user_id uuid)
 returns table(match_id uuid, matched_at timestamp with time zone, other_user_id uuid, other_name text, other_age integer, other_location text, other_photos text[], other_subscription_tier text, other_is_verified boolean, other_hidden_fields text[], last_message_content text, last_message_at timestamp with time zone, last_message_sender_id uuid, unread_count bigint)
 language sql
 stable
 security definer
 set search_path = public
as $function$
  with my_matches as (
    select
      m.id as match_id,
      m.created_at as matched_at,
      case when m.user_a_id = p_user_id then m.user_b_id else m.user_a_id end as other_user_id
    from public.matches m
    where m.unmatched_at is null
      and (m.user_a_id = p_user_id or m.user_b_id = p_user_id)
      -- only your own matches
      and p_user_id = auth.uid()
  ),
  with_profile as (
    select
      mm.match_id, mm.matched_at, mm.other_user_id,
      case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end as name,
      case when 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end as age,
      case when 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end as location,
      p.photo_urls, p.subscription_tier, p.is_verified, p.hidden_fields
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. The search counter joins the fields only the server may change
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user creating their own row (profile-rescue screen) always starts
    -- unverified, on the free plan, unbanned, with their sign-in email and
    -- fresh like and search counters.
    new.email := coalesce(auth.jwt() ->> 'email', new.email);
    new.account_created := now();
    new.is_verified := false;
    new.verification_status := 'unverified';
    new.subscription_tier := 'FREE';
    new.subscription_renews_at := null;
    new.is_banned := false;
    new.banned_at := null;
    new.ban_reason := null;
    new.daily_like_count := 0;
    new.last_like_date := current_date;
    new.daily_super_like_count := 0;
    new.last_super_like_date := current_date;
    new.daily_search_count := 0;
    new.last_search_date := current_date;
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
     or new.daily_like_count is distinct from old.daily_like_count
     or new.last_like_date is distinct from old.last_like_date
     or new.daily_super_like_count is distinct from old.daily_super_like_count
     or new.last_super_like_date is distinct from old.last_super_like_date
     or new.daily_search_count is distinct from old.daily_search_count
     or new.last_search_date is distinct from old.last_search_date
  then
    raise exception 'This profile field can only be changed by MatchGPT'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$function$;
