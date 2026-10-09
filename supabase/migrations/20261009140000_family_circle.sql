-- ============================================================================
-- Family Circle: a member's family sees their shortlist and reacts
--
--   - the member invites up to 5 people (Mummy, Papa, Didi…) with Shaadi24+;
--     each gets their own private link (shaadi24 …/family/<link>) to send on
--     WhatsApp, and the member can remove anyone at any time
--   - on the link's page (family_circle_view, anyone with the link) family
--     see the people the member liked or matched with, as other members see
--     them: never what those people hid, photos waiting for approval, chats,
--     contact details or anyone who said no to being shown to families
--     (profiles.family_can_view, Settings → Privacy), blocked, paused, banned
--     or unmatched
--   - they react 👍 yes, 🤔 maybe or 👎 no, with a short note
--     (family_react); the member sees each reaction in the app and gets a
--     notification
--   - Admin → Growth: circles, family who visited, reactions
--     (admin_family_stats)
-- ============================================================================

alter table public.profiles add column if not exists family_can_view boolean not null default true;
comment on column public.profiles.family_can_view is
  'Members may show this profile to their family in Family Circle (Settings → Privacy).';

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  relation text not null check (relation in ('mother', 'father', 'sister', 'brother', 'relative', 'friend')),
  token text not null unique,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  last_seen_at timestamptz
);
create index if not exists family_members_member on public.family_members (member_id);

create table if not exists public.family_reactions (
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('yes', 'maybe', 'no')),
  note text check (note is null or length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (family_member_id, profile_id)
);
create index if not exists family_reactions_profile on public.family_reactions (profile_id);

alter table public.family_members enable row level security;
alter table public.family_reactions enable row level security;
drop policy if exists "Members read their own family" on public.family_members;
create policy "Members read their own family" on public.family_members
  for select to authenticated using (member_id = (select auth.uid()));
drop policy if exists "Members read their family's reactions" on public.family_reactions;
create policy "Members read their family's reactions" on public.family_reactions
  for select to authenticated using (exists (
    select 1 from public.family_members f where f.id = family_member_id and f.member_id = (select auth.uid())));
revoke insert, update, delete on public.family_members, public.family_reactions from anon, authenticated;

-- ---- The member's side ------------------------------------------------------------------

create or replace function public.invite_family_member(p_name text, p_relation text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.family_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in to invite your family' using errcode = '42501';
  end if;
  if not public.has_pro(auth.uid()) then
    raise exception 'Family Circle comes with Shaadi24+' using errcode = 'P0001', hint = 'PRO_ONLY';
  end if;
  if coalesce(length(trim(p_name)), 0) not between 1 and 40 then
    raise exception 'Give a name of up to 40 letters' using errcode = '22023';
  end if;
  if public.has_objectionable_words(p_name) then
    raise exception 'Please choose another name' using errcode = '22023';
  end if;
  if (select count(*) from public.family_members where member_id = auth.uid() and removed_at is null) >= 5 then
    raise exception 'You can invite up to 5 people. Remove someone to invite another.' using errcode = 'P0001';
  end if;
  insert into public.family_members (member_id, name, relation, token)
  values (auth.uid(), trim(p_name), p_relation, substr(replace(gen_random_uuid()::text, '-', ''), 1, 24))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'token', v_row.token);
end;
$$;

create or replace function public.remove_family_member(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.family_members set removed_at = now()
   where id = p_id and member_id = auth.uid() and removed_at is null;
$$;

-- The member's circle and every reaction, for the Family Circle screen
create or replace function public.my_family_circle()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'relation', f.relation, 'token', f.token,
        'created_at', f.created_at, 'last_seen_at', f.last_seen_at,
        'reactions', (select count(*) from public.family_reactions r where r.family_member_id = f.id)) order by f.created_at)
        from public.family_members f where f.member_id = auth.uid() and f.removed_at is null), '[]'::jsonb),
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', r.profile_id, 'family_member_id', f.id, 'name', f.name,
        'relation', f.relation, 'reaction', r.reaction, 'note', r.note, 'updated_at', r.updated_at) order by r.updated_at desc)
        from public.family_reactions r join public.family_members f on f.id = r.family_member_id
       where f.member_id = auth.uid() and f.removed_at is null), '[]'::jsonb)
  );
$$;

-- ---- The family's side (the link's page on the website) -----------------------------------

