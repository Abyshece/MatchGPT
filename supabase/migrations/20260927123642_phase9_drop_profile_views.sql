-- Phase 9, part 2: drop the views the website used to read other people's
-- profiles. Search, Standouts and the profile lists now go through the
-- functions from part 1 (20260927112757), and the live website no longer
-- reads these views. Three of them ran with their owner's rights and were
-- flagged by Supabase's security advisor; visible_profiles was unused.
drop view public.eligible_profiles;
drop view public.public_profiles;
drop view public.my_blocked_ids;
drop view public.visible_profiles;
