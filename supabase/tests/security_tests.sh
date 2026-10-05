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
check ALLOWED "A1  signed-out visitor reads emails/phones (profiles)" anon "" "" \
  "select 'rows=' || count(*) from public.profiles where email is not null or phone_number is not null;" "rows=0"
check ALLOWED "A2  signed-out visitor marks a profile verified" anon "" "" \
  "with u as (update public.profiles set is_verified = true where id = '$OTHER' returning 1) select 'updated=' || count(*) from u;" "updated=0"
check ALLOWED "A3  signed-out visitor deletes a profile" anon "" "" \
  "with d as (delete from public.profiles where id = '$OTHER' returning 1) select 'deleted=' || count(*) from d;" "deleted=0"
check BLOCKED "A4  signed-out visitor reads push keys and queued messages" anon "" "" \
  "select endpoint, auth, body from public.pending_pushes;"
check BLOCKED "A5  signed-in user reads the old search pool view (eligible_profiles)" authenticated "$USER_X" "x@example.com" \
  "select count(*) from public.eligible_profiles;" "does not exist"
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
check BLOCKED "A15 free user sends a Super Like (MatchGPT+ for subscribers only)" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.app_settings set pro_for_all = false; set local role authenticated;
   insert into public.likes (liker_id, liked_id, is_super_like) select '$USER_X', $EXTRA, true from generate_series(1, 1) g;" \
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
check ALLOWED "A22 search isn't given the last-active time of someone with Active Status off" service_role "" "" \
  "select 'v=' || coalesce(e ->> 'last_active_at', 'hidden') from jsonb_array_elements(public.search_candidates('$USER_X')) e where e ->> 'id' = '$OTHER';" "v=hidden"

check BLOCKED "A23 user resets their own daily search counter" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set daily_search_count = 3, last_search_date = current_date where id = '$USER_X'; set local role authenticated;
   update public.profiles set daily_search_count = 0 where id = '$USER_X';" "can only be changed by MatchGPT"
check BLOCKED "A24 signed-in user downloads the search pool (search_candidates)" authenticated "$USER_X" "x@example.com" \
  "select public.search_candidates('$USER_X');" "permission denied"
check BLOCKED "A25 signed-in user calls the search counter directly (consume_search)" authenticated "$USER_X" "x@example.com" \
  "select public.consume_search('$USER_X');" "permission denied"
check BLOCKED "A26 signed-out visitor reads profile cards" anon "" "" \
  "select * from public.get_profile_cards(array['$USER_X']::uuid[]);" "permission denied"
check ALLOWED "A27 user reads the card of a stranger (no like, match or block)" authenticated "$USER_X" "x@example.com" \
  "select 'cards=' || count(*) from public.get_profile_cards(array[('00000000-0000-0000-0001-' || lpad('1', 12, '0'))::uuid]);" "cards=0"
check ALLOWED "A28 user reads the card of someone who blocked them" authenticated "$USER_X" "x@example.com" \
  "reset role; insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 1) g;
   insert into public.blocks (blocker_id, blocked_id) select $EXTRA, '$USER_X' from generate_series(1, 1) g; set local role authenticated;
   select 'cards=' || count(*) from public.get_profile_cards(array(select $EXTRA from generate_series(1, 1) g));" "cards=0"
check ALLOWED "A29 hidden name, age and location stay out of Likes You, Matches and cards" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set hidden_fields = '{name,age,location}', age = 30, location = 'Pune, MH' where id = '$OTHER'; set local role authenticated;
   select 'like=' || coalesce(liker_name, 'hidden') || '/' || coalesce(liker_age::text, 'hidden') || '/' || coalesce(liker_location, 'hidden')
     from public.get_likes_received('$USER_X');
   reset role; insert into public.likes (liker_id, liked_id) values ('$USER_X', '$OTHER'); set local role authenticated;
   select 'match=' || coalesce(other_name, 'hidden') || '/' || coalesce(other_age::text, 'hidden') || '/' || coalesce(other_location, 'hidden')
     from public.get_matches_with_profile('$USER_X');
   select 'card=' || coalesce(name, 'hidden') || '/' || coalesce(age::text, 'hidden') || '/' || coalesce(location, 'hidden')
     from public.get_profile_cards(array['$OTHER']::uuid[]);" "like=hidden/hidden/hidden
