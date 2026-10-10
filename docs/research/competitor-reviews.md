# What members of other matrimony apps complain about

Written 10 October 2026. What 1- and 2-star reviews of India's biggest matrimony apps say, and what Shaadi24
does about each problem.

## How

13,707 reviews of 9 apps were read: Shaadi.com, Jeevansathi, BharatMatrimony, Sangam, Betterhalf, Tamil Matrimony,
Kerala Matrimony, Telugu Matrimony and NikahForever. They were the newest and the most-liked reviews on Google Play
(India), plus the newest on the Indian App Store. 5,341 different reviews gave 1 or 2 stars. They were grouped by the
words they use (in English, Hindi and Hinglish), and samples of each group were read to check the grouping. A review
can count under several problems, so the counts are approximate.

## The 20 problems, most common first

| # | Problem | Reviews | Shaadi24 | Phase |
|---|---|---|---|---|
| 1 | Fake profiles, bots, marriage-bureau agents | ~1,740 | Photo and bio approval, Scam alerts, throwaway emails refused, one account per inbox, 3 per phone. The Verified badge needs a selfie with a gesture; "An agent or marriage bureau" is a report reason. | 4 (done) |
| 2 | Crashes, freezes, broken updates | ~830 | Every change is tested before it ships. Crash reports from phones and gradual releases next. | 5 |
| 3 | Support that doesn't help | ~710 | Complaints with a ticket and legal deadlines. "My requests" shows each verification, complaint and report with our answer, and a message says when one is answered. | 4 (done) |
| 4 | Nobody replies; dead profiles; fake "last seen" | ~600 | "Online" is never faked. Inactive profiles leave search, interests expire, a "Usually replies" badge, "I found my match". | 2 (done) |
| 5 | Daily sales calls | ~440 | No sales team. Now a written promise. | 1 (done) |
| 6 | Too expensive | ~420 | From ₹499 a week. Now a public price list with the price a day. | 1 (done) |
| 7 | Basics locked behind payment; "free" ads that aren't | ~390 | Chatting after a match is free. Now said plainly, and one free "Likes You" a day. | 1 (done) |
| 8 | Refunds refused, auto-renewal, double charges | ~300 | Paid only through the stores. A reminder before each renewal next. | 5 |
| 9 | Matches dry up after paying | ~260 | Paying doesn't change matches. A "Your week" card next. | 5 |
| 10 | The same profiles again and again | ~250 | "Not interested" for good, no repeats in Standouts, "New" on new members. | 2 (done) |
| 11 | Too few relevant profiles | ~240 | Near misses below few results; saved searches with a daily alert about new members. | 3 (done) |
| 12 | Can't log in, no code, reset broken | ~200 | Errors in plain words and a "Still no email?" box. | 1 (done) |
| 13 | Matches ignore preferences | ~120 | Search filters are strict. Partner preferences decide Standouts, start searches and have their own alert. | 3 (done) |
| 14 | Missing search options; can't save a search | ~120 | Saved searches; "Family from (state)" and "Profile managed by" filters. | 3 (done) |
| 15 | Fake interests to make people pay | ~130 | None, ever. Now a written promise. | 1 (done) |
| 16 | Hidden or missing photos | ~100 | A face photo is required; no paid photo locks. The Verified badge needs two. | 4 (done) |
| 17 | Privacy: numbers made public, data copied | ~100 | Phone and email never shown; "Share my number" in chat when the member chooses; screenshots blocked in the Android app. | 4 (done) |
| 18 | Members running money scams | dozens | Chat notes on money, "digital arrest" and moving to WhatsApp fast; a scams section on the Safety page. | 1 (done) |
| 19 | Verification stuck | ~120 | Since when it's in review ("taking longer than usual" after 48 hours), the reason when it isn't approved, and Try again. | 4 (done) |
| 20 | Interests sent by mistake can't be undone | ~40 | Undo after sending; Withdraw in Search History. | 1 (done) |

Also mentioned less often: accounts suspended without a reason, daily caps even on paid plans, profiles that can't be
deleted, too many notifications, both people having to pay before they can talk, men paying while women use the app
free, and a separate subscription for each sister site.

## Phase 1 (done)

- **Promises** (`lib/promises.ts`): no sales calls, every interest from a real member, chatting free, clear prices.
  On the welcome screen, the Shaadi24+ page and the website, which also lists the prices with the price a day.
- **Undo and Withdraw** (`interest_status()`, `refund_undone_interest()`): an interest can be taken back until it
  becomes a match. Undone within a minute, it doesn't use up one of the day's likes, and a bought Super Interest comes
  back.
