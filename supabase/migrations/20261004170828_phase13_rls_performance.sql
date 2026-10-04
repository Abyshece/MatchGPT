-- ============================================================================
-- Phase 13: faster row access rules, and indexes for foreign keys
--
-- Supabase's performance advisor: 32 row access rules call auth.uid() once
-- per row; written as (select auth.uid()) Postgres works it out once per
-- query. The rules themselves don't change (ALTER POLICY keeps each rule's
-- command and roles; only auth.uid() is wrapped). And six foreign keys get an
-- index, so deleting an account (which cascades through them) and the lookups
-- by them stay fast as the tables grow.
-- ============================================================================

-- ---- Row access rules: auth.uid() once per query ----------------------------------------
alter policy "users delete own blocks" on public.blocks
  using (((select auth.uid()) = blocker_id));

alter policy "users insert own blocks" on public.blocks
  with check (((select auth.uid()) = blocker_id));

alter policy "users see own blocks" on public.blocks
  using (((select auth.uid()) = blocker_id));

alter policy "users insert own consent" on public.consent_records
  with check ((((select auth.uid()) = user_id) OR (user_id IS NULL)));

alter policy "users see own consent" on public.consent_records
  using (((select auth.uid()) = user_id));

alter policy "users insert own export log" on public.data_export_log
  with check ((user_id = (select auth.uid())));

alter policy "users see own export log" on public.data_export_log
  using ((user_id = (select auth.uid())));

alter policy "users delete own likes" on public.likes
  using (((select auth.uid()) = liker_id));

alter policy "users insert own likes" on public.likes
  with check (((select auth.uid()) = liker_id));

alter policy "users see own likes" on public.likes
  using ((((select auth.uid()) = liker_id) OR ((select auth.uid()) = liked_id)));

alter policy "users see own matches" on public.matches
  using ((((select auth.uid()) = user_a_id) OR ((select auth.uid()) = user_b_id)));

alter policy "users update own matches" on public.matches
  using ((((select auth.uid()) = user_a_id) OR ((select auth.uid()) = user_b_id)))
  with check ((((select auth.uid()) = user_a_id) OR ((select auth.uid()) = user_b_id)));

alter policy "users see own messages" on public.messages
  using ((EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = (select auth.uid())) OR (m.user_b_id = (select auth.uid()))) AND (m.unmatched_at IS NULL)))));

alter policy "users send messages in own matches" on public.messages
  with check ((((select auth.uid()) = sender_id) AND (EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = (select auth.uid())) OR (m.user_b_id = (select auth.uid()))) AND (m.unmatched_at IS NULL))))));

alter policy "users update messages in own matches" on public.messages
  using ((EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = messages.match_id) AND ((m.user_a_id = (select auth.uid())) OR (m.user_b_id = (select auth.uid())))))));

alter policy "users can insert own profile" on public.profiles
  with check (((select auth.uid()) = id));

alter policy "users can update own profile" on public.profiles
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

alter policy "users see own profile" on public.profiles
  using (((select auth.uid()) = id));

alter policy "users see own push queue" on public.push_queue
  using (((select auth.uid()) = user_id));

alter policy "users delete own push subs" on public.push_subscriptions
  using (((select auth.uid()) = user_id));

alter policy "users insert own push subs" on public.push_subscriptions
  with check (((select auth.uid()) = user_id));

alter policy "users see own push subs" on public.push_subscriptions
  using (((select auth.uid()) = user_id));

alter policy "users insert own reports" on public.reports
  with check (((select auth.uid()) = reporter_id));

alter policy "users see own reports" on public.reports
  using (((select auth.uid()) = reporter_id));

alter policy "search_history_delete_own" on public.search_history
  using (((select auth.uid()) = user_id));

alter policy "search_history_insert_own" on public.search_history
  with check (((select auth.uid()) = user_id));

alter policy "search_history_select_own" on public.search_history
  using (((select auth.uid()) = user_id));

alter policy "users delete own standouts" on public.standouts
  using (((select auth.uid()) = user_id));

alter policy "users insert own standouts" on public.standouts
  with check (((select auth.uid()) = user_id));

alter policy "users see own standouts" on public.standouts
  using (((select auth.uid()) = user_id));

alter policy "users insert own verification requests" on public.verification_requests
  with check (((select auth.uid()) = user_id));

alter policy "users see own verification requests" on public.verification_requests
  using (((select auth.uid()) = user_id));

-- ---- Indexes for foreign keys -------------------------------------------------------------
create index if not exists admin_emails_added_by_idx on public.admin_emails (added_by);
create index if not exists matches_unmatched_by_idx on public.matches (unmatched_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists standouts_candidate_id_idx on public.standouts (candidate_id);
create index if not exists verification_requests_reviewed_by_idx on public.verification_requests (reviewed_by);
