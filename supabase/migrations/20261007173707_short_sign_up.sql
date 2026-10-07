-- ============================================================================
-- A short sign-up, and profile sections that fit India
--
-- Sign-up now asks only what families judge a match on first (name, age,
-- gender, marital status, height, where they live, religion, mother tongue,
-- education, occupation) and one photo. "About me" and everything else is
-- optional, in the six sections of My Profile, and each section completed
-- still earns one more free AI search a day (consume_search()).
--
-- The sections change to match what's asked now (the research is in
-- docs/research/profile-questions.md):
--   about   About you, in place of Appearance: About me (at least 30
--           characters, as before), where you grew up, body type ("Prefer
--           not to say" counts). Hair, eyes, glasses, tattoos and style
--           aren't asked any more.
--   plans   Plans & values: love language, attachment style and dream home
--           aren't asked any more.
-- Religion & community, Education & career, Family and Lifestyle stay as
-- they were. Answers already given to the questions no longer asked stay in
-- the database (and in "Download my data") but don't count and aren't shown.
-- ============================================================================

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

    -- About me counts once it's a few sentences (as the app asks)
    ('about', 1, 'description', case when length(btrim(coalesce(p.description, ''))) >= 30 then p.description end, true),
    ('about', 2, 'hometown', p.hometown, true),
    ('about', 3, 'body_type', p.body_type, true),

    ('plans', 1, 'marriage_timeline', p.marriage_timeline, true),
    ('plans', 2, 'family_plans', p.family_plans, true),
    ('plans', 3, 'settling_abroad', p.settling_abroad, true),
    ('plans', 4, 'social_battery', p.social_battery, true),
    ('plans', 5, 'conflict_resolution', p.conflict_resolution, true),
    ('plans', 6, 'financial_approach', p.financial_approach, true),
    ('plans', 7, 'future_plans', p.future_plans, true),
    ('plans', 8, 'pets', p.pets, true)
  ),
  -- About you first: About me is what people read first
  section(id, n, title) as (values
    ('about', 1, 'About you'),
    ('community', 2, 'Religion & community'),
    ('career', 3, 'Education & career'),
    ('family', 4, 'Family'),
    ('lifestyle', 5, 'Lifestyle'),
    ('plans', 6, 'Plans & values')
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

-- Everyone's count, under the new sections (the trigger sets it on every update)
update public.profiles set search_bonus = public.profile_search_bonus(profiles);

-- When the pop-up offering free searches for filling in the profile last
-- showed (ProfileRewardsPopup: after sign-up, then at most every three days
-- until every section is complete). Kept with the profile rather than on the
-- phone, so it doesn't come back on another device.
alter table public.profiles add column if not exists profile_nudged_at timestamptz;
