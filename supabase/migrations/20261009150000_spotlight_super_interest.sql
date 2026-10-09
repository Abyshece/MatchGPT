-- ============================================================================
-- Spotlight and Super Interest: bought one at a time in the apps
--
-- For members who won't take a plan, and Shaadi24+ members who want more.
-- The stores take the payment (consumable in-app products: Google Play
-- one-time products, App Store consumables). The store-billing function
-- checks each purchase with the store and records it here
-- (grant_boost_purchase), which adds the credits; a refund takes them back.
--
--   Spotlight (₹149, 24 hours): the member starts it when they like
--     (start_spotlight). While it's on, the search function puts them first,
--     marked "Spotlight", for people in their city or state whose search they
--     fit anyway, and counts how many people it was shown to.
--   Super Interest (₹49 for 1, ₹199 for 5): a like with a short note that goes
--     to the top of the other person's Likes You and shows who sent it, even
--     to members without Shaadi24+, with a notification. Shaadi24+ includes
--     3 a week; beyond those each uses a credit (enforce_daily_like_limit).
--   Admin → Finance: what sold, refunds, Spotlights and Super Interests sent
--     and how many became matches (admin_boost_stats). Store test purchases
--     are kept apart from real ones (payments.mode).
-- ============================================================================

create table if not exists public.boost_products (
  id text primary key,
  kind text not null check (kind in ('spotlight', 'super_interest')),
  quantity integer not null check (quantity between 1 and 50),
  amount integer not null check (amount >= 0),
  currency text not null default 'INR',
  google_product_id text unique,
  apple_product_id text unique,
  is_active boolean not null default true,
  sort integer not null default 0
);
comment on table public.boost_products is
  'Spotlight and Super Interest packs sold in the apps. amount: the price in paise as set in the stores (Google doesn''t say a one-time purchase''s price, so the finance figures use this).';

insert into public.boost_products (id, kind, quantity, amount, google_product_id, apple_product_id, sort) values
  ('spotlight_24h', 'spotlight', 1, 14900, 'spotlight_24h', 'shaadi24_spotlight_24h', 1),
  ('super_interest_1', 'super_interest', 1, 4900, 'super_interest_1', 'shaadi24_super_interest_1', 2),
  ('super_interest_5', 'super_interest', 5, 19900, 'super_interest_5', 'shaadi24_super_interest_5', 3)
on conflict (id) do nothing;

alter table public.boost_products enable row level security;
drop policy if exists "members see what is on sale" on public.boost_products;
create policy "members see what is on sale" on public.boost_products
  for select to authenticated using (is_active);

create table if not exists public.member_credits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('spotlight', 'super_interest')),
  balance integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
comment on table public.member_credits is
  'Spotlights and Super Interests bought and not used yet. Below zero after a refund of credits already used.';
alter table public.member_credits enable row level security;
drop policy if exists "members see their own credits" on public.member_credits;
create policy "members see their own credits" on public.member_credits
  for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.spotlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  views integer not null default 0
);
create index if not exists spotlights_user on public.spotlights (user_id, ends_at desc);
create index if not exists spotlights_ends on public.spotlights (ends_at);
alter table public.spotlights enable row level security;
drop policy if exists "members see their own spotlights" on public.spotlights;
create policy "members see their own spotlights" on public.spotlights
  for select to authenticated using ((select auth.uid()) = user_id);

-- One-time purchases go in the payments ledger too
alter table public.payments
  add column if not exists product_id text references public.boost_products(id),
  add column if not exists quantity integer check (quantity is null or quantity > 0),
  add column if not exists mode text check (mode is null or mode in ('test', 'live'));
create index if not exists payments_product on public.payments (product_id) where product_id is not null;
comment on column public.payments.product_id is 'A Spotlight or Super Interest pack (then there is no subscription).';
comment on column public.payments.mode is 'test for a store test purchase of a pack; a subscription charge follows its subscription''s mode.';
-- Members read which pack a charge was for (payments are read column by column)
grant select (product_id, quantity) on public.payments to authenticated;

-- Super Interest: its note, and whether Shaadi24+ or a credit paid for it
alter table public.likes
  add column if not exists note text check (note is null or char_length(note) <= 200),
  add column if not exists super_source text check (super_source is null or super_source in ('plan', 'credit'));
