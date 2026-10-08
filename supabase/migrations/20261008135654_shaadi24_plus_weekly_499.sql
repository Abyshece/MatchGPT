-- ============================================================================
-- Shaadi24+ for a week: ₹499, as set in App Store Connect (₹449 before)
--
-- ₹499 a week, ₹999 a month (54% less a week), ₹1,999 for 3 months (69%)
-- and ₹2,999 for 6 months (77%): a month costs what 2 weeks do. As in the
-- Terms (lib/billingService.ts DEFAULT_PLANS, Terms terms-v9-2026-10-08) and
-- the App Store check (scripts/store-check.mjs). Nobody has bought the
-- weekly plan yet.
-- ============================================================================

update public.billing_plans set amount = 49900 where id = 'weekly';
