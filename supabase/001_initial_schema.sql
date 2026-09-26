-- ============================================================================
-- ShaadiGPT Initial Schema
-- Paste this entire file into Supabase SQL Editor and run it ONCE.
-- ============================================================================

-- Enable extensions we need
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE
-- Extends auth.users with all profile attributes (the 70+ fields).
-- Stored as one wide row per user. JSONB for arrays/lists.
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  -- account meta
  email text,
  phone_number text,
  email_verified boolean default false,
  phone_verified boolean default false,
  account_created timestamptz default now() not null,
  onboarding_complete boolean default false,
  verification_status text default 'unverified' check (verification_status in ('unverified', 'pending', 'verified')),
  is_verified boolean default false,

  -- subscription (just two tiers)
  subscription_tier text default 'FREE' check (subscription_tier in ('FREE', 'PRO')),
  subscription_renews_at timestamptz,

  -- usage tracking
  daily_search_count int default 0,
  last_search_date date default current_date,
  daily_like_count int default 0,
  last_like_date date default current_date,
  daily_super_like_count int default 0,
  last_super_like_date date default current_date,

  -- the basics
  name text,
  age int check (age is null or (age >= 18 and age <= 99)),
  age_changed_once boolean default false,
  gender text,
  pronouns text,
  sexuality text,
  interested_in text,
  location text,
  hometown text,
  ethnicity text,
  race text,
  nationality_count int,
  languages text,

  -- appearance
  height text,
  body_type text,
  hair_color text,
  hair_type text,
  eye_color text,
  facial_hair text,
  makeup_routine text,
  clothing_style text,
  wears_glasses text,
  wears_lenses text,
  wears_jewelry text,
  body_hair text,
  has_tattoos text,
  dresses_well text,
  hygiene text,

  -- lifestyle & habits
  drinking text,
  smoking text,
  marijuana text,
  drugs text,
  covid_vaccine text,
  drives_car text,
  has_drivers_license text,
  living_preference text,
  favorite_drink text,
  can_cook text,
  baking_interest text,
  shopping_preference text,
  gym_routine text,
  sports_interest text,
  reading_interest text,
  hobbies text,
  is_organised text,
  snoring text,
  phone_type text,

  -- travel
  loves_travel text,
  travel_style text,
  next_travel_destination text,

  -- career
  job_title text,
  work text,
  university text,
  education_level text,
  work_style text,

  -- background & mind
  religion text,
  politics text,
  zodiac text,
  therapy_history text,
  childhood_description text,
  music_genre text,
  family_health_history text,
  criminal_record text,

  -- future & goals
  future_plans text,
  dream_house_type text,

  -- family & dating
  love_language text,
  relationship_type text,
  dating_intention text,
  children text,
  family_plans text,
  pets text,
  marriage_timeline text,
  sex_style text,
  interracial_marriage text,
  siblings text,
  family_closeness text,
  financial_splitting text,

  -- relationship psychology
  conflict_resolution text,
  social_battery text,
  dietary_preferences text,
  attachment_style text,
  sleep_schedule text,
  financial_approach text,

  -- summary
  description text,

  -- social verification
  linkedin text,
  instagram text,
  facebook text,
  twitter text,

  -- photos: array of URLs in order. Photo metadata kept simple.
  photo_urls text[] default array[]::text[],

  -- privacy: list of field names the user has hidden from their public profile
  hidden_fields text[] default array[]::text[],

  -- settings
  settings_incognito boolean default false,
  settings_show_online boolean default true,
  settings_read_receipts boolean default true,
  settings_push_notifs boolean default true,
  settings_email_notifs boolean default true,

  -- presence
  last_active_at timestamptz default now(),

  updated_at timestamptz default now() not null
);

-- index on common filter fields
create index idx_profiles_location on public.profiles(location);
create index idx_profiles_age on public.profiles(age);
create index idx_profiles_gender on public.profiles(gender);
create index idx_profiles_interested_in on public.profiles(interested_in);
create index idx_profiles_subscription_tier on public.profiles(subscription_tier);
create index idx_profiles_last_active_at on public.profiles(last_active_at desc);

-- ============================================================================
-- 2. LIKES TABLE
-- One row per like. Includes super_like flag.
-- ============================================================================

create table public.likes (
  id uuid primary key default uuid_generate_v4(),
  liker_id uuid references public.profiles(id) on delete cascade not null,
  liked_id uuid references public.profiles(id) on delete cascade not null,
  is_super_like boolean default false,
  created_at timestamptz default now() not null,

  unique(liker_id, liked_id),
  check (liker_id <> liked_id)
);

