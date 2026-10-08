import React, { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useIsAdmin } from '../../lib/useIsAdmin';
import { deleteAccount } from '../../lib/deleteAccountService';
import StoreBadges from '../StoreBadges';
import OfferBanner from './OfferBanner';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { StoriesStrip } from './StoriesPages';

// ============================================================================
// SiteHome: the website's home page
//
// What Shaadi24 is and where to get the apps; members use Shaadi24 there.
// Someone signed in on the website (an admin, or a member who opened an email
// link here) sees who they're signed in as, and can sign out; a member can
// also delete the account here (the Delete account page sends them here when
// its email has a link instead of a code).
// ============================================================================

const FEATURES = [
  {
    icon: '✨',
    title: "Say what you're looking for",
    text: 'Describe the person you hope to marry in your own words. Shaadi24 finds the people who fit you best, and says why.',
  },
  {
    icon: '✅',
    title: 'Verified badges, and reports that count',
    text: 'Members can get a Verified badge by linking their social profiles, which our team checks, and every report is reviewed within 24 hours.',
  },
  {
    icon: '👪',
    title: 'What families ask about',
    text: 'Community, mother tongue, family and horoscope, and you choose what to show: any answer can be hidden.',
  },
  {
    icon: '💬',
    title: 'Matches go both ways',
    text: "When you both like each other, it's a match, and you can chat.",
  },
];

type Deleted = { appStoreRenews: boolean };

const DeleteThisAccount: React.FC<{ onDeleted: (d: Deleted) => void; onCancel: () => void }> = ({ onDeleted, onCancel }) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typed !== 'Delete') return;
    setBusy(true);
    setError(null);
    const result = await deleteAccount({ confirmation: 'Delete', reason: 'Deleted on the website' });
    setBusy(false);
    if (!result.success) {
      setError(result.error || "Your account couldn't be deleted. Please try again, or write to privacy@shaadi24.com.");
      return;
    }
    onDeleted({ appStoreRenews: !!result.appStoreRenews });
  };

  return (
    <form onSubmit={remove} className="max-w-4xl mx-auto mt-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-white dark:bg-zinc-950 p-4 space-y-3" data-testid="site-delete-account">
      <p className="text-gray-700 dark:text-gray-300">
        This deletes your account and everything kept about it: your profile, photos, likes, matches and messages. It
        can't be undone. <a className="underline" href="/delete-account">What's deleted and what's kept</a>
      </p>
      {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase" htmlFor="site-delete-typed">
        Type Delete to confirm
      </label>
      <input
        id="site-delete-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
        className="w-full max-w-xs border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-sm bg-white dark:bg-zinc-900"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={typed !== 'Delete' || busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50">
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
};

const SignedIn: React.FC<{ onDeleted: (d: Deleted) => void }> = ({ onDeleted }) => {
  const { session, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const [deleting, setDeleting] = useState(false);
  if (!session) return null;
  return (
    <div role="status" className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 px-5 py-3 text-sm" data-testid="site-signed-in">
      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-700 dark:text-gray-300">
          Signed in as <strong className="text-gray-900 dark:text-white">{session.user.email}</strong>.{' '}
          {isAdmin ? 'The admin panel is open to you.' : 'Shaadi24 is used in the app: sign in there with the same account.'}
        </p>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <a href="/admin" className="px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90">
              Admin panel
            </a>
          )}
          {isAdmin === false && !deleting && (
            <button onClick={() => setDeleting(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-white dark:hover:bg-zinc-800">
              Delete this account
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      </div>
      {deleting && <DeleteThisAccount onDeleted={onDeleted} onCancel={() => setDeleting(false)} />}
    </div>
  );
};

const SiteHome: React.FC = () => {
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  return (
    <div className="min-h-screen flex flex-col">
      <OfferBanner />
      <SiteHeader />

      {deleted ? (
        <div role="status" className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 px-5 py-3 text-sm text-gray-700 dark:text-gray-300" data-testid="site-account-deleted">
          <p className="max-w-4xl mx-auto">
            Your Shaadi24 account is deleted.
            {deleted.appStoreRenews && ' Your App Store subscription is still on: cancel it on your iPhone, in Settings → your name → Subscriptions.'}
          </p>
        </div>
      ) : (
        <SignedIn onDeleted={setDeleted} />
      )}

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-5 pt-14 pb-12 sm:pt-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Find the person you'll marry, in your own words
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-gray-600 dark:text-gray-300">
            Shaadi24 is a matrimony app for India. Describe the person you hope to marry, and it finds the people who fit
            you best: by values, family, lifestyle and plans, not just photos.
          </p>
          <StoreBadges className="mt-8 justify-center" />
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Free to join, on Android and iPhone.</p>
          {/* The declaration the Government's advisory for matrimonial websites asks for */}
          <p className="mt-6 text-xs text-gray-600 dark:text-gray-400" data-testid="matrimony-only">
            Shaadi24 is for marriage only. It is not a dating website, and it must not be used for posting obscene
            material. For women of 18 and men of 21 or older.
          </p>
        </section>

        <section aria-label="What Shaadi24 does" className="max-w-4xl mx-auto px-5 pb-16 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-gray-200 dark:border-zinc-800 p-5">
              <div className="text-2xl" aria-hidden="true">{f.icon}</div>
              <h2 className="mt-3 font-semibold text-gray-900 dark:text-white">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{f.text}</p>
            </div>
          ))}
        </section>

        <StoriesStrip />
      </main>

      <SiteFooter />
    </div>
  );
};

export default SiteHome;
