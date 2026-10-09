import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { setErrorScreen } from '../../lib/errorReports';
import { BrandMark } from '../../constants';

// ============================================================================
// AppPreview: /app-preview, the members' app for admins (lib/appPreview.ts)
//
// Shows the members' app (its children) only to someone signed in to the
// website's admin panel as an admin, as the database decides (is_admin()).
// That sign-in is the website's, read here with a client of its own; the
// app inside signs in separately (lib/supabase.ts), so whoever it's tried
// with, the admin panel stays signed in.
// ============================================================================

type Access = 'checking' | 'admin' | 'signed-out' | 'not-admin';

async function websiteAccess(): Promise<Access> {
  const website = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    // Reads the admin panel's sign-in; the admin panel keeps it fresh
    { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data: { session } } = await website.auth.getSession();
  if (!session) return 'signed-out';
  const { data, error } = await website.rpc('is_admin');
  return !error && data === true ? 'admin' : 'not-admin';
}

const AppPreview: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [access, setAccess] = useState<Access>('checking');

  useEffect(() => {
    setErrorScreen('loading');
    websiteAccess().then(setAccess, () => setAccess('signed-out'));
  }, []);

  if (access === 'admin') return <>{children}</>;
  if (access === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919]">
        <div className="w-8 h-8 border-3 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100">
      <div className="max-w-sm text-center" data-testid="app-preview-refused">
        <BrandMark className="w-10 h-10 mx-auto" />
        <h1 className="mt-3 text-xl font-bold tracking-tight">The app preview is for Shaadi24's admins</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {access === 'signed-out'
            ? 'Sign in to the admin panel first, then open its App Preview tab.'
            : "You're signed in to the website with an account that isn't an admin. Members use Shaadi24 in the Android and iPhone apps."}
        </p>
        <a
          href={access === 'signed-out' ? '/admin' : '/'}
          target="_top"
          className="mt-6 inline-block px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-bold hover:opacity-90"
        >
          {access === 'signed-out' ? 'Go to the admin panel' : 'Home'}
        </a>
      </div>
    </div>
  );
};

export default AppPreview;
