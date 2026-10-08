-- ============================================================================
-- Admin, part 4: photo and text approval, and scam and fake-profile alerts
--
-- Approval: a photo a member adds, and the text about themselves and about
-- their family when they write or change it, wait for an admin (Admin →
-- Moderation). Until then other members see the profile without that photo,
-- and the text as it was before (moderated_photos(), moderated_text(), used
-- by every function that shows a profile to someone else). Approved, it
-- shows; rejected, the photo is taken off the profile or the text goes back
-- to what it was, and the member gets a message with the reason. "Show first,
-- review after" (app_settings.review_before_showing = false) shows everything
-- at once and keeps the queue for review.
--
-- What was on profiles before this, and what the server writes (no signed-in
-- member), counts as approved.
--
-- Alerts (Admin → Scam alerts): members who look like scammers or fake
-- profiles, from what they do: the same photo as another account (photo
-- fingerprints, made in the admin's browser), money or investment talk in
-- chats, the same message pasted to many people, likes by the dozen, reports
-- from several members, and a banned member back with a new account. An admin
-- can open the member, ban them, or mark the alert reviewed (it comes back if
-- something new happens).
-- ============================================================================

-- ---- Approval ---------------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists review_before_showing boolean not null default true;

create or replace function public.review_before_showing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.review_before_showing from public.app_settings s limit 1), true);
$$;

create table if not exists public.moderation_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  field text not null check (field in ('photo', 'description', 'about_family')),
  value text not null,           -- the photo's address, or the text
  prev_value text,               -- text: what others see until this is approved
  flags text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);
create unique index if not exists moderation_items_pending_text on public.moderation_items (user_id, field)
  where status = 'pending' and field <> 'photo';
create unique index if not exists moderation_items_pending_photo on public.moderation_items (user_id, value)
  where status = 'pending' and field = 'photo';
create index if not exists moderation_items_queue on public.moderation_items (created_at) where status = 'pending';
create index if not exists moderation_items_user on public.moderation_items (user_id);
alter table public.moderation_items enable row level security;  -- only through the functions below
revoke all on public.moderation_items from anon, authenticated;

-- What in a text needs a closer look (the words Shaadi24 doesn't allow are refused already)
create or replace function public.text_flags(p_text text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select array_remove(array[
    case when p_text ~ '\+?\d[\d\s().-]{8,}\d' then 'phone number' end,
    case when p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then 'email address' end,
    case when p_text ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|in|net|org|me|io|co)\M)' then 'link' end,
    case when p_text ~* '(whats\s?app|telegram|snap\s?chat|\minsta(gram)?\M|(^|\s)@[a-z0-9_.]{3,})' then 'social or chat app' end,
    case when p_text ~* '(paytm|phone\s?pe|g\s?pay|google\s?pay|\mupi\M|bank\s?account|\mifsc\M|bitcoin|crypto|forex|trading\s?(tips|plan)|investment\s?(plan|scheme|opportunit))'
      then 'money' end
  ], null);
$$;

-- A member's new photos and changed texts go in the queue
create or replace function public.capture_profile_for_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_field text;
  v_new text;
  v_old text;
  v_pending public.moderation_items;
  v_first boolean;
  v_added integer := 0;
  v_n integer;
