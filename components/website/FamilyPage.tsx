import React, { useEffect, useState } from 'react';
import { SITE_URL } from '../../lib/blogSeo';
import { setPageMeta } from '../../lib/pageMeta';
import { REACTIONS, familyReact, fetchFamilyView, type FamilyCard, type FamilyView, type Reaction } from '../../lib/familyCircle';
import StoreBadges from '../StoreBadges';
import { SiteFooter, SiteHeader } from './SiteChrome';

// ============================================================================
// /family/<link>: Family Circle for the family (lib/familyCircle.ts)
//
// A parent, sibling or relative the member invited sees the people the member
// liked or matched with, as members see them, and reacts 👍 / 🤔 / 👎 with a
// note. No account; in English or Hindi. Not for search engines.
// ============================================================================

type Lang = 'en' | 'hi';
const TEXT = {
  en: {
    title: (m: string) => `${m}'s shortlist`,
    hello: (you: string, m: string) => `Namaste ${you}! ${m} has shortlisted these people on Shaadi24 and would like to know what you think.`,
    matched: 'Matched', note: 'Add a note (optional)', save: 'Save note', saved: (m: string) => `Sent to ${m}`,
    empty: (m: string) => `${m} hasn't shortlisted anyone yet. Please look again later.`,
    privacy: 'You see these profiles as Shaadi24 members do. Please keep them within the family.',
    gone: 'This link has been turned off', goneSub: 'Ask for a new one if you were sent it by family.',
    cta: 'Looking for someone for your family too?', said: 'said',
  },
  hi: {
    title: (m: string) => `${m} की पसंद`,
    hello: (you: string, m: string) => `नमस्ते ${you}! ${m} ने Shaadi24 पर ये प्रोफ़ाइल चुनी हैं और आपकी राय जानना चाहते हैं।`,
    matched: 'मैच हुआ', note: 'कुछ लिखें (वैकल्पिक)', save: 'भेजें', saved: (m: string) => `${m} को भेज दिया`,
    empty: (m: string) => `${m} ने अभी कोई प्रोफ़ाइल नहीं चुनी है। कृपया बाद में देखें।`,
    privacy: 'आप ये प्रोफ़ाइल वैसे ही देख रहे हैं जैसे Shaadi24 के सदस्य देखते हैं। कृपया इन्हें परिवार तक ही रखें।',
    gone: 'यह लिंक बंद कर दिया गया है', goneSub: 'अगर परिवार ने भेजा था, तो नया लिंक माँगें।',
    cta: 'क्या आप भी परिवार के लिए रिश्ता ढूँढ रहे हैं?', said: 'ने कहा',
  },
} as const;

const Card: React.FC<{ card: FamilyCard; token: string; member: string; lang: Lang; onSaved: () => void }> = ({ card, token, member, lang, onSaved }) => {
  const t = TEXT[lang];
  const mine = card.reactions.find((r) => r.mine);
  const others = card.reactions.filter((r) => !r.mine);
  const [reaction, setReaction] = useState<Reaction | null>(mine?.reaction ?? null);
  const [note, setNote] = useState(mine?.note ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const facts = [card.height, card.place, [card.religion, card.mother_tongue, card.caste].filter(Boolean).join(' · '),
    card.marital_status, [card.education, card.occupation].filter(Boolean).join(' · ')].filter(Boolean) as string[];

  const send = async (r: Reaction | null) => {
    if (!r) return;
    setReaction(r);
    setStatus('…');
    const error = await familyReact(token, card.id, r, note);
    setStatus(error ?? t.saved(member));
    if (!error) onSaved();
  };

  return (
    <article className="rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden" data-testid="family-card">
      <div className="flex gap-4 p-4">
        {card.photo ? <img src={card.photo} alt="" className="w-24 h-28 rounded-xl object-cover flex-shrink-0" />
          : <span className="w-24 h-28 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-3xl" aria-hidden="true">👤</span>}
        <div className="min-w-0">
          <h2 className="font-semibold text-lg">
            {card.name ?? '—'}{card.age ? `, ${card.age}` : ''}
            {card.matched && <span className="ml-2 align-middle text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">{t.matched}</span>}
          </h2>
          <ul className="mt-1 text-sm text-gray-600 dark:text-gray-300 space-y-0.5">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      </div>
      {card.about && <p className="px-4 text-sm text-gray-700 dark:text-gray-300">{card.about}</p>}
      {others.length > 0 && (
        <ul className="px-4 pt-3 text-sm text-gray-600 dark:text-gray-300">
          {others.map((o) => (
            <li key={o.by}>{o.by} {t.said} {REACTIONS.find((x) => x.id === o.reaction)?.emoji}{o.note ? ` "${o.note}"` : ''}</li>
          ))}
        </ul>
      )}
      <div className="p-4 space-y-2">
        <div className="flex gap-2" role="group" aria-label="Your reaction">
          {REACTIONS.map((r) => (
            <button key={r.id} type="button" onClick={() => send(r.id)} aria-pressed={reaction === r.id}
              className={`flex-1 py-2 rounded-xl border text-sm font-semibold ${reaction === r.id
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
                : 'border-gray-300 dark:border-zinc-700'}`}>
              <span aria-hidden="true">{r.emoji}</span> {lang === 'hi' ? r.hindi : r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder={t.note} aria-label={t.note}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base" />
          <button type="button" onClick={() => send(reaction)} disabled={!reaction}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-semibold disabled:opacity-40">{t.save}</button>
        </div>
        {status && <p className="text-xs text-gray-500 dark:text-gray-400" role="status">{status}</p>}
      </div>
    </article>
  );
};

const FamilyPage: React.FC<{ token: string }> = ({ token }) => {
  const [view, setView] = useState<FamilyView | null>(null);
  const [lang, setLang] = useState<Lang>(() => (navigator.language?.startsWith('hi') ? 'hi' : 'en'));
  const load = () => fetchFamilyView(token).then(setView);

  useEffect(() => {
    setPageMeta({
      title: 'Family Circle · Shaadi24', description: 'See the profiles your family member shortlisted on Shaadi24.',
      url: `${SITE_URL}/family/${token}`, noindex: true,
    });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const t = TEXT[lang];
  const member = view?.member || 'Your family member';
  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-xl mx-auto px-5 py-8 space-y-5" data-testid="family-page" lang={lang}>
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-zinc-700 p-0.5" role="group" aria-label="Language">
            {(['en', 'hi'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                className={`px-3 py-1 rounded-md text-sm ${lang === l ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : ''}`}>
                {l === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
        </div>
        {!view ? (
          <div className="h-64 rounded-2xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
        ) : !view.found ? (
          <div className="text-center py-12" data-testid="family-gone">
            <p className="text-4xl" aria-hidden="true">👪</p>
            <h1 className="mt-4 text-xl font-bold">{t.gone}</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">{t.goneSub}</p>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold">{t.title(member)}</h1>
              <p className="mt-2 text-gray-700 dark:text-gray-300">{t.hello(view.you?.name ?? '', member)}</p>
            </div>
            {(view.shortlist ?? []).length === 0 ? (
              <p className="text-gray-600 dark:text-gray-300">{t.empty(member)}</p>
            ) : (view.shortlist ?? []).map((c) => (
              <Card key={c.id} card={c} token={token} member={member} lang={lang} onSaved={() => void load()} />
            ))}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t.privacy}</p>
          </>
        )}
        <div className="rounded-xl bg-rose-50 dark:bg-zinc-800 p-4">
          <p className="font-semibold">{t.cta}</p>
          <StoreBadges className="mt-3" />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default FamilyPage;
