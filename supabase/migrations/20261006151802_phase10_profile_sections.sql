-- ============================================================================
-- Phase 10, part 9 (1 of 2): the profile's six sections, and the count of
-- those complete. Each section a member completes (about 70% of its answers
-- given) earns one more free AI search a day (part 2: consume_search()).
--
--   community   Religion & community: caste, sub-caste, sect, gotra, open to
--               other communities, languages, and the horoscope for the
--               religions that use one (Hindu, Jain, Sikh, Buddhist)
--   career      Education & career: degree, college, employed in, and for
--               those who work: job title, workplace, work style; income
--   family      Family: type, status, values, parents' occupations,
--               brothers, sisters, where they live, living with them,
--               closeness, about the family
--   lifestyle   Lifestyle: diet, drinking, smoking, exercise, sleep, cooking,
--               hobbies, reading, sports, travel
--   appearance  Appearance: body type, hair, eyes, glasses, tattoos, style
--   plans       Plans & personality: marriage timeline, children, settling
--               abroad, love language, social battery, attachment and
--               conflict style, money, the future, dream home, pets
--
-- profile_sections() says where each section stands (for My Profile, through
-- my_profile_sections()); profiles.search_bonus keeps the count, set by the
-- database on every change, so members can't set it. The required answers
-- (name, date of birth, religion, mother tongue, …) are asked by the apps
-- before anything else and don't count here.
-- ============================================================================