create index if not exists likes_super_plan on public.likes (liker_id, created_at) where super_source = 'plan';

-- ---- Buying -----------------------------------------------------------------------------

-- The store-billing function, after the store confirmed the purchase: saves
-- the charge (once per store order) and adds the credits. Reported again
-- (the app retrying, Restore), nothing changes.
create or replace function public.grant_boost_purchase(
  p_user uuid, p_product text, p_provider text, p_order_id text, p_amount integer, p_currency text,
  p_fee integer, p_mode text, p_paid_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.boost_products;
  v_payment_id uuid;
  v_owner uuid;
  v_balance integer;
begin
  select * into v_product from public.boost_products where id = p_product;
  if not found then
    raise exception 'Unknown product %', p_product using errcode = '22023';
  end if;
  insert into public.payments (provider, store_order_id, user_id, product_id, quantity, mode, amount, currency, status,
                               method, fee_amount, fee_estimated, paid_at)
  values (p_provider, p_order_id, p_user, p_product, v_product.quantity, case when p_mode = 'test' then 'test' else 'live' end,
          p_amount, coalesce(p_currency, 'INR'), 'captured', p_provider, p_fee, true, coalesce(p_paid_at, now()))
  on conflict (provider, store_order_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select user_id into v_owner from public.payments where provider = p_provider and store_order_id = p_order_id;
    if v_owner is distinct from p_user then
      raise exception 'This purchase belongs to another Shaadi24 account.' using errcode = '42501', hint = 'OTHER_ACCOUNT';
    end if;
    return jsonb_build_object('granted', false, 'kind', v_product.kind,
      'balance', coalesce((select balance from public.member_credits where user_id = p_user and kind = v_product.kind), 0));
  end if;

  insert into public.member_credits (user_id, kind, balance) values (p_user, v_product.kind, v_product.quantity)
  on conflict (user_id, kind) do update set balance = public.member_credits.balance + excluded.balance, updated_at = now()
  returning balance into v_balance;
  return jsonb_build_object('granted', true, 'kind', v_product.kind, 'balance', v_balance);
end;
$$;

-- A refunded pack takes its credits back. A Spotlight already started ends.
create or replace function public.take_back_refunded_boost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_balance integer;
begin
  if new.product_id is null or new.user_id is null or new.status <> 'refunded' or old.status = 'refunded' then
    return new;
  end if;
  select kind into v_kind from public.boost_products where id = new.product_id;
  update public.member_credits set balance = balance - coalesce(new.quantity, 1), updated_at = now()
   where user_id = new.user_id and kind = v_kind
  returning balance into v_balance;
  if v_kind = 'spotlight' and v_balance < 0 then
    update public.spotlights set ends_at = now() where user_id = new.user_id and ends_at > now();
    if found then
      update public.member_credits set balance = balance + 1 where user_id = new.user_id and kind = 'spotlight';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_refund_boost on public.payments;
create trigger payments_refund_boost after update of status on public.payments
  for each row execute function public.take_back_refunded_boost();

-- ---- The member's side --------------------------------------------------------------------

-- Spotlights and Super Interests: credits, the Spotlight on now (or the last
-- one, with how it went), what Shaadi24+ includes this week, what's on sale
create or replace function public.my_boosts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_pro boolean;
  v_used integer;
  v_oldest timestamptz;
begin
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  v_pro := public.has_pro(v_me);
  select count(*), min(created_at) into v_used, v_oldest from public.likes
   where liker_id = v_me and super_source = 'plan' and created_at > now() - interval '7 days';

  return jsonb_build_object(
    'spotlight', jsonb_build_object(
      'credits', greatest(coalesce((select balance from public.member_credits where user_id = v_me and kind = 'spotlight'), 0), 0),
      'active', (select jsonb_build_object('started_at', s.started_at, 'ends_at', s.ends_at, 'views', s.views,
                   'likes', (select count(*) from public.likes l where l.liked_id = v_me and l.created_at >= s.started_at))
                   from public.spotlights s where s.user_id = v_me and s.ends_at > now() order by s.ends_at desc limit 1),
      'last', (select jsonb_build_object('started_at', s.started_at, 'ends_at', s.ends_at, 'views', s.views,
                 'likes', (select count(*) from public.likes l where l.liked_id = v_me
                             and l.created_at between s.started_at and s.ends_at))
                 from public.spotlights s where s.user_id = v_me and s.ends_at <= now() order by s.ends_at desc limit 1)),
    'super_interest', jsonb_build_object(
      'credits', greatest(coalesce((select balance from public.member_credits where user_id = v_me and kind = 'super_interest'), 0), 0),
      'free_per_week', case when v_pro then 3 else 0 end,
      'free_left', case when v_pro then greatest(3 - v_used, 0) else 0 end,
      'next_free_at', case when v_pro and v_used >= 3 then v_oldest + interval '7 days' end),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'kind', b.kind, 'quantity', b.quantity, 'amount', b.amount, 'currency', b.currency,
        'google_product_id', b.google_product_id, 'apple_product_id', b.apple_product_id) order by b.sort)
        from public.boost_products b where b.is_active), '[]'::jsonb)
  );
