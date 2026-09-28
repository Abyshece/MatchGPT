-- Phase 12: the profile details Indian families look for.
--
-- New optional profile answers, taken from the sign-up forms of India's big
-- matrimony sites (Shaadi.com, BharatMatrimony, Jeevansathi): who created the
-- profile, date of birth, marital status, mother tongue, community (caste,
-- sub-caste, sect, gotra), horoscope, degree, occupation, income, structured
-- location, family and more. All are optional and can be hidden like any
-- other answer.
--
-- 1. The new columns, with length limits
-- 2. Worked out by the database, so they can't disagree with what people chose:
--    age from the date of birth, height in cm from the height, and the
--    location text from city, state and country. Ages move on at each birthday
--    (daily job, India time).
-- 3. Existing answers tidied into the new shapes: heights to the new list,
--    "No children" to "No", and "City, XX" locations to city, state and
--    country where that's certain.
-- 4. search_candidates() returns the new answers, never the date of birth, and
--    no longer returns the cannabis, other-drugs and relationship-type answers,
--    which the app no longer asks or shows (the columns stay).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column profile_created_for text,
  add column date_of_birth date,
  add column marital_status text,
  add column children_count text,
  add column height_cm smallint,
  add column disability text,
  add column mother_tongue text,
  add column caste text,
  add column sub_caste text,
  add column sect text,
  add column open_to_other_communities text,
  add column gotra text,
  add column manglik text,
  add column rashi text,
  add column nakshatra text,
  add column birth_time text,
  add column birth_place text,
  add column horoscope_match text,
  add column degree text,
  add column employed_in text,
  add column occupation text,
  add column annual_income text,
  add column country text,
  add column state text,
  add column city text,
  add column residential_status text,
  add column settling_abroad text,
  add column family_type text,
  add column family_status text,
  add column family_values text,
  add column father_occupation text,
  add column mother_occupation text,
  add column brothers text,
  add column brothers_married text,
  add column sisters text,
  add column sisters_married text,
  add column family_location text,
  add column living_with_family text,
  add column about_family text;

comment on column public.profiles.date_of_birth is
  'Private: only the age worked out from it is shown to other people.';
comment on column public.profiles.height_cm is
  'Worked out from height by profiles_derive_fields(); used by the height filter.';

do $$
declare
  limits constant jsonb := '{
    "profile_created_for": 40, "marital_status": 40, "children_count": 10, "disability": 60,
    "mother_tongue": 60, "caste": 80, "sub_caste": 80, "sect": 80, "open_to_other_communities": 60,
    "gotra": 60, "manglik": 40, "rashi": 40, "nakshatra": 60, "birth_place": 100,
    "horoscope_match": 40, "degree": 120, "employed_in": 60, "occupation": 100,
    "annual_income": 40, "country": 60, "state": 60, "city": 80, "residential_status": 40,
    "settling_abroad": 60, "family_type": 40, "family_status": 40, "family_values": 40,
    "father_occupation": 60, "mother_occupation": 60, "family_location": 100,
    "living_with_family": 40, "about_family": 1000
  }';
  col text;