match=hidden/hidden/hidden
card=hidden/hidden/hidden"
check ALLOWED "A30 signed-in user reads or fills the AI plan cache" authenticated "$USER_X" "x@example.com" \
  "select 'readable=' || has_table_privilege('authenticated', 'public.search_prompt_cache', 'select')
       || ' writable=' || has_table_privilege('authenticated', 'public.search_prompt_cache', 'insert')
       || ' anon=' || has_table_privilege('anon', 'public.search_prompt_cache', 'select');" "readable=false writable=false anon=false"

check BLOCKED "A31 user adds a Pro subscription for themself" authenticated "$USER_X" "x@example.com" \
  "insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id, status)
   values ('$USER_X', 'monthly', 'live', 'google_play', 'sub_fake', 'active');" "permission denied"
check BLOCKED "A32 user marks their own subscription active" authenticated "$USER_X" "x@example.com" \
  "reset role; insert into public.subscriptions (id, user_id, plan_id, mode, provider, store_subscription_id, status) values ('00000000-0000-0000-0000-0000000000d1', '$USER_X', 'monthly', 'test', 'google_play', 'sub_x', 'active'), ('00000000-0000-0000-0000-0000000000d2', '$OTHER', 'monthly', 'test', 'google_play', 'sub_v', 'active'); insert into public.payments (user_id, subscription_id, provider, store_order_id, amount, status) values ('$OTHER', '00000000-0000-0000-0000-0000000000d2', 'google_play', 'pay_v', 99900, 'captured'); update public.subscriptions set status = 'created' where user_id = '$USER_X'; set local role authenticated;
   update public.subscriptions set status = 'active' where user_id = '$USER_X';" "permission denied"
check ALLOWED "A33 user reads someone else's subscription and payments" authenticated "$USER_X" "x@example.com" \
  "reset role; insert into public.subscriptions (id, user_id, plan_id, mode, provider, store_subscription_id, status) values ('00000000-0000-0000-0000-0000000000d1', '$USER_X', 'monthly', 'test', 'google_play', 'sub_x', 'active'), ('00000000-0000-0000-0000-0000000000d2', '$OTHER', 'monthly', 'test', 'google_play', 'sub_v', 'active'); insert into public.payments (user_id, subscription_id, provider, store_order_id, amount, status) values ('$OTHER', '00000000-0000-0000-0000-0000000000d2', 'google_play', 'pay_v', 99900, 'captured'); set local role authenticated;
   select 'subs=' || (select count(*) from public.subscriptions where user_id <> '$USER_X')
       || ' payments=' || (select count(*) from public.payments);" "subs=0 payments=0"
check BLOCKED "A34 user reads the plans' store ids and the store notification log" authenticated "$USER_X" "x@example.com" \
  "select google_product_id from public.billing_plans union all select id from public.billing_events;" "permission denied"
check BLOCKED "A35 user runs the Pro sync to make themself Pro" authenticated "$USER_X" "x@example.com" \
  "select public.sync_pro_status('$USER_X');" "permission denied"
check BLOCKED "A36 signed-out visitor reads subscriptions" anon "" "" \
  "select count(*) from public.subscriptions;" "permission denied"
check ALLOWED "A37 user reads someone else's date of birth or caste" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set date_of_birth = '1995-05-05', caste = 'Brahmin' where id = '$OTHER'; set local role authenticated;
   select 'rows=' || count(*) from public.profiles where id = '$OTHER' and (date_of_birth is not null or caste is not null);" "rows=0"
