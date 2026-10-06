-- ============================================================================
-- Phase 10: the product is now called Shaadi24 (it was MatchGPT)
--
-- What members see from the database says Shaadi24: the notifications'
-- texts, the messages when something isn't allowed, the "app" field of
-- "Download my data". MatchGPT+ is now Shaadi24+, and its store products are
-- renamed to match, as nothing has been sold yet: the Google Play
-- subscription "shaadi24_plus" (base plans "monthly" and "yearly") and the
-- App Store's "shaadi24_plus_monthly" and "shaadi24_plus_yearly".
-- ============================================================================

update public.billing_plans
   set name = replace(name, 'MatchGPT', 'Shaadi24'),
       google_product_id = 'shaadi24_plus',
       apple_product_id = 'shaadi24_plus_' || id;

-- Every function whose text says MatchGPT, written again with the new name.
-- On 2026-10-06 that's enforce_date_proposal_pro, enqueue_message_push,
-- enqueue_superlike_push, export_my_data, protect_profile_fields,
-- refuse_objectionable_message and refuse_objectionable_profile_text. Done
-- from their current definitions, so a rebuild from the migrations gets the
-- same result as the live database. Owners, settings and grants stay.
do $rename$
declare
  f record;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%MatchGPT%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'MatchGPT', 'Shaadi24');
  end loop;

  if exists (select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%MatchGPT%') then
    raise exception 'A function still says MatchGPT';
  end if;
end
$rename$;

comment on function public.has_objectionable_words(text) is
  'True when the text has a word Shaadi24 doesn''t allow in chats and profiles (Phase 13, App Review 1.2).';
