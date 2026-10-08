-- ============================================================================
-- Blog: posts written in Admin → Blog (by hand or drafted with AI) and shown
-- on the website at /blog and /blog/<slug>.
--
-- A post is a draft until it's published. A published post with a date in
-- the future shows from that date (scheduled). Everyone can read published
-- posts; only admins can see drafts and write. Cover pictures go in the public
-- "blog" storage bucket, which only admins can write to.
-- ============================================================================

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  content text not null default '' check (char_length(content) <= 100000),   -- Markdown
  word_count integer generated always as (coalesce(array_length(regexp_split_to_array(btrim(content), '\s+'), 1), 0)) stored,
  cover_url text check (cover_url is null or cover_url ~ '^https?://'),
  cover_alt text not null default '' check (char_length(cover_alt) <= 200),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  -- Search engines and link previews (empty: the title and the excerpt)
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  focus_keyword text not null default '' check (char_length(focus_keyword) <= 100),
  noindex boolean not null default false,
  author_name text not null default 'Shaadi24 Team' check (char_length(btrim(author_name)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  ai_assisted boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_published on public.blog_posts (published_at desc) where status = 'published';

-- Who wrote and changed it, and when; publishing without a date publishes now
create or replace function public.blog_posts_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists blog_posts_stamp on public.blog_posts;
create trigger blog_posts_stamp before insert or update on public.blog_posts
  for each row execute function public.blog_posts_stamp();

-- Publishing, unpublishing and deleting go in the admin log
create or replace function public.blog_posts_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
  post public.blog_posts;
begin
  if tg_op = 'DELETE' then
    act := 'delete_blog_post';
    post := old;
  elsif tg_op = 'INSERT' and new.status = 'published' then
    act := 'publish_blog_post';
    post := new;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    act := case when new.status = 'published' then 'publish_blog_post' else 'unpublish_blog_post' end;
    post := new;
  else
    return null;
  end if;
  if auth.uid() is not null then
    insert into public.admin_audit (admin_id, admin_email, action, details)
    values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), act,
            jsonb_build_object('post_id', post.id, 'slug', post.slug, 'title', post.title));
  end if;
  return null;
end;
$$;
revoke execute on function public.blog_posts_audit() from public, anon, authenticated;

drop trigger if exists blog_posts_audit on public.blog_posts;
create trigger blog_posts_audit after insert or update or delete on public.blog_posts
  for each row execute function public.blog_posts_audit();

alter table public.blog_posts enable row level security;

drop policy if exists "Anyone reads published posts" on public.blog_posts;
create policy "Anyone reads published posts" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

drop policy if exists "Admins manage posts" on public.blog_posts;
create policy "Admins manage posts" on public.blog_posts
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- Visits to each post: the website counts each page load once (blog_view())
create table if not exists public.blog_views (
  post_id uuid primary key references public.blog_posts (id) on delete cascade,
  views integer not null default 0
);
alter table public.blog_views enable row level security;

drop policy if exists "Admins see visits" on public.blog_views;
create policy "Admins see visits" on public.blog_views
  for select to authenticated
  using ((select public.is_admin()));
grant select on public.blog_views to authenticated;

create or replace function public.blog_view(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.blog_views (post_id, views)
  select id, 1 from public.blog_posts
   where slug = p_slug and status = 'published' and published_at <= now()
  on conflict (post_id) do update set views = public.blog_views.views + 1;
$$;
revoke execute on function public.blog_view(text) from public;
grant execute on function public.blog_view(text) to anon, authenticated;

-- ---- Cover pictures --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Admins add blog pictures" on storage.objects;
create policy "Admins add blog pictures" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog' and (select public.is_admin()));

drop policy if exists "Admins see blog pictures" on storage.objects;
create policy "Admins see blog pictures" on storage.objects
  for select to authenticated
  using (bucket_id = 'blog' and (select public.is_admin()));

drop policy if exists "Admins remove blog pictures" on storage.objects;
create policy "Admins remove blog pictures" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog' and (select public.is_admin()));