- **One free "Likes You" a day** (`reveal_like()`, `app_settings.free_like_reveals_per_day`): without Shaadi24+, a
  member can see who one person who liked them is, each day. The database only sends who it is after that.
  While "Shaadi24+ for everyone" is on, everyone sees all of them anyway.
- **Chat notes** (`lib/scamWarning.ts`): money talk and "digital arrest" under every such message (and in Admin →
  Scam alerts); moving to WhatsApp or a video call under the first such message in a chat.
- **Sign-in** (`lib/authErrors.ts`): errors in plain words; "Still no email?" after a resend.

## Phase 2 (done)

- **Not interested** (`passed_profiles`): the X on a card, or ⋯ → Not interested on a profile, hides that person
  from search and Standouts for good, with Undo; Settings → Hidden profiles shows them again.
- **Inactive profiles leave search**: nobody who hasn't opened the app for 60 days
  (`app_settings.inactive_hide_days`) is in search or Standouts, until they come back.
- **Interests expire** (`interest_active()`): one nobody answered in 14 days (a Super Interest in 28;
  `app_settings.interest_expiry_days`) leaves the other person's Likes You and the family's shortlist; the sender sees
  it as expired in Search History, can find the person in search again, and can send another. Nothing is deleted.
- **Labels on cards**: "New" in a member's first week, "Usually replies" for someone who answered at least 3 people
  who wrote to them, and 70% of them, in the last 90 days (`member_stats`, worked out every day).
- **Standouts don't repeat**: nobody picked in the last 30 days is picked again while there are others.
- **I found my match** (Settings): hides the profile, and passes the story the member may tell to the team,
  unpublished (`found_my_match()`, `success_stories`).

## Phase 3 (done)

- **Partner preferences** (`partner_preferences`; My Profile, and Edit from the filters and Standouts): ages, heights,
  religions, mother tongues, marital status, diets, Manglik, states and countries, no smoking or drinking.
  - Standouts put the people who fit them first (someone who hasn't answered isn't held against).
  - Search starts from them ("Use my partner preferences" in the filters, on by default); a filter the member sets
    replaces the preference about the same thing. Without Shaadi24+, only age and place apply, like the filters.
  - With alerts on, a notification once a day about new members who fit; they wait in Search History.
- **Near misses**: when a search finds fewer than 5, up to 10 people who miss one thing by a little are shown below,
  each saying what ("Age 31", "Height 6'2\"", "Not verified yet", the next level of education, "Not online right
  now"). Religion, community, place and the like are never "a little".
- **Saved searches** (`saved_searches`, up to 10): "Save this search" on the results, or when nothing is found. Each
  has a daily alert (the bell turns it off). The `search-alerts` job (8:43 every morning, India time) calls the search
  function with the push cron secret; it looks at members listed since the last look (`profiles.listed_at`), keeps who
  fits, and sends one notification. Search History shows "N new"; looking at them doesn't use a search. Only the
  server writes who an alert found, so it can't be used to see profiles without searching.
- **New filters**: "Family from (state)" (a new My Profile answer, "Family's home state", taken from "Family lives in"
  where that names a state) and "Profile managed by" (the member, parents, or a sibling, relative or friend, from
  "Profile created for"). Both free.

## Phase 4 (done)

- **Selfie check** (`verification-selfies`, a private bucket; `verification_pose()`): the Verified badge needs two
  photos of the member and a selfie doing a gesture the server picks (the same all day, so it can't be chosen to
  suit an old photo). Social media links are optional now. Only the member and the verification team can open the
  selfie; the admin panel shows it next to the profile photos and deletes it once decided, and deleting the account
  deletes it too.
- **Verification status and reasons**: a request in review says since when, and "taking longer than usual" after 48
  hours. Turning one down needs a reason (`verification_requests.reason_code`), which the member reads with what to
  do, the team's note, and Try again. Either way the member gets a message and a notification.
- **My requests** (Settings; `my_requests()`): verification requests, complaints and reports, where each stands and
  our answer. A report says only whether we acted, never what happened to the other member and never the team's
  notes (members can't read those notes any more). Answering a complaint or a report sends the member a message.
- **"An agent or marriage bureau"** as a reason to report someone, with its own admin alert.
- **Share my number** (chat ⋯; `share_my_number()`): the member's own number into the chat as a card with Call,
  WhatsApp and Copy, and a safety line. Only that function can send one. It can't be taken back, which the sheet
  says.
- **Screenshots blocked** in the Android app (`FLAG_SECURE`), which also hides the app in the recent-apps list.
- **Chat messages can't be changed**: until now either person in a chat could rewrite the other's messages through
  the database; now only the person a message was sent to can mark it read.
- **Download my data** adds partner preferences, saved searches, hidden profiles, complaints and an "I found my
  match" story; Privacy Policy and Terms updated (members accept them again).

