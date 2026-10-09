-- ============================================================================
-- Biodata: a member's marriage biodata, shared as a picture on WhatsApp, with
-- a QR code and a private link back to Shaadi24 (shaadi24.com/b/<link>)
--
--   - the picture is made in the app from the member's own profile; nothing
--     here stores it
--   - one link per member at a time: random, so nobody can guess one; the
--     member can turn it off (the next biodata gets a new one), and it counts
--     how often it was opened
--   - the website's page for the link (biodata_preview, anyone with the link)
--     shows only what other members see of the profile: never what the member
--     hid, photos waiting for approval, an email or a phone number; nothing at
--     all for a link turned off, or a profile paused, banned or not finished
--   - Admin → Growth: biodatas shared and opened (admin_biodata_stats)
-- ============================================================================

create table if not exists public.biodata_links (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  opens integer not null default 0,
  last_opened_at timestamptz
);
create index if not exists biodata_links_user on public.biodata_links (user_id);
create unique index if not exists biodata_links_one_active on public.biodata_links (user_id) where revoked_at is null;

alter table public.biodata_links enable row level security;
-- Members read their own links; everything else goes through the functions below
drop policy if exists "Members read their own biodata links" on public.biodata_links;
create policy "Members read their own biodata links" on public.biodata_links
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.biodata_links from anon, authenticated;

-- The member's link, made the first time (and after one is turned off)
create or replace function public.my_biodata_link()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.biodata_links;
begin
  if auth.uid() is null then
    raise exception 'Sign in to share your biodata' using errcode = '42501';
  end if;
  select * into v_link from public.biodata_links where user_id = auth.uid() and revoked_at is null;
  if not found then
    insert into public.biodata_links (token, user_id)
    values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), auth.uid())
    returning * into v_link;
  end if;
  return jsonb_build_object('token', v_link.token, 'created_at', v_link.created_at, 'opens', v_link.opens,
    'last_opened_at', v_link.last_opened_at);
end;
$$;

-- Turns the member's link off: a biodata already shared opens nothing
create or replace function public.revoke_biodata_link()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.biodata_links set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
$$;

-- The page a shared biodata's link opens: what other members see, never more
create or replace function public.biodata_preview(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  p record;
  hidden text[];
  photos text[];
  shown boolean;
begin
  select l.user_id into v_user from public.biodata_links l
   where l.token = p_token and l.revoked_at is null;
  if v_user is null or p_token is null or length(p_token) <> 20 then
    return jsonb_build_object('found', false);
  end if;
  select * into p from public.profiles where id = v_user;
  shown := found and coalesce(p.onboarding_complete, false) and not coalesce(p.is_banned, false)
    and not coalesce(p.is_paused, false);
  if not shown then
    return jsonb_build_object('found', false);
  end if;
  update public.biodata_links set opens = opens + 1, last_opened_at = now() where token = p_token;

  hidden := coalesce(p.hidden_fields, '{}');
  photos := public.moderated_photos(p.id, p.photo_urls);
  return jsonb_build_object(
    'found', true,
    'name', case when 'name' = any (hidden) then null else split_part(trim(p.name), ' ', 1) end,
    'age', p.age,
    'gender', p.gender,
    'height', case when 'height' = any (hidden) then null else p.height end,
    'city', case when 'location' = any (hidden) then null else p.city end,
    'state', case when 'location' = any (hidden) then null else p.state end,
    'country', case when 'location' = any (hidden) then null else p.country end,
    'religion', case when 'religion' = any (hidden) then null else p.religion end,
    'mother_tongue', case when 'motherTongue' = any (hidden) then null else p.mother_tongue end,
    'caste', case when 'caste' = any (hidden) then null else p.caste end,
    'marital_status', case when 'maritalStatus' = any (hidden) then null else p.marital_status end,
    'degree', case when 'degree' = any (hidden) then null else p.degree end,
    'occupation', case when 'occupation' = any (hidden) then null else p.occupation end,
    'diet', case when 'dietaryPreferences' = any (hidden) then null else p.dietary_preferences end,
    'about', case when 'description' = any (hidden) then null
                  else left(public.moderated_text(p.id, 'description', p.description), 280) end,
    'photo', case when 'photos' = any (hidden) then null else photos[1] end,
    'verified', coalesce(p.is_verified, false)
  );
end;
$$;

comment on function public.biodata_preview(text) is
  'The page a shared biodata''s link opens (website /b/<link>): what other members see of the profile, never more; nothing for a link turned off or a profile paused, banned or not finished.';

-- Admin → Growth: biodatas shared and opened
create or replace function public.admin_biodata_stats(p_days integer default 30)
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
    'members', (select count(distinct user_id) from public.biodata_links),
    'active_links', (select count(*) from public.biodata_links where revoked_at is null),
    'made_in_period', (select count(*) from public.biodata_links where created_at >= v_since),
    'opens', (select coalesce(sum(opens), 0) from public.biodata_links),
    'opened_in_period', (select count(*) from public.biodata_links where last_opened_at >= v_since),
    'top', coalesce((
      select jsonb_agg(t order by t.opens desc)
        from (select l.user_id, p.name, p.email, l.opens, l.created_at, l.last_opened_at, l.revoked_at is not null as turned_off
                from public.biodata_links l join public.profiles p on p.id = l.user_id
               where l.opens > 0
               order by l.opens desc limit 10) t), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_biodata_link(), public.revoke_biodata_link(), public.biodata_preview(text),
  public.admin_biodata_stats(integer) from public, anon;
grant execute on function public.my_biodata_link(), public.revoke_biodata_link(), public.admin_biodata_stats(integer) to authenticated;
-- The link's page is on the website, for anyone the member gave it to
grant execute on function public.biodata_preview(text) to anon, authenticated;
