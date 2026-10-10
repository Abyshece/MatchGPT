# Shaadi24: compliance with Indian law

A check of the whole product (the Android and iPhone apps, the website and the admin panel, the database and
the server) against the Indian laws that apply to a matrimony service, what was changed to follow them, and
what is left for the owner and a lawyer.

- **Checked:** 6 October 2026, against the laws as they stood that day (the IT Rules 2021 as amended on
  10 February 2026; the DPDP Act 2023 and the DPDP Rules 2025).
- **Documents now in force:** Terms of Service `terms-v7-2026-10-08` (v6 with Shaadi24+ for a week, a month,
  three months or six months, and their prices), Privacy Policy `privacy-v12-2026-10-06`, plus the new Grievance
  Redressal, Community Guidelines and Safety, and Refund and Cancellation pages.

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

The owner lives in Germany, without an Indian company, address, phone number or bank account. None of
these is needed: [Running Shaadi24 from Germany](#running-shaadi24-from-germany) explains why, which
structure suits the app stores, and what German law (tax, the Impressum, the GDPR) adds.

## Running Shaadi24 from Germany

The owner is a German citizen living in Germany, with no OCI card and no Indian company, address, phone
number or bank account. This section was researched on 6 October 2026, to be confirmed with the lawyer
and a German tax adviser (Steuerberater). It isn't advice.

**What Google and Apple do, and what they don't.**

- **They sell Shaadi24+ to Indian members in their own name.** Apple's agreement (Schedule 2, Exhibit A)
  makes Apple Distribution International (Ireland) the developer's *commissionaire* for India: it sells in
  its own name on the developer's behalf. Google says that for developers outside India it "is
  responsible for setting, charging and remitting goods and services tax (GST)" on Google Play purchases
  in India. Under GST law the store that collects the payment counts as the supplier (IGST Act 2017,
  section 14). So there's no Indian GST registration (GSTIN) to get.
- Apple lists India among the countries where it collects and remits the tax (Exhibit B), and its terms
  deduct no Indian tax from the developer's proceeds.
- **They pay out to a bank account in Germany.** This works because Shaadi24+ is sold only in the apps:
  payments on the website (Razorpay, UPI) would need an Indian business.
- **They don't become the operator.** Every duty in this report (complaints, removals, data protection,
  consumer law) stays with whoever runs Shaadi24.

**Indian tax.**

- No GST to charge or file (above).
- No Indian income tax while there's no office, staff or agent in India: under the India–Germany tax
  treaty (Articles 5 and 7), the profits are taxed in Germany. India's 2% equalisation levy on foreign
  e-commerce ended on 1 August 2024.
- India's "significant economic presence" rule (₹2 crore of payments from India, or 3 lakh users, in a
  year: Income-tax Rules, rule 11UD) widens Indian tax law but not the treaty. Near those numbers, have an
  Indian chartered accountant confirm it, with a German certificate of tax residence.
- No PAN is needed.

**What Indian law asks of an operator abroad.**

| Duty | From Germany | Changes only when |
|---|---|---|
| Being an Indian company | Not required. Since the 2021 amendment, the E-Commerce Rules (rule 4(1)) ask for a nodal officer resident in India only of Indian companies, LLPs and partnerships, foreign companies with a place of business in India, and offices abroad controlled by Indian residents | — |
| A Grievance Officer (IT Rules, rule 3(2)) | Anyone, anywhere: the owner, in Germany | Officers resident in India, and an address in India, at 50 lakh registered users (a significant social media intermediary: rule 4(1)(a)–(c) and 4(5)) |
| The DPDP Act | Applies to processing abroad for people in India (section 3(b)); no local representative | A data protection officer in India, if the Government names Shaadi24 a Significant Data Fiduciary (section 10) |
| An address and phone number on the platform (E-Commerce Rules, rule 4(2)) | The German ones | — |

An Indian company would need a director who stays in India at least 182 days a year (Companies Act 2013,
section 149(3); for an LLP, a designated partner and 120 days), an office, a bank account, PAN and TAN,
GST registration, audits and annual filings. None of that is needed.

**Individual or company: the app stores decide.**

- **Apple, guideline 5.1.1(ix):** apps "that require sensitive user information should be submitted by a
  legal entity that provides the services, and not by an individual developer". A matrimony app asks for
  religion, caste, health and sexuality, so an individual account should expect to be refused. Sole
  traders can only enrol as individuals; an organization needs a company and a D-U-N-S number. Guideline
  4.3(b) also takes new dating apps only with "a meaningfully different or improved experience": the
  notes for the reviewers should explain the matrimony focus and the AI search.
