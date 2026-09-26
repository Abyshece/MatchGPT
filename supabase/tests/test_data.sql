-- Test data for security_tests.sh (run as a superuser after the migrations).
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com', now()),  -- admin
  ('00000000-0000-0000-0000-00000000000b', 'x@example.com',     now()),  -- ordinary user
  ('00000000-0000-0000-0000-00000000000c', 'v@example.com',     now());  -- another user
-- 20 more people to like (daily-limit tests)
insert into auth.users (id, email, email_confirmed_at)
select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'extra' || lpad(g::text, 2, '0') || '@example.com', now()
from generate_series(1, 20) g;

update public.profiles set onboarding_complete = true, name = 'Profile ' || left(id::text, 8);
update public.profiles set phone_number = '+91 99999 00000', criminal_record = 'private answer'
 where id = '00000000-0000-0000-0000-00000000000c';
insert into public.admin_emails (email) values ('owner@example.com');
insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000c', 'https://push.example/abc', 'p256dh-key', 'auth-secret');
insert into public.push_queue (user_id, event_type, title, body) values
  ('00000000-0000-0000-0000-00000000000c', 'message', 'New message', 'Hey, are you free Friday?');
-- v has liked x, so x's "Likes You" inbox has one entry
insert into public.likes (liker_id, liked_id) values
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b');
-- a report for the admin tests
insert into public.reports (id, reporter_id, reported_id, reason) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'spam');
