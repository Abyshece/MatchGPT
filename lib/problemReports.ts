// ============================================================================
// Report a problem (Settings → Support): what went wrong, in the member's own
// words, sent with the screen they were on, the app's version and the kind of
// device (report_problem() in supabase/migrations/…_payments_and_reliability.sql).
// The team answers in Admin → Errors; the answer shows in Settings → My
// requests, with a message.
// ============================================================================

import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { supabase } from './supabase';
import { currentScreen } from './errorReports';

async function deviceText(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) {
      const d = await Device.getInfo();
      return `${d.manufacturer} ${d.model}, ${d.operatingSystem} ${d.osVersion}`.slice(0, 300);
    }
  } catch {
    // fall through to the browser's description
  }
  return navigator.userAgent.slice(0, 300);
}

export async function reportProblem(details: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('report_problem', {
    p_details: details.trim(),
    p_screen: currentScreen() || 'settings',
    p_app_version: __APP_VERSION__,
    p_platform: Capacitor.getPlatform(),
    p_device: await deviceText(),
  });
  return { error: error?.message ?? null };
}
