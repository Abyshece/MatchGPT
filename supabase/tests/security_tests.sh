#!/usr/bin/env bash
# Security and behaviour checks against a local rebuild (see run_local.sh).
# Each case runs as the role PostgREST would use for that caller, inside a
# transaction that is rolled back, and states what should happen.
# Prints PASS/FAIL per case and exits non-zero if anything failed.
DB=${DB:-shaadigpt_test}
ADMIN=00000000-0000-0000-0000-00000000000a
USER_X=00000000-0000-0000-0000-00000000000b
OTHER=00000000-0000-0000-0000-00000000000c
REPORT=00000000-0000-0000-0000-0000000000e1
PUSH_SUB=00000000-0000-0000-0000-0000000000f1
EXTRA="('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid"

if [ "$(id -u)" = 0 ]; then as_pg() { su postgres -c "$*"; }; else as_pg() { bash -c "$*"; }; fi
fails=0

# check <ALLOWED|BLOCKED> <label> <role> <user-id or ""> <email or ""> <sql> [text the output must contain]
check() {
  local expect=$1 label=$2 role=$3 sub=$4 email=$5 sql=$6 want=${7:-} out status summary claims
  if [[ -n $sub ]]; then claims="{\"sub\":\"$sub\",\"role\":\"$role\",\"email\":\"$email\"}"; else claims="{\"role\":\"$role\"}"; fi
  out=$(as_pg "psql -X -q -At -v ON_ERROR_STOP=1 -d $DB" 2>&1 <<SQL
begin;
set local role $role;
set local request.jwt.claims = '$claims';
$sql
rollback;
SQL
)
  if [[ $? -eq 0 ]]; then status=ALLOWED; else status=BLOCKED; fi
  summary=$(echo "$out" | grep -oE 'ERROR:.*' | head -1)
  [[ -z $summary ]] && summary=$(echo "$out" | tr '\n' ' ')
  if [[ $status == "$expect" && ( -z $want || $out == *"$want"* ) ]]; then
    printf 'PASS  %-60s %s\n' "$label" "$(echo "$summary" | cut -c1-58)"
  else
    printf 'FAIL  %-60s expected %s%s; got %s: %s\n' "$label" "$expect" "${want:+ with \"$want\"}" "$status" "$(echo "$summary" | cut -c1-90)"
    fails=$((fails + 1))
  fi
}

echo "Attacks — must be blocked (or return nothing):"
check BLOCKED "A1  signed-out visitor reads emails/phones (visible_profiles)" anon "" "" \
  "select email, phone_number, criminal_record from public.visible_profiles;"
check BLOCKED "A2  signed-out visitor verifies a profile through a view" anon "" "" \
  "update public.visible_profiles set is_verified = true where id = '$OTHER' returning id;"
check BLOCKED "A3  signed-out visitor deletes a profile through a view" anon "" "" \
  "delete from public.public_profiles where id = '$OTHER' returning id;"
check BLOCKED "A4  signed-out visitor reads push keys and queued messages" anon "" "" \
  "select endpoint, auth, body from public.pending_pushes;"
check BLOCKED "A5  signed-out visitor reads the search pool" anon "" "" \
  "select count(*) from public.eligible_profiles;"
check BLOCKED "A6  user changes own profile email to the admin's" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set email = 'owner@example.com' where id = '$USER_X';"
check BLOCKED "A7  user marks themself verified and Pro" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set is_verified = true, subscription_tier = 'PRO' where id = '$USER_X';"
check BLOCKED "A8  banned user lifts their own ban" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set is_banned = true where id = '$USER_X'; set local role authenticated;
   update public.profiles set is_banned = false where id = '$USER_X';"
check BLOCKED "A9  signed-out visitor disables someone's push notifications" anon "" "" \
  "select public.increment_push_failure('$PUSH_SUB');"
check ALLOWED "A10 self-created profile row can't start verified/Pro" authenticated "$USER_X" "x@example.com" \
  "reset role; delete from public.profiles where id = '$USER_X'; set local role authenticated;
   insert into public.profiles (id, email, is_verified, subscription_tier) values ('$USER_X', 'owner@example.com', true, 'PRO');
   reset role; select 'stored: ' || email || ' verified=' || is_verified || ' tier=' || subscription_tier from public.profiles where id = '$USER_X';" \
  "stored: x@example.com verified=false tier=FREE"