-- An answer counts when it says something
create or replace function public.profile_answered(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_value is not null and btrim(p_value) <> '' and p_value <> 'Not specified';
$$;

create or replace function public.profile_sections(p public.profiles)
returns jsonb
language sql
immutable
set search_path = public
as $$
  with field(section, n, key, value, applies) as (values
    ('community', 1, 'caste', p.caste, true),
    ('community', 2, 'sub_caste', p.sub_caste, coalesce(p.caste, '') not in ('', 'Prefer not to say')),
    ('community', 3, 'sect', p.sect, p.religion in ('Muslim', 'Christian')),
    ('community', 4, 'gotra', p.gotra, p.religion in ('Hindu', 'Jain', 'Sikh')),
    ('community', 5, 'open_to_other_communities', p.open_to_other_communities, true),
    ('community', 6, 'languages', p.languages, true),
    ('community', 7, 'manglik', p.manglik, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),
    ('community', 8, 'rashi', p.rashi, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),
    ('community', 9, 'nakshatra', p.nakshatra, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),
    ('community', 10, 'birth_time', p.birth_time, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),
    ('community', 11, 'birth_place', p.birth_place, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),
    ('community', 12, 'horoscope_match', p.horoscope_match, p.religion in ('Hindu', 'Jain', 'Sikh', 'Buddhist')),

    ('career', 1, 'degree', p.degree, true),
    ('career', 2, 'university', p.university, true),
    ('career', 3, 'employed_in', p.employed_in, true),
    ('career', 4, 'job_title', p.job_title, coalesce(p.employed_in, '') <> 'Not working'),
    ('career', 5, 'work', p.work, coalesce(p.employed_in, '') <> 'Not working'),
    ('career', 6, 'work_style', p.work_style, coalesce(p.employed_in, '') <> 'Not working'),
    ('career', 7, 'annual_income', p.annual_income, true),

    ('family', 1, 'family_type', p.family_type, true),
    ('family', 2, 'family_status', p.family_status, true),
    ('family', 3, 'family_values', p.family_values, true),
    ('family', 4, 'father_occupation', p.father_occupation, true),
    ('family', 5, 'mother_occupation', p.mother_occupation, true),
    ('family', 6, 'brothers', p.brothers, true),
    ('family', 7, 'sisters', p.sisters, true),
    ('family', 8, 'family_location', p.family_location, true),
    ('family', 9, 'living_with_family', p.living_with_family, true),
    ('family', 10, 'family_closeness', p.family_closeness, true),
    ('family', 11, 'about_family', p.about_family, true),

    ('lifestyle', 1, 'dietary_preferences', p.dietary_preferences, true),
    ('lifestyle', 2, 'drinking', p.drinking, true),
    ('lifestyle', 3, 'smoking', p.smoking, true),
    ('lifestyle', 4, 'gym_routine', p.gym_routine, true),
    ('lifestyle', 5, 'sleep_schedule', p.sleep_schedule, true),
    ('lifestyle', 6, 'can_cook', p.can_cook, true),
    ('lifestyle', 7, 'hobbies', p.hobbies, true),
    ('lifestyle', 8, 'reading_interest', p.reading_interest, true),
    ('lifestyle', 9, 'sports_interest', p.sports_interest, true),
    ('lifestyle', 10, 'loves_travel', p.loves_travel, true),
    ('lifestyle', 11, 'travel_style', p.travel_style, true),

    ('appearance', 1, 'body_type', p.body_type, true),
    ('appearance', 2, 'hair_color', p.hair_color, true),
    ('appearance', 3, 'hair_type', p.hair_type, true),
    ('appearance', 4, 'eye_color', p.eye_color, true),
    ('appearance', 5, 'wears_glasses', p.wears_glasses, true),
    ('appearance', 6, 'has_tattoos', p.has_tattoos, true),
    ('appearance', 7, 'clothing_style', p.clothing_style, true),

    ('plans', 1, 'marriage_timeline', p.marriage_timeline, true),
    ('plans', 2, 'family_plans', p.family_plans, true),
    ('plans', 3, 'settling_abroad', p.settling_abroad, true),
    ('plans', 4, 'love_language', p.love_language, true),
    ('plans', 5, 'social_battery', p.social_battery, true),
    ('plans', 6, 'attachment_style', p.attachment_style, true),
    ('plans', 7, 'conflict_resolution', p.conflict_resolution, true),
    ('plans', 8, 'financial_approach', p.financial_approach, true),
    ('plans', 9, 'future_plans', p.future_plans, true),
    ('plans', 10, 'dream_house_type', p.dream_house_type, true),
    ('plans', 11, 'pets', p.pets, true)
  ),
  section(id, n, title) as (values
    ('community', 1, 'Religion & community'),
    ('career', 2, 'Education & career'),
    ('family', 3, 'Family'),
    ('lifestyle', 4, 'Lifestyle'),
    ('appearance', 5, 'Appearance'),
    ('plans', 6, 'Plans & personality')
  ),
  counted as (
    select s.id, s.n, s.title,
           jsonb_agg(jsonb_build_object('key', f.key, 'answered', public.profile_answered(f.value)) order by f.n) as fields,
           count(*) filter (where public.profile_answered(f.value))::int as answered,
           count(*)::int as total
      from section s
      join field f on f.section = s.id and f.applies
     group by s.id, s.n, s.title
  )
  select jsonb_agg(jsonb_build_object(
           'id', id, 'title', title, 'fields', fields, 'answered', answered, 'total', total,
           'needed', ceil(total * 0.7)::int, 'complete', answered >= ceil(total * 0.7)) order by n)
    from counted;
$$;

-- How many sections are complete: one more free search a day for each
create or replace function public.profile_search_bonus(p public.profiles)
returns smallint
language sql
immutable
set search_path = public
as $$
  select count(*)::smallint
    from jsonb_array_elements(public.profile_sections(p)) s
   where (s ->> 'complete')::boolean;
$$;

alter table public.profiles add column if not exists search_bonus smallint not null default 0;
comment on column public.profiles.search_bonus is
  'Profile sections completed, each one more free search a day (profile_sections()); set by the database.';

-- Set on every change, after the derived fields (triggers run in name order);
-- whatever a member sends for it is replaced
create or replace function public.profiles_set_search_bonus()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_bonus := public.profile_search_bonus(new);
  return new;
end;
$$;

create or replace trigger profiles_search_bonus
  before insert or update on public.profiles
  for each row execute function public.profiles_set_search_bonus();

-- The signed-in member's sections, for My Profile
create or replace function public.my_profile_sections()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'sections', public.profile_sections(p),
           'bonus', p.search_bonus,
           'daily_searches', 3 + p.search_bonus)
    from public.profiles p
   where p.id = auth.uid();
$$;

revoke execute on function public.my_profile_sections() from public, anon;
grant execute on function public.my_profile_sections() to authenticated;
-- The trigger runs as the member saving their profile, so members keep these
revoke execute on function public.profile_answered(text), public.profile_sections(public.profiles),
  public.profile_search_bonus(public.profiles) from public, anon;
grant execute on function public.profile_answered(text), public.profile_sections(public.profiles),
  public.profile_search_bonus(public.profiles) to authenticated, service_role;
revoke execute on function public.profiles_set_search_bonus() from public, anon, authenticated;