begin
  for col in select jsonb_object_keys(limits) loop
    execute format(
      'alter table public.profiles add constraint %I check (%I is null or length(%I) <= %s)',
      'profiles_' || col || '_length', col, col, limits ->> col);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_birth_time_format
    check (birth_time is null or birth_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint profiles_sibling_counts check (
    (brothers is null or brothers in ('0', '1', '2', '3', '3+'))
    and (brothers_married is null or brothers_married in ('0', '1', '2', '3', '3+'))
    and (sisters is null or sisters in ('0', '1', '2', '3', '3+'))
    and (sisters_married is null or sisters_married in ('0', '1', '2', '3', '3+'))),
  add constraint profiles_height_cm_range check (height_cm is null or height_cm between 100 and 250);

-- ---------------------------------------------------------------------------
-- 2. Worked out by the database
-- ---------------------------------------------------------------------------

-- Height in cm from what people chose or typed: 5' 8" (173 cm), 5'8", 5 ft 8,
-- 173 cm, 173. Null when it can't be read or is outside 100-250 cm.
create or replace function public.height_to_cm(p_height text)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
  cm numeric;
begin
  if p_height is null or btrim(p_height) = '' then
    return null;
  end if;
  m := regexp_match(lower(p_height), '^\s*([3-7])\s*(?:''|’|ft|feet|foot)\s*(?:([0-9]|1[01])(?![0-9]))?');
  if m is not null then
    cm := (m[1]::int * 12 + coalesce(m[2]::int, 0)) * 2.54;
  else
    m := regexp_match(lower(p_height), '^\s*([12][0-9]{2})\s*(?:cm|cms)?\s*$');
    if m is not null then
      cm := m[1]::int;
    end if;
  end if;
  if cm is null or cm < 100 or cm > 250 then
    return null;
  end if;
  return round(cm)::smallint;
end;
$$;

-- The height list's label for a height in cm: 5' 8" (173 cm).
create or replace function public.height_label(p_cm integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cm is null then null else
    (round(p_cm / 2.54)::int / 12) || ''' ' || (round(p_cm / 2.54)::int % 12) || '" ('
      || round(round(p_cm / 2.54) * 2.54) || ' cm)'
  end;
$$;

-- Age in whole years on today's date in India.
create or replace function public.age_on_today(p_date_of_birth date)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age((now() at time zone 'Asia/Kolkata')::date, p_date_of_birth))::integer;
$$;

-- Runs before every insert and update (named so it runs before
-- protect_profile_fields; triggers run in name order).
create or replace function public.profiles_derive_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  place text;
begin
  -- Age follows the date of birth; the age check (18-99) then applies to it
  if new.date_of_birth is not null then
    new.age := public.age_on_today(new.date_of_birth);
  end if;

  new.height_cm := public.height_to_cm(new.height);

  -- The location text everyone sees: "City, State" in India, "City, Country"
  -- abroad. Only when city, state or country changed, so an older typed
  -- location stays as it was until then.
  if tg_op = 'INSERT'
     or new.city is distinct from old.city
     or new.state is distinct from old.state
     or new.country is distinct from old.country then
    place := concat_ws(', ',
      nullif(btrim(new.city), ''),
      case when coalesce(nullif(btrim(new.country), ''), 'India') = 'India'
        then nullif(btrim(new.state), '')
        else nullif(btrim(new.country), '')
      end);
    if place <> '' then
      new.location := place;
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_derive_fields
  before insert or update on public.profiles
  for each row execute function public.profiles_derive_fields();

-- Daily at 00:05 India time (18:35 UTC): ages move on at birthdays.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('birthday-ages', '35 18 * * *',
      $job$update public.profiles set age = public.age_on_today(date_of_birth)
           where date_of_birth is not null and age is distinct from public.age_on_today(date_of_birth)$job$);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Existing answers in the new shapes
-- ---------------------------------------------------------------------------

-- Heights that can be read become the list's label (5'2" -> 5' 2" (157 cm)).
update public.profiles
   set height = public.height_label(public.height_to_cm(height))
 where public.height_to_cm(height) is not null
   and height is distinct from public.height_label(public.height_to_cm(height));

-- Children: "No children" is the new "No". "Has children" stays until the
-- person says whether the children live with them.
update public.profiles set children = 'No' where children = 'No children';

-- "City, XX" with an Indian state code, and a few places outside India.
with codes (code, state) as (values
  ('AN', 'Andaman and Nicobar Islands'), ('AP', 'Andhra Pradesh'), ('AR', 'Arunachal Pradesh'),
  ('AS', 'Assam'), ('BR', 'Bihar'), ('CH', 'Chandigarh'), ('CG', 'Chhattisgarh'), ('CT', 'Chhattisgarh'),
  ('DL', 'Delhi'), ('GA', 'Goa'), ('GJ', 'Gujarat'), ('HR', 'Haryana'), ('HP', 'Himachal Pradesh'),
  ('JK', 'Jammu and Kashmir'), ('JH', 'Jharkhand'), ('KA', 'Karnataka'), ('KL', 'Kerala'),
  ('LA', 'Ladakh'), ('MP', 'Madhya Pradesh'), ('MH', 'Maharashtra'), ('MN', 'Manipur'),
  ('ML', 'Meghalaya'), ('MZ', 'Mizoram'), ('NL', 'Nagaland'), ('OD', 'Odisha'), ('OR', 'Odisha'),
  ('PY', 'Puducherry'), ('PB', 'Punjab'), ('RJ', 'Rajasthan'), ('SK', 'Sikkim'), ('TN', 'Tamil Nadu'),
  ('TG', 'Telangana'), ('TS', 'Telangana'), ('TR', 'Tripura'), ('UP', 'Uttar Pradesh'),
  ('UT', 'Uttarakhand'), ('WB', 'West Bengal')),
parsed as (
  select id,
         -- "mumbai" -> "Mumbai"; anything already capitalised stays as typed
         case when btrim(split_part(location, ',', 1)) = lower(btrim(split_part(location, ',', 1)))
           then initcap(btrim(split_part(location, ',', 1))) else btrim(split_part(location, ',', 1)) end as city,
         upper(btrim(split_part(location, ',', 2))) as code
  from public.profiles
  where location ~ '^[^,]+,\s*[A-Za-z]{2}\s*$' and city is null and state is null and country is null)
update public.profiles p
   set city = parsed.city,
       state = coalesce(codes.state, case parsed.code when 'CA' then 'California' when 'NY' then 'New York' when 'ON' then 'Ontario' end),
       country = case when codes.state is not null then 'India'
                      when parsed.code in ('CA', 'NY') then 'United States'
                      when parsed.code = 'ON' then 'Canada'
                      when parsed.code = 'UK' then 'United Kingdom' end
  from parsed left join codes on codes.code = parsed.code
 where p.id = parsed.id
   and (codes.state is not null or parsed.code in ('CA', 'NY', 'ON', 'UK'));

-- A big Indian city on its own ("Mumbai"), or a country ("Singapore").
with places (place, city, state, country) as (values
  ('mumbai', 'Mumbai', 'Maharashtra', 'India'), ('delhi', 'Delhi', 'Delhi', 'India'),
  ('new delhi', 'New Delhi', 'Delhi', 'India'), ('bangalore', 'Bangalore', 'Karnataka', 'India'),
  ('bengaluru', 'Bengaluru', 'Karnataka', 'India'), ('hyderabad', 'Hyderabad', 'Telangana', 'India'),
  ('chennai', 'Chennai', 'Tamil Nadu', 'India'), ('kolkata', 'Kolkata', 'West Bengal', 'India'),
  ('pune', 'Pune', 'Maharashtra', 'India'), ('ahmedabad', 'Ahmedabad', 'Gujarat', 'India'),
  ('jaipur', 'Jaipur', 'Rajasthan', 'India'), ('lucknow', 'Lucknow', 'Uttar Pradesh', 'India'),
  ('gurgaon', 'Gurgaon', 'Haryana', 'India'), ('gurugram', 'Gurugram', 'Haryana', 'India'),
  ('noida', 'Noida', 'Uttar Pradesh', 'India'), ('chandigarh', 'Chandigarh', 'Chandigarh', 'India'),
  ('singapore', null, null, 'Singapore'), ('dubai', 'Dubai', null, 'United Arab Emirates'),
  ('london', 'London', null, 'United Kingdom'))
update public.profiles p
   set city = places.city, state = places.state, country = places.country
  from places
 where lower(btrim(p.location)) = places.place
   and p.city is null and p.state is null and p.country is null;

-- ---------------------------------------------------------------------------
-- 4. Search pool with the new answers
-- ---------------------------------------------------------------------------
create or replace function public.search_candidates(
  p_user_id uuid,
  p_ids uuid[] default null,
  p_exclude_liked boolean default false,
  p_limit integer default 5000)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  from (
    select
      p.id, p.name, p.age, p.location, p.hometown, p.description, p.photo_urls,
      p.is_verified, p.subscription_tier, p.gender, p.interested_in, p.hidden_fields,
      case when p.settings_show_online is false then null else p.last_active_at end as last_active_at,
      p.settings_show_online, p.linkedin, p.instagram,
      p.job_title, p.work, p.work_style, p.university, p.education_level,
      p.height, p.body_type, p.hair_color, p.eye_color, p.clothing_style, p.has_tattoos,
      p.ethnicity, p.religion, p.politics, p.zodiac, p.languages,
      p.dating_intention, p.marriage_timeline, p.children, p.family_plans,
      p.interracial_marriage, p.family_closeness, p.pets,
      p.drinking, p.smoking,
      p.gym_routine, p.dietary_preferences, p.sleep_schedule, p.living_preference, p.can_cook,
      p.hobbies, p.travel_style, p.music_genre, p.sports_interest, p.reading_interest,
      p.loves_travel, p.next_travel_destination, p.favorite_drink, p.future_plans, p.dream_house_type,
      p.love_language, p.social_battery, p.attachment_style, p.conflict_resolution,
      p.financial_approach,
      -- Phase 12 (never the date of birth: the age above is worked out from it)
      p.profile_created_for, p.marital_status, p.children_count, p.height_cm, p.disability,
      p.mother_tongue, p.caste, p.sub_caste, p.sect, p.open_to_other_communities, p.gotra,
      p.manglik, p.rashi, p.nakshatra, p.birth_time, p.birth_place, p.horoscope_match,
      p.degree, p.employed_in, p.occupation, p.annual_income,
      p.country, p.state, p.city, p.residential_status, p.settling_abroad,
      p.family_type, p.family_status, p.family_values, p.father_occupation, p.mother_occupation,
      p.brothers, p.brothers_married, p.sisters, p.sisters_married,
      p.family_location, p.living_with_family, p.about_family
    from public.profiles me
    join public.profiles p on p.id <> me.id
    where me.id = p_user_id
      and (p_ids is null or p.id = any (p_ids))
      and p.onboarding_complete = true
      and p.name is not null and p.name <> ''
      and not coalesce(p.is_banned, false)
      and not coalesce(p.is_paused, false)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = me.id))
      and (not p_exclude_liked or not exists (
        select 1 from public.likes l where l.liker_id = me.id and l.liked_id = p.id))
      and (not coalesce(p.settings_incognito, false) or exists (
        select 1 from public.likes l where l.liker_id = p.id and l.liked_id = me.id))
      and public.gender_preference_fits(me.interested_in, p.gender)
      and public.gender_preference_fits(p.interested_in, me.gender)
    order by p.last_active_at desc nulls last, p.id
    limit least(greatest(coalesce(p_limit, 5000), 1), 5000)
  ) c;
$$;
