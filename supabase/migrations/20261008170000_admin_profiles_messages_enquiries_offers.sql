-- ============================================================================
-- Admin, part 2: profile completeness, in-app messages, enquiries, offers
--
-- Profiles: admin_profile_stats() counts how complete members' profiles are
-- (by how much is filled in, by sections complete, each section, and the
-- answers most often missing), from profile_sections().
--
-- Messages: an admin writes to a group of members (everyone, a section not
-- complete, the profile not complete, not verified, free, inactive); each
-- gets it in the app (a card with a button that opens, say, their Family
-- section) and as a notification. admin_message_audience() counts who it
-- would reach, admin_send_message() sends it, admin_list_messages() shows
-- what was sent and how many saw and opened it. Members read theirs with
-- my_messages() and mark them with mark_my_message().
--
-- Enquiries: the website's contact form (submit_enquiry(), anyone, a few a
-- day from one address), and the admins' inbox (admin_enquiries(),
-- admin_update_enquiry()). A new one alerts the admins.
--
-- Offers: a code to show on the website's home page, from an offer set up
-- in App Store Connect (offer codes) or Play Console (promo codes); anyone
-- can read the one running now, admins manage them.
-- ============================================================================

-- ---- Profiles ------------------------------------------------------------------------------

create or replace function public.admin_profile_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  with member as (
    select p.id, public.profile_sections(p) as sections
      from public.profiles p
     where not coalesce(p.is_banned, false) and coalesce(p.onboarding_complete, false)
  ),
  per_member as (
    select m.id,
           (select count(*) filter (where (s->>'complete')::boolean) from jsonb_array_elements(m.sections) s) as done,
           (select coalesce(sum((s->>'answered')::int), 0) from jsonb_array_elements(m.sections) s) as answered,
           (select coalesce(sum((s->>'total')::int), 0) from jsonb_array_elements(m.sections) s) as total
      from member m
  ),
  section_rows as (
    select s->>'id' as id, s->>'title' as title, (s->>'complete')::boolean as complete,
           (s->>'answered')::int as answered, (s->>'total')::int as total
      from member m, jsonb_array_elements(m.sections) s
  ),
  field_rows as (
    select s->>'id' as section, f->>'key' as key, (f->>'answered')::boolean as answered
      from member m, jsonb_array_elements(m.sections) s, jsonb_array_elements(s->'fields') f
  )
  select jsonb_build_object(
    'members', (select count(*) from per_member),
    'bands', jsonb_build_array(
      jsonb_build_object('label', 'Under 25%', 'count', (select count(*) from per_member where total > 0 and answered * 100 < total * 25)),
      jsonb_build_object('label', '25–49%', 'count', (select count(*) from per_member where answered * 100 >= total * 25 and answered * 100 < total * 50)),
      jsonb_build_object('label', '50–74%', 'count', (select count(*) from per_member where answered * 100 >= total * 50 and answered * 100 < total * 75)),
      jsonb_build_object('label', '75–99%', 'count', (select count(*) from per_member where answered * 100 >= total * 75 and answered < total)),
      jsonb_build_object('label', 'All filled in', 'count', (select count(*) from per_member where total > 0 and answered = total))),
    'sections_done', (select jsonb_agg(jsonb_build_object('done', n, 'count', (select count(*) from per_member where done = n)) order by n)
                        from generate_series(0, 6) n),
    'sections', (select jsonb_agg(x order by x->>'order') from (
                   select jsonb_build_object('id', id, 'title', min(title),
                            'order', min(case id when 'about' then 1 when 'community' then 2 when 'career' then 3
                                                 when 'family' then 4 when 'lifestyle' then 5 else 6 end)::text,
                            'complete', count(*) filter (where complete),
                            'incomplete', count(*) filter (where not complete),
                            'answered_pct', round(100.0 * sum(answered) / nullif(sum(total), 0))) as x
                     from section_rows group by id) q),
    'missing_fields', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                         select jsonb_build_object('section', section, 'key', key, 'missing', count(*) filter (where not answered),
                                                   'of', count(*)) as x
                           from field_rows group by section, key
                          order by count(*) filter (where not answered) desc, key
                          limit 15) q)
  ) into v_result;

  return v_result;
end;
$$;

