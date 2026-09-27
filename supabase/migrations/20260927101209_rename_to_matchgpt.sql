-- Rename: the product is now called MatchGPT.
-- The same functions as before, with only the name changed in what users see:
-- the text of "new message" and "super like" push notifications, the app name
-- in "Export my data" files, and the protected-profile-field error message.

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
    'Open MatchGPT to read it',
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
    'Open MatchGPT to see who.',
    jsonb_build_object('liker_id', new.liker_id, 'deep_link', '/likes')
  );

  return new;
end;
$function$
;

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
      'app', 'MatchGPT',
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
    raise exception 'This profile field can only be changed by MatchGPT'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$function$;
