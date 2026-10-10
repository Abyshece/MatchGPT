-- ============================================================================
-- Fresh, active profiles: what members of other matrimony apps complain about
-- (docs/research/competitor-reviews.md), part 2
--
-- 1. Not interested: passed_profiles. Someone a member passes on never comes
--    back in their search or Standouts; Settings → Hidden profiles undoes it.
-- 2. Inactive profiles leave search: nobody who hasn't opened the app for 60
--    days (app_settings.inactive_hide_days) is shown. They come back the
--    moment they open it.
-- 3. Interests expire: one nobody answered in 14 days (a Super Interest in
--    28; app_settings.interest_expiry_days) no longer counts: it leaves the
--    other person's Likes You and the family's shortlist, and the sender
--    can find them in search again and send another (interest_active()).
--    Nothing is deleted.
-- 4. "Usually replies": member_stats, worked out every day from the last 90
--    days of chats: a member who answered at least 3 people who wrote to them,
--    and most of them (70%), gets the badge. compute_member_stats().
-- 5. I found my match: found_my_match() hides the profile, and keeps the
--    story the member may tell for the team (success_stories, unpublished).
-- 6. search_candidates() leaves out the passed and the inactive, and says
--    when each person joined (for the "New" label) and whether they usually
--    reply.
-- ============================================================================

-- ---- Settings ------------------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists inactive_hide_days smallint not null default 60 check (inactive_hide_days between 7 and 365),
  add column if not exists interest_expiry_days smallint not null default 14 check (interest_expiry_days between 3 and 90);
comment on column public.app_settings.inactive_hide_days is
  'Members who haven''t opened the app for this many days are left out of search and Standouts.';
comment on column public.app_settings.interest_expiry_days is
  'An interest nobody answered no longer counts after this many days (a Super Interest after twice as many).';

-- ---- 1. Not interested -----------------------------------------------------------------------------

create table if not exists public.passed_profiles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  passed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, passed_id),
  check (user_id <> passed_id)
);
comment on table public.passed_profiles is
  'People a member said they''re not interested in: left out of their search and Standouts until undone.';
create index if not exists passed_profiles_passed on public.passed_profiles (passed_id);
alter table public.passed_profiles enable row level security;
revoke all on table public.passed_profiles from public, anon, authenticated;
grant select, insert, delete on table public.passed_profiles to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'passed_profiles' and policyname = 'members see their own passes') then
    create policy "members see their own passes" on public.passed_profiles
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'passed_profiles' and policyname = 'members pass on others') then
    create policy "members pass on others" on public.passed_profiles
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'passed_profiles' and policyname = 'members undo their passes') then
    create policy "members undo their passes" on public.passed_profiles
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end;
$$;

-- The people a member passed on, for Settings → Hidden profiles
create or replace function public.my_passed_profiles()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'name', case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
           'age', case when 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
           'photo', (public.moderated_photos(p.id, p.photo_urls))[1],
           'passed_at', x.created_at
         ) order by x.created_at desc), '[]'::jsonb)
  from public.passed_profiles x
  join public.profiles p on p.id = x.passed_id
  where x.user_id = auth.uid();
$$;
revoke all on function public.my_passed_profiles() from public, anon;
grant execute on function public.my_passed_profiles() to authenticated;

-- ---- 3. Interests that expire -------------------------------------------------------------------

-- Whether an interest still counts: answered (a match) or younger than the
-- expiry (twice as long for a Super Interest)
create or replace function public.interest_active(p_created_at timestamptz, p_super boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_created_at > now() - make_interval(days =>
    coalesce((select interest_expiry_days from public.app_settings where id), 14) * case when p_super then 2 else 1 end);
$$;
revoke all on function public.interest_active(timestamptz, boolean) from public, anon;
grant execute on function public.interest_active(timestamptz, boolean) to authenticated;

-- Likes You: interests that expired leave
create or replace function public.get_likes_received(p_user_id uuid)
returns table(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamptz, liker_name text, liker_age integer,
              liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean,
              liker_hidden_fields text[], liker_description text, note text)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select public.has_pro(p_user_id) as pro)
  select
    l.id,
    case when o.open then l.liker_id end,
    l.is_super_like, l.created_at,
    case when not o.open or 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when not o.open or 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when not o.open or 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    case when o.open then public.moderated_photos(p.id, p.photo_urls) end,
    case when o.open then p.subscription_tier end,
    case when o.open then p.is_verified end,
    case when o.open then p.hidden_fields end,
    case when o.open then public.moderated_text(p.id, 'description', p.description) end,
    case when l.is_super_like then l.note end
  from me
  cross join public.likes l
  join public.profiles p on p.id = l.liker_id
  cross join lateral (
    select me.pro or l.is_super_like
           or exists (select 1 from public.like_reveals r where r.user_id = p_user_id and r.like_id = l.id) as open
  ) o
  where l.liked_id = p_user_id
    -- only your own inbox
    and p_user_id = auth.uid()
    -- still counts (interests nobody answered expire)
    and public.interest_active(l.created_at, l.is_super_like)
    -- not blocked in either direction
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = l.liker_id)
         or (b.blocker_id = l.liker_id and b.blocked_id = p_user_id)
    )
    -- not already matched
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
    and not coalesce(p.is_banned, false)
  order by l.is_super_like desc, l.created_at desc;
