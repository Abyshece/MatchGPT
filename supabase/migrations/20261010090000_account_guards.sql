-- ============================================================================
-- Guards against fake and repeat accounts
--
-- Free searches are per account, so the way to get more is more accounts.
-- Three guards make that hard, without getting in the way of real members:
--
-- 1. Throwaway email addresses (Mailinator, YOPmail, 10 Minute Mail and some
--    9,000 others) can't sign up. blocked_email_domains is checked when an
--    account is created or its email changed (a trigger on auth.users), and
--    by the app first (email_domain_allowed), so it can say why. Subdomains
--    count (x.yopmail.com). The list is the public disposable-email-domains
--    list (CC0, 20261010090100_blocked_email_domains.sql); admins can add to it.
--
-- 2. One mailbox, one account. Gmail ignores dots and anything after a +, so
--    a.bc+2@gmail.com reaches abc@gmail.com; other providers ignore the +.
--    A second account on the same mailbox is still created (refusing it would
--    tell anyone typing an address whether that person is on Shaadi24), but
--    only the mailbox's owner can confirm it, and once confirmed it can't
--    search and shows in Admin → Scam alerts ("same_mailbox").
--
-- 3. One phone, at most 3 accounts with free searches. The app sends the
--    phone's app ID with every search and at sign-in (stored hashed,
--    member_devices). A 4th account on the same phone within 90 days needs
--    Shaadi24+ to search: 3 covers a parent making profiles for their
--    children. Admin → Scam alerts shows phones with 4 or more accounts
--    ("shared_phone"), and a new account on a banned member's phone counts
--    as that member coming back ("banned_back", "same phone").
--
-- account_guard() is what the search function asks. Shaadi24+ members, and
-- the team's own test accounts (on an admin's mailbox), aren't limited.
-- ============================================================================

-- ---- 1. Throwaway email domains ---------------------------------------------------------------

create table if not exists public.blocked_email_domains (
  domain text primary key check (domain = lower(btrim(domain)) and domain ~ '^[a-z0-9.-]+\.[a-z0-9-]+$'),
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);
alter table public.blocked_email_domains enable row level security;  -- only through the functions below
revoke all on public.blocked_email_domains from anon, authenticated;

-- The part after the last @, lower case
create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(lower(btrim(substring(btrim(coalesce(p_email, '')) from '@([^@]*)$'))), '');
$$;

-- Whether an address is at a throwaway domain (or a subdomain of one)
create or replace function public.email_domain_blocked(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_email_domains b
     where b.domain = public.email_domain(p_email)
        or public.email_domain(p_email) like '%.' || b.domain);
$$;
revoke all on function public.email_domain_blocked(text) from public, anon, authenticated;

-- For the app's sign-up form: whether to go ahead (no account is looked up)
create or replace function public.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.email_domain(p_email) is not null and not public.email_domain_blocked(p_email);
$$;
revoke all on function public.email_domain_allowed(text) from public;
grant execute on function public.email_domain_allowed(text) to anon, authenticated;

-- ---- 2. One mailbox, one account --------------------------------------------------------------

-- The mailbox an address reaches: lower case, without +tags, and for Gmail
-- without dots (googlemail.com is gmail.com)
create or replace function public.normalized_email(p_email text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  local_part text := substring(e from '^(.*)@[^@]*$');
  domain text := public.email_domain(e);
begin
  if local_part is null or domain is null then
    return nullif(e, '');
  end if;
  local_part := split_part(local_part, '+', 1);
  if domain in ('gmail.com', 'googlemail.com') then
    local_part := replace(local_part, '.', '');
    domain := 'gmail.com';
  end if;
  return local_part || '@' || domain;
end;
$$;

-- Each account's mailbox (written by the auth.users trigger below)
create table if not exists public.account_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  normalized text not null,
  created_at timestamptz not null default now()
);
create index if not exists account_emails_normalized on public.account_emails (normalized);
alter table public.account_emails enable row level security;
revoke all on public.account_emails from anon, authenticated;

