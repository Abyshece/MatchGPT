-- ============================================================================
-- Admin, part 5: a member's timeline, growth, search insights, success stories
--
--   admin_member_timeline(member)  everything one member did and what was done
--                                  about them, newest first (messages as a
--                                  count per chat per day, never their text)
--   admin_growth(days)             how far members get (joined → profile →
--                                  photo → verified → liked → matched →
--                                  messaged → paid), sign-ups and active
--                                  members a day, and members by city,
--                                  community, religion, gender and age
--   admin_search_insights(days)    what members search for: searches a day,
--                                  the words and searches most typed,
--                                  searches that found no one, filters used
--                                  (never who searched)
--   success_stories                couples' stories for the website, published
--                                  only with both partners' consent
-- ============================================================================

-- ---- A member's timeline ----------------------------------------------------------------------------

create or replace function public.admin_member_timeline(p_user uuid, p_limit integer default 300)
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
    with other(id, name) as (select p.id, coalesce(p.name, 'a member') from public.profiles p),
    ev(at, kind, title, detail) as (
      select p.account_created, 'account', 'Joined Shaadi24',
             nullif(concat_ws(' · ', 'profile for ' || p.profile_created_for, case when p.onboarding_complete then 'finished sign-up' else 'sign-up not finished' end), '')
        from public.profiles p where p.id = p_user
      union all
      select c.created_at, 'account',
             case c.event_type
               when 'terms_accepted' then 'Agreed to the Terms'
               when 'privacy_accepted' then 'Agreed to the Privacy Policy'
               when 'sensitive_data_consent' then 'Consented to sensitive details'
               when 'marketing_consent' then case when c.consented then 'Said yes to marketing emails' else 'Said no to marketing emails' end
               when 'legal_age_declaration' then 'Declared the legal age to marry'
               when 'matrimony_declaration' then 'Declared they''re looking to marry'
               when 'cookies_updated' then 'Chose cookies'
               else initcap(replace(c.event_type, '_', ' ')) end,
             c.document_version
        from public.consent_records c where c.user_id = p_user
      union all
      select s.created_at, 'search', 'Searched',
             coalesce(nullif(btrim(s.prompt), ''), '(filters only)') || ' · ' || coalesce(cardinality(s.result_ids), 0) || ' found'
        from public.search_history s where s.user_id = p_user
      union all
      select l.created_at, 'like', case when l.is_super_like then 'Super liked ' else 'Liked ' end || o.name, null
        from public.likes l join other o on o.id = l.liked_id where l.liker_id = p_user
      union all
      select l.created_at, 'like', initcap(left(o.name, 1)) || substr(o.name, 2) || case when l.is_super_like then ' super liked them' else ' liked them' end, null
        from public.likes l join other o on o.id = l.liker_id where l.liked_id = p_user
      union all
      select m.created_at, 'match', 'Matched with ' || o.name, null
        from public.matches m join other o on o.id = case when m.user_a_id = p_user then m.user_b_id else m.user_a_id end
       where p_user in (m.user_a_id, m.user_b_id)
      union all
      select m.unmatched_at, 'match', case when m.unmatched_by = p_user then 'Unmatched ' else 'Unmatched by ' end || o.name, null
        from public.matches m join other o on o.id = case when m.user_a_id = p_user then m.user_b_id else m.user_a_id end
       where p_user in (m.user_a_id, m.user_b_id) and m.unmatched_at is not null
      union all
      select max(msg.created_at), 'message',
             'Sent ' || count(*) || ' message' || case when count(*) = 1 then '' else 's' end || ' to ' || min(o.name), null
        from public.messages msg
        join public.matches m on m.id = msg.match_id
        join other o on o.id = case when m.user_a_id = p_user then m.user_b_id else m.user_a_id end
       where msg.sender_id = p_user
       group by msg.match_id, date_trunc('day', msg.created_at)
      union all
      select r.created_at, 'safety', 'Reported ' || o.name, concat_ws(': ', r.reason, left(r.details, 140))
        from public.reports r join other o on o.id = r.reported_id where r.reporter_id = p_user
      union all
      select r.created_at, 'safety', 'Reported by ' || o.name, concat_ws(' · ', concat_ws(': ', r.reason, left(r.details, 140)), r.status)
        from public.reports r join other o on o.id = r.reporter_id where r.reported_id = p_user
      union all
      select b.created_at, 'safety', 'Blocked ' || o.name, null
        from public.blocks b join other o on o.id = b.blocked_id where b.blocker_id = p_user
      union all
      select b.created_at, 'safety', 'Blocked by ' || o.name, null
        from public.blocks b join other o on o.id = b.blocker_id where b.blocked_id = p_user
      union all
      select g.created_at, 'safety', 'Complained to the Grievance Officer', concat_ws(' · ', g.ticket, g.category, g.status)
        from public.grievances g where g.user_id = p_user
      union all
      select v.created_at, 'verification', 'Asked to be verified', null
        from public.verification_requests v where v.user_id = p_user
      union all
      select v.reviewed_at, 'verification',
             case v.status when 'approved' then 'Verified' when 'rejected' then 'Not verified' else 'Verification: ' || v.status end, v.admin_notes
        from public.verification_requests v where v.user_id = p_user and v.reviewed_at is not null
      union all
      select mi.created_at, 'profile',
             case mi.field when 'photo' then 'Added a photo' when 'description' then 'Wrote About me' else 'Wrote About my family' end,
             case when mi.field = 'photo' then mi.value else left(mi.value, 160) end
        from public.moderation_items mi where mi.user_id = p_user
      union all
      select mi.reviewed_at, 'profile',
             case when mi.status = 'approved' then 'Approved: ' else 'Not approved: ' end
               || case mi.field when 'photo' then 'photo' when 'description' then 'About me' else 'About my family' end,
             mi.reason
        from public.moderation_items mi where mi.user_id = p_user and mi.reviewed_at is not null
      union all
      select s.created_at, 'money', 'Started Shaadi24+ (' || s.plan_id || ')',
             concat_ws(' · ', case s.provider when 'app_store' then 'App Store' when 'google_play' then 'Google Play' else s.provider end, s.status)
        from public.subscriptions s where s.user_id = p_user
      union all
      select s.ended_at, 'money', 'Shaadi24+ ended (' || s.plan_id || ')', s.status
        from public.subscriptions s where s.user_id = p_user and s.ended_at is not null
      union all
      select coalesce(pay.paid_at, pay.created_at), 'money',
             case when pay.status in ('captured', 'refunded') then 'Paid ' else initcap(pay.status) || ': ' end
               || case when pay.currency = 'INR' then '₹' else pay.currency || ' ' end || to_char(pay.amount / 100.0, 'FM999,999,990.##'),
             case when pay.refunded_at is not null then 'refunded ' || to_char(pay.refunded_at, 'DD Mon YYYY') end
        from public.payments pay where pay.user_id = p_user
      union all
      select mm.created_at, 'team', 'Message from the team: ' || am.title,
             case when mm.clicked_at is not null then 'tapped' when mm.dismissed_at is not null then 'put off'
                  when mm.seen_at is not null then 'seen' else 'not seen yet' end
        from public.member_messages mm join public.admin_messages am on am.id = mm.message_id where mm.user_id = p_user
      union all
      select a.created_at, 'admin',
             case a.action
               when 'ban_user' then 'Banned' when 'unban_user' then 'Unbanned' when 'verify_user' then 'Verified by the team'
               when 'correct_date_of_birth' then 'Date of birth corrected' when 'review_risk' then 'Scam alert reviewed'
               else initcap(replace(a.action, '_', ' ')) end || coalesce(' by ' || nullif(a.admin_email, ''), ''),
             nullif(left(coalesce(a.details ->> 'reason', a.details ->> 'note', a.details ->> 'signal', ''), 160), '')
        from public.admin_audit a where a.target_user_id = p_user
      union all
      select d.created_at, 'device', 'Turned on notifications (' || d.platform || ')', 'app ' || d.app_version
        from public.push_devices d where d.user_id = p_user
      union all
      select x.exported_at, 'account', 'Downloaded their data', null
        from public.data_export_log x where x.user_id = p_user
    )
    select jsonb_build_object(
      'last_active', (select p.last_active_at from public.profiles p where p.id = p_user),
      'events', coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'title', e.title, 'detail', e.detail) order by e.at desc), '[]'::jsonb))
      from (select * from ev where at is not null order by at desc limit least(greatest(coalesce(p_limit, 300), 1), 1000)) e
  );