check ALLOWED "A38 the search pool never has a date of birth or the dropped questions" service_role "" "" \
  "update public.profiles set date_of_birth = '1995-05-05', marijuana = 'Regularly', drugs = 'Often', relationship_type = 'Open', mother_tongue = 'Tamil';
   select 'dob=' || count(*) filter (where e ? 'date_of_birth') || ' dropped=' || count(*) filter (where e ?| array['marijuana', 'drugs', 'relationship_type'])
       || ' mother_tongue=' || count(*) filter (where e ->> 'mother_tongue' = 'Tamil')
     from jsonb_array_elements(public.search_candidates('$USER_X')) e;" "dob=0 dropped=0 mother_tongue=22"
check BLOCKED "A39 user turns MatchGPT+ for everyone off" authenticated "$USER_X" "x@example.com" \
  "select public.admin_set_pro_for_all(false);" "only admins"
check BLOCKED "A40 user changes the app settings directly" authenticated "$USER_X" "x@example.com" \
  "update public.app_settings set pro_for_all = false;" "permission denied"
check BLOCKED "A41 user asks whether someone has MatchGPT+ (has_pro)" authenticated "$USER_X" "x@example.com" \
  "select public.has_pro('$OTHER');" "permission denied"
check ALLOWED "A42 free user sees who liked them (MatchGPT+ for subscribers only)" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.app_settings set pro_for_all = false;
   insert into public.likes (liker_id, liked_id) values ('$OTHER', '$USER_X') on conflict do nothing; set local role authenticated;
   select 'who=' || coalesce(liker_id::text, 'hidden') || ' name=' || coalesce(liker_name, 'hidden') || ' photos=' || coalesce(array_length(liker_photos, 1)::text, 'hidden')
     from public.get_likes_received('$USER_X') limit 1;" "who=hidden name=hidden photos=hidden"
check BLOCKED "A43 free user proposes a date (MatchGPT+ for subscribers only)" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.app_settings set pro_for_all = false;
   insert into public.matches (user_a_id, user_b_id) select least('$USER_X'::uuid, '$OTHER'::uuid), greatest('$USER_X'::uuid, '$OTHER'::uuid)
    where not exists (select 1 from public.matches where user_a_id = least('$USER_X'::uuid, '$OTHER'::uuid) and user_b_id = greatest('$USER_X'::uuid, '$OTHER'::uuid));
   set local role authenticated;
   insert into public.messages (match_id, sender_id, content, message_type)
   select id, '$USER_X', 'Coffee on Saturday?', 'date_proposal' from public.matches
    where user_a_id = least('$USER_X'::uuid, '$OTHER'::uuid) and user_b_id = greatest('$USER_X'::uuid, '$OTHER'::uuid);" "Date proposals are a MatchGPT+ feature"
check BLOCKED "A44 signed-out visitor calls is_admin()" anon "" "" \
  "select public.is_admin();" "permission denied"
check BLOCKED "A45 signed-out visitor reads reports, verification requests or the admin tables" anon "" "" \
  "select (select count(*) from public.reports) + (select count(*) from public.verification_requests)
        + (select count(*) from public.admin_emails) + (select count(*) from public.admin_audit);" "permission denied"
echo
echo "Normal app use — must keep working:"
check ALLOWED "N1  user reads their own profile row" authenticated "$USER_X" "x@example.com" \
  "select 'rows=' || count(*) from public.profiles;" "rows=1"
check ALLOWED "N2  user edits normal fields (onboarding, hidden fields, theme)" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set name = 'New Name', hobbies = 'hiking', email_verified = true, hidden_fields = '{religion}', settings_theme = 'dark' where id = '$USER_X' returning name;"
check ALLOWED "N3  admin is recognised (is_admin)" authenticated "$ADMIN" "owner@example.com" \
  "select 'is_admin=' || public.is_admin();" "is_admin=true"
check ALLOWED "N4  admin verifies a user" authenticated "$ADMIN" "owner@example.com" \
  "select public.admin_verify_user('$OTHER'); reset role; select 'verified=' || is_verified from public.profiles where id = '$OTHER';" "verified=true"