check BLOCKED "A11 user resets their own daily like counter" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set daily_like_count = 15, last_like_date = current_date where id = '$USER_X'; set local role authenticated;
   update public.profiles set daily_like_count = 0 where id = '$USER_X';"
check BLOCKED "A12 signed-out visitor calls an admin function" anon "" "" \
  "select public.admin_platform_stats();" "permission denied"
check ALLOWED "A13 user reads someone else's Likes You inbox" authenticated "$USER_X" "x@example.com" \
  "select 'rows=' || count(*) from public.get_likes_received('$OTHER');" "rows=0"
check ALLOWED "A14 user reads someone else's matches" authenticated "$USER_X" "x@example.com" \
  "select 'rows=' || count(*) from public.get_matches_with_profile('$OTHER');" "rows=0"
check BLOCKED "A15 free user sends a Super Like" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id, is_super_like) select '$USER_X', $EXTRA, true from generate_series(1, 1) g;" \
  "Super Likes are a Pro feature"
check BLOCKED "A16 free user's 16th like of the day" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 16) g;" \
  "Daily like limit reached"

check BLOCKED "A17 signed-out visitor reads the push cron secret and keys" anon "" "" \
  "select * from public.send_push_config();" "permission denied"
check BLOCKED "A18 signed-in user reads the push cron secret and keys" authenticated "$USER_X" "x@example.com" \
  "select * from public.send_push_config();" "permission denied"
check BLOCKED "A19 signed-in user replaces the push (VAPID) keys" authenticated "$USER_X" "x@example.com" \
  "select * from public.save_vapid_keys('pub', 'priv');" "permission denied"
check BLOCKED "A20 non-admin lists every user (admin_search_users)" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.admin_search_users('', 50);" "Forbidden"
check BLOCKED "A21 non-admin lists reports with names (admin_list_reports)" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.admin_list_reports(false);" "Forbidden"
check ALLOWED "A22 user reads last-active time of someone with Active Status off" authenticated "$USER_X" "x@example.com" \
  "select 'search=' || coalesce(e.last_active_at::text, 'hidden') || ' public=' || coalesce(p.last_active_at::text, 'hidden')
     from public.eligible_profiles e join public.public_profiles p using (id) where e.id = '$OTHER';" "search=hidden public=hidden"

echo
echo "Normal app use — must keep working:"
check ALLOWED "N1  user reads the search pool (eligible_profiles)" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.eligible_profiles;"
check ALLOWED "N2  user reads public_profiles (liked-profiles list)" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.public_profiles;"
check ALLOWED "N3  user reads my_blocked_ids" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.my_blocked_ids;"
check ALLOWED "N4  user reads their own profile row" authenticated "$USER_X" "x@example.com" \
  "select 'rows=' || count(*) from public.profiles;" "rows=1"
check ALLOWED "N5  user edits normal fields (onboarding, search counter, theme)" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set name = 'New Name', hobbies = 'hiking', email_verified = true, daily_search_count = 1, settings_theme = 'dark' where id = '$USER_X' returning name;"
check ALLOWED "N6  admin is recognised (is_admin)" authenticated "$ADMIN" "owner@example.com" \
  "select 'is_admin=' || public.is_admin();" "is_admin=true"
check ALLOWED "N7  admin verifies a user" authenticated "$ADMIN" "owner@example.com" \
  "select public.admin_verify_user('$OTHER'); reset role; select 'verified=' || is_verified from public.profiles where id = '$OTHER';" "verified=true"
check ALLOWED "N8  admin reads admin_emails" authenticated "$ADMIN" "owner@example.com" \
  "select 'rows=' || count(*) from public.admin_emails;" "rows=1"
check BLOCKED "N9  non-admin calls an admin function" authenticated "$USER_X" "x@example.com" \
  "select public.admin_verify_user('$OTHER');" "Forbidden"
check ALLOWED "N10 user submits a verification request" authenticated "$USER_X" "x@example.com" \
  "select public.submit_verification_request('https://linkedin.com/in/x', 'https://instagram.com/x', '', '', '');
   reset role; select 'status=' || verification_status from public.profiles where id = '$USER_X';" "status=pending"
