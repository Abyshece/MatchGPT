// ============================================================================
// Which phone the app is on (the account guards: one phone, at most 3
// accounts with free searches; 20261010090000_account_guards.sql)
//
// The phone's app ID from @capacitor/device: on Android it stays the same
// when the app is deleted and installed again; on iPhones until every app of
// ours is deleted. On the website, or if the plugin can't answer, an ID kept
// in this browser. The server only stores a hash of it.
// ============================================================================

import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { supabase } from './supabase';

const KEY = 'shaadi24_install_id';

function browserId(): string | null {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

let cached: Promise<string | null> | null = null;

/** This phone's app ID (or this browser's), or null. */
export function deviceId(): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { identifier } = await Promise.race([
            Device.getId(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
          ]);
          if (identifier && identifier.length >= 8) return `${Capacitor.getPlatform()}:${identifier}`;
        } catch {
          // falls back to an ID kept by the app
        }
      }
      return browserId();
    })();
  }
  return cached;
}

/** 'android' | 'ios' | 'web' */
export const devicePlatform = (): string => Capacitor.getPlatform();

/** At sign-in: this account is used on this phone (for Admin → Scam alerts). */
export async function noteDevice(): Promise<void> {
  const id = await deviceId();
  if (!id) return;
  await supabase.rpc('note_device', { p_device: id, p_platform: devicePlatform() }).then(() => undefined, () => undefined);
}
