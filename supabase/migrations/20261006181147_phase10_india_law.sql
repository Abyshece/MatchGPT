-- ============================================================================
-- Phase 10, part 11 (1 of 3): what Indian law asks of a matrimonial platform
-- (docs/legal/README.md has the reasons and the sources)
--
--  1. Consent to the current Terms and Privacy Policy (each member's accepted
--     versions, so a new version is asked for), the internet address each
--     consent came from (the 2016 advisory for matrimonial websites: keep the
--     address a profile was set up from), and the reminder of the rules that
--     the IT Rules 2021 (rule 3(1)(c), as amended 10 Feb 2026) ask for at least
--     every three months
--  2. Marriage only (the advisory): every profile is looking for marriage. The
--     legal age to marry (Prohibition of Child Marriage Act 2006): 21 for men,
--     18 for women, 21 for any other gender; younger members stay paused
--  3. Reports: the reasons the law treats urgently (intimate or morphed images,
--     2 hours: IT Rules rule 3(2)(b)) and dowry (Dowry Prohibition Act 1961)
--
-- Part 2 (…_phase10_india_law_grievances): complaints to the Grievance
-- Officer. Part 3 (…_phase10_india_law_retention): what's kept after an
-- account is deleted or content removed, and for how long.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Consent to the current documents, and the reminder of the rules
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists rules_reminded_at timestamptz;
comment on column public.profiles.terms_version is 'The Terms of Service version the member last accepted (lib/consentService.ts)';
comment on column public.profiles.privacy_version is 'The Privacy Policy version the member last accepted';
comment on column public.profiles.rules_reminded_at is 'When the member was last reminded of the rules (IT Rules 2021, rule 3(1)(c): at least every three months)';

-- The internet address a request came from. Cloudflare, in front of Supabase,
-- sets cf-connecting-ip and a client can't; the others are fallbacks.
create or replace function public.request_ip()
returns inet
language plpgsql
stable
set search_path = public
as $$
declare
  v_headers json;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  return nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-real-ip',
                               split_part(v_headers ->> 'x-forwarded-for', ',', 1))), '')::inet;
exception when others then
  return null;
end;
$$;
revoke execute on function public.request_ip() from public;
grant execute on function public.request_ip() to anon, authenticated, service_role;

-- Each consent keeps the address it was given from: the sign-up consent is
-- where the profile was set up (the 2016 advisory asks for that address)
create or replace function public.consent_records_set_ip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ip_address := coalesce(new.ip_address, public.request_ip());
  return new;
end;
$$;
revoke execute on function public.consent_records_set_ip() from public, anon, authenticated;
create or replace trigger consent_records_set_ip
  before insert on public.consent_records
  for each row execute function public.consent_records_set_ip();

-- ---------------------------------------------------------------------------
-- 2. Marriage only, and the legal age to marry
-- ---------------------------------------------------------------------------
create or replace function public.profiles_legal_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Shaadi24 is for marriage only (Terms, section 1)
  new.dating_intention := 'Marriage';
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

-- After the derived fields (the age), before the search bonus (triggers run in name order)
create or replace trigger profiles_legal_rules
  before insert or update on public.profiles
  for each row execute function public.profiles_legal_rules();

alter table public.profiles alter column dating_intention set default 'Marriage';
update public.profiles set dating_intention = 'Marriage' where dating_intention is distinct from 'Marriage';
update public.profiles set is_paused = true
 where coalesce(gender, '') <> 'Female' and age < 21 and not coalesce(is_paused, false);

-- ---------------------------------------------------------------------------
-- 3. Reports: the reasons the law treats urgently
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_admin_report_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := case new.reason
    when 'spam' then 'Spam or scam'
    when 'fake_profile' then 'Fake profile or impersonation'
    when 'inappropriate_content' then 'Inappropriate photos or content'
    when 'intimate_images' then 'Intimate or morphed photos'
    when 'harassment' then 'Harassment or threats'
    when 'dowry' then 'Dowry or money demands'
    when 'underage' then 'Underage user'
    else 'Other'
  end;
begin
  perform public.notify_admins(
    'admin_report',
    case new.reason
      when 'underage' then '🚨 Report: someone may be under age'
      when 'intimate_images' then '🚨 Report: intimate photos, act within 2 hours'
      when 'fake_profile' then '🚩 Report: fake profile or impersonation'
      else '🚩 New report to review' end,
    format('Reason: %s. Open Admin → Reports.', v_reason),
    jsonb_build_object('deep_link', '/admin', 'admin_tab', 'reports', 'report_id', new.id),
    new.reporter_id);
  return new;
end;
$function$;