-- ---- Messages ------------------------------------------------------------------------------

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  cta_label text check (cta_label is null or char_length(btrim(cta_label)) between 1 and 40),
  -- Where the button goes: profile:<section>, profile, verify, upgrade, search
  cta_target text check (cta_target is null or cta_target ~ '^(profile(:(about|community|career|family|lifestyle|plans))?|verify|upgrade|search)$'),
  audience jsonb not null,
  audience_label text not null,
  pushed boolean not null default true,
  recipients integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.member_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.admin_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  clicked_at timestamptz,
  dismissed_at timestamptz,
  unique (message_id, user_id)
);
create index if not exists member_messages_user_idx on public.member_messages (user_id, created_at desc);

alter table public.admin_messages enable row level security;
alter table public.member_messages enable row level security;
-- (no policies: members and admins go through the functions below)

-- Who an audience is: active members (not banned), and then
--   {"kind":"all"} · {"kind":"incomplete"} (fewer than 6 sections complete)
--   {"kind":"missing_section","section":"family"} · {"kind":"unverified"}
--   {"kind":"free"} · {"kind":"inactive","days":14}
create or replace function public.message_audience(p_audience jsonb)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where not coalesce(p.is_banned, false)
     and coalesce(p.onboarding_complete, false)
     and case p_audience->>'kind'
           when 'all' then true
           when 'incomplete' then
             (select count(*) filter (where (s->>'complete')::boolean) from jsonb_array_elements(public.profile_sections(p)) s) < 6
           when 'missing_section' then exists (
             select 1 from jsonb_array_elements(public.profile_sections(p)) s
              where s->>'id' = p_audience->>'section' and not (s->>'complete')::boolean)
           when 'unverified' then not coalesce(p.is_verified, false)
           when 'free' then coalesce(p.subscription_tier, 'FREE') <> 'PRO'
           when 'inactive' then coalesce(p.last_active_at, p.account_created)
                                  < now() - make_interval(days => greatest(coalesce((p_audience->>'days')::int, 14), 1))
           else false
         end;
$$;
revoke all on function public.message_audience(jsonb) from public, anon, authenticated;

create or replace function public.admin_message_audience(p_audience jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (select count(*) from public.message_audience(p_audience));
end;
$$;

create or replace function public.admin_send_message(
  p_title text, p_body text, p_cta_label text, p_cta_target text,
  p_audience jsonb, p_audience_label text, p_push boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.admin_messages;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  insert into public.admin_messages (title, body, cta_label, cta_target, audience, audience_label, pushed, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_cta_label, '')), ''), nullif(btrim(coalesce(p_cta_target, '')), ''),
          p_audience, coalesce(nullif(btrim(p_audience_label), ''), p_audience->>'kind'), coalesce(p_push, true), auth.uid())
  returning * into v_message;

  insert into public.member_messages (message_id, user_id)
  select v_message.id, a.user_id from public.message_audience(p_audience) a;
  get diagnostics v_count = row_count;

  update public.admin_messages set recipients = v_count where id = v_message.id;

  if coalesce(p_push, true) then
    insert into public.push_queue (user_id, event_type, title, body, data)
    select mm.user_id, 'admin_message', v_message.title, v_message.body,
           jsonb_build_object('message_id', v_message.id, 'target', v_message.cta_target)
      from public.member_messages mm
     where mm.message_id = v_message.id;
  end if;

  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'send_message',
          jsonb_build_object('message_id', v_message.id, 'title', v_message.title, 'audience', v_message.audience_label, 'recipients', v_count));

  return jsonb_build_object('id', v_message.id, 'recipients', v_count);
end;
$$;

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
      from (select * from public.admin_messages order by created_at desc limit 100) m);
end;
$$;

-- The signed-in member's messages not yet dismissed or opened, newest first
create or replace function public.my_messages()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', mm.id, 'title', m.title, 'body', m.body, 'cta_label', m.cta_label, 'cta_target', m.cta_target,
           'created_at', mm.created_at, 'seen_at', mm.seen_at)
         order by mm.created_at desc), '[]'::jsonb)
    from public.member_messages mm
    join public.admin_messages m on m.id = mm.message_id
   where mm.user_id = auth.uid()
     and mm.dismissed_at is null and mm.clicked_at is null
     and mm.created_at > now() - interval '60 days';
$$;

-- p_action: seen, clicked (the button), dismissed (Not now)
create or replace function public.mark_my_message(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_messages
     set seen_at = coalesce(seen_at, now()),
         clicked_at = case when p_action = 'clicked' then coalesce(clicked_at, now()) else clicked_at end,
         dismissed_at = case when p_action = 'dismissed' then coalesce(dismissed_at, now()) else dismissed_at end
   where id = p_id and user_id = auth.uid();
end;
$$;

-- ---- Enquiries -----------------------------------------------------------------------------

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  topic text not null check (topic in ('general', 'account', 'subscription', 'safety', 'partnership', 'press', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'open', 'closed')),
  admin_notes text,
  source text not null default 'website' check (source in ('website', 'app')),
  user_id uuid references auth.users (id) on delete set null,
  ip_address inet,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null
);
create index if not exists enquiries_status_idx on public.enquiries (status, created_at desc);
alter table public.enquiries enable row level security;
-- (no policies: anyone writes with submit_enquiry(), admins read with admin_enquiries())

