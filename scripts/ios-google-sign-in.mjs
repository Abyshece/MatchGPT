// ============================================================================
// Google sign-in on iPhones needs the app to own the "reversed" iOS client ID
// as a URL scheme (Info.plist → CFBundleURLTypes); without it, Google's
// sign-in stops the app. This keeps the scheme in step with
// VITE_GOOGLE_IOS_CLIENT_ID, read from the same .env files as the build
// (.env.production.local and the others, as Vite reads them): when it's set
// the scheme is added, when it isn't the scheme is taken out (and the app
// doesn't offer Google sign-in on iPhones).
//
// Runs before every `cap sync` (package.json "capacitor:sync:before"), for
// the iPhone only, or by hand: node scripts/ios-google-sign-in.mjs
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import plist from 'plist';
import { loadEnv } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INFO_PLIST = path.join(ROOT, 'ios/App/App/Info.plist');
const URL_NAME = 'google-sign-in';

/** "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc" */
export function reversedClientId(clientId) {
  const match = /^([\w-]+)\.apps\.googleusercontent\.com$/.exec(clientId.trim());
  if (!match) {
    throw new Error(`VITE_GOOGLE_IOS_CLIENT_ID should end in .apps.googleusercontent.com, not "${clientId}"`);
  }
  return `com.googleusercontent.apps.${match[1]}`;
}

/** The Info.plist with Google's URL scheme (or without it, for null), its keys in order. */
export function withGoogleScheme(info, scheme) {
  const others = (info.CFBundleURLTypes ?? []).filter((t) => t.CFBundleURLName !== URL_NAME);
  const types = scheme
    ? [...others, { CFBundleTypeRole: 'Editor', CFBundleURLName: URL_NAME, CFBundleURLSchemes: [scheme] }]
    : others;
  const next = {};
  for (const [key, value] of Object.entries(info)) {
    if (key === 'CFBundleURLTypes') continue;
    if (types.length && !('CFBundleURLTypes' in next) && key > 'CFBundleURLTypes') next.CFBundleURLTypes = types;
    next[key] = value;
  }
  if (types.length && !('CFBundleURLTypes' in next)) next.CFBundleURLTypes = types;
  return next;
}

export function updatedInfoPlist(source, clientId) {
  const scheme = clientId ? reversedClientId(clientId) : null;
  return plist.build(withGoogleScheme(plist.parse(source), scheme), { indent: '\t', offset: -1 }) + '\n';
}

function main() {
  const platform = process.env.CAPACITOR_PLATFORM_NAME;
  if (platform && platform !== 'ios') return;
  const clientId = (loadEnv('production', ROOT, 'VITE_').VITE_GOOGLE_IOS_CLIENT_ID ?? '').trim();
  const source = readFileSync(INFO_PLIST, 'utf8');
  const updated = updatedInfoPlist(source, clientId);
  if (updated === source) return;
  writeFileSync(INFO_PLIST, updated);
  console.log(clientId
    ? `Info.plist: Google sign-in URL scheme ${reversedClientId(clientId)}`
    : 'Info.plist: Google sign-in URL scheme removed (VITE_GOOGLE_IOS_CLIENT_ID is not set)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
