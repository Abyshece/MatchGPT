import React, { useEffect, useState } from 'react';
import { fetchStories, type Story } from '../../lib/adminInsights';
import { SITE_URL } from '../../lib/blogSeo';
import { setPageMeta } from '../../lib/pageMeta';
import StoreBadges from '../StoreBadges';
import { SiteFooter, SiteHeader } from './SiteChrome';

// ============================================================================
// Success stories on the website (Admin → Success stories): a few on the home
// page, once there are any, and all of them at /stories, with how couples can
// send theirs (the contact form's "Our success story").
// ============================================================================

const married = (iso: string | null) =>
  iso ? `Married ${new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` : '';

const StoryCard: React.FC<{ story: Story }> = ({ story }) => (
  <article className="rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col" data-testid="story">
    {story.photo_url ? (
      <img src={story.photo_url} alt={story.photo_alt} loading="lazy" className="w-full aspect-[4/3] object-cover" />
    ) : (
      <div className="w-full aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-rose-50 to-amber-50 dark:from-zinc-800 dark:to-zinc-900" aria-hidden="true">
        <span className="text-4xl">💍</span>
      </div>
    )}
    <div className="p-5">
      <h3 className="font-semibold text-gray-900 dark:text-white">{story.names}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">{[story.place, married(story.married_on)].filter(Boolean).join(' · ')}</p>
      <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{story.story}</p>
    </div>
  </article>
);

/** The home page's few, only when there are any */
export const StoriesStrip: React.FC = () => {
  const [stories, setStories] = useState<Story[]>([]);
  useEffect(() => { void fetchStories(true).then(({ stories }) => setStories(stories)); }, []);
  if (!stories.length) return null;
  return (
    <section aria-labelledby="stories-title" className="max-w-5xl mx-auto px-5 pb-16" data-testid="home-stories">
      <h2 id="stories-title" className="text-2xl font-bold tracking-tight text-center">Couples who met on Shaadi24</h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.slice(0, 3).map((s) => <StoryCard key={s.id} story={s} />)}
      </div>
      {stories.length > 3 && (
        <p className="mt-6 text-center"><a href="/stories" className="text-sm font-medium underline underline-offset-4">Read more stories</a></p>
      )}
    </section>
  );
};

/** /stories */
export const StoriesPage: React.FC = () => {
  const [stories, setStories] = useState<Story[] | null>(null);
  useEffect(() => {
    void fetchStories(true).then(({ stories }) => setStories(stories));
    setPageMeta({
      title: 'Success stories | Shaadi24',
      description: 'Couples who met on Shaadi24, the matrimony app for India, in their own words.',
      url: `${SITE_URL}/stories`,
    });
  }, []);
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-12 sm:py-16" data-testid="stories-page">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Success stories</h1>
        <p className="mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl">Couples who met on Shaadi24, in their own words.</p>
        {!stories ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/5] rounded-2xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />)}
          </div>
        ) : stories.length === 0 ? (
          <p className="mt-10 text-gray-600 dark:text-gray-300">The first stories are coming soon.</p>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((s) => <StoryCard key={s.id} story={s} />)}
          </div>
        )}
        <aside className="mt-14 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 sm:p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Met on Shaadi24?</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">We'd love to hear your story. Send it to us, and tell us if we may share it.</p>
          <a href="/support#contact" className="mt-4 inline-flex h-10 px-5 items-center rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-semibold">Send your story</a>
          <StoreBadges className="mt-6 justify-center" />
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
};
