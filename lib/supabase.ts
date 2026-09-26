// ============================================================================
// Frontend Supabase client
// Used by all React components to talk to Supabase.
// Uses the anon key, which is safe to ship - RLS protects the data.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.local.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

// Read before the client consumes (and clears) the tokens in the URL: a
// password-reset link signs the user in, and the app must then ask for a new
// password instead of carrying on as a normal sign-in.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && /(^#|&)type=recovery(&|$)/.test(window.location.hash);

// An expired or already-used email link comes back as an error in the URL.
export const emailLinkError: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('error_description');
})();

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});