end;
$$;

-- Starts a Spotlight bought earlier: 24 hours from now
create or replace function public.start_spotlight()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_profile public.profiles;
  v_balance integer;
  v_end timestamptz;
begin
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  -- One at a time, even when started twice at once
  select balance into v_balance from public.member_credits where user_id = v_me and kind = 'spotlight' for update;
  if exists (select 1 from public.spotlights where user_id = v_me and ends_at > now()) then
    raise exception 'Your Spotlight is on already.' using errcode = '22023', hint = 'ALREADY_ON';
  end if;
  if coalesce(v_balance, 0) < 1 then
    raise exception 'Buy a Spotlight first.' using errcode = '22023', hint = 'NO_CREDITS';
  end if;
  select * into v_profile from public.profiles where id = v_me;
  if not coalesce(v_profile.onboarding_complete, false) or coalesce(v_profile.is_paused, false)
     or coalesce(v_profile.is_banned, false) then
    raise exception 'Your profile isn''t showing to other members (is it paused in Settings?).' using errcode = '22023', hint = 'NOT_VISIBLE';
  end if;

  update public.member_credits set balance = balance - 1, updated_at = now() where user_id = v_me and kind = 'spotlight';
  insert into public.spotlights (user_id, ends_at) values (v_me, now() + interval '24 hours') returning ends_at into v_end;
  return jsonb_build_object('ends_at', v_end);
end;
$$;