check ALLOWED "N5  admin reads admin_emails" authenticated "$ADMIN" "owner@example.com" \
  "select 'rows=' || count(*) from public.admin_emails;" "rows=1"
check BLOCKED "N6  non-admin calls an admin function" authenticated "$USER_X" "x@example.com" \
  "select public.admin_verify_user('$OTHER');" "Forbidden"
check ALLOWED "N7  user submits a verification request" authenticated "$USER_X" "x@example.com" \
  "select public.submit_verification_request('https://linkedin.com/in/x', 'https://instagram.com/x', '', '', '');
   reset role; select 'status=' || verification_status from public.profiles where id = '$USER_X';" "status=pending"
check ALLOWED "N8  server (service role) bans a user" service_role "" "" \
  "update public.profiles set is_banned = true where id = '$OTHER' returning is_banned;"
check ALLOWED "N9  server reads pending_pushes (send-push function)" service_role "" "" \
  "select 'rows=' || count(*) from public.pending_pushes;" "rows=1"
check ALLOWED "N10 server calls increment_push_failure (send-push)" service_role "" "" \
  "select public.increment_push_failure('$PUSH_SUB');"
check ALLOWED "N11 sign-up creates a profile (as Supabase Auth's role)" supabase_auth_admin "" "" \
  "insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000d', 'new@example.com', now());
   reset role; select 'profiles=' || count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d';" "profiles=1"
check ALLOWED "N12 Likes You shows the like the user received" authenticated "$USER_X" "x@example.com" \
  "select 'likes_received=' || count(*) from public.get_likes_received('$USER_X');" "likes_received=1"
check ALLOWED "N13 liking back creates a match that shows in Matches" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id) values ('$USER_X', '$OTHER');
   select 'matches=' || count(*) from public.get_matches_with_profile('$USER_X');" "matches=1"
check ALLOWED "N14 free user sends 15 likes in a day (server counts them)" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 15) g;
   select 'likes today=' || daily_like_count from public.profiles where id = '$USER_X';" "likes today=15"
check ALLOWED "N15 Pro user: no daily limit, Super Likes allowed" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.profiles set subscription_tier = 'PRO' where id = '$USER_X'; set local role authenticated;
   insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 16) g;
   insert into public.likes (liker_id, liked_id, is_super_like) values ('$USER_X', '$OTHER', true); select 'ok';" "ok"
check ALLOWED "N16 admin resolves a report" authenticated "$ADMIN" "owner@example.com" \
  "select public.admin_update_report('$REPORT', 'resolved', 'handled');
   reset role; select 'status=' || status from public.reports where id = '$REPORT';" "status=resolved"
check ALLOWED "N17 user exports their own data" authenticated "$USER_X" "x@example.com" \
  "select case when public.export_my_data() ? 'profile' then 'export ok' end;" "export ok"
check ALLOWED "N18 member asks is_admin() (false, no error)" authenticated "$USER_X" "x@example.com" \
  "select 'is_admin=' || public.is_admin();" "is_admin=false"

check ALLOWED "N19 admin lists every user" authenticated "$ADMIN" "owner@example.com" \
  "select 'users=' || count(*) from public.admin_search_users('', 50);" "users=23"
check ALLOWED "N20 admin finds a user by email" authenticated "$ADMIN" "owner@example.com" \
  "select 'found=' || count(*) || ' ' || min(email) from public.admin_search_users('x@example', 50);" "found=1 x@example.com"
check ALLOWED "N21 admin lists reports with both people's details" authenticated "$ADMIN" "owner@example.com" \
  "select 'reporter=' || reporter_email || ' reported=' || reported_email from public.admin_list_reports(true);" \
  "reporter=x@example.com reported=v@example.com"
check ALLOWED "N22 server reads the send-push config (cron secret exists)" service_role "" "" \
  "select 'secret_len=' || length(cron_secret) from public.send_push_config();" "secret_len=64"