insert into public.account_emails (user_id, normalized, created_at)
select u.id, public.normalized_email(u.email), u.created_at
  from auth.users u
 where u.email is not null
on conflict (user_id) do nothing;

-- The older account on the same mailbox, if this one is a second one
create or replace function public.mailbox_duplicate_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.user_id
    from public.account_emails me
    join public.account_emails o on o.normalized = me.normalized and o.user_id <> me.user_id
   where me.user_id = p_user
     and (o.created_at, o.user_id) < (me.created_at, me.user_id)
   order by o.created_at
   limit 1;
$$;
revoke all on function public.mailbox_duplicate_of(uuid) from public, anon, authenticated;

-- On auth.users: refuse throwaway domains; note the mailbox
create or replace function public.guard_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if new.email is not null and public.email_domain_blocked(new.email) then
    raise exception 'Temporary or throwaway email addresses can''t be used on Shaadi24. Please use your regular email address.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_account_email() from public, anon, authenticated;

create or replace function public.note_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or (tg_op = 'UPDATE' and new.email is not distinct from old.email) then
    return new;
  end if;
  insert into public.account_emails (user_id, normalized, created_at)
  values (new.id, public.normalized_email(new.email), coalesce(new.created_at, now()))
  on conflict (user_id) do update set normalized = excluded.normalized;
  return new;
end;
$$;
revoke all on function public.note_account_email() from public, anon, authenticated;

create or replace trigger guard_account_email
  before insert or update of email on auth.users
  for each row execute function public.guard_account_email();

create or replace trigger note_account_email
  after insert or update of email on auth.users
  for each row execute function public.note_account_email();

-- ---- 3. One phone, at most 3 accounts with free searches --------------------------------------

alter table public.app_settings
  add column if not exists free_accounts_per_phone smallint not null default 3
    check (free_accounts_per_phone between 1 and 20);