begin
  -- Fingerprints of photos no longer on the profile
  if tg_op = 'UPDATE' and new.photo_urls is distinct from old.photo_urls then
    delete from public.photo_fingerprints f where f.user_id = new.id and not (f.url = any (coalesce(new.photo_urls, '{}')));
  end if;
  -- The server's own writes, and an admin's decision being applied
  if auth.uid() is null or coalesce(current_setting('shaadi.moderating', true), '') = 'on' then
    return null;
  end if;

  v_first := tg_op = 'INSERT' or coalesce(cardinality(old.photo_urls), 0) = 0;
  for v_url in
    select u from unnest(coalesce(new.photo_urls, '{}')) u
    except
    select u from unnest(case when tg_op = 'UPDATE' then coalesce(old.photo_urls, '{}') else '{}' end) u
  loop
    insert into public.moderation_items (user_id, field, value, flags)
    values (new.id, 'photo', v_url, case when v_first then array['first photo'] else '{}' end)
    on conflict (user_id, value) where status = 'pending' and field = 'photo' do nothing;
    get diagnostics v_n = row_count;
    v_added := v_added + v_n;
  end loop;
  -- A photo taken off the profile has nothing left to review
  delete from public.moderation_items m
   where m.user_id = new.id and m.field = 'photo' and m.status = 'pending'
     and not (m.value = any (coalesce(new.photo_urls, '{}')));

  foreach v_field in array array['description', 'about_family'] loop
    v_new := nullif(btrim(coalesce(to_jsonb(new) ->> v_field, '')), '');
    v_old := case when tg_op = 'UPDATE' then nullif(btrim(coalesce(to_jsonb(old) ->> v_field, '')), '') end;
    continue when v_new is not distinct from v_old;
    select * into v_pending from public.moderation_items
     where user_id = new.id and field = v_field and status = 'pending';
    if found then
      if v_new is null or v_new is not distinct from v_pending.prev_value then
        delete from public.moderation_items where id = v_pending.id;  -- cleared, or back to what was approved
      else
        update public.moderation_items set value = v_new, flags = public.text_flags(v_new), updated_at = now()
         where id = v_pending.id;
      end if;
    elsif v_new is not null then
      insert into public.moderation_items (user_id, field, value, prev_value, flags)
      values (new.id, v_field, v_new, v_old, public.text_flags(v_new));
      v_added := v_added + 1;
    end if;
  end loop;

  -- The admins hear when something waits (with "approve before others see it" on), once in half an hour
  if v_added > 0 and public.review_before_showing() and not exists (
    select 1 from public.push_queue q where q.event_type = 'admin_moderation' and q.created_at > now() - interval '30 minutes') then
    perform public.notify_admins('admin_moderation', 'Photos and text to approve',
      'Members added photos or wrote about themselves. Approve them so others can see them.',
      jsonb_build_object('deep_link', '/admin', 'admin_tab', 'moderation'));
  end if;
  return null;
end;
$$;
revoke all on function public.capture_profile_for_review() from public, anon, authenticated;

create or replace trigger profiles_capture_for_review
  after insert or update of photo_urls, description, about_family on public.profiles
  for each row execute function public.capture_profile_for_review();