check ALLOWED "N23 server saves VAPID keys once; a second pair can't replace them" service_role "" "" \
  "select 1 from public.save_vapid_keys('pub1', 'priv1');
   select 'pub=' || vapid_public_key || ' priv=' || vapid_private_key from public.save_vapid_keys('pub2', 'priv2');" "pub=pub1 priv=priv1"
check ALLOWED "N24 signed-in user gets the VAPID public key (none yet)" authenticated "$USER_X" "x@example.com" \
  "select 'key=' || coalesce(public.vapid_public_key(), 'none');" "key=none"
check ALLOWED "N25 search gets the last-active time of people with Active Status on" service_role "" "" \
  "select 'admin=' || case when e ->> 'last_active_at' is null then 'hidden' else 'shown' end from jsonb_array_elements(public.search_candidates('$USER_X')) e where e ->> 'id' = '$ADMIN';" "admin=shown"

check ALLOWED "N26 search pool: everyone else who can be shown (service role)" service_role "" "" \
  "select 'pool=' || jsonb_array_length(public.search_candidates('$USER_X'));" "pool=22"
check ALLOWED "N27 search pool leaves out blocked, banned, paused, incognito, liked, wrong gender" service_role "" "" \
  "insert into public.blocks (blocker_id, blocked_id) values ('$USER_X', (select $EXTRA from generate_series(1, 1) g));
   insert into public.blocks (blocker_id, blocked_id) values ((select $EXTRA from generate_series(2, 2) g), '$USER_X');
   update public.profiles set is_banned = true where id = (select $EXTRA from generate_series(3, 3) g);
   update public.profiles set is_paused = true where id = (select $EXTRA from generate_series(4, 4) g);
   update public.profiles set settings_incognito = true where id in ((select $EXTRA from generate_series(5, 5) g), '$OTHER');
   insert into public.likes (liker_id, liked_id) values ('$USER_X', (select $EXTRA from generate_series(6, 6) g));
   update public.profiles set gender = 'Woman', interested_in = 'Men' where id = '$USER_X';
   update public.profiles set gender = 'Male', interested_in = 'Men' where id = (select $EXTRA from generate_series(7, 7) g);
   update public.profiles set gender = 'Woman', interested_in = 'Everyone' where id = (select $EXTRA from generate_series(8, 8) g);
   update public.profiles set gender = 'Man', interested_in = 'Women' where id = (select $EXTRA from generate_series(9, 9) g);
   select 'pool=' || jsonb_array_length(p) || ' liked_kept=' || jsonb_array_length(public.search_candidates('$USER_X', null, false))
       || ' v_incognito_liked_me=' || (p @> jsonb_build_array(jsonb_build_object('id', '$OTHER')))
       || ' man_for_women=' || (p @> jsonb_build_array(jsonb_build_object('id', (select $EXTRA from generate_series(9, 9) g))))
     from (select public.search_candidates('$USER_X', null, true) p) s;" "pool=14 liked_kept=15 v_incognito_liked_me=true man_for_women=true"
check ALLOWED "N28 search pool for given people only (Standouts)" service_role "" "" \
  "select 'pool=' || jsonb_array_length(public.search_candidates('$USER_X', array['$OTHER', '$USER_X']::uuid[]));" "pool=1"
check ALLOWED "N29 free user: 3 searches a day, the 4th is refused" service_role "" "" \
  "select 'allowed=' || string_agg(public.consume_search('$USER_X') ->> 'allowed', ',') from generate_series(1, 4);
   select 'count=' || daily_search_count from public.profiles where id = '$USER_X';" "allowed=true,true,true,false
count=3"
check ALLOWED "N30 search count starts again on a new day" service_role "" "" \
  "update public.profiles set daily_search_count = 3, last_search_date = current_date - 1 where id = '$USER_X';
   select 'remaining=' || (public.consume_search('$USER_X') ->> 'remaining');" "remaining=2"
