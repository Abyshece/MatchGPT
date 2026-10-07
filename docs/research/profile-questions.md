# Which profile questions Indian members will answer

Research for the short sign-up (October 2026). Every question in sign-up and My
Profile was checked against how Indian families screen matches and what people
are comfortable sharing. The verdicts are recommendations from published
research and from how India's big matrimony sites work; no survey of Shaadi24's
own members has been done yet.

**In short:** sign-up keeps what a match is judged on first and takes about two
minutes. Everything else is optional, in the six sections of My Profile, where
each section completed earns one more free AI search a day. Questions brought
over from Western dating apps are dropped.

| | Before | Now |
|---|---|---|
| Sign-up | 8 pages after the Terms | 3 short pages |
| Questions | about 70, About me required | 13, each a tap or a name |
| Photos | 4 required | 1 clear photo, more later |
| Time to the first search | 15+ minutes | about 2 minutes |

Where it lives in the code:

- Sign-up: `components/onboarding/` (`StepBasicInfo`, `StepBackground`, `StepPhotos`, in that order, chosen by `OnboardingShell`)
- My Profile: `components/ProfileView.tsx`; what's required in `lib/profileRewards.ts`
- The sections and free searches: `profile_sections()` in `supabase/migrations/20261007173707_short_sign_up.sql`
- The pop-up after sign-up: `components/ProfileRewardsPopup.tsx`
- "Write a draft for me": `lib/aboutDrafts.ts`
- Questions no longer asked aren't shown, searched or scored: `NOT_ASKED` in `supabase/functions/search/matching.ts`

## What the research says

