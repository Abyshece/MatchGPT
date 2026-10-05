-- ============================================================================
-- Phase 10: one rule for MatchGPT+
--
-- "MatchGPT+ for everyone" (app_settings.pro_for_all) is the one switch. While
-- it's on, every member gets every MatchGPT+ feature: the Likes You list, Super
-- Likes, refreshing Standouts, all the search filters, the compatibility report
-- and date proposals. The daily limits (3 AI searches, 15 likes) stay for free
-- accounts either way: searches cost money, and the like limit keeps spam down.
--
-- has_pro() is the rule the server checks for each of those features (here,
-- and in the search function); the app reads the same switch (pro_for_all()).
-- Admins turn it off in Admin → Dashboard when MatchGPT+ goes on sale, with no
-- new app release. Before this, the switch was a constant in the app that only
-- the Likes You list followed. Safe to run again.
-- ============================================================================

-- ---- The switch -------------------------------------------------------------------------
create table if not exists public.app_settings (
  id boolean primary key default true check (id),  -- one row
  pro_for_all boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
grant select on table public.app_settings to authenticated;
drop policy if exists "signed-in members read the app settings" on public.app_settings;
create policy "signed-in members read the app settings" on public.app_settings
  for select to authenticated using (true);

-- For the app: is MatchGPT+ open to everyone right now?
create or replace function public.pro_for_all()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.pro_for_all from public.app_settings s where s.id), false);
$$;
revoke all on function public.pro_for_all() from public, anon;
grant execute on function public.pro_for_all() to authenticated, service_role;

-- The rule: a subscriber, or anyone while the switch is on. For the server's
-- own checks only (triggers, the search function), not callable from the app.
create or replace function public.has_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.pro_for_all from public.app_settings s where s.id), false)
      or coalesce((select p.subscription_tier = 'PRO' from public.profiles p where p.id = p_user), false);
$$;
revoke all on function public.has_pro(uuid) from public, anon, authenticated;
grant execute on function public.has_pro(uuid) to service_role;

-- Admin → Dashboard: turn the switch on or off (in the audit log)
create or replace function public.admin_set_pro_for_all(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can change this' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'On or off?' using errcode = '22023';
  end if;
  update public.app_settings set pro_for_all = p_on, updated_at = now() where id;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  select auth.uid(), coalesce(p.email, ''), 'set_pro_for_all', jsonb_build_object('on', p_on)
    from public.profiles p
   where p.id = auth.uid();
end;
$$;
revoke all on function public.admin_set_pro_for_all(boolean) from public, anon;
grant execute on function public.admin_set_pro_for_all(boolean) to authenticated;

-- ---- Super Likes follow the rule; the daily like limit stays for free accounts -----------
create or replace function public.enforce_daily_like_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  tier text;
  used integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.is_super_like and not public.has_pro(new.liker_id) then
    raise exception 'Super Likes are a Pro feature' using errcode = '42501';
  end if;

  select subscription_tier into tier from public.profiles where id = new.liker_id;
  if coalesce(tier, 'FREE') = 'PRO' then
    return new;
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

-- ---- Likes You: who liked you, only with MatchGPT+ ---------------------------------------
-- Without it, each like comes without the person (no id, name or photos): the
-- app shows how many people liked you, and that seeing them is MatchGPT+.
create or replace function public.get_likes_received(p_user_id uuid)
 returns table(like_id uuid, liker_id uuid, is_super_like boolean, liked_at timestamp with time zone, liker_name text, liker_age integer, liker_location text, liker_photos text[], liker_subscription_tier text, liker_is_verified boolean, liker_hidden_fields text[], liker_description text)
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
    case when me.pro then p.photo_urls end,
    case when me.pro then p.subscription_tier end,
    case when me.pro then p.is_verified end,
    case when me.pro then p.hidden_fields end,
    case when me.pro then p.description end
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

-- ---- Date proposals in chats follow the rule ---------------------------------------------
create or replace function public.enforce_date_proposal_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.message_type = 'date_proposal' and auth.uid() is not null and not public.has_pro(new.sender_id) then
    raise exception 'Date proposals are a MatchGPT+ feature' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_date_proposal_pro() from public, anon, authenticated;

create or replace trigger messages_date_proposal_pro
  before insert on public.messages
  for each row execute function public.enforce_date_proposal_pro();
