// ============================================================================
// The oldest app that still works (app_settings.min_app_build, set by the owner
// in Admin → Errors): a phone app older than that shows "Please update" and
// nothing else, so a broken release can be stopped (docs/store/README.md,
// "Staged rollouts"). The website is always the newest, so it never asks.
// ============================================================================

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { APP_STORE_URL, APPLE_APP_ID, PLAY_STORE_URL } from './storeLinks';

/** "1.2.3" → 10203, the build number on both phones (scripts/app-version.mjs) */
export function buildNumber(version: string): number {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
}

export const appBuild = (): number => buildNumber(__APP_VERSION__);

/** Where to get the newest app */
export function updateUrl(platform = Capacitor.getPlatform()): string {
  if (platform === 'ios') return APP_STORE_URL ?? `https://apps.apple.com/app/id${APPLE_APP_ID}`;
  return PLAY_STORE_URL ?? 'https://play.google.com/store/apps/details?id=com.shaadi24.app';
}

/** True once the server says this app is too old (phone apps only; checked once on start) */
export function useUpdateRequired(): boolean {
  const [required, setRequired] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let live = true;
    void supabase.rpc('app_config').then(({ data }) => {
      const min = Number((data as { min_app_build?: number } | null)?.min_app_build ?? 0);
      if (live && min > appBuild()) setRequired(true);
    }, () => undefined);
    return () => { live = false; };
  }, []);
  return required;
}