check ALLOWED "N31 Pro user: unlimited searches" service_role "" "" \
  "update public.profiles set subscription_tier = 'PRO' where id = '$USER_X';
   select 'allowed=' || bool_and((public.consume_search('$USER_X') ->> 'allowed')::boolean) || ' remaining=' || coalesce(max(public.consume_search('$USER_X') ->> 'remaining'), 'unlimited')
     from generate_series(1, 5);" "allowed=true remaining=unlimited"
check ALLOWED "N32 user reads cards of people they liked, matched or blocked" authenticated "$USER_X" "x@example.com" \
  "reset role; insert into public.likes (liker_id, liked_id) select '$USER_X', $EXTRA from generate_series(1, 1) g;
   insert into public.blocks (blocker_id, blocked_id) select '$USER_X', $EXTRA from generate_series(2, 2) g; set local role authenticated;
   select 'cards=' || count(*) from public.get_profile_cards(array(select $EXTRA from generate_series(1, 3) g));" "cards=2"
check ALLOWED "N33 search function saves and reuses a Gemini plan (service role)" service_role "" "" \
  "insert into public.search_prompt_cache (key, plan) values ('k1', '{\"gender\": \"woman\"}');
   insert into public.search_prompt_cache (key, plan) values ('k1', '{\"gender\": \"man\"}')
     on conflict (key) do update set plan = excluded.plan, created_at = now();
   select 'plan=' || (plan ->> 'gender') from public.search_prompt_cache where key = 'k1';" "plan=man"

check ALLOWED "N34 user reads their own subscription and payments" authenticated "$USER_X" "x@example.com" \
  "reset role; insert into public.subscriptions (id, user_id, plan_id, mode, provider, store_subscription_id, status) values ('00000000-0000-0000-0000-0000000000d1', '$USER_X', 'monthly', 'test', 'google_play', 'sub_x', 'active'), ('00000000-0000-0000-0000-0000000000d2', '$OTHER', 'monthly', 'test', 'google_play', 'sub_v', 'active'); insert into public.payments (user_id, subscription_id, provider, store_order_id, amount, status) values ('$OTHER', '00000000-0000-0000-0000-0000000000d2', 'google_play', 'pay_v', 99900, 'captured'); insert into public.payments (user_id, subscription_id, provider, store_order_id, amount, status) values ('$USER_X', '00000000-0000-0000-0000-0000000000d1', 'google_play', 'pay_x', 99900, 'captured');
   set local role authenticated;
   select 'subs=' || (select count(*) from public.subscriptions) || ' payments=' || (select count(*) from public.payments);" "subs=1 payments=1"
check ALLOWED "N35 a paid subscription gives Pro until the period ends, then it ends" service_role "" "" \
  "insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id, status, current_start, current_end)
   values ('$USER_X', 'monthly', 'test', 'google_play', 'sub_n35', 'active', '2030-01-01', '2030-02-01');
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'paid=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X');
   update public.subscriptions set status = 'cancelled', current_end = now() - interval '4 days' where store_subscription_id = 'sub_n35';
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'ended=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X');" "paid=PRO/2030-02-01
ended=FREE/-"
check ALLOWED "N36 free trial gives Pro until it ends; cancelling during the trial keeps it" service_role "" "" \
  "insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id, status, trial_ends_at)
   values ('$USER_X', 'yearly', 'test', 'google_play', 'sub_n36', 'authenticated', '2030-03-01');
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'trial=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X');
   update public.subscriptions set status = 'cancelled' where store_subscription_id = 'sub_n36';
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'cancelled=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X');" "trial=PRO/2030-03-01
cancelled=PRO/2030-03-01"
check ALLOWED "N40 cancelled after being charged: the old trial doesn't count" service_role "" "" \
  "insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id, status, trial_ends_at, current_start, current_end)
   values ('$USER_X', 'monthly', 'test', 'google_play', 'sub_n40', 'cancelled', now() + interval '5 days', now() - interval '40 days', now() - interval '10 days');
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'charged_then_cancelled=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X');" "charged_then_cancelled=FREE/-"
check ALLOWED "N37 failed renewal: Pro through a 3-day grace; halted ends it" service_role "" "" \
  "insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id, status, current_end)
   values ('$USER_X', 'monthly', 'test', 'google_play', 'sub_n37', 'pending', now() - interval '1 day');
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'retrying=' || (select subscription_tier from public.profiles where id = '$USER_X');
   update public.subscriptions set status = 'halted' where store_subscription_id = 'sub_n37';
   do \$\$ begin perform public.sync_pro_status('$USER_X'); end \$\$;
   select 'halted=' || (select subscription_tier from public.profiles where id = '$USER_X');" "retrying=PRO