-- The people a member's family may see: liked or matched (not unmatched),
-- shown to others, not blocked either way, and not said no to families
create or replace function public.family_shortlist_ids(p_member uuid)
returns table (profile_id uuid, matched boolean, since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with picked as (
    select l.liked_id as profile_id, false as matched, l.created_at as since
      from public.likes l where l.liker_id = p_member
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

create or replace function public.family_circle_view(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  f public.family_members;
  me record;
begin
  select * into f from public.family_members where token = p_token and removed_at is null;
  if not found or p_token is null then
    return jsonb_build_object('found', false);
  end if;
  select * into me from public.profiles where id = f.member_id;
  if coalesce(me.is_banned, false) or not coalesce(me.onboarding_complete, false) then
    return jsonb_build_object('found', false);
  end if;
  update public.family_members set last_seen_at = now() where id = f.id;

  return jsonb_build_object(
    'found', true,
    'member', split_part(trim(me.name), ' ', 1),
    'member_gender', me.gender,
    'you', jsonb_build_object('name', f.name, 'relation', f.relation),
    'shortlist', coalesce((
      select jsonb_agg(card order by since desc)
        from (
          select s.since, jsonb_build_object(
            'id', p.id,
            'matched', s.matched,
            'name', case when 'name' = any (coalesce(p.hidden_fields, '{}')) then null else split_part(trim(p.name), ' ', 1) end,
            'age', p.age,
            'height', case when 'height' = any (coalesce(p.hidden_fields, '{}')) then null else p.height end,
            'place', case when 'location' = any (coalesce(p.hidden_fields, '{}')) then null
                          else concat_ws(', ', nullif(p.city, ''), nullif(coalesce(nullif(p.state, ''), p.country), '')) end,
            'religion', case when 'religion' = any (coalesce(p.hidden_fields, '{}')) then null else p.religion end,
            'mother_tongue', case when 'motherTongue' = any (coalesce(p.hidden_fields, '{}')) then null else p.mother_tongue end,
            'caste', case when 'caste' = any (coalesce(p.hidden_fields, '{}')) then null else p.caste end,
            'education', case when 'degree' = any (coalesce(p.hidden_fields, '{}')) then null else p.degree end,
            'occupation', case when 'occupation' = any (coalesce(p.hidden_fields, '{}')) then null else p.occupation end,
            'marital_status', case when 'maritalStatus' = any (coalesce(p.hidden_fields, '{}')) then null else p.marital_status end,
            'about', case when 'description' = any (coalesce(p.hidden_fields, '{}')) then null
                          else left(public.moderated_text(p.id, 'description', p.description), 200) end,
            'photo', (public.moderated_photos(p.id, p.photo_urls))[1],
            'verified', coalesce(p.is_verified, false),
            'reactions', coalesce((
              select jsonb_agg(jsonb_build_object('by', o.name, 'relation', o.relation, 'mine', o.id = f.id,
                'reaction', r.reaction, 'note', r.note) order by r.updated_at)
                from public.family_reactions r join public.family_members o on o.id = r.family_member_id
               where r.profile_id = p.id and o.member_id = f.member_id and o.removed_at is null), '[]'::jsonb)
          ) as card
            from public.family_shortlist_ids(f.member_id) s join public.profiles p on p.id = s.profile_id
           order by s.since desc
           limit 50
        ) c), '[]'::jsonb)
  );
end;
$$;

create or replace function public.family_react(p_token text, p_profile_id uuid, p_reaction text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f public.family_members;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_first boolean;
  v_who text;
begin
  select * into f from public.family_members where token = p_token and removed_at is null;
  if not found or p_token is null then
    raise exception 'This link has been turned off' using errcode = '42501';
  end if;
  if p_reaction not in ('yes', 'maybe', 'no') then
    raise exception 'Choose yes, maybe or no' using errcode = '22023';
  end if;
  if v_note is not null and (length(v_note) > 280 or public.has_objectionable_words(v_note)) then
    raise exception 'Please keep the note short and polite' using errcode = '22023';
  end if;
  if not exists (select 1 from public.family_shortlist_ids(f.member_id) s where s.profile_id = p_profile_id) then
    raise exception 'This profile is no longer on the shortlist' using errcode = 'P0002';
  end if;
  -- At most 60 reactions an hour from one link
  if (select count(*) from public.family_reactions where family_member_id = f.id and updated_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many reactions for now. Please try again later.' using errcode = 'P0001';
  end if;

  select not exists (select 1 from public.family_reactions where family_member_id = f.id and profile_id = p_profile_id) into v_first;
  insert into public.family_reactions (family_member_id, profile_id, reaction, note)
  values (f.id, p_profile_id, p_reaction, v_note)
  on conflict (family_member_id, profile_id)
  do update set reaction = excluded.reaction, note = excluded.note, updated_at = now();
  update public.family_members set last_seen_at = now() where id = f.id;

  -- The member hears about it (once per person a profile, not each change)
  if v_first then
    select coalesce(split_part(trim(name), ' ', 1), 'someone') into v_who from public.profiles where id = p_profile_id;
    insert into public.push_queue (user_id, event_type, title, body, data)
    values (f.member_id, 'family_reaction', f.name || ' reacted to ' || v_who,
      case p_reaction when 'yes' then '👍 ' when 'maybe' then '🤔 ' else '👎 ' end || coalesce(v_note, 'Open Family Circle to see.'),
      jsonb_build_object('event_type', 'family_reaction', 'profile_id', p_profile_id));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---- Admin → Growth -----------------------------------------------------------------------

create or replace function public.admin_family_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not public.admin_can(array['growth']) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'circles', (select count(distinct member_id) from public.family_members where removed_at is null),
    'family', (select count(*) from public.family_members where removed_at is null),
    'visited_in_period', (select count(*) from public.family_members where removed_at is null and last_seen_at >= v_since),
    'reactions', (select count(*) from public.family_reactions),
    'reactions_in_period', (select count(*) from public.family_reactions where updated_at >= v_since),
    'by_reaction', (select coalesce(jsonb_object_agg(reaction, n), '{}'::jsonb)
                      from (select reaction, count(*) n from public.family_reactions group by reaction) t),
    'by_relation', (select coalesce(jsonb_object_agg(relation, n), '{}'::jsonb)
                      from (select relation, count(*) n from public.family_members where removed_at is null group by relation) t)
  );
end;
$$;

revoke all on function public.invite_family_member(text, text), public.remove_family_member(uuid), public.my_family_circle(),
  public.family_shortlist_ids(uuid), public.family_circle_view(text), public.family_react(text, uuid, text, text),
  public.admin_family_stats(integer) from public, anon;
grant execute on function public.invite_family_member(text, text), public.remove_family_member(uuid), public.my_family_circle(),
  public.admin_family_stats(integer) to authenticated;
-- The link's page is on the website, for the family the member sent it to
grant execute on function public.family_circle_view(text), public.family_react(text, uuid, text, text) to anon, authenticated;