$function$;

-- The family's shortlist: interests that expired leave it too
create or replace function public.family_shortlist_ids(p_member uuid)
returns table (profile_id uuid, matched boolean, since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with picked as (
    select l.liked_id as profile_id, false as matched, l.created_at as since
      from public.likes l where l.liker_id = p_member and public.interest_active(l.created_at, l.is_super_like)
    union all
    select case when m.user_a_id = p_member then m.user_b_id else m.user_a_id end, true, m.created_at
      from public.matches m
     where p_member in (m.user_a_id, m.user_b_id) and m.unmatched_at is null
  )
  select p.id, bool_or(k.matched), max(k.since)
    from picked k join public.profiles p on p.id = k.profile_id
   where coalesce(p.onboarding_complete, false) and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false)
     and p.family_can_view
     and not exists (select 1 from public.blocks b where (b.blocker_id = p_member and b.blocked_id = p.id)
                                                   or (b.blocker_id = p.id and b.blocked_id = p_member))
   group by p.id;
$$;

-- ---- 4. "Usually replies" ------------------------------------------------------------------------

create table if not exists public.member_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  conversations integer not null default 0,   -- matches in 90 days where the other person wrote first
  replied integer not null default 0,         -- of those, how many the member answered
  replies_usually boolean not null default false,
  computed_at timestamptz not null default now()
);
comment on table public.member_stats is
  'Worked out every day (compute_member_stats()): whether a member usually replies, for the badge on their card.';
alter table public.member_stats enable row level security;
revoke all on table public.member_stats from public, anon, authenticated;

