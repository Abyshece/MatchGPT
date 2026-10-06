-- ============================================================================
-- Phase 10, part 9 (2 of 2): one more free AI search a day for each profile
-- section complete (profiles.search_bonus, part 1): free accounts get 3 a day
-- plus up to 6. Shaadi24+ stays unlimited.
-- ============================================================================

-- Daily search limit: 3 a day plus one per completed section; Shaadi24+ is
-- unlimited. Returns {"allowed", "remaining" (null when unlimited), "limit"}
create or replace function public.consume_search(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_count integer;
  v_date date;
  v_limit integer;
begin
  select subscription_tier, coalesce(daily_search_count, 0), last_search_date, 3 + coalesce(search_bonus, 0)
    into v_tier, v_count, v_date, v_limit
    from public.profiles
   where id = p_user_id
     for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  if v_tier = 'PRO' then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null);
  end if;

  if v_date is distinct from current_date then
    v_count := 0;
  end if;
  if v_count >= v_limit then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', v_limit);
  end if;

  update public.profiles
     set daily_search_count = v_count + 1,
         last_search_date = current_date
   where id = p_user_id;
  return jsonb_build_object('allowed', true, 'remaining', v_limit - v_count - 1, 'limit', v_limit);
end;
$$;

revoke execute on function public.consume_search(uuid) from public, anon, authenticated;
grant execute on function public.consume_search(uuid) to service_role;

-- The profiles there are now (from now on the trigger keeps it)
update public.profiles p
   set search_bonus = public.profile_search_bonus(p)
 where public.profile_search_bonus(p) > 0;
