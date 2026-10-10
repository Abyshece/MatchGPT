# Shaadi24 security: what protects the app, and what's left for you

Written 10 October 2026. This covers hacking, fake and repeat accounts, and scammers.

## In short

No app can be made impossible to hack, but Shaadi24 already does what the big matrimony apps do.
The database refuses anything a member isn't allowed to see or change, even if someone bypasses the
app. Fake accounts are slowed down at sign-up, limited in what they can do for free, and flagged to
your team.

## 1. Against hacking

| What | How |
|---|---|
| Every table is locked by default | Supabase row-level security on all tables: a member can only read or change their own data, and what others see goes through functions that hide private fields (phone, email, hidden answers). The live security check (Supabase advisor) shows no open tables. |
| The secret keys stay on the server | The app only has the public key. Payments, notifications, AI search and admin work run on the server with keys the app never sees. |
| Sign-in | Email with a confirmation code, Google, or Apple. Passwords are at least 8 characters and are stored hashed by Supabase, never in plain text. |
| Admins | Admin pages need an admin email, two-step sign-in (an authenticator app code) and a role (owner, moderator, support). Every admin action is logged. |
| Public forms are rate-limited | The contact form, complaints form, error reports and family links refuse floods (too many from one source in a short time). |
| Website headers (new) | The website tells browsers to use HTTPS only, not to be shown inside other sites (clickjacking), not to guess file types, and not to allow camera, microphone or location. |
| Purchases | Checked with Apple and Google on the server before anything is unlocked; the app can't grant itself Shaadi24+. |

## 2. Against fake and repeat accounts

Free AI searches are per account, so the way to get more is more accounts. Each layer below makes
that slower and more visible:

1. **The email must be real and confirmed.** An account can't sign in until the 6-digit code from the
   email is entered.
2. **No throwaway addresses (new).** 9,221 temporary-email domains (Mailinator, YOPmail,
   10 Minute Mail…) are refused at sign-up, by the database itself. Gmail, Yahoo, Outlook,
   Rediffmail, iCloud and Apple's Hide My Email, Proton, Zoho and Sify are all fine.
3. **One mailbox, one account (new).** Gmail ignores dots and anything after a +, so
   `a.bc+2@gmail.com` is the same inbox as `abc@gmail.com`. A second account on the same inbox can't
   search ("You already have a Shaadi24 account with this email address…").
4. **One phone, at most 3 accounts with free searches (new).** The app sends a scrambled ID of the
   phone with each search. A 4th account on the same phone within 90 days needs Shaadi24+ to
   search. Three covers a parent making profiles for their children. You can change the number
   (`app_settings.free_accounts_per_phone`).
5. **Unverified accounts stop searching after 3 days.** To keep going, a member gets the Verified
   badge (your team checks their social profiles).
6. **Search limits** per account: so many every 5 hours, a day and a week.
7. **Admin → Scam alerts** shows: the same photo on two accounts, a second account on the same
   mailbox (new), 4 or more accounts on one phone (new), and a banned member back with a new account
   (same phone number, name and birth date, social link, photo, or phone).

Your team's own test accounts (on an admin's mailbox, for example `you+test1@gmail.com`) aren't
limited.

**What these can't stop:** someone with several real email addresses and several phones. That's
expensive for a scammer, and their accounts still show up in Scam alerts. The step that stops it is
**phone-number verification by SMS** (see section 4).

## 3. Against scammers

| What | How |
|---|---|
| Photos and "about me" are approved first | Your team checks new photos and text before other members see them (Admin → Moderation). |
| Word filter | Sexual, abusive and hateful words (English and Hindi) are refused in chats and profiles. |
| Report and Block | On every profile and chat; reports have a deadline in Admin → Reports. |
| Scam alerts | Money or investment talk in chats, the same message pasted to many people, dozens of likes in an hour, reports or blocks from several members. |
| Warning in chat (new) | When the other person asks for money, UPI or bank details, crypto, gift cards or "customs fees", the member sees: "Never send money or share bank, UPI or card details with someone you haven't met. Shaadi24 never asks for them." with a Report button. |
| Contact details stay private | Phone and email are never shown to other members. |
| Safety page | /safety on the website and in the app. |

## 4. What you should do (only you can)

1. **Run two database updates in Supabase → SQL Editor** (they contain `delete` and `drop`
   statements, so they wait for your approval):
   - `supabase/migrations/20261004094100_phase13_phone_notifications_signout.sql`. **Do this one
     first, it's a privacy fix.** Signing out of the app doesn't currently stop that phone getting
     the account's notifications, because the function it calls was never added to the live
     database. This adds it, keeps each account to its 10 latest phones, and clears the
     notification queue after a week. It's safe to run twice.
   - `supabase/migrations/20261005222759_phase10_no_razorpay.sql`. This removes the old Razorpay
     columns. It's housekeeping only.
2. **Supabase → Authentication → Attack Protection:**
   - Turn on **leaked-password protection** (refuses passwords found in known leaks; paid plans).
   - Set the **minimum password length to 8** to match the app.
   - Check the **rate limits** (sign-ups and sign-ins per hour from one address). The defaults are
     reasonable; lower them if you see bursts of sign-ups.
3. **Phone verification by SMS (recommended before a big launch).** This is what Shaadi.com and
   BharatMatrimony do: one phone number, one account. It needs an SMS provider (MSG91 or Twilio,
   about ₹0.15–0.25 a message) and DLT registration with an Indian telecom operator (required for
   business SMS in India). Supabase supports it directly. Tell me when you have the provider and
   I'll build it.
4. **Optional: a CAPTCHA on sign-up** (Cloudflare Turnstile, free) if bots start creating
   accounts. It goes on Supabase → Authentication → Attack Protection, with a site key in the app.
5. **App Store and Google Play privacy forms:** add "Device ID: fraud prevention" (the answers are in
   `docs/store/README.md`).
6. **Two old test accounts** on one Gmail inbox (aby…@gmail.com, made on 28 September and
   7 October) are now second accounts on that inbox and can't search. Use the first account, make
   them Shaadi24+, or delete them.

## 5. Checked on the live database (10 October 2026)

- Supabase's security advisor flags no exposed data. The notes it does show are expected:
  server-only tables with no direct access, admin functions that check the caller is an admin,
  public forms that are rate-limited, and pg_net installed in the public schema (Supabase's default).
- Leaked-password protection is off (step 2 above).
- Two migrations were never applied live (step 1 above).
