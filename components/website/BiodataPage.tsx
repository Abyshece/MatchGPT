import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { SITE_URL } from '../../lib/blogSeo';
import { setPageMeta } from '../../lib/pageMeta';
import StoreBadges from '../StoreBadges';
import { SiteFooter, SiteHeader } from './SiteChrome';

// ============================================================================
// /b/<link>: the page a shared biodata's QR code and link open
//
// What other members see of the profile (biodata_preview in the database),
// never more, and the way to the app to see the rest and send an interest.
// Not for search engines. A link the member turned off, or a profile paused
// or gone, shows nothing.
// ============================================================================

interface Preview {
  found: boolean;
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  height?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  religion?: string | null;
  mother_tongue?: string | null;
  caste?: string | null;
  marital_status?: string | null;
  degree?: string | null;
  occupation?: string | null;
  diet?: string | null;
  about?: string | null;
  photo?: string | null;
  verified?: boolean;
}

const BiodataPage: React.FC<{ token: string }> = ({ token }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const asked = useRef<string | null>(null);  // each look counts once

  useEffect(() => {
    setPageMeta({
      title: 'A biodata shared on Shaadi24', description: 'See this profile on Shaadi24, the matrimony app.',
      url: `${SITE_URL}/b/${token}`, noindex: true,
    });
    if (asked.current === token) return;
    asked.current = token;
    void supabase.rpc('biodata_preview', { p_token: token }).then(({ data, error }) =>
      setPreview(error || !data ? { found: false } : (data as unknown as Preview)));
  }, [token]);

  const who = preview?.name || (preview?.gender === 'Female' ? 'She' : preview?.gender === 'Male' ? 'He' : 'This member');
  const facts = preview?.found ? [
    preview.height ?? '',
    [preview.city, preview.state || preview.country].filter(Boolean).join(', '),
    [preview.religion, preview.mother_tongue, preview.caste].filter(Boolean).join(' · '),
    preview.marital_status ?? '',
    [preview.degree, preview.occupation].filter(Boolean).join(' · '),
    preview.diet ?? '',
  ].filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full max-w-lg mx-auto px-5 py-10" data-testid="biodata-page">
        {!preview ? (
          <div className="h-64 rounded-2xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
        ) : !preview.found ? (
          <div className="text-center py-12" data-testid="biodata-gone">
            <p className="text-4xl" aria-hidden="true">💍</p>
            <h1 className="mt-4 text-xl font-bold">This biodata link isn't available</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              The member may have turned it off. You can still find your match on Shaadi24.
            </p>
            <StoreBadges className="mt-6 justify-center" />
          </div>
        ) : (
          <article className="rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            {preview.photo ? (
              <img src={preview.photo} alt={preview.name ?? 'Profile photo'} className="w-full aspect-[4/5] object-cover" />
            ) : (
              <div className="w-full aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-rose-50 to-amber-50 dark:from-zinc-800 dark:to-zinc-900" aria-hidden="true">
                <span className="text-5xl">👤</span>
              </div>
            )}
            <div className="p-6">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {preview.name ?? 'A Shaadi24 member'}{preview.age ? `, ${preview.age}` : ''}
                {preview.verified && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Verified</span>
                )}
              </h1>
              <ul className="mt-3 space-y-1 text-gray-700 dark:text-gray-300">
                {facts.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {preview.about && <p className="mt-4 text-gray-700 dark:text-gray-300 leading-relaxed">{preview.about}</p>}
              <div className="mt-6 rounded-xl bg-rose-50 dark:bg-zinc-800 p-4">
                <p className="font-semibold">See {preview.name ? `${preview.name}'s` : 'the'} full profile on Shaadi24</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {who === 'This member' ? 'This member is' : `${who} is`} on Shaadi24, the matrimony app with AI search. Get the app
                  to see the whole profile and send an interest. Shaadi24 never shows phone numbers.
                </p>
                <StoreBadges className="mt-4" />
              </div>
            </div>
          </article>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default BiodataPage;
