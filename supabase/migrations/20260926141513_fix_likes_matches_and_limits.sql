-- ============================================================================
-- Fix likes/matches visibility, enforce the daily like limit, tidy functions
-- (Phase 7 security migration, part 2)
-- ============================================================================

-- 1. "Likes You" and "Matches" ---------------------------------------------------
-- Both functions ran with the caller's rights, but a user may only read their
-- own profile row, so the joins to the other person's profile found nothing and
-- both lists were always empty. They now run with the owner's rights and only
-- ever return the caller's own likes / matches.
create or replace function public.get_likes_received(p_user_id uuid)
 returns table(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamp with time zone, liker_name text, liker_age integer, liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean, liker_hidden_fields text[], liker_description text)
 language sql
 stable
 security definer
 set search_path = public
as $function$
  select
    l.id, l.liker_id, l.is_super_like, l.created_at,
    p.name, p.age, p.location, p.photo_urls,
    p.subscription_tier, p.is_verified, p.hidden_fields, p.description
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
$function$;

-- 2. Daily like limit ----------------------------------------------------------------
-- Free users: 15 likes per day (UTC), no super likes. Pro: unlimited (the
-- 60-per-hour anti-spam limit still applies to everyone). The server keeps the
-- counter; requests without a signed-in user (service role, dashboard) are
-- not limited.
create or replace function public.enforce_daily_like_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  tier text;
  used integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  select subscription_tier into tier from public.profiles where id = new.liker_id;
  if coalesce(tier, 'FREE') = 'PRO' then
    return new;
  end if;

  if new.is_super_like then
    raise exception 'Super Likes are a Pro feature' using errcode = '42501';
  end if;

  update public.profiles
     set daily_like_count = case when last_like_date = current_date then daily_like_count + 1 else 1 end,
         last_like_date = current_date
   where id = new.liker_id
   returning daily_like_count into used;

  if used > 15 then
    raise exception 'Daily like limit reached (15 per day). Try again tomorrow.';
  end if;

  return new;
end;
$function$;

create trigger likes_daily_limit
  before insert on public.likes
  for each row execute function public.enforce_daily_like_limit();

-- The like counters join the fields the website can't change (so nobody can
-- reset their own count). Search counters stay writable until search itself
-- moves to the server (roadmap Phase 9).
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
    -- fresh like counters.
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
  then
    raise exception 'This profile field can only be changed by ShaadiGPT'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$function$;

-- 3. Reports: the admin panel's "Resolve" sets status 'resolved', which the
--    check constraint rejected, so reports could only ever be dismissed.
alter table public.reports drop constraint reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status = any (array['pending', 'reviewed', 'actioned', 'dismissed', 'resolved']));

-- 4. export_my_data(): referred to matches.user_a / user_b, which don't exist
--    (the columns are user_a_id / user_b_id), so every export failed.
create or replace function public.export_my_data()
 returns jsonb
 language plpgsql
 security definer
 set search_path = public
as $function$
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
      where m.user_a_id = uid or m.user_b_id = uid
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
$function$;

-- 5. Pin search_path on the remaining functions (Supabase advisor warning).
alter function public.touch_updated_at() set search_path = public;
alter function public.mark_messages_read(uuid) set search_path = public;
alter function public.unmatch(uuid) set search_path = public;

-- 6. Who may call what ---------------------------------------------------------------
-- Trigger functions: only ever run by their triggers.
revoke execute on function
  public.block_if_banned(), public.check_for_match(), public.enforce_like_rate_limit(),
  public.enforce_message_rate_limit(), public.enforce_report_rate_limit(),
  public.enqueue_match_push(), public.enqueue_message_push(), public.enqueue_superlike_push(),
  public.handle_new_user(), public.touch_updated_at(), public.protect_profile_fields(),
  public.enforce_daily_like_limit()
  from public, anon, authenticated;

-- Signed-in features: not callable by signed-out visitors. (is_admin() stays
-- callable by everyone: access policies evaluate it, and it only answers
-- "am I an admin?" for the caller.)
revoke execute on function
  public.admin_ban_user(uuid, text), public.admin_pending_verifications(), public.admin_platform_stats(),
  public.admin_review_verification(uuid, text, text), public.admin_unban_user(uuid),
  public.admin_update_report(uuid, text, text), public.admin_verify_user(uuid),
  public.export_my_data(), public.get_likes_received(uuid), public.get_matches_with_profile(uuid),
  public.mark_messages_read(uuid), public.submit_verification_request(text, text, text, text, text),
  public.unmatch(uuid)
  from public, anon;
grant execute on function
  public.admin_ban_user(uuid, text), public.admin_pending_verifications(), public.admin_platform_stats(),
  public.admin_review_verification(uuid, text, text), public.admin_unban_user(uuid),
  public.admin_update_report(uuid, text, text), public.admin_verify_user(uuid),
  public.export_my_data(), public.get_likes_received(uuid), public.get_matches_with_profile(uuid),
  public.mark_messages_read(uuid), public.submit_verification_request(text, text, text, text, text),
  public.unmatch(uuid)
  to authenticated;