halted=FREE"
check ALLOWED "N38 hourly job ends Pro 3 days after the period; hand-given Pro stays" service_role "" "" \
  "update public.profiles set subscription_tier = 'PRO', subscription_renews_at = now() - interval '4 days' where id = '$USER_X';
   update public.profiles set subscription_tier = 'PRO', subscription_renews_at = null where id = '$OTHER';
   select 'ended=' || public.expire_pro_subscriptions();
   select 'x=' || (select subscription_tier || '/' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from public.profiles where id = '$USER_X') || ' v=' || (select subscription_tier from public.profiles where id = '$OTHER');" "ended=1
x=FREE/- v=PRO"
check ALLOWED "N39 changing a plan records when it changed" service_role "" "" \
  "update public.billing_plans set amount = 79900 where id = 'monthly';
   select 'stamped=' || (updated_at = now()) from public.billing_plans where id = 'monthly';" "stamped=true"
check ALLOWED "N41 every sale is by Google Play or the App Store, with its id" service_role "" "" \
  "do \$\$
   declare refused int := 0;
   begin
     begin insert into public.subscriptions (user_id, plan_id, mode, provider, store_subscription_id) values ('$USER_X', 'monthly', 'test', 'razorpay', 'sub_n41');
     exception when check_violation then refused := refused + 1; end;
     begin insert into public.subscriptions (user_id, plan_id, mode, provider) values ('$USER_X', 'monthly', 'test', 'google_play');
     exception when not_null_violation then refused := refused + 1; end;
     begin insert into public.payments (user_id, provider, store_order_id, amount, status) values ('$USER_X', 'razorpay', 'pay_n41', 99900, 'captured');
     exception when check_violation then refused := refused + 1; end;
     begin insert into public.payments (user_id, provider, amount, status) values ('$USER_X', 'app_store', 99900, 'captured');
     exception when not_null_violation then refused := refused + 1; end;
     perform set_config('n41.refused', refused::text, true);
   end \$\$;
   select 'refused=' || current_setting('n41.refused');" "refused=4"
check ALLOWED "N42 the date of birth sets the age (India time)" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set date_of_birth = ((now() at time zone 'Asia/Kolkata')::date - interval '30 years')::date, age = 50 where id = '$USER_X';
   select 'age=' || age from public.profiles where id = '$USER_X';" "age=30"
check ALLOWED "N43 the daily job moves ages on at birthdays" service_role "" "" \
  "reset role;
   update public.profiles set date_of_birth = ((now() at time zone 'Asia/Kolkata')::date - interval '30 years')::date where id = '$USER_X';
   set local session_replication_role = replica;  -- yesterday's age, written without the triggers
   update public.profiles set age = 29 where id = '$USER_X';
   set local session_replication_role = origin;
   update public.profiles set age = public.age_on_today(date_of_birth)
    where date_of_birth is not null and age is distinct from public.age_on_today(date_of_birth);
   select 'age=' || age from public.profiles where id = '$USER_X';" "age=30"