check ALLOWED "N11 server (service role) bans a user" service_role "" "" \
  "update public.profiles set is_banned = true where id = '$OTHER' returning is_banned;"
check ALLOWED "N12 server reads pending_pushes (send-push function)" service_role "" "" \
  "select 'rows=' || count(*) from public.pending_pushes;" "rows=1"
check ALLOWED "N13 server calls increment_push_failure (send-push)" service_role "" "" \
  "select public.increment_push_failure('$PUSH_SUB');"
check ALLOWED "N14 sign-up creates a profile (as Supabase Auth's role)" supabase_auth_admin "" "" \
  "insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000d', 'new@example.com', now());
   reset role; select 'profiles=' || count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d';" "profiles=1"
check ALLOWED "N15 Likes You shows the like the user received" authenticated "$USER_X" "x@example.com" \
  "select 'likes_received=' || count(*) from public.get_likes_received('$USER_X');" "likes_received=1"
check ALLOWED "N16 liking back creates a match that shows in Matches" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id) values ('$USER_X', '$OTHER');
   select 'matches=' || count(*) from public.get_matches_with_profile('$USER_X');" "matches=1"
check ALLOWED "N17 free user sends 15 likes in a day (server counts them)" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 15) g;
   select 'likes today=' || daily_like_count from public.profiles where id = '$USER_X';" "likes today=15"
check ALLOWED "N18 Pro user: no daily limit, Super Likes allowed" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set subscription_tier = 'PRO' where id = '$USER_X'; set local role authenticated;
   insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 16) g;
   insert into public.likes (liker_id, liked_id, is_super_like) values ('$USER_X', '$OTHER', true); select 'ok';" "ok"
check ALLOWED "N19 admin resolves a report" authenticated "$ADMIN" "owner@example.com" \
  "select public.admin_update_report('$REPORT', 'resolved', 'handled');
   reset role; select 'status=' || status from public.reports where id = '$REPORT';" "status=resolved"
check ALLOWED "N20 user exports their own data" authenticated "$USER_X" "x@example.com" \
  "select case when public.export_my_data() ? 'profile' then 'export ok' end;" "export ok"
check ALLOWED "N21 signed-out visitor asks is_admin() (false, no error)" anon "" "" \
  "select 'is_admin=' || public.is_admin();" "is_admin=false"

check ALLOWED "N22 admin lists every user" authenticated "$ADMIN" "owner@example.com" \
  "select 'users=' || count(*) from public.admin_search_users('', 50);" "users=23"
check ALLOWED "N23 admin finds a user by email" authenticated "$ADMIN" "owner@example.com" \
  "select 'found=' || count(*) || ' ' || min(email) from public.admin_search_users('x@example', 50);" "found=1 x@example.com"
check ALLOWED "N24 admin lists reports with both people's details" authenticated "$ADMIN" "owner@example.com" \
  "select 'reporter=' || reporter_email || ' reported=' || reported_email from public.admin_list_reports(true);" \
  "reporter=x@example.com reported=v@example.com"
check ALLOWED "N25 server reads the send-push config (cron secret exists)" service_role "" "" \
  "select 'secret_len=' || length(cron_secret) from public.send_push_config();" "secret_len=64"
check ALLOWED "N26 server saves VAPID keys once; a second pair can't replace them" service_role "" "" \
  "select 1 from public.save_vapid_keys('pub1', 'priv1');
   select 'pub=' || vapid_public_key || ' priv=' || vapid_private_key from public.save_vapid_keys('pub2', 'priv2');" "pub=pub1 priv=priv1"
check ALLOWED "N27 signed-in user gets the VAPID public key (none yet)" authenticated "$USER_X" "x@example.com" \
  "select 'key=' || coalesce(public.vapid_public_key(), 'none');" "key=none"
check ALLOWED "N28 last-active time still shows for people with Active Status on" authenticated "$USER_X" "x@example.com" \
  "select 'admin=' || case when last_active_at is null then 'hidden' else 'shown' end from public.eligible_profiles where id = '$ADMIN';" "admin=shown"

echo
if [[ $fails -eq 0 ]]; then echo "All checks passed."; else echo "$fails check(s) FAILED."; exit 1; fi