**Long forms lose people.** Form research finds each extra field costs roughly
4–5% of the people who would have finished, and the best checkouts ask seven
fields or fewer. Collecting details in stages works better than asking for
everything at once. Shaadi.com's own sign-up promises a profile "in less than 8
minutes", with photos and partner preferences after.
([Formstack and Baymard figures, summarised](https://easysellapp.com/blogs/wiki/shopify-checkout-mistakes-kill-conversions),
[Shaadi.com registration FAQ](https://www.shaadi.com/info/customer-relations/faq/registration),
[Shaadi.com: how to use](https://www.shaadi.com/info/introduction/how-to-use))

**Families screen on faith, community, marital status, age, height, education,
work and place first.** These are expected on every Indian matrimony site, and
members give them without hesitation. In Pew's 2021 survey about two in three
Indians said it is very important to stop marriages outside their religion, and
62–64% outside their caste. About four in ten Indians are vegetarian, so diet
matters early too.
([Pew 2021, explained by BOOM](https://www.boomlive.in/explainers/most-indians-oppose-interfaith-and-intercaste-marriages-pew-study-13720),
[Pew: religion and food](https://www.pewresearch.org/religion/2021/06/29/religion-and-food/))

**Caste matters to many families but is sensitive.** Privacy reviewers have
criticised sites that make caste mandatory at registration. It belongs in the
profile, optional, with "Prefer not to say".
([MediaNama on matrimonial sites and privacy](https://www.medianama.com/2020/02/223-personal-data-protection-bill-matrimonial-websites/))

**Looks questions feed old biases.** Indian matrimonial ads have long asked for
"fair, slim, tall" brides. Shaadi.com removed its skin-tone filter in 2020 after
a petition. Older sites still ask complexion, weight and body type. Shaadi24
never asks complexion or weight. Body type stays optional, with the plain
options Indian sites use and "Prefer not to say", and is never a search filter.
([Campaign India on Shaadi.com's filter](https://campaignindia.in/article/shaadi-com-removes-skin-colour-filter-after-petition/461839),
[Outlook on what matrimonial ads ask for](https://www.outlookindia.com/amp/story/national/fair-beautiful-well-mannered-what-matrimonial-ads-reveal-about-indian-attitude-for-to-be-brides-and-grooms-news-308880),
[The Society Pages on BharatMatrimony's form](https://thesocietypages.org/socimages/?p=1014))

**Glasses and contact lenses are a judgement trap, not information.** In 2021 a
bride in Uttar Pradesh called off her wedding when she found the groom wore
glasses. Asking the question invites exactly that. Photos show it anyway, and
the big Indian sites don't ask.
([The Tribune, 2021](https://www.tribuneindia.com/news/nation/up-woman-calls-off-marriage-at-last-moment-as-groom-fails-to-read-newspaper-without-glasses-on-273853))

**Women are wary of photos.** 78% of Indian women on dating or matrimony apps
have met fake profiles, and morphed photos are a known harm. One clear photo is
enough to start. Group photos ("with friends") expose other people and are
discouraged on Indian sites.
([Feminism in India, citing a Juleo and YouGov survey](https://feminisminindia.com/2025/12/01/from-rishta-to-risk-scams-and-ai-morphing-fueling-gendered-violence-on-indian-matrimonial-sites/))

**Horoscopes matter, but many young members don't know their own.** India has
one of the world's highest shares of adults who consult horoscopes or fortune
tellers (45%). Many families match kundlis. But a member making their own
profile often doesn't know their nakshatra, Manglik status or gotra without
asking at home. These stay in the profile with "Don't know" and a hint.
([Pew 2025](https://www.pewresearch.org/religion/2025/05/06/spells-curses-and-ways-to-see-the-future/))

**Income is expected but private.** 61% of Indian professionals are wary of
telling even friends their salary. It's asked in ranges, in the profile, and can
be hidden.
([LinkedIn survey, DT Next](https://www.dtnext.in/news/business/61-indians-wary-of-revealing-salary-to-co-workers-friends-li-2))

**Disability needs care.** In a 2011 survey, 59% of women and 48% of men said
they would not marry someone with a physical disability. The question stays
optional, never counts towards rewards, and is never used to filter anyone out.
([Disabled World, citing The Times of India](https://www.disabled-world.com/communication/disabled-dating/matrimonial-india.php))

**Dating-app questions don't fit.** Politics, love language, attachment style,
sun sign, race and "sex style" come from the Western dating app Shaadi24 started
from. Matrimony here is family-led. Indian politics doesn't map onto liberal and
conservative, even though young people care about a partner's politics (41% in
a 2023 Bumble survey). And most people don't know their attachment style. These
questions go.
([Bumble survey, DailyO](https://dailyo.in/lifestyle/what-the-indian-dating-scene-looks-like-ahead-of-2024-according-to-a-new-survey-42485))

## Sign-up: three steps, about two minutes

1. **The basics:** this profile is for, name, date of birth, gender and interested
   in (filled in from the gender), marital status (children if divorced or
   widowed), height, where they live.
2. **Background:** religion, mother tongue, highest qualification, occupation.
3. **Photos:** one clear photo of the face; five more slots suggest what
   families like to see (full-length, traditional or festive, everyday, at work
   or study, doing what you love). Just the member in each photo.

Then the Dashboard opens with a pop-up: "Unlock more free searches". It lists
each section not complete yet, the free search it adds and about how long it
takes, with **Complete my profile** and **Later**. It comes back every three
days until every section is complete.

## My Profile: six sections, one more free search a day each

Members get 3 free searches a day. Completing a section (about 70% of its
answers) adds one more, up to 9 a day. The minutes are for the quickest answers
that complete the section, from an empty profile (a tap about 8 seconds, a short
typed answer 15, About me two minutes).

| Section | Questions | About |
|---|---|---|
| About you | About me, where you grew up, body type ("Prefer not to say" counts) | 3 min |
| Religion & community | Caste, sub-caste, sect, gotra, other communities, languages; Manglik, rashi, nakshatra, time and place of birth and horoscope match for Hindu, Jain, Sikh and Buddhist members | 1 min |
| Education & career | Degree, college, employed in, job title, workplace, work style, annual income | 1 min |
| Family | Family type, status and values, parents' work, brothers and sisters, where the family lives, living with them, closeness, about my family | 2 min |
| Lifestyle | Diet, drinking, smoking, exercise, sleep, cooking, hobbies, reading, sports, travel | 2 min |
| Plans & values | When to marry, children, settling abroad, introvert or extrovert, disagreements, money, the next five years, pets | 1 min |

Disability and pronouns stay optional under More about you, and never count.

## Every question, one by one

Comfort is how readily Indian members give the answer: **High** (expected,
given freely), **Medium** (given by most, private to some), **Low**
(unfamiliar, irrelevant or invites judgement). **Sign-up** is asked when
joining; **Profile** is in a My Profile section, optional; **Profile + help**
is optional with help for people who don't know; **Dropped** is no longer asked
or shown.

| Question | Comfort | Verdict | Why |
|---|---|---|---|
| **Sign-up** | | | |
| This profile is for | High | Sign-up | Parents and siblings often make the profile. Fills in the gender for a son, daughter, brother or sister. |
| Name | High | Sign-up | Needed for the profile. Google and Apple sign-ups arrive with it. |
| Date of birth | High | Sign-up | The legal age to marry (21 men, 18 women) is checked here. Others see only the age. |
| Gender, interested in | High | Sign-up | Needed to show the right people. "Interested in" is picked from the gender and can be changed. |
| Marital status (children if divorced or widowed) | High | Sign-up | The first filter on every Indian site. Children are asked only when relevant, and optional. |
| Height | High | Sign-up | In every biodata; one tap. |
| Lives in (country, state, city) | High | Sign-up | "Near me" searches and NRI matches need it. |
| Religion, mother tongue | High | Sign-up | What families ask first. |
| Highest qualification, occupation | High | Sign-up | Next on every family's list; two taps. |
| Photos | Medium | Sign-up | One clear photo instead of four; more in My Profile. No more "with an animal" or group photos. |
| **Moved out of sign-up** | | | |
| About me | Medium | Profile + help | Many find it hard to write about themselves, and it stopped people at the end of sign-up. "Write a draft for me" starts one from their answers, to edit. |
| Grew up in | High | Profile | Native place matters to families, but isn't needed to start. |
| Pronouns | Low | Profile | Unfamiliar to most Indian members; optional under More about you, not counted. |
| **Religion & community** | | | |
| Caste, sub-caste | Medium | Profile | Important to many families, sensitive to others. "Prefer not to say" and type-your-own stay. |
| Sect (Muslim, Christian) | High | Profile | Matters within these faiths; shown only to them. |
| Gotra | Medium | Profile + help | Same-gotra marriages are avoided by many Hindu families, but members often need to ask a parent. "Don't know" and a hint. |
| Open to other communities, languages | High | Profile | Plain and useful. |
| Manglik, rashi, nakshatra | Medium | Profile + help | Kundli matching is common, but many members don't know these. "Don't know", with a hint where to find them. |
| Time and place of birth, horoscope match | Medium | Profile | For families who match horoscopes; skippable. |
| **Education & career** | | | |
| Degree, college, employed in, job title, workplace, work style | High | Profile | Standard and freely given. |
| Annual income | Medium | Profile | Expected in matrimony, private at work. Ranges only, and it can be hidden. |
| **Family** | | | |
| Family type, values, parents' work, brothers, sisters, where they live, living together, closeness | High | Profile | Family is central to Indian matrimony; these are expected. |
| Family status | Medium | Profile + help | People hesitate to rank themselves. A one-line description of each choice helps. |
| About my family | Medium | Profile + help | "Write a draft for me", from the family answers. |
| **Lifestyle** | | | |
| Diet | High | Profile | Vegetarian, Jain, eggetarian and so on decide many matches. |
| Drinking, smoking | High | Profile | Standard on Indian sites. |
| Exercise, cooking, sleep, hobbies, reading, sports, travel | High | Profile | Easy, friendly, good conversation starters. |
| **About you (was Appearance)** | | | |
| Body type | Medium | Profile | Common on Indian sites but appearance-based. Slim, average, athletic, heavy, or "Prefer not to say"; never a filter. |
| Complexion, weight | Low | Dropped | Never asked: colourism and body-shaming. |
| Glasses, contact lenses | Low | Dropped | Invites rejection; photos show it. |
| Hair colour, hair type, eye colour, facial hair | Low | Dropped | Little variation among Indians; a Western dating-app field. |
| Tattoos, clothing style, makeup, jewellery, body hair, hygiene, dresses well | Low | Dropped | Judgement on looks with no matrimonial use. |
| **Plans & values** | | | |
| When to marry, children, settling abroad | High | Profile | Central to a marriage decision. |
| Introvert or extrovert, disagreements, money, next five years, pets | High | Profile | Plain-language personality questions people can answer. |
| Love language, attachment style | Low | Dropped | Pop psychology; most would answer "Don't know". |
| Dream home (beach house, off-grid…) | Low | Dropped | Western options with little meaning here. |
| Politics | Low | Dropped | Liberal and conservative don't describe Indian politics, and families shy away from the subject. |
| **More about you (optional, not counted)** | | | |
| Disability | Low | Profile | Optional, never counted, never a filter. |
| Sexuality, race, ethnicity, interracial marriage, nationalities | Low | Dropped | US categories, or sensitive with no use: "Interested in" covers matching, and mother tongue and caste cover community. |
| Sun sign (zodiac) | Low | Dropped | Indian astrology uses the rashi (moon sign), which stays. |
| "Sex style" | Low | Dropped | Inappropriate for a matrimony app, and against the app stores' rules. |
| Therapy, family health history, criminal record, COVID vaccine | Low | Dropped | Sensitive health and legal data under the DPDP Act, self-declared and unverifiable. |
| Phone brand, car, driving licence, living situation, shopping, baking, favourite drink, music, next trip, organisation, snoring, childhood, splitting bills | Low | Dropped | Filler from the dating-app version; Hobbies and Lifestyle cover what matters. |

Answers members gave to the dropped questions stay in their data (and in
"Download my data") until they delete their account, but aren't shown to
anyone, searched or scored.

## Help for the questions people get stuck on

- **About me and About my family:** "Write a draft for me" turns the member's
  answers into a few sentences they can edit. It's put together on the phone,
  and nothing is sent anywhere.
- **Rashi, nakshatra, Manglik:** "Don't know" is an answer. A hint says where
  to find each one: the kundli, or a parent.
- **Gotra:** "Don't know", with the hint that it usually comes from the father's
  side.
- **Family status:** each choice gets one plain line, so nobody has to guess
  what "upper middle class" means here.
- **Income and caste:** ranges and "Prefer not to say", and income can be
  hidden from others.

## Sources

- [Shaadi.com, Registration FAQs](https://www.shaadi.com/info/customer-relations/faq/registration) and [How to use Shaadi.com](https://www.shaadi.com/info/introduction/how-to-use)
- [Summary of Formstack and Baymard research on form fields](https://easysellapp.com/blogs/wiki/shopify-checkout-mistakes-kill-conversions)
- [BOOM, Pew Research Center 2021: Religion in India](https://www.boomlive.in/explainers/most-indians-oppose-interfaith-and-intercaste-marriages-pew-study-13720)
- [Pew Research Center 2021, Religion and food](https://www.pewresearch.org/religion/2021/06/29/religion-and-food/)
- [Pew Research Center 2025, Spells, curses and ways to see the future](https://www.pewresearch.org/religion/2025/05/06/spells-curses-and-ways-to-see-the-future/)
- [MediaNama 2020, Are matrimonial websites divorced from user privacy?](https://www.medianama.com/2020/02/223-personal-data-protection-bill-matrimonial-websites/)
- [Campaign India 2020, Shaadi.com removes skin colour filter after petition](https://campaignindia.in/article/shaadi-com-removes-skin-colour-filter-after-petition/461839)
- [Outlook, What matrimonial ads reveal](https://www.outlookindia.com/amp/story/national/fair-beautiful-well-mannered-what-matrimonial-ads-reveal-about-indian-attitude-for-to-be-brides-and-grooms-news-308880) and [The Society Pages on BharatMatrimony](https://thesocietypages.org/socimages/?p=1014)
- [The Tribune 2021, wedding called off over glasses](https://www.tribuneindia.com/news/nation/up-woman-calls-off-marriage-at-last-moment-as-groom-fails-to-read-newspaper-without-glasses-on-273853)
- [Feminism in India 2025, From rishta to risk](https://feminisminindia.com/2025/12/01/from-rishta-to-risk-scams-and-ai-morphing-fueling-gendered-violence-on-indian-matrimonial-sites/)
- [DT Next, 61% of Indians wary of revealing salary (LinkedIn)](https://www.dtnext.in/news/business/61-indians-wary-of-revealing-salary-to-co-workers-friends-li-2)
- [Disabled World, Matrimonial services in India](https://www.disabled-world.com/communication/disabled-dating/matrimonial-india.php)
- [DailyO 2023, Bumble's survey of Indian daters](https://dailyo.in/lifestyle/what-the-indian-dating-scene-looks-like-ahead-of-2024-according-to-a-new-survey-42485)