-- What others see: the photos without those waiting for approval
create or replace function public.moderated_photos(p_user uuid, p_urls text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.review_before_showing() then coalesce(p_urls, '{}')
    else coalesce(array(
      select t.u from unnest(coalesce(p_urls, '{}')) with ordinality as t(u, n)
       where not exists (
         select 1 from public.moderation_items m
          where m.user_id = p_user and m.field = 'photo' and m.value = t.u and m.status = 'pending')
       order by t.n), '{}')
  end;
$$;

-- What others see: the text as it was approved, while a change waits
create or replace function public.moderated_text(p_user uuid, p_field text, p_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.review_before_showing() and exists (
      select 1 from public.moderation_items m where m.user_id = p_user and m.field = p_field and m.status = 'pending')
    then (select m.prev_value from public.moderation_items m
           where m.user_id = p_user and m.field = p_field and m.status = 'pending' limit 1)
    else p_value
  end;
$$;
revoke all on function public.moderated_photos(uuid, text[]) from public, anon, authenticated;
revoke all on function public.moderated_text(uuid, text, text) from public, anon, authenticated;

-- ---- Every way a profile reaches someone else ----------------------------------------------------

create or replace function public.get_profile_cards(p_ids uuid[])
returns table(id uuid, name text, age integer, location text, description text, photo_urls text[], is_verified boolean,
              subscription_tier text, hidden_fields text[])
language sql
stable
security definer
set search_path = public
as $function$
  select
    p.id,
    case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    public.moderated_text(p.id, 'description', p.description),
    public.moderated_photos(p.id, p.photo_urls),
    p.is_verified, p.subscription_tier, p.hidden_fields
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
$function$;

create or replace function public.get_likes_received(p_user_id uuid)
returns table(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamptz, liker_name text, liker_age integer,
              liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean,
              liker_hidden_fields text[], liker_description text)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select public.has_pro(p_user_id) as pro)
  select
    l.id,
    case when me.pro then l.liker_id end,
    l.is_super_like, l.created_at,
    case when not me.pro or 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when not me.pro or 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when not me.pro or 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    case when me.pro then public.moderated_photos(p.id, p.photo_urls) end,
    case when me.pro then p.subscription_tier end,
    case when me.pro then p.is_verified end,
    case when me.pro then p.hidden_fields end,
    case when me.pro then public.moderated_text(p.id, 'description', p.description) end
  from me
  cross join public.likes l
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
  order by l.is_super_like desc, l.created_at desc;
$function$;

create or replace function public.get_matches_with_profile(p_user_id uuid)
returns table(match_id uuid, matched_at timestamptz, other_user_id uuid, other_name text, other_age integer,
              other_location text, other_photos text[], other_subscription_tier text, other_is_verified boolean,
              other_hidden_fields text[], last_message_content text, last_message_at timestamptz,
              last_message_sender_id uuid, unread_count bigint)
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
      public.moderated_photos(p.id, p.photo_urls) as photo_urls, p.subscription_tier, p.is_verified, p.hidden_fields
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
      public.moderated_text(p.id, 'about_family', p.about_family) as about_family
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
$function$;

-- ---- Messages from the team that aren't campaigns ----------------------------------------------

alter table public.admin_messages
  add column if not exists kind text not null default 'campaign' check (kind in ('campaign', 'moderation', 'automation'));

create or replace function public.admin_list_messages()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'title', m.title, 'body', m.body, 'cta_label', m.cta_label, 'cta_target', m.cta_target,
             'audience_label', m.audience_label, 'pushed', m.pushed, 'recipients', m.recipients, 'created_at', m.created_at,
             'seen', (select count(*) from public.member_messages mm where mm.message_id = m.id and mm.seen_at is not null),
             'clicked', (select count(*) from public.member_messages mm where mm.message_id = m.id and mm.clicked_at is not null))
           order by m.created_at desc), '[]'::jsonb)
      from (select * from public.admin_messages where kind = 'campaign' order by created_at desc limit 100) m);
end;
$$;

