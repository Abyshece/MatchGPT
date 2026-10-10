-- ============================================================================
-- Fixes for what members of other matrimony apps complain about most
-- (research in docs/research/competitor-reviews.md), part 1:
--
-- 1. Taking back an interest that hasn't become a match (interest_status(),
--    then the member's own delete). Undone within a minute (the Undo after
--    sending), it doesn't count toward the day's 15 free likes, and a bought
--    Super Interest comes back (refund_undone_interest()).
-- 2. One free "Likes You" a day: a member without Shaadi24+ can see who one of
--    the people who liked them is, once a day (India time). The rest stay
--    hidden until Shaadi24+, as before. reveal_like() and like_reveal_status();
--    get_likes_received() shows revealed likes in full.
-- 3. money_talk() (Admin → Scam alerts) also knows "digital arrest" scams, as
--    the warning in chats does (lib/scamWarning.ts).
-- ============================================================================

-- ---- 1. Taking back an interest -----------------------------------------------------------------
--
-- A member deletes their own interest, as they always could (the "users
-- delete own likes" rule on likes); the app asks interest_status() first, so
-- a match isn't taken back by mistake. Taken back within a minute, the
-- trigger below gives back what it used.

-- Whether an interest can be taken back: 'open', 'matched' or 'not_found'
create or replace function public.interest_status(p_liked uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.likes where liker_id = auth.uid() and liked_id = p_liked) then 'not_found'
    when exists (
      select 1 from public.matches m
      where m.unmatched_at is null
        and ((m.user_a_id = auth.uid() and m.user_b_id = p_liked) or (m.user_a_id = p_liked and m.user_b_id = auth.uid()))
    ) then 'matched'
    else 'open'
  end;
$$;
revoke all on function public.interest_status(uuid) from public, anon;
grant execute on function public.interest_status(uuid) to authenticated;

-- Undone straight away (sent by mistake): it doesn't use up the day's like,
-- or a bought Super Interest. Only when its sender takes it back themselves
-- (not when an account is deleted), and not once it's a match.
create or replace function public.refund_undone_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is distinct from old.liker_id
     or old.created_at <= now() - interval '1 minute' then
    return old;
  end if;
  if exists (
    select 1 from public.matches m
    where m.unmatched_at is null
      and ((m.user_a_id = old.liker_id and m.user_b_id = old.liked_id) or (m.user_a_id = old.liked_id and m.user_b_id = old.liker_id))
  ) then
    return old;
  end if;
  if not old.is_super_like then
    update public.profiles
       set daily_like_count = greatest(daily_like_count - 1, 0)
     where id = old.liker_id and last_like_date = current_date and daily_like_count > 0;
  elsif old.super_source = 'credit' then
    insert into public.member_credits (user_id, kind, balance) values (old.liker_id, 'super_interest', 1)
    on conflict (user_id, kind) do update set balance = public.member_credits.balance + 1, updated_at = now();
  end if;
  return old;
end;
$$;
revoke all on function public.refund_undone_interest() from public, anon, authenticated;
create or replace trigger likes_refund_undone
  after delete on public.likes
  for each row execute function public.refund_undone_interest();

-- ---- 2. One free "Likes You" a day ----------------------------------------------------------

alter table public.app_settings
  add column if not exists free_like_reveals_per_day smallint not null default 1
    check (free_like_reveals_per_day between 0 and 20);
comment on column public.app_settings.free_like_reveals_per_day is
  'How many of the people who liked them a member without Shaadi24+ can see each day (India time).';

create table if not exists public.like_reveals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  like_id uuid not null references public.likes(id) on delete cascade,
  revealed_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at timestamptz not null default now(),
  primary key (user_id, like_id)
);
comment on table public.like_reveals is
  'Likes a member without Shaadi24+ chose to see with their free reveal of the day (reveal_like()).';
create index if not exists like_reveals_user_day on public.like_reveals (user_id, revealed_on);
alter table public.like_reveals enable row level security;
revoke all on table public.like_reveals from public, anon, authenticated;

-- How many free reveals are left today, and when the next one comes
create or replace function public.like_reveal_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce((select free_like_reveals_per_day from public.app_settings where id), 1) as per_day,
           (now() at time zone 'Asia/Kolkata')::date as today
  )
  select jsonb_build_object(
    'per_day', s.per_day,
    'left', greatest(s.per_day - (select count(*) from public.like_reveals r
                                  where r.user_id = auth.uid() and r.revealed_on = s.today), 0),
    'resets_at', ((s.today + 1)::timestamp at time zone 'Asia/Kolkata')
  )
  from s;
$$;
revoke all on function public.like_reveal_status() from public, anon;
grant execute on function public.like_reveal_status() to authenticated;

-- See who sent one like, with the day's free reveal
create or replace function public.reveal_like(p_like_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_status jsonb;
begin
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.likes where id = p_like_id and liked_id = v_me) then
    return jsonb_build_object('revealed', false, 'reason', 'not_found');
  end if;
  -- Already open: with Shaadi24+, a Super Interest, or revealed before
  if public.has_pro(v_me)
     or exists (select 1 from public.likes where id = p_like_id and is_super_like)
     or exists (select 1 from public.like_reveals where user_id = v_me and like_id = p_like_id) then
    return jsonb_build_object('revealed', true);
  end if;
  -- One member at a time, so two taps can't both use the last reveal
  perform pg_advisory_xact_lock(hashtextextended('like_reveal:' || v_me::text, 0));
  v_status := public.like_reveal_status();
  if (v_status ->> 'left')::int <= 0 then
    return jsonb_build_object('revealed', false, 'reason', 'none_left', 'resets_at', v_status -> 'resets_at');
  end if;
  insert into public.like_reveals (user_id, like_id) values (v_me, p_like_id) on conflict do nothing;
  return jsonb_build_object('revealed', true);
end;
$$;
revoke all on function public.reveal_like(uuid) from public, anon;
grant execute on function public.reveal_like(uuid) to authenticated;

-- The inbox of likes: in full with Shaadi24+, for a Super Interest, or for a
-- like revealed with the free reveal; otherwise without who sent it.
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

-- ---- 3. "Digital arrest" in Scam alerts -------------------------------------------------------

create or replace function public.money_talk(p_text text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_text ~* ('(\msend (me )?money\M|\mtransfer (the )?(money|amount|fees?)\M|\m(paytm|phone\s?pe|g\s?pay|google\s?pay|upi)\M'
    || '|bank\s?account|\mifsc\M|western union|money\s?gram|gift\s?cards?|bitcoin|\mcrypto|\musdt\M|forex|binary option'
    || '|investment (plan|scheme|opportunit\w*)|trading (tips|plan|platform)|double your money|customs (duty|fee|charges?)'
    || '|\mloan\M.*\murgent|\murgent\M.*\m(money|loan|help)\M|stuck at (the )?airport|clearance fee|parcel.*\m(fee|charges?)\M'
    || '|digital(ly)? arrest|arrest warrant|money laundering|\msettle (the|this) case\M|parcel.{0,30}(drugs|seized|illegal)'
    || '|\mpais[ae] (bhej|chahiye|transfer|de do)|डिजिटल अरेस्ट|पैसे (भेज|चाहिए))'), false);
$$;
revoke all on function public.money_talk(text) from public, anon, authenticated;