- **Google Play:** a new personal account must run a closed test with 12 testers for 14 days in a row
  before it can publish; an organization account doesn't. A personal account that sells shows the
  owner's full address on Google Play.

| | German sole trader (Einzelunternehmen) | German UG (haftungsbeschränkt): recommended |
|---|---|---|
| Setting up | A Gewerbeanmeldung at the town hall | A notary (the standard protocol) and the commercial register, a few hundred euros; capital from €1, with a quarter of each year's profit kept until it reaches €25,000 |
| Apple | An individual account: likely refused (5.1.1(ix)) | An organization account |
| Google Play | 12 testers for 14 days; the home address shown | No tester rule; the company's address shown |
| Liability | Personal and unlimited | The company's (DPDP penalties go up to ₹250 crore) |
| Each year | An income tax return | Annual accounts, corporation and trade tax: a Steuerberater |
| A question for the Indian lawyer | — | Whether a foreign company selling online to India is a "foreign company" with a place of business in India "through electronic mode" (Companies Act 2013, section 2(42); Companies (Registration of Foreign Companies) Rules 2014, rule 2(1)(c)). If so, it would register in India and need a resident nodal officer (E-Commerce Rules, rule 4(1)). The definition is broad but rarely applied to small app makers; as an individual, it doesn't arise |