create or replace function public.submit_enquiry(p_name text, p_email text, p_topic text, p_message text, p_source text default 'website')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.enquiries;
  v_ip inet := public.request_ip();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Against spam: a few a day from one email address or one internet address
  if (select count(*) from public.enquiries where email = v_email and created_at > now() - interval '1 day') >= 5
     or (v_ip is not null and (select count(*) from public.enquiries where ip_address = v_ip and created_at > now() - interval '1 day') >= 10) then
    raise exception 'You have sent several messages today. Please write to us by email instead.';
  end if;

  insert into public.enquiries (name, email, topic, message, source, user_id, ip_address)
  values (btrim(p_name), v_email, coalesce(nullif(p_topic, ''), 'general'), btrim(p_message),
          case when p_source = 'app' then 'app' else 'website' end, auth.uid(), v_ip)
  returning * into v_row;

  perform public.notify_admins('admin_enquiry', '✉️ New enquiry',
    format('%s: %s. Open Admin → Enquiries.', v_row.name, left(v_row.message, 80)),
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'enquiries', 'enquiry_id', v_row.id));

  return jsonb_build_object('id', v_row.id, 'received_at', v_row.created_at);
end;
$$;

create or replace function public.admin_enquiries(p_status text default 'open')
returns setof public.enquiries
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return query
    select * from public.enquiries e
     where coalesce(p_status, 'all') = 'all'
        or (p_status = 'open' and e.status in ('new', 'open'))
        or e.status = p_status
     order by case e.status when 'new' then 0 when 'open' then 1 else 2 end, e.created_at desc
     limit 500;
end;
$$;

create or replace function public.admin_update_enquiry(p_id uuid, p_status text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  if p_status not in ('new', 'open', 'closed') then
    raise exception 'Unknown status';
  end if;
  update public.enquiries
     set status = p_status,
         admin_notes = coalesce(p_notes, admin_notes),
         handled_at = case when p_status = 'closed' then now() else handled_at end,
         handled_by = auth.uid()
   where id = p_id;
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'update_enquiry', jsonb_build_object('enquiry_id', p_id, 'status', p_status));
end;
$$;

-- ---- Offers --------------------------------------------------------------------------------

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),       -- for admins
  banner_text text not null check (char_length(btrim(banner_text)) between 1 and 140),
  code text not null check (code ~ '^[A-Za-z0-9]{3,64}$'),
  stores text not null default 'both' check (stores in ('both', 'app_store', 'google_play')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.offers enable row level security;

drop policy if exists "Anyone sees the offer running now" on public.offers;
create policy "Anyone sees the offer running now" on public.offers
  for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "Admins manage offers" on public.offers;
create policy "Admins manage offers" on public.offers
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.offers to anon, authenticated;
grant insert, update, delete on public.offers to authenticated;

-- ---- Who may call what ---------------------------------------------------------------------

revoke all on function public.admin_profile_stats() from public, anon;
revoke all on function public.admin_message_audience(jsonb) from public, anon;
revoke all on function public.admin_send_message(text, text, text, text, jsonb, text, boolean) from public, anon;
revoke all on function public.admin_list_messages() from public, anon;
revoke all on function public.my_messages() from public, anon;
revoke all on function public.mark_my_message(uuid, text) from public, anon;
revoke all on function public.admin_enquiries(text) from public, anon;
revoke all on function public.admin_update_enquiry(uuid, text, text) from public, anon;
grant execute on function public.admin_profile_stats() to authenticated;
grant execute on function public.admin_message_audience(jsonb) to authenticated;
grant execute on function public.admin_send_message(text, text, text, text, jsonb, text, boolean) to authenticated;
grant execute on function public.admin_list_messages() to authenticated;
grant execute on function public.my_messages() to authenticated;
grant execute on function public.mark_my_message(uuid, text) to authenticated;
grant execute on function public.admin_enquiries(text) to authenticated;
grant execute on function public.admin_update_enquiry(uuid, text, text) to authenticated;
grant execute on function public.submit_enquiry(text, text, text, text, text) to anon, authenticated;
