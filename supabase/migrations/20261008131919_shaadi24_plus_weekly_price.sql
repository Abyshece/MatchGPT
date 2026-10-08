-- ============================================================================
-- Shaadi24+ for a week: ₹449 (it was ₹349)
--
-- The plans are priced as a ladder, each cheaper a week than the one before:
-- ₹449 a week, ₹999 a month (49% less a week), ₹1,999 for 3 months (66%) and
-- ₹2,999 for 6 months (74%), the same steps as the dating apps' own. The week
-- is mostly there to make the longer plans look as good as they are
-- (docs/store/README.md, "Prices"). As in the Terms (lib/billingService.ts
-- DEFAULT_PLANS, Terms terms-v8-2026-10-08); the stores charge their own, set
-- in App Store Connect and Play Console. Nobody has bought the weekly plan yet.
-- ============================================================================

update public.billing_plans set amount = 44900 where id = 'weekly';