end;
$$;

-- ---- Growth --------------------------------------------------------------------------------------

create or replace function public.admin_growth(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from date := (now() at time zone 'Asia/Kolkata')::date - (v_days - 1);
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (
    with
    members as (select * from public.profiles where onboarding_complete and not coalesce(is_banned, false)),
    joined as (select * from public.profiles where (account_created at time zone 'Asia/Kolkata')::date >= v_from),
    days as (select generate_series(v_from, (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day),
    signups as (
      select (account_created at time zone 'Asia/Kolkata')::date as day, count(*) as n
        from public.profiles where (account_created at time zone 'Asia/Kolkata')::date >= v_from group by 1),
    actions as (
      select (created_at at time zone 'Asia/Kolkata')::date as day, user_id as uid from public.search_history
       where created_at >= v_from::timestamp at time zone 'Asia/Kolkata'
      union all
      select (created_at at time zone 'Asia/Kolkata')::date, liker_id from public.likes
       where created_at >= v_from::timestamp at time zone 'Asia/Kolkata'
      union all
      select (created_at at time zone 'Asia/Kolkata')::date, sender_id from public.messages
       where created_at >= v_from::timestamp at time zone 'Asia/Kolkata'),
    active as (select day, count(distinct uid) as n from actions group by day),
    breakdown(dimension, label, members, active) as (
      select 'city', coalesce(nullif(btrim(city), ''), 'Not given'), count(*), count(*) filter (where last_active_at > now() - interval '30 days')
        from members group by 2
      union all
      select 'community', coalesce(nullif(btrim(caste), ''), 'Not given'), count(*), count(*) filter (where last_active_at > now() - interval '30 days')
        from members group by 2
      union all
      select 'religion', coalesce(nullif(btrim(religion), ''), 'Not given'), count(*), count(*) filter (where last_active_at > now() - interval '30 days')
        from members group by 2
      union all
      select 'gender', coalesce(nullif(btrim(gender), ''), 'Not given'), count(*), count(*) filter (where last_active_at > now() - interval '30 days')
        from members group by 2
      union all
      select 'age', case when age is null then 'Not given' when age < 25 then '18–24' when age < 30 then '25–29'
                         when age < 35 then '30–34' when age < 40 then '35–39' else '40 and over' end,
             count(*), count(*) filter (where last_active_at > now() - interval '30 days')
        from members group by 2
    ),
    ranked as (
      select b.*, row_number() over (partition by dimension order by members desc, label) as rn from breakdown b
    )
    select jsonb_build_object(
      'days', v_days,
      'from', v_from,
      'members', (select count(*) from members),
      'active_1', (select count(*) from members where last_active_at > now() - interval '1 day'),
      'active_7', (select count(*) from members where last_active_at > now() - interval '7 days'),
      'active_30', (select count(*) from members where last_active_at > now() - interval '30 days'),
      'funnel', (
        select jsonb_build_array(
          jsonb_build_object('step', 'Joined', 'n', count(*)),
          jsonb_build_object('step', 'Finished sign-up', 'n', count(*) filter (where j.onboarding_complete)),
          jsonb_build_object('step', 'Has a photo', 'n', count(*) filter (where coalesce(cardinality(j.photo_urls), 0) > 0)),
          jsonb_build_object('step', 'Verified', 'n', count(*) filter (where j.is_verified)),
          jsonb_build_object('step', 'Liked someone', 'n', count(*) filter (where exists (select 1 from public.likes l where l.liker_id = j.id))),
          jsonb_build_object('step', 'Got a match', 'n', count(*) filter (where exists (
            select 1 from public.matches m where j.id in (m.user_a_id, m.user_b_id)))),
          jsonb_build_object('step', 'Sent a message', 'n', count(*) filter (where exists (select 1 from public.messages msg where msg.sender_id = j.id))),
          jsonb_build_object('step', 'Bought Shaadi24+', 'n', count(*) filter (where exists (
            select 1 from public.payments pay where pay.user_id = j.id and pay.status in ('captured', 'refunded'))
            or exists (select 1 from public.subscriptions s where s.user_id = j.id and s.status in ('active', 'authenticated')))))
          from joined j),
      'series', (
        select jsonb_agg(jsonb_build_object('day', d.day, 'signups', coalesce(s.n, 0), 'active', coalesce(a.n, 0)) order by d.day)
          from days d left join signups s on s.day = d.day left join active a on a.day = d.day),
      'breakdown', (
        select jsonb_object_agg(dimension, rows) from (
          select dimension, jsonb_agg(jsonb_build_object('label', label, 'members', members, 'active', active) order by rn) as rows
            from ranked where rn <= 12 group by dimension) x)
    )
  );
end;
$$;

-- ---- What members search for ----------------------------------------------------------------------

create or replace function public.admin_search_insights(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from date := (now() at time zone 'Asia/Kolkata')::date - (v_days - 1);
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  return (
    with s as (
      select *, lower(regexp_replace(btrim(coalesce(prompt, '')), '\s+', ' ', 'g')) as norm,
             coalesce(cardinality(result_ids), 0) as hits
        from public.search_history
       where created_at >= v_from::timestamp at time zone 'Asia/Kolkata'
    ),
    days as (select generate_series(v_from, (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day),
    per_day as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n, count(*) filter (where hits = 0) as none
                  from s group by 1),
    words as (
      select w, count(*) as n
        from s, regexp_split_to_table(s.norm, '[^a-z''\u0900-\u097f]+') w0, btrim(w0, '''') w
       where char_length(w) >= 3 and w !~ '''t$'  -- doesn't, don't, isn't
         and w <> all (array['the', 'and', 'for', 'who', 'with', 'from', 'that', 'someone', 'somebody', 'person', 'looking',
                             'find', 'want', 'wants', 'need', 'show', 'match', 'matches', 'partner', 'life', 'girl', 'boy',
                             'woman', 'man', 'women', 'men', 'lady', 'guy', 'like', 'likes', 'love', 'loves', 'good', 'nice',
                             'very', 'also', 'should', 'have', 'has', 'not', 'but', 'any', 'are', 'can', 'her', 'his', 'she',
                             'him', 'more', 'than', 'about', 'into', 'out', 'over', 'under', 'between', 'near', 'years', 'year',
                             'old', 'age', 'aged', 'who', 'whom', 'what', 'which', 'their', 'they', 'them', 'our', 'your',
                             'ki', 'ka', 'ke', 'hai', 'ho', 'aur', 'wali', 'wala', 'chahiye'])
       group by w)
    select jsonb_build_object(
      'days', v_days,
      'searches', (select count(*) from s),
      'searchers', (select count(distinct user_id) from s),
      'typed', (select count(*) from s where norm <> ''),
      'none_found', (select count(*) from s where hits = 0),
      'average_found', (select round(avg(hits)::numeric, 1) from s),
      'series', (select jsonb_agg(jsonb_build_object('day', d.day, 'searches', coalesce(p.n, 0), 'none_found', coalesce(p.none, 0)) order by d.day)
                   from days d left join per_day p on p.day = d.day),
      'top_words', (select coalesce(jsonb_agg(jsonb_build_object('word', w, 'n', n) order by n desc, w), '[]'::jsonb)
                      from (select * from words order by n desc, w limit 30) x),
      'top_searches', (select coalesce(jsonb_agg(jsonb_build_object('search', norm, 'n', n, 'found', hits) order by n desc, norm), '[]'::jsonb)
                         from (select norm, count(*) as n, round(avg(hits))::int as hits from s where norm <> ''
                                group by norm order by count(*) desc, norm limit 20) x),
      'none_found_searches', (select coalesce(jsonb_agg(jsonb_build_object('search', norm, 'n', n, 'last', last) order by last desc), '[]'::jsonb)
                                from (select norm, count(*) as n, max(created_at) as last from s where hits = 0 and norm <> ''
                                       group by norm order by max(created_at) desc limit 20) x),
      'filters', (select coalesce(jsonb_agg(jsonb_build_object('filter', k, 'n', n) order by n desc, k), '[]'::jsonb)
                    from (select f.key as k, count(*) as n
                            from s, jsonb_each(coalesce(s.filters, '{}'::jsonb)) f
                           where f.value not in ('false'::jsonb, 'null'::jsonb, '[]'::jsonb, '""'::jsonb, '{}'::jsonb, '0'::jsonb)
                           group by f.key) x)
    )
  );
end;
$$;

-- ---- Success stories --------------------------------------------------------------------------------

create table if not exists public.success_stories (
  id uuid primary key default gen_random_uuid(),
  names text not null check (char_length(btrim(names)) between 2 and 80),     -- "Priya & Arjun"
  place text not null default '' check (char_length(place) <= 80),
  married_on date,
  story text not null check (char_length(btrim(story)) between 20 and 1500),
  photo_url text check (photo_url is null or photo_url ~ '^https?://'),
  photo_alt text not null default '' check (char_length(photo_alt) <= 200),
  consent_note text not null default '' check (char_length(consent_note) <= 300),  -- how both partners agreed
  published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Shown on the website only once both partners have agreed
  constraint stories_published_with_consent check (not published or char_length(btrim(consent_note)) >= 5)
);
alter table public.success_stories enable row level security;

drop policy if exists "Anyone reads published stories" on public.success_stories;
create policy "Anyone reads published stories" on public.success_stories
  for select to anon, authenticated
  using (published);

drop policy if exists "Admins manage stories" on public.success_stories;
create policy "Admins manage stories" on public.success_stories
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.success_stories to anon, authenticated;
grant insert, update, delete on public.success_stories to authenticated;

-- Publishing, unpublishing and deleting go in the admin log
create or replace function public.success_stories_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
  row_ public.success_stories;
begin
  if tg_op = 'DELETE' then act := 'delete_story'; row_ := old;
  elsif tg_op = 'INSERT' and new.published then act := 'publish_story'; row_ := new;
  elsif tg_op = 'UPDATE' and new.published is distinct from old.published then
    act := case when new.published then 'publish_story' else 'unpublish_story' end; row_ := new;
  else
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if auth.uid() is not null then
    insert into public.admin_audit (admin_id, admin_email, action, details)
    values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), act, jsonb_build_object('story_id', row_.id, 'names', row_.names));
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.success_stories_audit() from public, anon, authenticated;

drop trigger if exists success_stories_audit on public.success_stories;
create trigger success_stories_audit before insert or update or delete on public.success_stories
  for each row execute function public.success_stories_audit();

-- Couples can send their story through the contact form
alter table public.enquiries drop constraint if exists enquiries_topic_check;
alter table public.enquiries add constraint enquiries_topic_check
  check (topic in ('general', 'account', 'subscription', 'safety', 'partnership', 'press', 'story', 'other'));

-- ---- Who may call what -------------------------------------------------------------------------------

revoke all on function public.admin_member_timeline(uuid, integer) from public, anon;
revoke all on function public.admin_growth(integer) from public, anon;
revoke all on function public.admin_search_insights(integer) from public, anon;
grant execute on function public.admin_member_timeline(uuid, integer), public.admin_growth(integer),
  public.admin_search_insights(integer) to authenticated;
