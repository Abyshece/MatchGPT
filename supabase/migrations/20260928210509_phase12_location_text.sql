-- Phase 12, part 2: "Delhi", not "Delhi, Delhi".
--
-- When the city and the state have the same name (Delhi, Chandigarh,
-- Puducherry...), the location people see is just the city.

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

  -- The location text everyone sees: "City, State" in India ("Delhi" when
  -- they're the same), "City, Country" abroad. Only when city, state or
  -- country changed, so an older typed location stays as it was until then.
  if tg_op = 'INSERT'
     or new.city is distinct from old.city
     or new.state is distinct from old.state
     or new.country is distinct from old.country then
    place := concat_ws(', ',
      nullif(btrim(new.city), ''),
      case
        when coalesce(nullif(btrim(new.country), ''), 'India') <> 'India' then nullif(btrim(new.country), '')
        when lower(btrim(new.state)) = lower(btrim(new.city)) then null
        else nullif(btrim(new.state), '')
      end);
    if place <> '' then
      new.location := place;
    end if;
  end if;

  return new;
end;
$$;

update public.profiles
   set location = city
 where lower(btrim(city)) = lower(btrim(state))
   and coalesce(nullif(btrim(country), ''), 'India') = 'India'
   and location is distinct from city;