create or replace function public.compute_member_stats()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with firsts as (
    -- In each match from the last 90 days: who wrote first, and when
    select distinct on (m.id) m.id as match_id, m.user_a_id, m.user_b_id, msg.sender_id as first_sender, msg.created_at as first_at
    from public.matches m
    join public.messages msg on msg.match_id = m.id
    where m.created_at > now() - interval '90 days'
    order by m.id, msg.created_at
  ),
  per_member as (
    -- The member is the one who was written to
    select case when f.first_sender = f.user_a_id then f.user_b_id else f.user_a_id end as user_id, f.match_id, f.first_sender, f.first_at
    from firsts f
  ),
  totals as (
    select pm.user_id,
           count(*) as conversations,
           count(*) filter (where exists (
             select 1 from public.messages r
             where r.match_id = pm.match_id and r.sender_id = pm.user_id and r.created_at > pm.first_at)) as replied
    from per_member pm
    group by pm.user_id
  )
  insert into public.member_stats (user_id, conversations, replied, replies_usually, computed_at)
  select t.user_id, t.conversations, t.replied, t.conversations >= 3 and t.replied >= 0.7 * t.conversations, now()
  from totals t
  join public.profiles p on p.id = t.user_id
  on conflict (user_id) do update
    set conversations = excluded.conversations, replied = excluded.replied,
        replies_usually = excluded.replies_usually, computed_at = excluded.computed_at;
  get diagnostics v_count = row_count;
  -- Nobody wrote to them in 90 days: no badge
  update public.member_stats s set conversations = 0, replied = 0, replies_usually = false, computed_at = now()
  where s.computed_at < now();  -- not updated just now (now() is this run's start)
  return v_count;
end;
$$;
revoke all on function public.compute_member_stats() from public, anon, authenticated;

-- ---- 5. I found my match ------------------------------------------------------------------------

alter table public.profiles add column if not exists found_match_at timestamptz;
comment on column public.profiles.found_match_at is 'When the member said they found their match (found_my_match()).';

create or replace function public.found_my_match(p_partner text default null, p_story text default null, p_both_agree boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_name text;
  v_story text := nullif(btrim(coalesce(p_story, '')), '');
  v_partner text := nullif(btrim(coalesce(p_partner, '')), '');
  v_saved boolean := false;
begin
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  update public.profiles set is_paused = true, paused_at = now(), found_match_at = now()
   where id = v_me
   returning split_part(btrim(name), ' ', 1) into v_name;

  -- The story goes to the team, unpublished; it's published only once both agree
  if v_story is not null then
    if char_length(v_story) < 20 or char_length(v_story) > 1500 then
      raise exception 'Please keep the story between 20 and 1,500 characters.' using errcode = '22023';
    end if;
    if public.has_objectionable_words(v_story) or public.has_objectionable_words(coalesce(v_partner, '')) then
      raise exception 'Please keep it kind and respectful.' using errcode = '22023';
    end if;
    insert into public.success_stories (names, story, consent_note, created_by)
    values (left(coalesce(v_name, 'A member') || coalesce(' & ' || split_part(v_partner, ' ', 1), ''), 80),
            v_story,
            case when p_both_agree then 'From the app: the member said both partners agree to share it.' else '' end,
            v_me);
    v_saved := true;
  end if;
  return jsonb_build_object('paused', true, 'story_saved', v_saved);
end;
$$;
revoke all on function public.found_my_match(text, text, boolean) from public, anon;
grant execute on function public.found_my_match(text, text, boolean) to authenticated;

-- ---- 6. The search pool ------------------------------------------------------------------------------

create or replace function public.search_candidates(p_user_id uuid, p_ids uuid[] default null, p_exclude_liked boolean default false,
                                                    p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  from (
    select
      p.id, p.name, p.age, p.location, p.hometown,
      public.moderated_text(p.id, 'description', p.description) as description,
      public.moderated_photos(p.id, p.photo_urls) as photo_urls,
      p.is_verified, p.subscription_tier, p.gender, p.interested_in, p.hidden_fields,
      case when p.settings_show_online is false then null else p.last_active_at end as last_active_at,
      p.settings_show_online, p.linkedin, p.instagram,
      p.job_title, p.work, p.work_style, p.university, p.education_level,
      p.height, p.body_type, p.hair_color, p.eye_color, p.clothing_style, p.has_tattoos,
      p.ethnicity, p.religion, p.politics, p.zodiac, p.languages,
      p.dating_intention, p.marriage_timeline, p.children, p.family_plans,
      p.interracial_marriage, p.family_closeness, p.pets,
      p.drinking, p.smoking,
      p.gym_routine, p.dietary_preferences, p.sleep_schedule, p.living_preference, p.can_cook,
      p.hobbies, p.travel_style, p.music_genre, p.sports_interest, p.reading_interest,
      p.loves_travel, p.next_travel_destination, p.favorite_drink, p.future_plans, p.dream_house_type,
      p.love_language, p.social_battery, p.attachment_style, p.conflict_resolution,
      p.financial_approach,
      -- Phase 12 (never the date of birth: the age above is worked out from it)
      p.profile_created_for, p.marital_status, p.children_count, p.height_cm, p.disability,
      p.mother_tongue, p.caste, p.sub_caste, p.sect, p.open_to_other_communities, p.gotra,
      p.manglik, p.rashi, p.nakshatra, p.birth_time, p.birth_place, p.horoscope_match,
      p.degree, p.employed_in, p.occupation, p.annual_income,
      p.country, p.state, p.city, p.residential_status, p.settling_abroad,
      p.family_type, p.family_status, p.family_values, p.father_occupation, p.mother_occupation,
      p.brothers, p.brothers_married, p.sisters, p.sisters_married,
      p.family_location, p.living_with_family,
      public.moderated_text(p.id, 'about_family', p.about_family) as about_family,
      -- For the "New" label and the "Usually replies" badge
      p.account_created,
      coalesce((select s.replies_usually from public.member_stats s where s.user_id = p.id), false) as replies_usually
    from public.profiles me
    join public.profiles p on p.id <> me.id
    where me.id = p_user_id
      and (p_ids is null or p.id = any (p_ids))
      and p.onboarding_complete = true
      and p.name is not null and p.name <> ''
      and not coalesce(p.is_banned, false)
      and not coalesce(p.is_paused, false)
      -- Opened the app recently (app_settings.inactive_hide_days)
      and coalesce(p.last_active_at, p.account_created, now())
          > now() - make_interval(days => coalesce((select inactive_hide_days from public.app_settings where id), 60))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = me.id))
      -- An interest that still counts keeps them out (one that expired doesn't)
      and (not p_exclude_liked or not exists (
        select 1 from public.likes l where l.liker_id = me.id and l.liked_id = p.id
          and public.interest_active(l.created_at, l.is_super_like)))
      -- Not someone they said they're not interested in
      and (not p_exclude_liked or not exists (
        select 1 from public.passed_profiles x where x.user_id = me.id and x.passed_id = p.id))
      and (not coalesce(p.settings_incognito, false) or exists (
        select 1 from public.likes l where l.liker_id = p.id and l.liked_id = me.id))
      and public.gender_preference_fits(me.interested_in, p.gender)
      and public.gender_preference_fits(p.interested_in, me.gender)
    order by p.last_active_at desc nulls last, p.id
    limit least(greatest(coalesce(p_limit, 5000), 1), 5000)
  ) c;
$function$;

-- ---- Every day ---------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('member-stats', '43 22 * * *', $job$select public.compute_member_stats()$job$);
  end if;
end;
$$;