create index idx_likes_liker on public.likes(liker_id);
create index idx_likes_liked on public.likes(liked_id);

-- ============================================================================
-- 3. MATCHES TABLE
-- Created automatically by trigger when both users have liked each other.
-- user_a_id is always the lexicographically smaller UUID for uniqueness.
-- ============================================================================

create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  user_a_id uuid references public.profiles(id) on delete cascade not null,
  user_b_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unmatched_at timestamptz,
  unmatched_by uuid references public.profiles(id) on delete set null,

  unique(user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

create index idx_matches_user_a on public.matches(user_a_id);
create index idx_matches_user_b on public.matches(user_b_id);

-- ============================================================================
-- 4. MESSAGES TABLE
-- ============================================================================

create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid references public.matches(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  message_type text default 'text' check (message_type in ('text', 'date_proposal')),
  read_at timestamptz,
  created_at timestamptz default now() not null
);

create index idx_messages_match on public.messages(match_id, created_at);

-- ============================================================================
-- 5. BLOCKS TABLE
-- ============================================================================

create table public.blocks (
  id uuid primary key default uuid_generate_v4(),
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  reason text,
  created_at timestamptz default now() not null,

  unique(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index idx_blocks_blocker on public.blocks(blocker_id);
create index idx_blocks_blocked on public.blocks(blocked_id);

-- ============================================================================
-- 6. REPORTS TABLE
-- ============================================================================

create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  reason text not null,
  details text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz default now() not null
);

create index idx_reports_reported on public.reports(reported_id);
create index idx_reports_status on public.reports(status);

-- ============================================================================
-- TRIGGER: auto-create profile row when user signs up
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, account_created)
  values (new.id, new.email, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- TRIGGER: auto-create match row when two users have liked each other
-- ============================================================================

create or replace function public.check_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reciprocal_exists boolean;
  user_a uuid;
  user_b uuid;
begin
  -- check if the liked user has already liked the liker
  select exists(
    select 1 from public.likes
    where liker_id = new.liked_id and liked_id = new.liker_id
  ) into reciprocal_exists;

  if reciprocal_exists then
    -- order the pair lexicographically
    if new.liker_id < new.liked_id then
      user_a := new.liker_id;
      user_b := new.liked_id;
    else
      user_a := new.liked_id;
      user_b := new.liker_id;
    end if;

    insert into public.matches (user_a_id, user_b_id)
    values (user_a, user_b)
    on conflict (user_a_id, user_b_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_like_created
  after insert on public.likes
  for each row execute function public.check_for_match();

-- ============================================================================
-- TRIGGER: keep profiles.updated_at fresh
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- PROFILES
-- everyone authenticated can read profiles (except those that have blocked them)
create policy "profiles readable to authenticated users"
  on public.profiles for select
  to authenticated
  using (
    not exists (
      select 1 from public.blocks
      where blocker_id = profiles.id and blocked_id = auth.uid()
    )
  );

-- users can update only their own profile
create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- LIKES
-- users see likes they sent + likes they received
create policy "users see own likes"
  on public.likes for select
  to authenticated
  using (auth.uid() = liker_id or auth.uid() = liked_id);

-- users can insert likes only as themselves
create policy "users insert own likes"
  on public.likes for insert
  to authenticated
  with check (auth.uid() = liker_id);

-- users can delete only likes they created (for rewind)
create policy "users delete own likes"
  on public.likes for delete
  to authenticated
  using (auth.uid() = liker_id);

-- MATCHES
-- users see matches they're part of
create policy "users see own matches"
  on public.matches for select
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- users can mark their own matches as unmatched
create policy "users update own matches"
  on public.matches for update
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id)
  with check (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- MESSAGES
-- users see messages in matches they're part of
create policy "users see own messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
        and m.unmatched_at is null
    )
  );

-- users can send messages in their own matches
create policy "users send messages in own matches"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
        and m.unmatched_at is null
    )
  );

-- users can mark messages as read (update read_at)
create policy "users update messages in own matches"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a_id = auth.uid() or m.user_b_id = auth.uid())
    )
  );

-- BLOCKS
create policy "users see own blocks"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "users insert own blocks"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "users delete own blocks"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- REPORTS
create policy "users insert own reports"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "users see own reports"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

-- ============================================================================
-- STORAGE BUCKET for photos
-- ============================================================================

-- create the bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- public read on photos bucket
create policy "photos publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'photos');

-- authenticated users can upload to their own folder (folder = user id)
create policy "users upload to own photo folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- authenticated users can update/delete their own photos
create policy "users update own photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- DONE.
-- ============================================================================
