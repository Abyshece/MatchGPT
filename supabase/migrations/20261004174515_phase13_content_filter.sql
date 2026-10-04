-- ============================================================================
-- Phase 13: words MatchGPT doesn't allow, kept out of chats and profiles
--
-- Apple (App Review Guideline 1.2) and Google Play ask apps where people post
-- for each other to filter objectionable material before it's posted, next
-- to reporting and blocking (which MatchGPT has). A message or profile text
-- with sexual, abusive or hateful words, in English or in Hindi (in Latin
-- letters or Devanagari), is refused with a plain message the app shows.
--
-- Careful with real words and names: only whole words count (no
-- "Scunthorpe" problem), and words that are also everyday Hindi, names or
-- places stay off the list (Randeep, Ranchod, "chota", "chhod do", "magna
-- cum laude", Lund University, Gandhinagar, Fukrey, Pornima). Common
-- disguises are caught: any capitals, 0/1/3/4/5/@/$/! for letters, repeated
-- letters (fuuuck).
--
-- Only what the person writes is checked, through the API: a profile's
-- changed text fields (the app updates profiles itself, e.g. last_active,
-- and older text mustn't block that), and new or edited messages. The
-- server's own writes (no signed-in user) aren't checked. Reports aren't:
-- they may need to quote what was said.
-- ============================================================================

create or replace function public.has_objectionable_words(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $function$
  select coalesce(
    translate(lower(p_text), '@4310$5!', 'aaeiossi') ~ ('\m(' || array_to_string(array[
      -- English
      'f+u+c+k+\w*', 'motherf\w*', 'fck', 'fcking', 'c+u+n+t+s?', 'b+i+t+c+h+(es|y)?', 'whores?', 'sluts?', 'slutty',
      'ass+holes?', 'arseholes?', 'bastards?', 'dickheads?', 'cocksuck\w*', 'twats?', 'wank(er|ers|ing)?',
      'nigg(a|as|az|er|ers)', 'faggots?', 'retard(ed|s)?',
      'porn', 'porno', 'pornstars?', 'pornograph\w*', 'pornhub', 'nudes', 'sexting', 'blow\s?jobs?', 'hand\s?jobs?',
      'boobs', 'boobies', 'titties', 'horny', 'dildos?', 'puss(y|ies)',
      -- Hindi, in Latin letters
      'ma+dh?[ae]r\s?cho+d\w*', 'b[ae]h?[ae]n\s?cho+d\w*', 'bh?e?n\s?cho+d\w*', 'p[ae]h?[ae]?n\s?cho+d\w*', 'beti\s?cho+d\w*',
      'ma+\s(ki|ka)\s(ch(u|oo)t|bhosd\w*)', 't?mkc', 'bsdk',
      'chutiy[ae]', 'chutia', 'chutiyapa', 'chootiy[ae]', 'chutya',
      'bhosa?d\w*', 'gaand(u|oo|mara|marao|marau|fat|phat)?', 'gandu',
      'lauda', 'la(v|w)d[ae]', 'lodu', 'randi(baaz|baj|bazi|khana)?', 'randwa', 'randwe',
      'harami\w*', 'haramzad\w*', 'haramkhor\w*', 'bhad(w|v)[aei]', 'chinaa?l', 'jhaat\w*', 'jhaa?ntu?',
      'chudai', 'chudwa\w*', 'chodu', 'katua', 'katuwe'
    ], '|') || ')\M')
    -- Hindi in Devanagari (no word edges there: these never sit inside other words)
    or p_text ~ '(मादरचोद|बहनचोद|बहेनचोद|भेनचोद|बेटीचोद|चूतिया|चुतिया|भोसड|रंडी|हरामी|हरामज|गांडू|चोदू|चुदाई)',
    false);
$function$;

comment on function public.has_objectionable_words(text) is
  'True when the text has a word MatchGPT doesn''t allow in chats and profiles (Phase 13, App Review 1.2).';

-- A field of the profile, as the app names it
create or replace function public.profile_field_label(p_column text)
returns text
language sql
immutable
set search_path = public
as $function$
  select case p_column
    when 'description' then 'About me'
    when 'about_family' then 'About my family'
    when 'name' then 'name'
    when 'job_title' then 'job title'
    when 'work' then 'workplace'
    when 'university' then 'college or university'
    when 'childhood_description' then 'Childhood'
    when 'future_plans' then '5-year vision'
    when 'family_health_history' then 'family health history'
    else replace(p_column, '_', ' ')
  end;
$function$;

-- Messages: refused before they're saved
create or replace function public.refuse_objectionable_message()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;
  if public.has_objectionable_words(new.content) then
    raise exception 'This message has words MatchGPT doesn''t allow. Please keep it respectful.'
      using errcode = 'MG001', hint = 'objectionable_words';
  end if;
  return new;
end;
$function$;

create or replace trigger messages_content_filter
  before insert or update of content on public.messages
  for each row execute function public.refuse_objectionable_message();

-- Profiles: every text field the person changed (the app's own fields and
-- the admin's are left alone)
create or replace function public.refuse_objectionable_profile_text()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_old jsonb;
  v_field text;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  select n.key into v_field
    from jsonb_each(to_jsonb(new)) n
   where jsonb_typeof(n.value) = 'string'
     and n.key <> all (array['id', 'email', 'phone_number', 'verification_status', 'subscription_tier',
                             'settings_theme', 'ban_reason'])
     and n.value is distinct from v_old -> n.key
     and public.has_objectionable_words(n.value #>> '{}')
   limit 1;
  if v_field is not null then
    raise exception 'Your % has words MatchGPT doesn''t allow. Please change them.', public.profile_field_label(v_field)
      using errcode = 'MG001', hint = 'objectionable_words', detail = v_field;
  end if;
  return new;
end;
$function$;

create or replace trigger profiles_content_filter
  before insert or update on public.profiles
  for each row execute function public.refuse_objectionable_profile_text();

-- Only the triggers use these
revoke all on function public.refuse_objectionable_message() from public, anon, authenticated;
revoke all on function public.refuse_objectionable_profile_text() from public, anon, authenticated;