**Chosen on 7 October 2026: a sole trader.** A UG can follow if Apple asks for a company (5.1.1(ix)); give it
a neutral name until the trade mark search on "Shaadi24" is done ([Before launch](#before-launch-from-you), step 9).

**Germany and the EU, because the operator is there.**

| Law | What it means | Status |
|---|---|---|
| Registering the business | For a UG, the commercial register; a Gewerbeanmeldung either way; the tax office's questionnaire in ELSTER for a tax number; a VAT ID | You |
| VAT (UStG) | A sale through a store is a supply to the store (Apple's is in Ireland), not to the member: the EU Court of Justice, *Xyrality* (C-101/24, 3 November 2025). No German VAT on those sales. The small-business limit (§ 19 UStG): €25,000 last year, €100,000 this year. Services bought from abroad (Supabase, Vercel, Google Cloud) may owe VAT under the reverse charge | You (Steuerberater) |
| Income tax | The profits are taxed in Germany. A sole trader: income tax, together with any other income; trade tax only on profit above €24,500 a year, and mostly credited against the income tax. A UG: corporation and trade tax, about 30% | You (Steuerberater) |
| Digitale-Dienste-Gesetz, § 5 (the Impressum) | On the website and in the apps: the name, an address where papers can be served (a business-address service, not a PO box), email and phone; the VAT ID, if there is one; for a UG, its register entry too | To add with the operator's details |
| GDPR, Article 3(1) | Applies to the members' data because the operator is established in Germany, wherever the members live (EDPB Guidelines 3/2018) | Privacy Policy additions (the operator in Germany, the legal bases, transfers, the supervisory authority): to add with the Impressum |
| GDPR Article 35; BDSG § 38 | Sensitive data at scale probably needs a data protection impact assessment, and in Germany that means appointing a data protection officer, whatever the size (external services are common) | You |
| GDPR Articles 28 and 44–46 | Processing agreements with standard contractual clauses (Supabase, Vercel, Google) | You ([Before launch](#before-launch-from-you), step 6) |
| EU Digital Services Act; EU consumer law | Only if the apps are offered in EU stores (for Indians living in Europe): trader details shown in the stores, EU consumer rights | Keep to India's stores at first |

**Steps, as a sole trader.**

1. With a job, the business can run alongside it (a Nebengewerbe): check the employment contract's rules
   on side work.
2. The Gewerbeanmeldung at the town's trade office (usually online, about €20–60), under the owner's full
   name (with "Shaadi24" added if wanted). It informs the tax office, the IHK (no fee while the trade
   profit is €5,200 a year or less) and the Berufsgenossenschaft (answer its letter within a week; with no
   staff, its insurance is usually voluntary).
3. An ELSTER account (its activation letter comes by post), then the tax office's questionnaire
   (Fragebogen zur steuerlichen Erfassung) within a month: the tax number, the VAT ID, and the small-business
   VAT exemption if it suits.
4. A separate bank account for the business: the store payouts in, the bills out.
5. Simple books (income minus expenses, the EÜR), with the records kept up to 10 years; a tax adviser for
   the first year's returns.
6. Business liability insurance, as the liability is personal (recommended, not required).
7. Apple: the individual account, with the Paid Apps agreement, the business bank account, the W-8BEN tax
   form and the Small Business Program (15%). If App Review refuses the app under 5.1.1(ix), found a UG
   then and convert the account to an organization.
8. Google Play: a personal account (no D-U-N-S number): a closed test with 12 testers for 14 days in a row
   before production; once the app sells, Google Play shows the owner's address, so a business-address
   service keeps the home address private.
9. A business address, a phone number (a German one with WhatsApp Business) and the mailboxes. The owner
   as Grievance Officer, with the admin alerts on: India is 3½ hours ahead of Germany in summer and 4½ in
   winter, and the urgent complaints have 2 hours.
10. The details go into `lib/legalInfo.ts`, with the Impressum and the GDPR additions, as one new version
    of the documents, so members agree only once.

## Before launch: from you

These go in `lib/legalInfo.ts` (one file; every page reads it). Until then the pages say "to be published
before launch" where an address is missing.

| What | Why | Where it shows |
|---|---|---|
| The **operator**: you, as a German sole trader (chosen 7 October 2026: [Running Shaadi24 from Germany](#running-shaadi24-from-germany)), under your **full legal name** as in your passport (now: "Abhishek") | Consumer Protection (E-Commerce) Rules 2020, rule 4(2); IT Rules 3(2)(a); DPDP Rules, rule 3; the Impressum (§ 5 DDG) | Terms, Privacy, Grievances, website footer |
| The **address**, in Germany (a business-address service is fine; a PO box isn't) | E-Commerce Rules, rule 4(2)(b); § 5 DDG | Terms, Privacy, Grievances |
| Your **VAT ID** (USt-IdNr.), once the tax office gives it. No register number (a sole trader isn't in the commercial register), and no CIN or GSTIN: there's no Indian company, and the stores pay India's GST | E-Commerce Rules, rule 4(2); § 5 DDG | Terms, the Impressum |
| The **Grievance Officer**: name and a phone number (now: "Abhishek", no phone). Can be you, in Germany, with a German number. Must be someone who can act within 2 hours, every day | IT Rules 3(2)(a): "the name of the Grievance Officer and his contact details"; E-Commerce Rules 4(4) | Grievances page, Terms, Privacy |
| **A working mailbox**: hello@shaadi24.in, read every day: the pages give it for help, personal data and the Grievance Officer | Every page gives it; complaints by email are as valid as by the form | Everywhere |
| The **city whose courts** hear disputes (now: Bengaluru, Karnataka; the lawyer to confirm, with the operator in Germany) | Terms, section 14 | Terms |
| ~~The website's **own domain**~~ Done: https://shaadi24.in (the old shaadi-gpt.vercel.app forwards to it) | Links in the apps and emails | `websiteUrl` |

Then, outside the code:

1. **Register as a sole trader in Germany and set up the store accounts**, as in
   [Running Shaadi24 from Germany](#running-shaadi24-from-germany): the Gewerbeanmeldung and the tax office,
   the Apple account as an individual (a UG only if Apple asks for a company), a Google Play personal
   account, the Impressum, and the GDPR steps (a data protection impact assessment and a data protection
   officer).
2. **Watch the complaints.** Admin → Complaints, and the phone alerts it sends. Intimate images and
   impersonation must be acted on within **2 hours** of a complaint, unlawful content within 36 hours,
   everything else within 7 days. Reply by email to each, then record what was done.
3. **Lawful requests**: a court order, or a written notice from an authorised officer, to remove something
   must be acted on within **3 hours** (IT Rules 3(1)(d)); a written order for information within **72 hours**
   (3(1)(j)). Admin → Users finds the account; the records kept after deletion are in the `legal_holds`
   table (Supabase → Table Editor, as the owner). Keep a copy of each order and what you sent.
4. **CERT-In** (Directions of 28 April 2022 under section 70B(6)): register a point of contact with CERT-In;
   report a cyber security incident to `incident@cert-in.org.in` within **6 hours** of noticing it; keep
   the logs of the systems for **180 days**. Supabase keeps its logs for 1 day (Free) or 7 days (Pro): set
   up a log drain or export (Supabase Team plan, or a daily export job) before launch. Vercel's logs need the
   same.
5. **A personal data breach** (DPDP Act section 8(6); DPDP Rules, rule 7): tell the affected members and the
   Data Protection Board of India without delay, and send the Board a full report within **72 hours**; also
   CERT-In as above. A short plan is in [If data leaks](#if-data-leaks).
6. **Agreements with the companies that process data for Shaadi24** (DPDP Act section 8(2)): accept the
   data processing terms of Supabase, Vercel, Google (Firebase Cloud Messaging, Gemini, Google sign-in, Play)
   and Apple in each one's dashboard. With the operator in Germany they are also the GDPR's processing
   agreements, with standard contractual clauses (GDPR Articles 28 and 46). Supabase's project is in
   Mumbai (ap-south-1); keep it there.
7. **Gemini on a paid plan** before launch: on the free tier Google may use the search text to improve its
   products, which the Privacy Policy would then have to say as "shared" (it now says Google processes it
   for Shaadi24). See `docs/store/README.md`.
8. **A tax adviser in Germany** (Steuerberater) for the registration, income tax and VAT. The stores charge
   and pay India's GST, and there's no Indian income tax without an office in India
   ([Running Shaadi24 from Germany](#running-shaadi24-from-germany)); an Indian chartered accountant only as
   the Indian revenue nears ₹2 crore a year or 3 lakh users. (TDS under section 194-O applies only to
   sellers resident in India.)
9. **The name.** "Shaadi" is in trademarks of Shaadi.com's owner (People Interactive), who has gone to court
   over them. Have a trade mark attorney search "Shaadi24" and file it (classes 45, 9 and 42) before launch;
   a foreign applicant files in India through an Indian trade mark agent. Until then, give a company a
   neutral name.
10. **Turn on the daily clean-up job**: paste `supabase/migrations/20261006185100_phase10_india_law_purge.sql`
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
- They can't change their own date of birth, age or gender. Only support can, in Admin → Users → Date of
  birth (`admin_correct_date_of_birth()`), after seeing an ID that shows the date, with a note on how it
  was checked in the audit log. A date under the legal age is refused there too.

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
| GST (IGST Act 2017, s.14) and income tax | The stores charge and pay India's GST on every sale; no Indian income tax without an office in India (India–Germany tax treaty) | GST: done by the stores; German tax: You (a Steuerberater) |
| German and EU law (the operator lives in Germany) | Registering the business, VAT, the Impressum, the GDPR | See [Running Shaadi24 from Germany](#running-shaadi24-from-germany) |
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
4. The structure of the business: a German sole trader, as chosen
   ([Running Shaadi24 from Germany](#running-shaadi24-from-germany)), given the duties above and the
   personal liability that comes with them; and, if a UG follows for Apple's guideline 5.1.1(ix), whether
   India's "foreign company… through electronic mode" (Companies Act 2013, s.2(42)) reaches it.
5. The Hindi summaries (a native speaker should read them), and whether any other language is needed for
   the states Shaadi24 targets first.
6. The trade mark question.
7. The consent screen's words (`components/onboarding/StepConsent.tsx`) and the sign-up form's.
8. The courts (Terms §14) and the governing law, now that the operator is in Germany.

For a German lawyer or data protection officer: the GDPR additions to the Privacy Policy, the data
protection impact assessment, and the Impressum.

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

For [Running Shaadi24 from Germany](#running-shaadi24-from-germany):

- Google Play Help, "Region and country-specific guidelines" (tax for developers outside India):
  support.google.com/paymentscenter/answer/7161449.
- Apple, Exhibits to Schedules 2 and 3 of the Apple Developer Program License Agreement (27 August 2026):
  Exhibit A (Apple Distribution International as commissionaire for India), Exhibit B (taxes Apple collects
  and remits).
- App Store Review Guidelines 5.1.1(ix) and 4.3(b); Apple Developer Program enrollment (individuals and
  organizations).
- Play Console Help: testing requirements for new personal accounts (answer 14151465); apps that need an
  organization account (answer 13634885); developer details shown on Google Play (answer 13634081).
- IGST Act 2017, section 14; Finance (No. 2) Act 2024 (the 2% equalisation levy ends on 1 August 2024);
  Income-tax Rules, rule 11UD (Notification 41/2021); India–Germany tax treaty (1995), Articles 5 and 7.
- Consumer Protection (E-Commerce) (Amendment) Rules 2021 (rule 4(1)); Companies Act 2013, sections 2(42)
  and 149(3); Companies (Registration of Foreign Companies) Rules 2014, rule 2(1)(c); LLP Act 2008,
  section 7.
- Court of Justice of the EU, *Xyrality*, C-101/24, 3 November 2025; UStG § 19 as from 1 January 2025.
- GDPR Article 3(1) and EDPB Guidelines 3/2018 on territorial scope; BDSG § 38; Digitale-Dienste-Gesetz
  § 5.
