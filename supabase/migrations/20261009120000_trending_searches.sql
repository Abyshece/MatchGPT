-- ============================================================================
-- Find Match's "Trending" pills: what members near you search for
--
--   - searches from the last 30 days that found someone, by members in the
--     same city first, then the same state, the same country, then anywhere,
--     until there are 7
--   - a search shows only once at least 2 different members have made it, and
--     only if it's short (at most 40 letters) plain words: no runs of digits
--     (phone numbers), no email addresses or links, nothing the word filter
--     refuses
--   - never who searched; the same words in other capitals or spacing count
--     as one search, shown the way it was last typed
--   - signed-in members only (it reads the caller's city)
-- ============================================================================

create or replace function public.trending_searches()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  me record;
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_scope text;
  v_place text;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see what''s trending' using errcode = '42501';
  end if;
  select nullif(trim(city), '') as city, nullif(trim(state), '') as state, nullif(trim(country), '') as country
    into me from profiles where id = auth.uid();

  for v_scope, v_place in
    select s, p from (values (1, 'city', me.city), (2, 'state', me.state), (3, 'country', me.country), (4, 'all', null::text)) v(o, s, p)
     where s = 'all' or p is not null
     order by o
  loop
    for r in
      with recent as (
        select h.user_id, trim(h.prompt) as prompt, h.created_at,
               lower(regexp_replace(regexp_replace(trim(h.prompt), '[[:space:]]+', ' ', 'g'), '[.!?,]+$', '')) as norm
          from search_history h
          join profiles p on p.id = h.user_id
         where h.created_at > now() - interval '30 days'
           and coalesce(cardinality(h.result_ids), 0) > 0
           and length(trim(h.prompt)) between 3 and 40
           and h.prompt !~ '[0-9]{4,}'
           and h.prompt !~* '(@|https?:|www\.|\.(com|in|net|org)\M)'
           and not coalesce(p.is_banned, false)
           and case v_scope
                 when 'city' then lower(trim(p.city)) = lower(me.city)
                                  and lower(coalesce(trim(p.country), '')) = lower(coalesce(me.country, ''))
                 when 'state' then lower(trim(p.state)) = lower(me.state)
                                   and lower(coalesce(trim(p.country), '')) = lower(coalesce(me.country, ''))
                 when 'country' then lower(trim(p.country)) = lower(me.country)
                 else true
               end
      )
      select norm, (array_agg(prompt order by created_at desc))[1] as shown,
             count(distinct user_id) as people, count(*) as times, max(created_at) as latest
        from recent
       where norm <> all (v_seen)
       group by norm
      having count(distinct user_id) >= 2
       order by people desc, times desc, latest desc
       limit 20
    loop
      exit when jsonb_array_length(v_out) >= 7;
      continue when public.has_objectionable_words(r.shown);
      v_seen := v_seen || r.norm;
      v_out := v_out || jsonb_build_object('prompt', r.shown, 'scope', v_scope,
        'place', case v_scope when 'all' then null else v_place end, 'people', r.people);
    end loop;
    exit when jsonb_array_length(v_out) >= 7;
  end loop;

  return jsonb_build_object('city', me.city, 'state', me.state, 'country', me.country, 'searches', v_out);
end;
$$;

comment on function public.trending_searches() is
  'Find Match''s Trending pills: searches made by at least 2 members near the caller (city, then state, country, anywhere) in the last 30 days, never who made them.';

revoke all on function public.trending_searches() from public, anon;
grant execute on function public.trending_searches() to authenticated;
