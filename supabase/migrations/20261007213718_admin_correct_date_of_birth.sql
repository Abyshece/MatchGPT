-- ============================================================================
-- Correcting a date of birth (Admin → Users)
--
-- Members younger than the legal age to marry see "Shaadi24 is for 21 and
-- over" and are asked to write to support if their date of birth is wrong.
-- Support had no way to correct it, and the member could still change it
-- through the API. Now:
--   1. An account under the legal age can't change its own date of birth,
--      typed age or gender: only support can, so typing an older year
--      doesn't let someone in.
--   2. admin_correct_date_of_birth(): an admin corrects it after seeing an ID,
--      with a note in the audit log. The legal-age rule still applies. A
--      profile hidden only by that rule (a member's own pause has a time)
--      becomes visible again.
--   3. admin_find_users(): admin_search_users() with the date of birth,
--      gender and whether the profile is hidden. A new name, so nothing is
--      dropped and the admin panel works before and after its update.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The legal-age rule
-- ---------------------------------------------------------------------------
create or replace function public.profiles_legal_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Shaadi24 is for marriage only (Terms, section 1)
  new.dating_intention := 'Marriage';
  -- Someone under the legal age changes their date of birth, typed age or
  -- gender only through support (admin_correct_date_of_birth). The daily
  -- birthday job and admins aren't members, so this doesn't stop them.
  if tg_op = 'UPDATE' and current_user in ('anon', 'authenticated')
     and old.age is not null
     and old.age < (case when coalesce(old.gender, '') = 'Female' then 18 else 21 end)
     and (new.date_of_birth is distinct from old.date_of_birth
          or new.gender is distinct from old.gender
          or (old.date_of_birth is null and new.age is distinct from old.age)) then
    raise exception 'Only Shaadi24 support can correct the date of birth or gender of an account under the legal age to marry'
      using errcode = '42501';  -- insufficient_privilege
  end if;
  -- The legal age to marry in India: 21 for men, 18 for women (the age check
  -- constraint), 21 for any other gender. Refused when a date of birth, gender
  -- or (without a date of birth) an age is given or changed. Members already
  -- younger stay paused, hidden from everyone, and the app asks them to come
  -- back at 21
  if new.age is not null and coalesce(new.gender, '') <> 'Female' and new.age < 21 then
    if tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth
       or new.gender is distinct from old.gender
       or (new.date_of_birth is null and new.age is distinct from old.age) then
      raise exception 'Shaadi24 is for women of 18 or older and men of 21 or older, the legal ages to marry in India'
        using errcode = 'check_violation';
    end if;
    new.is_paused := true;
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_legal_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Support corrects a date of birth
-- ---------------------------------------------------------------------------
create or replace function public.admin_correct_date_of_birth(target_id uuid, new_date_of_birth date, note text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  admin_email_val text;
  old_date_of_birth date;
  hidden_by_age boolean;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can correct a date of birth';
  end if;
  if new_date_of_birth is null or new_date_of_birth >= current_date then
    raise exception 'Enter a date of birth in the past' using errcode = '22023';
  end if;
  if coalesce(btrim(note), '') = '' then
    raise exception 'Say how the date of birth was checked (it goes in the audit log)' using errcode = '22023';
  end if;

  select date_of_birth, coalesce(is_paused, false) and paused_at is null
    into old_date_of_birth, hidden_by_age
    from public.profiles where id = target_id;
  if not found then
    raise exception 'No such member' using errcode = 'P0002';
  end if;
  select email into admin_email_val from public.profiles where id = auth.uid();

  -- The age follows (profiles_derive_fields); a date still under the legal
  -- age is refused (profiles_legal_rules)
  update public.profiles set date_of_birth = new_date_of_birth where id = target_id;
  if hidden_by_age then
    update public.profiles set is_paused = false where id = target_id;
  end if;

  insert into public.admin_audit (admin_id, admin_email, action, target_user_id, details)
  values (auth.uid(), admin_email_val, 'correct_date_of_birth', target_id,
          jsonb_build_object('from', old_date_of_birth, 'to', new_date_of_birth, 'note', btrim(note)));
end;
$function$;
revoke execute on function public.admin_correct_date_of_birth(uuid, date, text) from public, anon;
grant execute on function public.admin_correct_date_of_birth(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin → Users: the date of birth, gender and whether the profile is hidden
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_users(p_query text default '', p_limit integer default 50)
returns table (
  id uuid, email text, name text, age integer, location text, subscription_tier text,
  is_verified boolean, is_banned boolean, banned_at timestamptz, ban_reason text,
  account_created timestamptz, daily_search_count integer, daily_like_count integer,
  date_of_birth date, gender text, is_paused boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := coalesce(trim(p_query), '');
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select p.id, p.email, p.name, p.age, p.location, p.subscription_tier,
         p.is_verified, p.is_banned, p.banned_at, p.ban_reason,
         p.account_created, p.daily_search_count, p.daily_like_count,
         p.date_of_birth, p.gender, coalesce(p.is_paused, false)
    from public.profiles p
   where q = '' or p.name ilike '%' || q || '%' or p.email ilike '%' || q || '%'
   order by p.account_created desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke execute on function public.admin_find_users(text, integer) from public, anon;
grant execute on function public.admin_find_users(text, integer) to authenticated;
