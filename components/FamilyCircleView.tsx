import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  RELATIONS, fetchMyFamily, inviteFamily, reactedCards, reactionEmoji, removeFamily, shareInvite,
  type FamilyMember, type FamilyReaction, type Relation,
} from '../lib/familyCircle';
import ProfileModal from './ProfileModal';
import UpgradeModal from './UpgradeModal';
import type { MatchCandidate } from '../types';

// ============================================================================
// Family Circle (lib/familyCircle.ts): invite family with a WhatsApp link,
// see who has looked, remove anyone, and what each of them thinks of the
// people on the shortlist.
// ============================================================================

const ago = (iso: string | null) => {
  if (!iso) return 'Not opened yet';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'Looked today' : days === 1 ? 'Looked yesterday' : `Looked ${days} days ago`;
};

const FamilyCircleView: React.FC = () => {
  const { profile, hasPro } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [reactions, setReactions] = useState<FamilyReaction[]>([]);
  const [cards, setCards] = useState<Map<string, MatchCandidate>>(new Map());
  const [relation, setRelation] = useState<Relation>('mother');
  const [name, setName] = useState('Mummy');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [open, setOpen] = useState<MatchCandidate | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const load = useCallback(async () => {
    const { members, reactions, error } = await fetchMyFamily();
    if (error) showToast(`Couldn't load your Family Circle: ${error}`, 'error');
    setMembers(members);
    setReactions(reactions);
    setCards(await reactedCards([...new Set(reactions.map((r) => r.profile_id))]));
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  // Reactions by the person they're about, newest first
  const byProfile = useMemo(() => {
    const m = new Map<string, FamilyReaction[]>();
    for (const r of reactions) m.set(r.profile_id, [...(m.get(r.profile_id) ?? []), r]);
    return [...m.entries()].filter(([id]) => cards.has(id));
  }, [reactions, cards]);

  if (!profile) return null;
  const from = (profile.name ?? '').split(' ')[0];

  const pickRelation = (r: Relation) => {
    setRelation(r);
    setName(RELATIONS.find((x) => x.id === r)?.suggested ?? '');
  };

  const invite = async () => {
    if (!hasPro) { setUpgrade(true); return; }
    setBusy(true);
    const { token, error, proOnly } = await inviteFamily(name.trim(), relation);
    setBusy(false);
    if (proOnly) { setUpgrade(true); return; }
    if (error || !token) { showToast(error ?? 'Could not invite them', 'error'); return; }
    // WhatsApp first: a browser only opens it straight after the tap
    try {
      await shareInvite({ name: name.trim(), token }, from);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open WhatsApp', 'error');
    }
    await load();
  };

  const remove = async (m: FamilyMember) => {
    setConfirmRemove(null);
    const error = await removeFamily(m.id);
    if (error) showToast(error, 'error');
    else showToast(`${m.name} can no longer see your shortlist`, 'success');
    await load();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8" data-testid="family-view">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Family Circle</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Invite your family with a WhatsApp link. They see the people you liked or matched with (never your chats)
            and tell you what they think, without needing the app. You can remove anyone at any time.
          </p>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4 space-y-3" aria-labelledby="family-invite">
          <h2 id="family-invite" className="font-semibold text-gray-900 dark:text-white">Invite someone</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Who are they?">
            {RELATIONS.map((r) => (
              <button key={r.id} type="button" onClick={() => pickRelation(r.id)} aria-pressed={relation === r.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${relation === r.id
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
                  : 'bg-white text-gray-700 border-gray-200 dark:bg-zinc-800 dark:text-gray-200 dark:border-zinc-700'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="block text-sm text-gray-700 dark:text-gray-200">
            What do you call them?
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Mummy, Papa, Didi…"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base" />
          </label>
          <button type="button" onClick={invite} disabled={busy || !name.trim() || (members?.length ?? 0) >= 5}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#25D366] text-black font-semibold disabled:opacity-50">
            {busy ? 'Making the link…' : 'Invite on WhatsApp'}
          </button>
          {!hasPro && <p className="text-xs text-gray-500 dark:text-gray-400">Family Circle comes with Shaadi24+.</p>}
          {(members?.length ?? 0) >= 5 && <p className="text-xs text-gray-500 dark:text-gray-400">Up to 5 people. Remove someone to invite another.</p>}
        </section>

        {members && members.length > 0 && (
          <section aria-labelledby="family-list" className="space-y-2">
            <h2 id="family-list" className="font-semibold text-gray-900 dark:text-white">Your family ({members.length} of 5)</h2>
            <ul className="divide-y divide-gray-100 dark:divide-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-800">
              {members.map((m) => (
                <li key={m.id} className="p-3 flex flex-wrap items-center gap-2" data-testid="family-member">
                  <div className="flex-1 min-w-[10rem]">
                    <p className="font-medium text-gray-900 dark:text-white">{m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {ago(m.last_seen_at)}{m.reactions > 0 ? ` · ${m.reactions} ${m.reactions === 1 ? 'reaction' : 'reactions'}` : ''}
                    </p>
                  </div>
                  {confirmRemove === m.id ? (
                    <>
                      <span className="text-sm text-gray-600 dark:text-gray-300">Remove {m.name}?</span>
                      <button type="button" onClick={() => remove(m)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold">Remove</button>
                      <button type="button" onClick={() => setConfirmRemove(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm">Keep</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => void shareInvite(m, from)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium">Send link again</button>
                      <button type="button" onClick={() => setConfirmRemove(m.id)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400">Remove</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="family-thinks" className="space-y-2">
          <h2 id="family-thinks" className="font-semibold text-gray-900 dark:text-white">What your family thinks</h2>
          {members === null ? (
            <div className="h-24 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
          ) : byProfile.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {members.length ? 'No reactions yet. They see everyone you like or match with.' : 'Invite someone to hear what they think.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {byProfile.map(([id, list]) => {
                const c = cards.get(id)!;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => setOpen(c)} data-testid="family-reaction"
                      className="w-full text-left flex gap-3 p-3 rounded-xl border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                      {c.imageUrls[0] ? <img src={c.imageUrls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                        : <span className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center" aria-hidden="true">👤</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900 dark:text-white">{c.name}{c.age ? `, ${c.age}` : ''}</span>
                        {list.map((r) => (
                          <span key={r.family_member_id} className="block text-sm text-gray-600 dark:text-gray-300">
                            {r.name} {reactionEmoji(r.reaction)}{r.note ? ` "${r.note}"` : ''}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {open && (
        <ProfileModal candidate={open} isPro={hasPro} onClose={() => setOpen(null)} onUpgrade={() => { setOpen(null); setUpgrade(true); }} />
      )}
      {upgrade && <UpgradeModal reason="pro_feature" onClose={() => setUpgrade(false)} />}
    </div>
  );
};

export default FamilyCircleView;
