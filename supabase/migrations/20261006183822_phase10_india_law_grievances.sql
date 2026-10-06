-- ============================================================================
-- Phase 10, part 11 (2 of 3): complaints to the Grievance Officer, as the IT
-- Rules 2021 (rule 3(2)) ask: from members and anyone else, with a ticket at
-- once and the deadline the law sets. The reasons and sources are in
-- docs/legal/README.md; part 1 of 3 is …_phase10_india_law.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 4. Complaints to the Grievance Officer
-- ---------------------------------------------------------------------------
create sequence if not exists public.grievance_ticket_seq start 1001;

create table if not exists public.grievances (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique default ('SH24-' || nextval('public.grievance_ticket_seq')),
  category text not null check (category in (
    'intimate_images', 'impersonation', 'unlawful_content', 'dowry', 'fraud',
    'account', 'privacy', 'payment', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  phone text check (phone is null or char_length(phone) <= 20),
  on_behalf boolean not null default false,
  about text check (about is null or char_length(about) <= 300),
  details text not null check (char_length(btrim(details)) between 10 and 4000),
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz not null default now(),
  due_at timestamptz not null,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 4000),
  handled_by uuid,
  ip_address inet
);
comment on table public.grievances is
  'Complaints to the Grievance Officer (IT Rules 2021, rule 3(2)), from members and anyone else; acknowledged with a ticket at once, due by the time the law sets (grievance_due())';
create index if not exists idx_grievances_open on public.grievances (status, due_at);
create index if not exists idx_grievances_user on public.grievances (user_id);
create index if not exists idx_grievances_email on public.grievances (email, created_at);
create index if not exists idx_grievances_ip on public.grievances (ip_address, created_at);
alter table public.grievances enable row level security;
-- Members see their own; everything else goes through the functions below
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'grievances' and policyname = 'grievances_own_read') then
    create policy grievances_own_read on public.grievances
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;
revoke all on public.grievances from anon;
revoke insert, update, delete on public.grievances from authenticated;

-- When a complaint must be resolved by, from when it was made:
--   intimate, nude or sexual images of someone, or impersonating them: 2 hours
--     (IT Rules rule 3(2)(b), as amended 10 Feb 2026)
--   unlawful content (rule 3(1)(b)), including dowry and fraud: 36 hours
--     (rule 3(2)(a)(i), proviso)
--   payments: a month (Consumer Protection (E-Commerce) Rules 2020, rule 4(5))
--   everything else, personal data included: 7 days (rule 3(2)(a)(i))
create or replace function public.grievance_due(p_category text, p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select p_at + case p_category
    when 'intimate_images' then interval '2 hours'
    when 'impersonation' then interval '2 hours'
    when 'unlawful_content' then interval '36 hours'
    when 'dowry' then interval '36 hours'
    when 'fraud' then interval '36 hours'
    when 'payment' then interval '30 days'
    else interval '7 days'
  end;
$$;

create or replace function public.grievance_label(p_category text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_category
    when 'intimate_images' then 'Intimate, nude or sexual images'
    when 'impersonation' then 'Impersonation or morphed photos'
    when 'unlawful_content' then 'Obscene, abusive or unlawful content'
    when 'dowry' then 'Dowry'
    when 'fraud' then 'Fraud or asking for money'
    when 'account' then 'My account'
    when 'privacy' then 'My personal data'
    when 'payment' then 'Payment or subscription'
    else 'Something else'
  end;
$$;

-- Anyone can complain, signed in or not (rule 3(2)(a): "a user or a victim")
create or replace function public.submit_grievance(
  p_category text,
  p_name text,
  p_email text,
  p_details text,
  p_about text default null,
  p_phone text default null,
  p_on_behalf boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.grievances;
  v_ip inet := public.request_ip();
begin
  -- Against spam: a few a day from one email address or one internet address
  -- (the email address of the Grievance Officer always works)
  if (select count(*) from public.grievances
       where email = lower(btrim(p_email)) and created_at > now() - interval '1 day') >= 5
     or (v_ip is not null and (select count(*) from public.grievances
          where ip_address = v_ip and created_at > now() - interval '1 day') >= 10) then
    raise exception 'You have sent several complaints today. Please write to us by email instead.';
  end if;

  insert into public.grievances (category, name, email, phone, on_behalf, about, details, user_id, due_at, ip_address)
  values (p_category, btrim(p_name), lower(btrim(p_email)), nullif(btrim(coalesce(p_phone, '')), ''),
          coalesce(p_on_behalf, false), nullif(btrim(coalesce(p_about, '')), ''), btrim(p_details),
          auth.uid(), public.grievance_due(p_category, now()), v_ip)
  returning * into v_row;

  perform public.notify_admins(
    'admin_grievance',
    case when p_category in ('intimate_images', 'impersonation')
      then '🚨 Complaint: act within 2 hours' else '📮 New complaint' end,
    format('%s: %s. Open Admin → Complaints.', v_row.ticket, public.grievance_label(p_category)),
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'grievances', 'grievance_id', v_row.id));

  return jsonb_build_object('ticket', v_row.ticket, 'acknowledged_at', v_row.acknowledged_at, 'due_at', v_row.due_at);
end;
$$;

create or replace function public.admin_grievances(p_open_only boolean default true)
returns setof public.grievances
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can see complaints';
  end if;
  return query
    select * from public.grievances g
     where not p_open_only or g.status in ('open', 'in_progress')
     order by case when g.status in ('open', 'in_progress') then 0 else 1 end, g.due_at, g.created_at desc
     limit 500;
end;
$$;

create or replace function public.admin_update_grievance(p_id uuid, p_status text, p_resolution text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: only admins can answer complaints';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'rejected') then
    raise exception 'Unknown status %', p_status;
  end if;
  update public.grievances
     set status = p_status,
         resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
         resolved_at = case when p_status in ('resolved', 'rejected') then coalesce(resolved_at, now()) else null end,
         handled_by = auth.uid()
   where id = p_id;
  if not found then
    raise exception 'No such complaint';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.admin_audit (admin_id, admin_email, action, details)
  values (auth.uid(), coalesce(v_email, ''), 'grievance_' || p_status,
          jsonb_build_object('grievance_id', p_id, 'resolution', p_resolution));
end;
$$;

revoke execute on function public.submit_grievance(text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_grievance(text, text, text, text, text, text, boolean) to anon, authenticated, service_role;
revoke execute on function public.admin_grievances(boolean), public.admin_update_grievance(uuid, text, text) from public, anon;
grant execute on function public.admin_grievances(boolean), public.admin_update_grievance(uuid, text, text) to authenticated, service_role;
revoke execute on function public.grievance_due(text, timestamptz), public.grievance_label(text) from public, anon;
grant execute on function public.grievance_due(text, timestamptz), public.grievance_label(text) to authenticated, service_role;