check BLOCKED "N44 a date of birth under 18 is refused" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set date_of_birth = current_date - interval '17 years' where id = '$USER_X';" "profiles_age_check"
check ALLOWED "N45 height in cm follows the height (and can't be set on its own)" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set height = '5'' 8\" (173 cm)', height_cm = 250 where id = '$USER_X';
   select 'cm=' || height_cm from public.profiles where id = '$USER_X';
   update public.profiles set height = '178' where id = '$USER_X';
   select 'typed=' || height_cm from public.profiles where id = '$USER_X';" "cm=173
typed=178"
check ALLOWED "N46 city, state and country make the location people see" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set city = 'Surat', state = 'Gujarat', country = 'India' where id = '$USER_X';
   select 'india=' || location from public.profiles where id = '$USER_X';
   update public.profiles set city = 'Austin', state = 'Texas', country = 'United States' where id = '$USER_X';
   select 'abroad=' || location from public.profiles where id = '$USER_X';
   update public.profiles set city = 'Delhi', state = 'Delhi', country = 'India' where id = '$USER_X';
   select 'same_name=' || location from public.profiles where id = '$USER_X';" "india=Surat, Gujarat
abroad=Austin, United States
same_name=Delhi"
check BLOCKED "N47 the new answers have limits (about the family: 1,000 characters)" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set about_family = repeat('x', 1001) where id = '$USER_X';" "profiles_about_family_length"
check BLOCKED "N48 time of birth must be a time" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set birth_time = '25:61' where id = '$USER_X';" "profiles_birth_time_format"
check ALLOWED "N49 user saves the India answers on their own profile" authenticated "$USER_X" "x@example.com" \
  "update public.profiles set profile_created_for = 'Daughter', marital_status = 'Never Married', mother_tongue = 'Hindi (Delhi)',
     religion = 'Hindu', caste = 'Brahmin', sub_caste = 'Saraswat', gotra = 'Kashyapa', manglik = 'Non Manglik', birth_time = '06:45',
     degree = 'MBBS (Bachelor of Medicine and Bachelor of Surgery)', annual_income = '₹10–15 lakh', family_type = 'Joint family',
     brothers = '2', brothers_married = '1', about_family = 'We live in Delhi.' where id = '$USER_X';
   select 'saved=' || mother_tongue || '/' || caste || '/' || brothers || '+' || brothers_married from public.profiles where id = '$USER_X';" \
  "saved=Hindi (Delhi)/Brahmin/2+1"
check ALLOWED "N50 free user sends a Super Like (MatchGPT+ for everyone)" authenticated "$USER_X" "x@example.com" \
  "insert into public.likes (liker_id, liked_id, is_super_like) select '$USER_X', $EXTRA, true from generate_series(1, 1) g;
   select 'super=' || count(*) from public.likes where liker_id = '$USER_X' and is_super_like;" "super=1"
check ALLOWED "N51 member reads whether MatchGPT+ is for everyone" authenticated "$USER_X" "x@example.com" \
  "select 'on=' || public.pro_for_all();" "on=true"
check ALLOWED "N52 admin turns MatchGPT+ for everyone off, in the audit log" authenticated "$ADMIN" "owner@example.com" \
  "select public.admin_set_pro_for_all(false);
   select 'on=' || public.pro_for_all() || ' audited=' || count(*) from public.admin_audit where action = 'set_pro_for_all';" "on=false audited=1"
check ALLOWED "N53 subscriber sees who liked them (MatchGPT+ for subscribers only)" authenticated "$USER_X" "x@example.com" \
  "reset role; update public.app_settings set pro_for_all = false; update public.profiles set subscription_tier = 'PRO' where id = '$USER_X';
   insert into public.likes (liker_id, liked_id) values ('$OTHER', '$USER_X') on conflict do nothing; set local role authenticated;
   select 'shown=' || bool_and(liker_id is not null and liker_name is not null) from public.get_likes_received('$USER_X');" "shown=true"
echo
if [[ $fails -eq 0 ]]; then echo "All checks passed."; else echo "$fails check(s) FAILED."; exit 1; fi
