// ============================================================================
// AuthContext (Phase 5 hotfix)
//
// Adds proper error surfacing for profile loading so the app never gets
// trapped in "Setting up your profile..." indefinitely.
//
// New state exposed to consumers:
//   - profileError: string | null     — last error from loading profile
//   - profileLoading: boolean         — is a fetch currently in-flight
//   - profileMissing: boolean         — DB has no profile row for this auth user
//   - retryLoadProfile()              — manual retry trigger
//
// Self-heal: if profileMissing is true, we attempt to INSERT a stub profile
// row matching the auth user. This rescues users whose handle_new_user
// trigger didn't fire (e.g. created via admin, OAuth import, etc.).
// ============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, openedFromRecoveryLink } from './supabase';
import { signOutNativePush } from './nativePush';
import { rowToProfile, rowToSettings } from './profileMapping';
import type { ProfileRow, TablesInsert } from './database.types';
import type { UserProfile, UserSettings } from '../types';

interface AuthContextValue {
  session: Session | null;
  profileRow: ProfileRow | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  loading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  profileMissing: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryLoadProfile: () => Promise<void>;
  healMissingProfile: () => Promise<{ error: string | null }>;
  // Signed in through a password-reset link: the app asks for a new password.
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(openedFromRecoveryLink);

  const loadProfile = useCallback(async (userId: string | undefined): Promise<void> => {
    if (!userId) {
      setProfileRow(null);
      setProfileError(null);
      setProfileMissing(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);
    setProfileMissing(false);

    // Wrap the query with a manual timeout so we never sit forever.
    // 8s is plenty for a single-row primary-key lookup.
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 8s. Check your network and Supabase URL.')), 8000)
    );

    try {
      const queryPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as Awaited<typeof queryPromise>;

      if (error) {
        console.error('[AuthContext] profile query error:', error);
        setProfileError(error.message);
        setProfileRow(null);
        setProfileLoading(false);
        return;
      }

      if (!data) {
        // No row exists for this auth user — the handle_new_user trigger
        // didn't fire, or this user was created before it existed.
        console.warn('[AuthContext] no profile row found for user', userId);
        setProfileMissing(true);
        setProfileRow(null);
        setProfileLoading(false);
        return;
      }

      setProfileRow(data);
      setProfileMissing(false);
      setProfileError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[AuthContext] loadProfile failed:', msg);
      setProfileError(msg);
      setProfileRow(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) {
      await loadProfile(session.user.id);
    }
  }, [session?.user.id, loadProfile]);

  const retryLoadProfile = useCallback(async () => {
    if (session?.user.id) {
      await loadProfile(session.user.id);
    }
  }, [session?.user.id, loadProfile]);

  // Self-heal: insert a stub profile row when the trigger didn't fire.
  const healMissingProfile = useCallback(async (): Promise<{ error: string | null }> => {
    if (!session?.user) return { error: 'No active session' };
    const u = session.user;

    // Only id + email: every other column (account_created, tier,
    // verification, photos…) has a database default, and the server — not
    // the browser — owns the tier and verification fields.
    const stub: TablesInsert<'profiles'> = {
      id: u.id,
      email: u.email ?? null,
    };

    const { error } = await supabase.from('profiles').insert(stub);
    if (error) {
      console.error('[AuthContext] healMissingProfile insert failed:', error);
      return { error: error.message };
    }

    await loadProfile(u.id);
    return { error: null };
  }, [session, loadProfile]);

  useEffect(() => {
    let mounted = true;

    // Hard top-level cap so UI never hangs forever even on weird failure modes
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn('[AuthContext] safety timer fired (5s) — unblocking UI');
        setLoading(false);
      }
    }, 5000);

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        // An expired reset link leaves no session; don't ask for a password later.
        if (!data.session) setPasswordRecovery(false);
        try {
          await loadProfile(data.session?.user.id);
        } catch (e) {
          console.error('[AuthContext] initial loadProfile threw:', e);
        }
        setLoading(false);
        clearTimeout(safetyTimer);
      })
      .catch((err) => {
        console.error('[AuthContext] getSession threw:', err);
        if (mounted) {
          setLoading(false);
          clearTimeout(safetyTimer);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setSession(newSession);
      // A token refresh doesn't change who is signed in or their profile.
      if (event === 'TOKEN_REFRESHED') return;
      // Never call Supabase from inside this callback: during a token refresh
      // or updateUser the auth client still holds its lock, and the profile
      // query would wait on that lock until it timed out (the "Couldn't load
      // your profile" screen). Load right after the callback instead.
      setTimeout(() => {
        if (!mounted) return;
        loadProfile(newSession?.user.id).catch((e) => {
          console.error('[AuthContext] onAuthStateChange loadProfile threw:', e);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    // In the phone apps: this phone stops getting this person's notifications
    // (needs the session, so first)
    await signOutNativePush().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  const profile = profileRow ? rowToProfile(profileRow) : null;
  const settings = profileRow ? rowToSettings(profileRow) : null;

  // Presence heartbeat — updates last_active_at on app open and every 2 min.
  // Incognito users skip the heartbeat so they stay hidden from "Online" filter.
  useEffect(() => {
    if (!session?.user.id) return;
    const incognito = settings?.incognito ?? false;
    const tick = async () => {
      try {
        if (incognito) return;
        await supabase
          .from('profiles')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', session.user.id);
      } catch {
        // best-effort
      }
    };
    tick();
    const id = setInterval(tick, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [session?.user.id, settings?.incognito]);

  return (
    <AuthContext.Provider value={{
      session,
      profileRow,
      profile,
      settings,
      loading,
      profileLoading,
      profileError,
      profileMissing,
      signOut,
      refreshProfile,
      retryLoadProfile,
      healMissingProfile,
      passwordRecovery,
      finishPasswordRecovery: () => setPasswordRecovery(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