-- One message to one member, in the app and as a notification (moderation, automations)
create or replace function public.message_member(p_user uuid, p_kind text, p_title text, p_body text,
                                                 p_cta_label text default null, p_cta_target text default null,
                                                 p_label text default null, p_push boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_messages (title, body, cta_label, cta_target, audience, audience_label, pushed, recipients, created_by, kind)
  values (left(btrim(p_title), 80), left(btrim(p_body), 400), p_cta_label, p_cta_target,
          jsonb_build_object('kind', 'member', 'user_id', p_user), coalesce(p_label, p_kind), p_push, 1, auth.uid(), p_kind)
  returning id into v_id;
  insert into public.member_messages (message_id, user_id) values (v_id, p_user);
  -- A notification too, unless they turned notifications off
  if p_push and coalesce((select p.settings_push_notifs from public.profiles p where p.id = p_user), true) then
    insert into public.push_queue (user_id, event_type, title, body, data)
    values (p_user, 'admin_message', left(btrim(p_title), 80), left(btrim(p_body), 400),
            jsonb_build_object('message_id', v_id, 'target', p_cta_target));
  end if;
  return v_id;
end;
$$;
revoke all on function public.message_member(uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;

-- ---- Admin: the queue ---------------------------------------------------------------------------

create or replace function public.admin_moderation_queue(p_status text default 'pending', p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'review_before_showing', public.review_before_showing(),
    'pending', (select count(*) from public.moderation_items where status = 'pending'),
    'items', (
      select coalesce(jsonb_agg(row_to_json(x) order by
               case when p_status = 'pending' then extract(epoch from x.created_at) else -extract(epoch from coalesce(x.reviewed_at, x.created_at)) end), '[]'::jsonb)
        from (
          select m.id, m.user_id, m.field, m.value, m.prev_value, m.flags, m.status, m.reason, m.created_at, m.reviewed_at,
                 (select u.email from auth.users u where u.id = m.reviewed_by) as reviewed_by_email,
                 p.name, p.age, p.gender, coalesce(p.city, p.location) as place, p.account_created, p.is_verified, p.is_banned,
                 coalesce(cardinality(p.photo_urls), 0) as photo_count,
                 m.field = 'photo' and exists (select 1 from public.photo_fingerprints f where f.url = m.value) as fingerprinted,
                 (select count(*) from public.reports r where r.reported_id = m.user_id) as reports,
                 (select jsonb_agg(jsonb_build_object('user_id', f2.user_id, 'name', p2.name, 'is_banned', p2.is_banned))
                    from public.photo_fingerprints f1
                    join public.photo_fingerprints f2 on f2.user_id <> f1.user_id
                     and bit_count((f1.hash # f2.hash)::bit(64)) <= 6
                    join public.profiles p2 on p2.id = f2.user_id
                   where m.field = 'photo' and f1.url = m.value) as same_photo_as
            from public.moderation_items m
            join public.profiles p on p.id = m.user_id
           where (p_status = 'all' or m.status = p_status)
           order by case when p_status = 'pending' then m.created_at end asc,
                    coalesce(m.reviewed_at, m.created_at) desc
           limit least(greatest(coalesce(p_limit, 200), 1), 500)
        ) x)
  );
end;
$$;

create or replace function public.admin_moderate(p_ids uuid[], p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.moderation_items;
  v_done integer := 0;
  v_user uuid;
  v_fields text[];
  v_what text;
  v_rejected uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why it isn''t approved';
  end if;
  perform set_config('shaadi.moderating', 'on', true);

  for v_item in
    select * from public.moderation_items where id = any (p_ids) and status = 'pending' for update
  loop
    if not p_approve then
      v_rejected := v_rejected || v_item.id;
      if v_item.field = 'photo' then
        update public.profiles set photo_urls = array_remove(photo_urls, v_item.value) where id = v_item.user_id;
      elsif v_item.field = 'description' then
        update public.profiles set description = v_item.prev_value where id = v_item.user_id;
      else
        update public.profiles set about_family = v_item.prev_value where id = v_item.user_id;
      end if;
    end if;
    update public.moderation_items
       set status = case when p_approve then 'approved' else 'rejected' end,
           reason = case when p_approve then null else btrim(p_reason) end,
           reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     where id = v_item.id;
    v_done := v_done + 1;
  end loop;

  -- Each member whose photo or text wasn't approved hears why, once
  if not p_approve then
    for v_user, v_fields in
      select m.user_id, array_agg(distinct m.field)
        from public.moderation_items m
       where m.id = any (v_rejected)
       group by m.user_id
    loop
      v_what := case
        when v_fields = array['photo'] then 'Your photo wasn''t approved'
        when 'photo' = any (v_fields) then 'Some of your profile wasn''t approved'
        when v_fields = array['about_family'] then 'Your "About your family" wasn''t approved'
        else 'Your "About you" wasn''t approved' end;
      perform public.message_member(v_user, 'moderation', v_what,
        btrim(p_reason) || case when v_fields = array['photo'] then ' Please add a clear photo of yourself.'
                                when 'photo' = any (v_fields) then ' Please update your profile.'
                                else ' Please write it again in My Profile.' end,
        'Open My Profile', 'profile', 'Moderation', true);
    end loop;
  end if;

  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), case when p_approve then 'approve_content' else 'reject_content' end,
          jsonb_build_object('items', v_done, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('done', v_done);
end;
$$;

create or replace function public.admin_set_review_before_showing(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  update public.app_settings set review_before_showing = p_on, updated_at = now() where id;  -- the one row
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'set_review_before_showing', jsonb_build_object('on', p_on));
end;
$$;

-- The member's own: what of theirs is waiting
create or replace function public.my_review_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(m.value) from public.moderation_items m
                         where m.user_id = auth.uid() and m.field = 'photo' and m.status = 'pending'), '[]'::jsonb),
    'texts', coalesce((select jsonb_agg(m.field) from public.moderation_items m
                        where m.user_id = auth.uid() and m.field <> 'photo' and m.status = 'pending'), '[]'::jsonb),
    'review_before_showing', public.review_before_showing());
$$;

-- ---- Photo fingerprints ------------------------------------------------------------------------
-- A 64-bit difference hash of each photo (made in the admin's browser:
-- lib/photoFingerprint.ts). Photos that differ in at most 6 bits look the same.

create table if not exists public.photo_fingerprints (
  url text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hash bigint,                   -- null: the photo couldn't be read (not asked for again)
  created_at timestamptz not null default now()
);
create index if not exists photo_fingerprints_user on public.photo_fingerprints (user_id);
alter table public.photo_fingerprints enable row level security;
revoke all on public.photo_fingerprints from anon, authenticated;

-- Photos not fingerprinted yet (every member's, newest first)
create or replace function public.admin_photos_to_fingerprint(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'left', (select count(*) from public.profiles p, unnest(coalesce(p.photo_urls, '{}')) u
              where not exists (select 1 from public.photo_fingerprints f where f.url = u)),
    'urls', (select coalesce(jsonb_agg(x.u), '[]'::jsonb) from (
               select u from public.profiles p, unnest(coalesce(p.photo_urls, '{}')) u
                where not exists (select 1 from public.photo_fingerprints f where f.url = u)
                order by p.updated_at desc nulls last
                limit least(greatest(coalesce(p_limit, 50), 1), 200)) x));
end;
$$;

-- [{url, hash}], hash a signed 64-bit integer as text, or null for a photo that couldn't be read;
-- only photos on a profile are kept
create or replace function public.admin_save_photo_fingerprints(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved integer;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  insert into public.photo_fingerprints (url, user_id, hash)
  select distinct on (i->>'url') i->>'url', p.id, (i->>'hash')::bigint
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    join public.profiles p on (i->>'url') = any (p.photo_urls)
   where i->>'hash' is null or (i->>'hash') ~ '^-?\d{1,20}$'
  on conflict (url) do update set hash = excluded.hash, user_id = excluded.user_id;
  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

-- ---- Alerts ---------------------------------------------------------------------------------

create table if not exists public.risk_reviews (
  user_id uuid not null references public.profiles (id) on delete cascade,
  signal text not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  note text,
  primary key (user_id, signal)
);
alter table public.risk_reviews enable row level security;
revoke all on public.risk_reviews from anon, authenticated;

-- Chat words that come up in money scams (romance, investment, customs and gift scams)
create or replace function public.money_talk(p_text text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_text ~* ('(\msend (me )?money\M|\mtransfer (the )?(money|amount|fees?)\M|\m(paytm|phone\s?pe|g\s?pay|google\s?pay|upi)\M'
    || '|bank\s?account|\mifsc\M|western union|money\s?gram|gift\s?cards?|bitcoin|\mcrypto|\musdt\M|forex|binary option'
    || '|investment (plan|scheme|opportunit\w*)|trading (tips|plan|platform)|double your money|customs (duty|fee|charges?)'
    || '|\mloan\M.*\murgent|\murgent\M.*\m(money|loan|help)\M|stuck at (the )?airport|clearance fee|parcel.*\m(fee|charges?)\M)'), false);
$$;

create or replace function public.admin_risk_signals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (
    with
    -- The same photo as another account
    same_photo as (
      select f1.user_id, 'same_photo'::text as signal, 3 as severity,
             'Same photo as ' || string_agg(distinct coalesce(p2.name, 'another member') || case when p2.is_banned then ' (banned)' else '' end, ', ') as detail,
             max(greatest(f1.created_at, f2.created_at)) as evidence_at, count(distinct f2.user_id) as times
        from public.photo_fingerprints f1
        join public.photo_fingerprints f2 on f2.user_id <> f1.user_id and bit_count((f1.hash # f2.hash)::bit(64)) <= 6
        join public.profiles p2 on p2.id = f2.user_id
       group by f1.user_id),
    -- Money talk in chats, last 30 days
    money as (
      select m.sender_id as user_id, 'money_talk'::text, 3,
             count(*) || ' message' || case when count(*) = 1 then '' else 's' end || ' about money to ' || count(distinct m.match_id)
               || ' match' || case when count(distinct m.match_id) = 1 then '' else 'es' end || ': "'
               || left((array_agg(m.content order by m.created_at desc))[1], 140) || '"',
             max(m.created_at), count(*)
        from public.messages m
       where m.created_at > now() - interval '30 days' and public.money_talk(m.content)
       group by m.sender_id),
    -- The same message pasted to many people, last 7 days
    pasted as (
      select x.sender_id as user_id, 'copy_paste'::text, 2,
             'The same message to ' || max(x.chats) || ' people: "' || left((array_agg(x.content order by x.chats desc))[1], 100) || '"',
             max(x.last_at), max(x.chats)
        from (select m.sender_id, lower(regexp_replace(btrim(m.content), '\s+', ' ', 'g')) as content,
                     count(distinct m.match_id) as chats, max(m.created_at) as last_at
                from public.messages m
               where m.created_at > now() - interval '7 days' and char_length(btrim(m.content)) >= 20
               group by 1, 2
              having count(distinct m.match_id) >= 4) x
       group by x.sender_id),
    -- Likes by the dozen: 40 in an hour, last 7 days
    likes_burst as (
      select x.liker_id as user_id, 'many_likes'::text, 2,
             max(x.n) || ' likes in one hour', max(x.hour) + interval '1 hour', max(x.n)
        from (select l.liker_id, date_trunc('hour', l.created_at) as hour, count(*) as n
                from public.likes l
               where l.created_at > now() - interval '7 days'
               group by 1, 2
              having count(*) >= 40) x
       group by x.liker_id),
    -- Reported by two or more members, last 30 days
    reported as (
      select r.reported_id as user_id, 'many_reports'::text, 3,
             'Reported by ' || count(distinct r.reporter_id) || ' members: ' || string_agg(distinct r.reason, ', '),
             max(r.created_at), count(distinct r.reporter_id)
        from public.reports r
       where r.created_at > now() - interval '30 days'
       group by r.reported_id
      having count(distinct r.reporter_id) >= 2),
    -- A banned member back: the same phone, name and date of birth, social link, device or photo
    banned_back as (
      select n.id as user_id, 'banned_back'::text, 3,
             'Looks like ' || coalesce(b.name, 'a banned member') || ', banned' || coalesce(' for "' || left(b.ban_reason, 60) || '"', '')
               || ' (' || string_agg(distinct x.how, ', ') || ')',
             max(n.account_created), count(distinct b.id)
        from public.profiles n
        join lateral (
          select b.id, 'same phone' as how from public.profiles b
           where b.is_banned and b.id <> n.id and n.phone_number is not null
             and regexp_replace(b.phone_number, '\D', '', 'g') = regexp_replace(n.phone_number, '\D', '', 'g')
          union all
          select b.id, 'same name and date of birth' from public.profiles b
           where b.is_banned and b.id <> n.id and n.date_of_birth is not null
             and b.date_of_birth = n.date_of_birth and lower(btrim(b.name)) = lower(btrim(n.name))
          union all
          select b.id, 'same social link' from public.profiles b
           where b.is_banned and b.id <> n.id
             and ((n.instagram is not null and public.norm_social_url(b.instagram) = public.norm_social_url(n.instagram))
               or (n.linkedin is not null and public.norm_social_url(b.linkedin) = public.norm_social_url(n.linkedin))
               or (n.facebook is not null and public.norm_social_url(b.facebook) = public.norm_social_url(n.facebook)))
          union all
          select d2.user_id, 'same phone app' from public.push_devices d1
            join public.push_devices d2 on d2.token = d1.token and d2.user_id <> d1.user_id
            join public.profiles b on b.id = d2.user_id and b.is_banned
           where d1.user_id = n.id
          union all
          select f2.user_id, 'same photo' from public.photo_fingerprints f1
            join public.photo_fingerprints f2 on f2.user_id <> f1.user_id and bit_count((f1.hash # f2.hash)::bit(64)) <= 6
            join public.profiles b on b.id = f2.user_id and b.is_banned
           where f1.user_id = n.id
        ) x on true
        join public.profiles b on b.id = x.id
       where not coalesce(n.is_banned, false)
       group by n.id, b.name, b.ban_reason),
    everything as (
      select * from same_photo union all select * from money union all select * from pasted
      union all select * from likes_burst union all select * from reported union all select * from banned_back
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', e.user_id, 'signal', e.signal, 'severity', e.severity, 'detail', e.detail,
             'evidence_at', e.evidence_at, 'times', e.times,
             'name', p.name, 'age', p.age, 'place', coalesce(p.city, p.location), 'account_created', p.account_created,
             'is_verified', p.is_verified, 'is_banned', p.is_banned, 'photo', (p.photo_urls)[1],
             'reviewed_at', rv.reviewed_at, 'reviewed_by', (select u.email from auth.users u where u.id = rv.reviewed_by),
             'open', rv.reviewed_at is null or e.evidence_at > rv.reviewed_at)
           order by (rv.reviewed_at is null or e.evidence_at > rv.reviewed_at) desc, e.severity desc, e.evidence_at desc), '[]'::jsonb)
      from everything e
      join public.profiles p on p.id = e.user_id
      left join public.risk_reviews rv on rv.user_id = e.user_id and rv.signal = e.signal
     where not coalesce(p.is_banned, false)
  );
end;
$$;

create or replace function public.admin_review_risk(p_user uuid, p_signal text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  insert into public.risk_reviews (user_id, signal, reviewed_at, reviewed_by, note)
  values (p_user, p_signal, now(), auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (user_id, signal) do update set reviewed_at = now(), reviewed_by = auth.uid(), note = excluded.note;
  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'review_risk', p_user, jsonb_build_object('signal', p_signal));
end;
$$;

-- ---- The sidebar's counts (each section's to-do, loaded whichever section is open) --------------------------------------------------------------------------

create or replace function public.admin_sidebar_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return jsonb_build_object(
    'enquiries', (select count(*) from public.enquiries where status = 'new'),
    'moderation', (select count(*) from public.moderation_items where status = 'pending'),
    'verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'reports', (select count(*) from public.reports where status = 'pending'));
end;
$$;

-- ---- Who may call what ------------------------------------------------------------------------------

revoke all on function public.review_before_showing() from public, anon;
grant execute on function public.review_before_showing() to authenticated;
revoke all on function public.text_flags(text) from public, anon, authenticated;
revoke all on function public.money_talk(text) from public, anon, authenticated;
revoke all on function public.admin_moderation_queue(text, integer) from public, anon;
revoke all on function public.admin_moderate(uuid[], boolean, text) from public, anon;
revoke all on function public.admin_set_review_before_showing(boolean) from public, anon;
revoke all on function public.my_review_status() from public, anon;
revoke all on function public.admin_photos_to_fingerprint(integer) from public, anon;
revoke all on function public.admin_save_photo_fingerprints(jsonb) from public, anon;
revoke all on function public.admin_risk_signals() from public, anon;
revoke all on function public.admin_review_risk(uuid, text, text) from public, anon;
revoke all on function public.admin_sidebar_counts() from public, anon;
grant execute on function public.admin_moderation_queue(text, integer), public.admin_moderate(uuid[], boolean, text),
  public.admin_set_review_before_showing(boolean), public.my_review_status(), public.admin_photos_to_fingerprint(integer),
  public.admin_save_photo_fingerprints(jsonb), public.admin_risk_signals(), public.admin_review_risk(uuid, text, text),
  public.admin_sidebar_counts()
  to authenticated;
