# Shaadi24: compliance with Indian law

A check of the whole product (the Android and iPhone apps, the website and the admin panel, the database and
the server) against the Indian laws that apply to a matrimony service, what was changed to follow them, and
what is left for the owner and a lawyer.

- **Checked:** 6 October 2026, against the laws as they stood that day (the IT Rules 2021 as amended on
  10 February 2026; the DPDP Act 2023 and the DPDP Rules 2025).
- **Documents now in force:** Terms of Service `terms-v6-2026-10-06`, Privacy Policy `privacy-v12-2026-10-06`,
  plus the new Grievance Redressal, Community Guidelines and Safety, and Refund and Cancellation pages.

> **This is not legal advice.** It was prepared to make a lawyer's review quick, not to replace it. Before
> launch, an advocate practising in Indian technology and consumer law should read the five legal pages
> and the list in [For the lawyer](#for-the-lawyer).

## In short

Shaadi24 is, in law:

- an **intermediary** under the Information Technology Act, 2000: it hosts what members post. It keeps the
  protection of section 79 only if it follows the due-diligence duties of the IT Rules 2021;
- a **matrimonial website** covered by the Government's 2016 advisory for them;
- a **Data Fiduciary** under the Digital Personal Data Protection Act, 2023, holding sensitive details
  (religion, caste, health, sexuality, photos). Until the DPDP Rules fully apply (about 13 May 2027), the
  SPDI Rules 2011 apply;
- an **e-commerce entity** under the Consumer Protection Act, 2019, because it sells Shaadi24+ online
  (through Google Play and the App Store).

What changed in the product is listed in [What was changed](#what-was-changed). Before launch, the owner
still has to supply the details in [Before launch: from you](#before-launch-from-you). Nothing in the
product itself blocks launch once those are in.

## Before launch: from you

These go in `lib/legalInfo.ts` (one file; every page reads it). Until then the pages say "to be published
before launch" where an address is missing.

| What | Why | Where it shows |
|---|---|---|
| The operator's **legal name**, and whether it's you as a sole proprietor or a company/LLP (now: "Abhishek", sole proprietor) | Consumer Protection (E-Commerce) Rules 2020, rule 4(2); IT Rules 3(2)(a); DPDP Rules, rule 3 | Terms, Privacy, Grievances, website footer |
| The **registered address** | E-Commerce Rules, rule 4(2)(a) | Terms, Privacy, Grievances |
| **CIN** (a company) or **GSTIN** (if registered) | E-Commerce Rules, rule 4(2) | Terms |
| The **Grievance Officer**: name and a phone number (now: "Abhishek", no phone). Must be someone who can act within 2 hours, every day | IT Rules 3(2)(a): "the name of the Grievance Officer and his contact details"; E-Commerce Rules 4(4) | Grievances page, Terms, Privacy |
| **Working mailboxes**: support@, privacy@ and grievance@shaadi24.com, read every day | Every page gives them; complaints by email are as valid as by the form | Everywhere |
| The **city whose courts** hear disputes (now: Bengaluru, Karnataka) | Terms, section 14 | Terms |
| The website's **own domain** when it moves from shaadi-gpt.vercel.app | Links in the apps and emails | `websiteUrl` |

Then, outside the code:

1. **Watch the complaints.** Admin → Complaints, and the phone alerts it sends. Intimate images and
   impersonation must be acted on within **2 hours** of a complaint, unlawful content within 36 hours,
   everything else within 7 days. Reply by email to each, then record what was done.
2. **Lawful requests**: a court order, or a written notice from an authorised officer, to remove something
   must be acted on within **3 hours** (IT Rules 3(1)(d)); a written order for information within **72 hours**
   (3(1)(j)). Admin → Users finds the account; the records kept after deletion are in the `legal_holds`
   table (Supabase → Table Editor, as the owner). Keep a copy of each order and what you sent.
3. **CERT-In** (Directions of 28 April 2022 under section 70B(6)): register a point of contact with CERT-In;
   report a cyber security incident to `incident@cert-in.org.in` within **6 hours** of noticing it; keep
   the logs of the systems for **180 days**. Supabase keeps its logs for 1 day (Free) or 7 days (Pro): set
   up a log drain or export (Supabase Team plan, or a daily export job) before launch. Vercel's logs need the
   same.
4. **A personal data breach** (DPDP Act section 8(6); DPDP Rules, rule 7): tell the affected members and the
   Data Protection Board of India without delay, and send the Board a full report within **72 hours**; also
   CERT-In as above. A short plan is in [If data leaks](#if-data-leaks).
5. **Agreements with the companies that process data for Shaadi24** (DPDP Act section 8(2)): accept the
   data processing terms of Supabase, Vercel, Google (Firebase Cloud Messaging, Gemini, Google sign-in, Play)
   and Apple in each one's dashboard. Supabase's project is in Mumbai (ap-south-1); keep it there.
6. **Gemini on a paid plan** before launch: on the free tier Google may use the search text to improve its
   products, which the Privacy Policy would then have to say as "shared" (it now says Google processes it
   for Shaadi24). See `docs/store/README.md`.
7. **An accountant** for GST and income tax on store sales (who the seller of record is in India for Google
   Play and the App Store, and whether TDS under section 194-O applies).
8. **The name.** "Shaadi" is in trademarks of Shaadi.com's owner (People Interactive), who has gone to court
   over them. Have a trade mark attorney search "Shaadi24" and file it (classes 45, 9 and 42) before launch.
9. **Turn on the daily clean-up job**: paste `supabase/migrations/20261006185100_phase10_india_law_purge.sql`
   into Supabase → SQL Editor and run it (see [What was changed](#what-was-changed)).

## What was changed

All of it is in this repository; the database part is `supabase/migrations/…_phase10_india_law.sql`.

**The legal pages** (website: `/terms`, `/privacy`, `/grievances`, `/safety`, `/refunds`; in the apps: Settings
→ Support, and the sign-up and consent screens). Each has a short summary on top and a summary in Hindi at
the end (the English text applies; any Eighth Schedule language on request).

- **Terms of Service** (`components/TermsView.tsx`), rewritten for India: marriage only; who may join (21 for
  men, 18 for women, 21 for other genders; not married, or awaiting a divorce and saying so); profiles made
  for a family member; the 11 kinds of content rule 3(1)(b) of the IT Rules forbids, word for word, plus
  dowry, asking for money, intimate images, fake profiles, scraping; what happens to those who break them;
  Shaadi24+ through the stores; complaints, deadlines and appeals; liability within the law; Indian law and
  courts, consumer commissions; the Hindi summary.
- **Privacy Policy** (`components/PrivacyView.tsx`): the notice the DPDP Act (section 5) and DPDP Rules (rule 3)
  ask for, and a privacy policy under the SPDI Rules 2011 (rule 4): each kind of data and why, the
  sensitive details and the consent for them, who sees what (members, the team, each processor by name),
  where data is kept (Mumbai), security and breaches, **how long each thing is kept**, every right under the
  DPDP Act and how to use it in the app, children, the device, changes, contact.
- **Grievance Redressal** (`components/GrievancesView.tsx`): the Grievance Officer's name, email, address and
  hours; a complaint form for anyone, member or not, that gives a ticket at once (IT Rules 3(2)(a): "a user
  or a victim"); the deadlines; the appeal to the **Grievance Appellate Committee** (gac.gov.in, 30 days,
  rule 3A); the **Data Protection Board**; the **National Consumer Helpline** (1915) and e-Daakhil; emergency
  numbers (112, 181, 1930, cybercrime.gov.in).
- **Community Guidelines and Safety** (`components/SafetyView.tsx`): the rules in plain words, that profiles
  aren't all checked, money scams, meeting safely, reporting and blocking, help numbers (the 2016 advisory
  asks matrimonial sites to warn members of fraud).
- **Refund and Cancellation Policy** (`components/RefundsView.tsx`): prices, cancelling on Android and iPhone,
  refunds through each store, price changes, complaints within 48 hours and a month (E-Commerce Rules 4(5)).

**Marriage only** (the 2016 advisory: "matrimonial websites… only for the purpose of matrimony, not dating"):

- The website's home page and the app's welcome screen say Shaadi24 is for marriage only, not dating, and
  not for obscene material (`data-testid="matrimony-only"`).
- Nobody is asked what they're "looking for" any more; the dating choices (casual, friendship, long-term)
  are gone from sign-up, the profile, the filters and search. The database keeps every profile's intention
  at Marriage, whatever is sent.
- The example searches and the search page's headline speak of a life partner, not coffee or hiking.

**The legal age to marry** (Prohibition of Child Marriage Act, 2006: 21 for men, 18 for women):

- Sign-up, Required details and My Profile check the date of birth against the gender, and so does the
  database (`profiles_legal_rules()`): a man under 21 can't join or change his date of birth or gender to get
  under it. Members of any other gender: 21.
- Members already under the age (one live profile, on 6 October 2026) are hidden from everyone, stay
  hidden whatever they change, and see a screen that says why (`components/UnderAgeScreen.tsx`).

**Consent** (DPDP Act section 6; SPDI Rules rule 5; the 2016 advisory):

- A new consent screen (`components/onboarding/StepConsent.tsx`) with the notice "What we use, and why", and
  separate ticks, none ticked in advance (E-Commerce Rules 4(9); the Dark Patterns Guidelines 2023):
  the Terms and Privacy Policy; looking to marry and giving true details (the advisory); of the legal age
  to marry; the sensitive details; and, optional, emails with tips and news.
- Each is recorded in `consent_records` with the version, the time and the **internet address it came from**
  (the advisory asks for the address a profile was set up from).
- When the Terms or Privacy Policy change, every member is asked again ("We've updated our Terms") before
  using the app. Settings has the email consent on and off.
- A profile made for a son, daughter, sibling, relative or friend needs a tick that they know about it, want
  it, are looking to marry and are of age; that is recorded too.

**The reminder of the rules** (IT Rules 3(1)(c), as amended: "at least once every three months"): every 90
days the app shows what happens to those who break the rules (removal, suspension, penalties under law,
reports to the authorities where the law requires) and records that it was shown
(`components/RulesReminder.tsx`).

**Complaints and reports** (IT Rules 3(2)):

- Complaints go to the `grievances` table with a ticket (SH24-1001 onwards) and the deadline the law sets:
  2 hours for intimate images and impersonation (3(2)(b), as amended), 36 hours for unlawful content
  (3(2)(a), proviso), a month for payments (E-Commerce Rules 4(5)), 7 days for everything else, personal
  data included. Admins get a phone alert at once ("act within 2 hours" for the urgent ones).
- **Admin → Complaints**: the open complaints, most urgent first, with time left or overdue; closing one
  needs a note of what was done, and goes in the audit log.
- Limits against abuse: 5 complaints a day from one email address, 10 from one internet address.
- Reports in the app have two new reasons the law treats urgently, "Shares or threatens to share intimate or
  morphed photos" and "Asks for or offers dowry" (Dowry Prohibition Act 1961, section 4A), and Admin → Reports
  shows how long is left to act on each.

**What's kept, and for how long** (shown in the Privacy Policy, section 6, and on the delete-account page):

| What | How long | Why |
|---|---|---|
| A registration record when an account is deleted: name, email, date of birth, gender, city, when it joined and left, the internet addresses used | 1 year | IT Rules 3(1)(h) (180 days); the 2016 advisory (the address, 1 year); DPDP Rules on records of processing (1 year) |
| What a ban removes: the profile and the last 30 days of the member's messages | 180 days | IT Rules 3(1)(g) |
| Consents | 3 years after the account ends | to show what was agreed |
| Complaints | 3 years after each is closed | to answer appeals and the Board |
| The log of deleted accounts | 1 year | |
| Store purchases | up to 8 years | Income Tax Act, GST Act, Companies Act |

These sit in the `legal_holds` table, which no member or admin screen can read, and a daily job
(`run_legal_retention()`, 21:23 UTC) deletes whatever is past its time. **The job isn't live yet**: its
migration (`supabase/migrations/20261006185100_phase10_india_law_purge.sql`) deletes data, so it has to
be run by you in Supabase → SQL Editor (paste the file, Run). Nothing is due before April 2027.

**Also**: a Help Center answer on how to complain; Settings → Support links to Grievances, Safety and
Refunds; the AI search is told it works for a matrimony app; the store privacy answers and the iPhone
privacy manifest list the phone number a complaint may carry.

## Law by law

Status: **Done** in the product · **You** = something for the owner to do or supply · **Lawyer** = needs a
lawyer's view.

### Information Technology Act, 2000 and the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021

As amended up to G.S.R. 120(E) of 10 February 2026.

| Rule | What it asks | Shaadi24 | Status |
|---|---|---|---|
| 3(1)(a) | Publish the rules, privacy policy and user agreement on the website and app, in English or an Eighth Schedule language | Terms, Privacy, Safety on the website and in the apps, English with Hindi summaries | Done |
| 3(1)(b) | Make reasonable efforts so users don't post the 11 kinds of prohibited content | Terms §5 lists them; the content filter blocks obscene words in profiles and messages; reports and bans | Done |
| 3(1)(c) | Tell users at least every 3 months what happens if they break the rules | The 90-day reminder | Done |
| 3(1)(d) | Remove unlawful content within 3 hours of a court order or authorised notice | Admin can remove and ban at once | You (a process; see above) |
| 3(1)(f) | Tell users of changes to the rules | Re-consent on every new version | Done |
| 3(1)(g) | Keep removed content and its records 180 days | `legal_holds` on every ban | Done |
| 3(1)(h) | Keep registration details 180 days after an account ends | 1 year (`keep_registration_record()`) | Done |
| 3(1)(i) | Reasonable security practices (SPDI Rules) | Access rules on every table, 135 automated security checks, encryption in transit and at rest | Done; an information security policy document: You |
| 3(1)(j) | Give lawful agencies information within 72 hours of a written order | Records are there to give | You (a process) |
| 3(1)(l) | Report cyber security incidents to CERT-In | | You (see CERT-In above) |
| 3(2)(a) | A Grievance Officer, named, with contact details, prominently published; acknowledge in 24 hours, resolve in 7 days; content under 3(1)(b) in 36 hours | Grievances page linked from the website's home page and the app's menu; tickets at once; deadlines in Admin → Complaints | Done; the officer's name and phone: You |
| 3(2)(b) | Intimate images and impersonation of the complainant removed within 2 hours | Its own complaint categories and report reason, alerts that say so | Done; being reachable: You |
| 3(2)(a), second proviso | Safeguards against misuse of complaints | Limits per email and address; the right to ask the complainant to show it concerns them | Done |
| 3A | Tell users they can appeal to the Grievance Appellate Committee within 30 days | Grievances page and Terms | Done |
| 3(3) and rule 4 | Duties of significant social media intermediaries (5 million users or more in India) | Not yet; revisit at that size | — |
| Synthetic media (amendments of 2025–26) | Label or stop AI-made content that looks real | Terms forbid synthetic or morphed photos; Shaadi24 makes none (its AI reads search text only) | Done |

### The Government's advisory for matrimonial websites (MeitY, 2016)

| It asks | Shaadi24 | Status |
|---|---|---|
| Say clearly the site is for matrimony only, not dating, and not for obscene material | Home page, welcome screen, Terms §1 | Done |
| Users declare they want to marry and their details are true | Consent screen | Done |
| Say whether profiles are verified, and warn against fraud | Verified badges say what was checked (social profiles); Terms and Safety say not every profile is checked; money-scam warnings | Done |
| Keep the internet address the profile was created from | Kept with each consent; in the registration record for a year | Done |
| Profiles made by family need the person's consent | A recorded tick | Done |
| A grievance officer and redressal | Grievances page | Done |
| Verify users by phone or ID document | Not done: verification is by social profiles | You: decide. Phone OTP needs DLT registration of the SMS sender (TRAI, TCCCPR 2018). Never store Aadhaar numbers (Aadhaar Act, section 29); use DigiLocker or masked Aadhaar |

### Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025

The Rules were notified in November 2025; the Board exists now, and most duties apply from about
13 May 2027. Shaadi24 follows them already.

| Section / rule | What it asks | Shaadi24 | Status |
|---|---|---|---|
| s.5, rule 3 | A notice: what data, why, how to withdraw consent, use rights and complain | Privacy Policy and the consent screen's notice | Done |
| s.6 | Consent: free, specific, informed, unconditional, by a clear act; separate for each purpose; as easy to withdraw | Separate ticks, none pre-ticked; Settings to withdraw; delete account | Done |
| s.7 | Uses without consent (legal duty, etc.) | Records kept for the law are named in Privacy §6 | Done |
| s.8(2) | Contracts with processors | | You (accept their DPAs) |
| s.8(4)–(5), rule 6 | Security safeguards, access logs kept a year | Access rules, audit log for admin actions | Done; log retention: You |
| s.8(6), rule 7 | Breach notice to members and the Board; report in 72 hours | | You (plan below) |
| s.8(7), rule 8 | Delete data when no longer needed | Deleted at once on request; retention table above; inactive accounts are not yet deleted automatically | Lawyer: whether to delete accounts inactive for, say, 3 years (the Third Schedule's classes don't cover Shaadi24 at its size) |
| s.8(9), rule 9 | Publish who answers questions about data | privacy@ and the Grievance Officer | Done; name: You |
| s.8(10), s.13, rule 14 | Answer grievances in no more than 90 days | 7 days | Done |
| s.9 | Children's data | 18+ only (21 for men) | Done |
| s.11–12 | Access and a summary; correction and erasure | Settings → Download my data; edit profile; delete answers or account | Done |
| s.14 | Nominate someone | By email to privacy@ | Done (manual) |
| s.16, rule 15 | Transfers abroad | Data in Mumbai; processors abroad named; none to restricted countries | Done |
| s.10 | Significant Data Fiduciary duties | Only if the Government notifies Shaadi24 | — |

### Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011

In force until the DPDP Act's provisions replace them.

| Rule | What it asks | Shaadi24 | Status |
|---|---|---|---|
| 3 | Sensitive data includes passwords, health, sexual orientation, financial details | Passwords are only with Supabase Auth (hashed); health, sexuality, income are optional and covered by the sensitive-data consent | Done |
| 4 | A privacy policy on the website | Privacy Policy | Done |
| 5 | Written (electronic) consent before collecting sensitive data; say why; let people withdraw; a grievance officer resolving in a month | The sensitive-data tick; Grievances | Done |
| 8 | Reasonable security practices, documented (ISO 27001 or an approved code) | The practices are in place; the document isn't | You / Lawyer: a short information security policy |

### Marriage law

| Law | What it means for Shaadi24 | Status |
|---|---|---|
| Prohibition of Child Marriage Act, 2006 | 21 for men, 18 for women | Done (app and database) |
| Bharatiya Nyaya Sanhita, 2023, s.82 (bigamy) | Married people may not join; "awaiting divorce" must be said | Terms §2 | Done |
| Dowry Prohibition Act, 1961 (ss.3, 4, 4A) | No dowry demands or offers, no advertisements offering money or property for a marriage | Terms, Safety, a report reason and a complaint category | Done |
| Hindu Marriage Act, Special Marriage Act and personal laws | Shaadi24 introduces people; it isn't a marriage bureau | Terms §1 | Done |
| Same-sex couples (Supriyo Chakraborty v. Union of India, 2023: no recognition of their marriages) | Shaadi24 lets members choose whom they're interested in | Lawyer: how the Terms should describe it |

### Consumer protection

| Law | What it asks | Shaadi24 | Status |
|---|---|---|---|
| Consumer Protection (E-Commerce) Rules, 2020, rule 4(2) | Legal name, address, website, customer care and grievance officer contacts | Grievances and Terms | Done; address and name: You |
| Rule 4(4)–(5) | A grievance officer; acknowledge in 48 hours, resolve in a month | Payment complaints: 48 hours / a month | Done |
| Rule 4(9) | Consent by a clear act, not pre-ticked boxes | Every tick starts empty | Done |
| Rule 7 (an entity selling its own services) | Clear prices, cancellation and refund terms, the grievance mechanism | Refunds page; prices in the store's sheet; Grievances | Done |
| Guidelines for Prevention and Regulation of Dark Patterns, 2023 | No false urgency, forced action, subscription traps, confirm-shaming, hidden costs | Checked: the Shaadi24+ popups show the price and the store's terms; cancelling is in the store and explained; no countdowns | Done; Lawyer to glance at the upgrade popups |
| Consumer Protection Act, 2019 | Unfair trade practices, misleading claims | The website promises nothing about results; "Verified" says what was checked | Done |

### Other

| Law | What it means | Status |
|---|---|---|
| CERT-In Directions, 28 April 2022 | 6-hour incident reports, 180-day logs, a point of contact, clocks synced | You |
| Indian Contract Act, 1872 | Only adults can agree to the Terms | Done (18+) |
| IT Act ss.66C, 66D, 66E, 67, 67A; BNS ss.77, 78, 79, 318, 319 | Identity theft, cheating by impersonation, voyeurism, stalking, obscene content: the offences the Safety page warns of and reports point to | Done |
| SC/ST (Prevention of Atrocities) Act, 1989, s.3(1)(r)–(s) | Caste insults in public view are offences, online too | Community Guidelines forbid hate based on caste; report and ban | Done |
| Rights of Persons with Disabilities Act, 2016 | Accessible digital services | axe-core checks of every screen at phone width | Done |
| Trade Marks Act, 1999 | The name "Shaadi24" | You (above) |
| GST and income tax | Store sales | You (an accountant) |
| Google Play and App Store rules | User content, account deletion, privacy answers | Done earlier (Phase 13); privacy answers updated |

## If data leaks

1. Stop it: revoke the leaked key or password, close the hole; Supabase → Settings → API to rotate keys.
2. Within **6 hours**: report to CERT-In (`incident@cert-in.org.in`, the form on cert-in.org.in).
3. **Without delay**: tell the affected members, in plain words, what happened, what data, what to do
   (the email address of their account), and the Data Protection Board of India (its portal, once open).
4. Within **72 hours**: the Board's full report: what happened, why, what was done, who was told.
5. Keep a note of each step and its time.

## For the lawyer

Please review:

1. The five pages (`/terms`, `/privacy`, `/grievances`, `/safety`, `/refunds`, or the files in `components/`),
   in particular: the limit of liability (Terms §12: 12 months' payments or ₹1,000), the courts (§14), the
   licence to members' content (§7), and the description of who may use the service.
2. Whether "interested in men / women / everyone" should stay, and how to describe it, given that India
   doesn't recognise same-sex marriages (Supriyo Chakraborty, 2023), and the Transgender Persons
   (Protection of Rights) Act, 2019.
3. The retention periods (table above), and whether to delete inactive accounts after a time.
4. The structure of the business (sole proprietorship or a company), given the duties above and the
   liability that comes with them.
5. The Hindi summaries (a native speaker should read them), and whether any other language is needed for
   the states Shaadi24 targets first.
6. The trade mark question.
7. The consent screen's words (`components/onboarding/StepConsent.tsx`) and the sign-up form's.

## Sources

- IT Rules 2021, as amended up to 10 February 2026 (MeitY's consolidated text, meity.gov.in).
- Advisory on functioning of matrimonial websites in accordance with the IT Act 2000 and rules, MeitY,
  2016.
- DPDP Act 2023 (Act 22 of 2023) and DPDP Rules 2025 (notified November 2025).
- SPDI Rules 2011 (G.S.R. 313(E)).
- Consumer Protection (E-Commerce) Rules 2020; Guidelines for Prevention and Regulation of Dark Patterns 2023.
- CERT-In Directions under section 70B(6) of the IT Act, 28 April 2022.
- Prohibition of Child Marriage Act 2006; Dowry Prohibition Act 1961; Bharatiya Nyaya Sanhita 2023.
- Supriyo Chakraborty v. Union of India, Supreme Court, 17 October 2023.