-- For the search function: a Spotlight was shown to someone
create or replace function public.note_spotlight_views(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.spotlights set views = views + 1 where user_id = any (p_ids) and ends_at > now();
$$;

-- ---- Super Interest: which ones Shaadi24+ pays for, the rest a credit -------------------------

create or replace function public.enforce_daily_like_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  used integer;
  v_free integer;
begin
  -- A note goes only with a Super Interest; what paid for it is decided here
  new.super_source := null;
  new.note := case when new.is_super_like then nullif(btrim(new.note), '') end;

  if auth.uid() is null then
    return new;
  end if;

  if new.is_super_like then
    if new.note is not null and (char_length(new.note) > 200 or public.has_objectionable_words(new.note)) then
      raise exception 'Please keep your note short, kind and respectful.' using errcode = '22023', hint = 'NOTE_REFUSED';
    end if;
    if public.has_pro(new.liker_id) then
      select count(*) into v_free from public.likes
       where liker_id = new.liker_id and super_source = 'plan' and created_at > now() - interval '7 days';
      if v_free < 3 then
        new.super_source := 'plan';
        return new;
      end if;
    end if;
    update public.member_credits set balance = balance - 1, updated_at = now()
     where user_id = new.liker_id and kind = 'super_interest' and balance > 0;
    if not found then
      raise exception 'You have no Super Interests left.' using errcode = '22023', hint = 'NO_SUPER_INTEREST';
    end if;
    new.super_source := 'credit';
    -- Not counted with the day's likes
    return new;
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
$$;

-- The notification says who (unless they hide their name) and the note
create or replace function public.enqueue_superlike_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_push boolean;
  v_who text;
begin
  if not new.is_super_like then return new; end if;

  select settings_push_notifs into v_push from public.profiles where id = new.liked_id;
  if not coalesce(v_push, true) then return new; end if;

  select case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else nullif(split_part(trim(p.name), ' ', 1), '') end
    into v_who from public.profiles p where p.id = new.liker_id;

  insert into public.push_queue (user_id, event_type, title, body, data)
  values (
    new.liked_id,
    'super_like',
    '⭐ ' || coalesce(v_who, 'Someone') || ' sent you a Super Interest',
    coalesce('"' || left(new.note, 120) || case when char_length(new.note) > 120 then '…' else '' end || '"',
             'Open Likes You to see their profile.'),
    jsonb_build_object('liker_id', new.liker_id, 'deep_link', '/likes')
  );
  return new;
end;
$$;

-- Likes You: a Super Interest shows who sent it and the note to everyone,
-- not only to members with Shaadi24+
drop function if exists public.get_likes_received(uuid);
create function public.get_likes_received(p_user_id uuid)
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
    case when me.pro or l.is_super_like then l.liker_id end,
    l.is_super_like, l.created_at,
    case when not (me.pro or l.is_super_like) or 'name' = any (coalesce(p.hidden_fields, '{}')) then null else p.name end,
    case when not (me.pro or l.is_super_like) or 'age' = any (coalesce(p.hidden_fields, '{}')) then null else p.age end,
    case when not (me.pro or l.is_super_like) or 'location' = any (coalesce(p.hidden_fields, '{}')) then null else p.location end,
    case when me.pro or l.is_super_like then public.moderated_photos(p.id, p.photo_urls) end,
    case when me.pro or l.is_super_like then p.subscription_tier end,
    case when me.pro or l.is_super_like then p.is_verified end,
    case when me.pro or l.is_super_like then p.hidden_fields end,
    case when me.pro or l.is_super_like then public.moderated_text(p.id, 'description', p.description) end,
    case when l.is_super_like then l.note end
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
    and not coalesce(p.is_banned, false)
  order by l.is_super_like desc, l.created_at desc;
$function$;

-- ---- Admin → Finance ---------------------------------------------------------------------

create or replace function public.admin_boost_stats(p_days integer default 30, p_mode text default 'live')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_mode text := case when p_mode = 'test' then 'test' else 'live' end;
begin
  if not public.admin_can(array['finance']) then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return (
    with sold as (
      select p.*, public.payment_net(p) as net
        from public.payments p
       where p.product_id is not null and coalesce(p.mode, 'live') = v_mode and p.paid_at >= v_since
         and p.status in ('captured', 'refunded')
    ),
    spot as (
      select s.*, (select count(*) from public.likes l where l.liked_id = s.user_id
                     and l.created_at between s.started_at and s.ends_at) as likes
        from public.spotlights s where s.started_at >= v_since
    ),
    supers as (
      select l.*, exists (select 1 from public.matches m
                           where (m.user_a_id = l.liker_id and m.user_b_id = l.liked_id)
                              or (m.user_a_id = l.liked_id and m.user_b_id = l.liker_id)) as matched
        from public.likes l where l.is_super_like and l.created_at >= v_since
    ),
    plain as (
      select l.*, exists (select 1 from public.matches m
                           where (m.user_a_id = l.liker_id and m.user_b_id = l.liked_id)
                              or (m.user_a_id = l.liked_id and m.user_b_id = l.liker_id)) as matched
        from public.likes l where not coalesce(l.is_super_like, false) and l.created_at >= v_since
    )
    select jsonb_build_object(
      'mode', v_mode,
      'days', extract(day from now() - v_since)::int,
      'products', coalesce((select jsonb_agg(jsonb_build_object(
          'id', b.id, 'kind', b.kind, 'quantity', b.quantity, 'price', b.amount, 'active', b.is_active,
          'sold', (select count(*) from sold s where s.product_id = b.id),
          'refunded', (select count(*) from sold s where s.product_id = b.id and s.status = 'refunded'),
          'gross', (select coalesce(sum(s.amount), 0) from sold s where s.product_id = b.id and s.currency = 'INR'),
          'net', (select coalesce(sum(s.net), 0) from sold s where s.product_id = b.id and s.currency = 'INR'))
          order by b.sort) from public.boost_products b), '[]'::jsonb),
      'buyers', (select count(distinct user_id) from sold),
      'repeat_buyers', (select count(*) from (select user_id from sold group by user_id having count(*) > 1) x),
      'spotlights', (select jsonb_build_object(
          'on_now', (select count(*) from public.spotlights where ends_at > now()),
          'started', count(*),
          'avg_views', coalesce(round(avg(views) filter (where ends_at <= now())), 0),
          'avg_likes', coalesce(round(avg(likes) filter (where ends_at <= now()), 1), 0)) from spot),
      'super_interests', (select jsonb_build_object(
          'sent', count(*),
          'with_plan', count(*) filter (where super_source = 'plan'),
          'with_credit', count(*) filter (where super_source = 'credit'),
          'with_note', count(*) filter (where note is not null),
          'matched', count(*) filter (where matched)) from supers),
      'likes_matched_pct', (select case when count(*) = 0 then null
                                        else round(100.0 * count(*) filter (where matched) / count(*), 1) end from plain),
      'unused', jsonb_build_object(
          'spotlight', (select coalesce(sum(greatest(balance, 0)), 0) from public.member_credits where kind = 'spotlight'),
          'super_interest', (select coalesce(sum(greatest(balance, 0)), 0) from public.member_credits where kind = 'super_interest'))
    )
  );
end;
$$;

-- Finance: a pack's test purchase stays out of the real figures, and the
-- packs are shown on their own
create or replace function public.admin_finance_summary(p_months integer DEFAULT 12, p_mode text DEFAULT 'live'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_months integer := greatest(1, least(coalesce(p_months, 12), 36));
  v_mode text := case when p_mode = 'test' then 'test' else 'live' end;
  -- Months by the calendar in India
  v_this_month timestamp := date_trunc('month', now() at time zone 'Asia/Kolkata');
  v_from timestamp := v_this_month - make_interval(months => v_months - 1);
  v_result jsonb;
begin
  if not public.admin_can(array['finance']) then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  with live as (
    -- Subscriptions giving Pro right now
    select s.*, (s.status = 'authenticated') as in_trial
      from public.subscriptions s
     where s.mode = v_mode
       and s.status in ('authenticated', 'active', 'pending')
       and coalesce(case when s.status = 'authenticated' then s.trial_ends_at end, s.current_end, s.trial_ends_at) > now()
  ),
  charges as (
    select p.*, public.payment_net(p) as net,
           date_trunc('month', p.paid_at at time zone 'Asia/Kolkata') as month
      from public.payments p
      left join public.subscriptions s on s.id = p.subscription_id
     where p.status in ('captured', 'refunded')
       and coalesce(p.mode, s.mode, 'live') = v_mode
  ),
  months as (
    select generate_series(v_from, v_this_month, interval '1 month') as month
  ),
  by_month as (
    select m.month, c.provider,
           sum(c.amount)::bigint as gross,
           sum(c.refunded_amount)::bigint as refunds,
           sum(c.amount - c.refunded_amount - c.net)::bigint as fees,
           sum(c.net)::bigint as net,
           count(*) as charges
      from months m
      join charges c on c.currency = 'INR' and c.month = m.month
     group by m.month, c.provider
  )
  select jsonb_build_object(
    'currency', 'INR',
    'mode', v_mode,
    'time_zone', 'Asia/Kolkata',
    'generated_at', now(),
    'subscribers', (select jsonb_build_object(
        'total', count(*),
        'paying', count(*) filter (where not in_trial),
        'in_trial', count(*) filter (where in_trial),
        'ending', count(*) filter (where cancel_at_period_end),
        'by_provider', coalesce((select jsonb_object_agg(provider, n) from (
            select provider, count(*) as n from live group by provider) x), '{}'::jsonb),
        'by_plan', coalesce((select jsonb_object_agg(plan_id, n) from (
            select plan_id, count(*) as n from live group by plan_id) x), '{}'::jsonb))
      from live),
    -- Monthly recurring revenue: paying subscriptions at their plan's price
    -- for a month (a week's times 52/12, three months' a third, and so on;
    -- store prices can differ a little by country)
    'mrr', (select coalesce(sum(round(b.amount * case b.period
                                                    when 'weekly' then 52 / 12.0
                                                    when 'quarterly' then 1 / 3.0
                                                    when 'halfyearly' then 1 / 6.0
                                                    when 'yearly' then 1 / 12.0
                                                    else 1 end)), 0)::bigint
              from live l join public.billing_plans b on b.id = l.plan_id
             where not l.in_trial),
    'cancelled_last_30_days', (select count(*) from public.subscriptions s
       where s.mode = v_mode and s.ended_at > now() - interval '30 days' and s.status in ('cancelled', 'expired', 'completed')),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'gross', coalesce((select sum(gross) from by_month b where b.month = m.month), 0),
        'refunds', coalesce((select sum(refunds) from by_month b where b.month = m.month), 0),
        'fees', coalesce((select sum(fees) from by_month b where b.month = m.month), 0),
        'net', coalesce((select sum(net) from by_month b where b.month = m.month), 0),
        'charges', coalesce((select sum(charges) from by_month b where b.month = m.month), 0),
        'by_provider', coalesce((select jsonb_object_agg(provider, jsonb_build_object(
            'gross', gross, 'refunds', refunds, 'fees', fees, 'net', net, 'charges', charges))
          from by_month b where b.month = m.month), '{}'::jsonb))
        order by m.month) from months m), '[]'::jsonb),
    'all_time', (select jsonb_build_object(
        'gross', coalesce(sum(amount), 0), 'refunds', coalesce(sum(refunded_amount), 0),
        'fees', coalesce(sum(amount - refunded_amount - net), 0),
        'net', coalesce(sum(net), 0), 'charges', count(*))
      from charges where currency = 'INR'),
    -- Spotlight and Super Interest packs (part of the figures above)
    'one_time', (select jsonb_build_object(
        'gross', coalesce(sum(amount), 0), 'refunds', coalesce(sum(refunded_amount), 0),
        'net', coalesce(sum(net), 0), 'charges', count(*))
      from charges where currency = 'INR' and product_id is not null),
    'other_currencies', coalesce((select jsonb_object_agg(currency, jsonb_build_object(
        'gross', gross, 'refunds', refunds, 'net', net, 'charges', n)) from (
        select currency, sum(amount) as gross, sum(refunded_amount) as refunds, sum(net) as net, count(*) as n
          from charges where currency <> 'INR' group by currency) x), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

-- Finance → Charges: a pack shows as its product, in the plan column
create or replace function public.admin_list_payments(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_provider text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, paid_at timestamp with time zone, provider text, order_id text, plan_id text, user_id uuid, user_name text, user_email text, amount integer, currency text, status text, method text, fee_amount integer, fee_estimated boolean, refunded_amount integer, refunded_at timestamp with time zone, net_amount integer, mode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.admin_can(array['finance']) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.id, p.paid_at, p.provider, p.store_order_id as order_id,
           coalesce(s.plan_id, p.product_id), p.user_id, pr.name, u.email::text,
           p.amount, p.currency, p.status, p.method,
           p.fee_amount, p.fee_estimated, p.refunded_amount, p.refunded_at,
           case when p.status in ('captured', 'refunded') then public.payment_net(p) else 0 end,
           coalesce(p.mode, s.mode, 'live')
      from public.payments p
      left join public.subscriptions s on s.id = p.subscription_id
      left join public.profiles pr on pr.id = p.user_id
      left join auth.users u on u.id = p.user_id
     where (p_from is null or p.paid_at >= p_from)
       and (p_to is null or p.paid_at < p_to)
       and (p_provider is null or p.provider = p_provider)
       and (p_mode is null or coalesce(p.mode, s.mode, 'live') = p_mode)
     order by p.paid_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 100), 5000))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

-- ---- Access --------------------------------------------------------------------------------

revoke all on function public.grant_boost_purchase(uuid, text, text, text, integer, text, integer, text, timestamptz),
  public.take_back_refunded_boost(), public.my_boosts(), public.start_spotlight(), public.note_spotlight_views(uuid[]),
  public.get_likes_received(uuid), public.admin_boost_stats(integer, text) from public, anon;
revoke all on function public.grant_boost_purchase(uuid, text, text, text, integer, text, integer, text, timestamptz),
  public.note_spotlight_views(uuid[]) from authenticated;
grant execute on function public.grant_boost_purchase(uuid, text, text, text, integer, text, integer, text, timestamptz),
  public.note_spotlight_views(uuid[]) to service_role;
grant execute on function public.my_boosts(), public.start_spotlight(), public.get_likes_received(uuid),
  public.admin_boost_stats(integer, text) to authenticated;