create table if not exists public.member_devices (
  device_hash text not null check (length(device_hash) = 64),   -- sha256 of the app ID, never the ID itself
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text check (platform in ('android', 'ios', 'web')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (device_hash, user_id)
);
create index if not exists member_devices_user on public.member_devices (user_id);
alter table public.member_devices enable row level security;
revoke all on public.member_devices from anon, authenticated;

create or replace function public.device_hash(p_device text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when length(btrim(coalesce(p_device, ''))) between 8 and 200
    then encode(extensions.digest('shaadi24-device:' || btrim(p_device), 'sha256'), 'hex') end;
$$;
revoke all on function public.device_hash(text) from public, anon, authenticated;

-- Which phone an account is used on (the search function, and note_device())
create or replace function public.record_device(p_user uuid, p_device text, p_platform text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := public.device_hash(p_device);
begin
  if h is null or p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    return null;
  end if;
  insert into public.member_devices (device_hash, user_id, platform)
  values (h, p_user, case when p_platform in ('android', 'ios', 'web') then p_platform end)
  on conflict (device_hash, user_id) do update set last_seen = now(),
    platform = coalesce(excluded.platform, public.member_devices.platform);
  return h;
end;
$$;
revoke all on function public.record_device(uuid, text, text) from public, anon, authenticated;

-- The app, at sign-in and start: this account is on this phone
create or replace function public.note_device(p_device text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_device(auth.uid(), p_device, p_platform);
end;
$$;
revoke all on function public.note_device(text, text) from public, anon;
grant execute on function public.note_device(text, text) to authenticated;

-- Whether a free account may search: not a second account on a mailbox, and
-- among the first accounts on its phone. { allowed, reason, message }
create or replace function public.account_guard(p_user uuid, p_device text default null, p_platform text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := public.record_device(p_user, p_device, p_platform);
  max_free int := coalesce((select s.free_accounts_per_phone from public.app_settings s limit 1), 3);
  place int;
begin
  -- Shaadi24+ members pay for their searches; the team's own test accounts
  -- (on an admin's mailbox, e.g. owner+test1@gmail.com) aren't limited
  if (select p.subscription_tier from public.profiles p where p.id = p_user) = 'PRO'
     or exists (select 1 from public.account_emails me join public.admin_emails t
                  on public.normalized_email(t.email) = me.normalized
                 where me.user_id = p_user) then
    return jsonb_build_object('allowed', true);
  end if;
  if public.mailbox_duplicate_of(p_user) is not null then
    return jsonb_build_object('allowed', false, 'reason', 'same_mailbox',
      'message', 'You already have a Shaadi24 account with this email address (Gmail ignores dots, and any email ignores what comes after a +). Please sign in to that account to search.');
  end if;
  if h is not null then
    select r.n into place
      from (select d.user_id, row_number() over (order by d.first_seen, d.user_id) as n
              from public.member_devices d
             where d.device_hash = h and d.first_seen > now() - interval '90 days') r
     where r.user_id = p_user;
    if place > max_free then
      return jsonb_build_object('allowed', false, 'reason', 'shared_phone',
        'message', format('This phone already has %s Shaadi24 accounts using free searches. To search from this account too, get Shaadi24+.', max_free));
    end if;
  end if;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.account_guard(uuid, text, text) from public, anon, authenticated;

-- ---- Admin → Scam alerts ----------------------------------------------------------------------
-- (admin_risk_signals was changed in place since it was written, so the live
-- definition is edited here; anchored on code, not comments: the live copy
-- has its comments stripped)

do $$
declare
  def text;
  patched text;
begin
  select pg_get_functiondef('public.admin_risk_signals()'::regprocedure) into def;
  if position('shared_phone as (' in def) > 0 then
    return;  -- already added (safe to run again)
  end if;
  patched := replace(def,
    $a$    banned_back as ($a$,
    $a$    same_mailbox as (
      select a.user_id, 'same_mailbox'::text, 2,
             'Second account on the mailbox of ' || coalesce(o.name, 'another member')
               || ' (' || a.normalized || ')',
             max(a.created_at), 1::bigint
        from public.account_emails a
        join public.profiles o on o.id = public.mailbox_duplicate_of(a.user_id)
       where exists (select 1 from public.account_emails x where x.normalized = a.normalized and x.user_id <> a.user_id)
       group by a.user_id, o.name, a.normalized),
    shared_phone as (
      select d.user_id, 'shared_phone'::text, 2,
             p.n || ' accounts on one phone in 90 days: ' || p.names,
             max(d.last_seen), p.n
        from public.member_devices d
        join (select d2.device_hash, count(*) as n,
                     string_agg(coalesce(pr.name, 'unnamed'), ', ' order by d2.first_seen) as names
                from public.member_devices d2
                left join public.profiles pr on pr.id = d2.user_id
               where d2.first_seen > now() - interval '90 days'
               group by d2.device_hash
              having count(*) >= 4) p on p.device_hash = d.device_hash
       where d.first_seen > now() - interval '90 days'
       group by d.user_id, p.n, p.names),
    banned_back as ($a$);
  patched := replace(patched,
    $a$          select f2.user_id, 'same photo' from public.photo_fingerprints f1$a$,
    $a$          select d2.user_id, 'same phone' from public.member_devices d1
            join public.member_devices d2 on d2.device_hash = d1.device_hash and d2.user_id <> d1.user_id
            join public.profiles b on b.id = d2.user_id and b.is_banned
           where d1.user_id = n.id
          union all
          select f2.user_id, 'same photo' from public.photo_fingerprints f1$a$);
  patched := replace(patched,
    $a$union all select * from blocked union all select * from banned_back$a$,
    $a$union all select * from blocked union all select * from same_mailbox union all select * from shared_phone union all select * from banned_back$a$);
  if position('select * from shared_phone' in patched) = 0 or position('shared_phone as (' in patched) = 0
     or position('''same phone'' from public.member_devices' in patched) = 0 then
    raise exception 'admin_risk_signals: the places to add the account guards were not found';
  end if;
  execute patched;
end $$;
