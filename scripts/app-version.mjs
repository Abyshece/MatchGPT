// ============================================================================
// The app's version is package.json's "version" (1.2.3) on both phones.
// Android's build reads it itself (android/app/build.gradle); this writes it
// into the iPhone project before every `cap sync` (package.json
// "capacitor:sync:before"): MARKETING_VERSION 1.2.3, and the build number
// (CURRENT_PROJECT_VERSION) 10203, the same as Android's versionCode
// (major × 10000 + minor × 100 + patch). Both stores need a higher number for
// every upload: raise the version before each one.
//
// Or by hand: node scripts/app-version.mjs
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBXPROJ = path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');

/** "1.2.3" → { name: '1.2.3', build: 10203 } */
export function appVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`package.json's version should look like 1.2.3, not "${version}"`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`Keep the minor and patch numbers under 100 (${version})`);
  return { name: `${major}.${minor}.${patch}`, build: major * 10000 + minor * 100 + patch };
}

/** The Xcode project with both build configurations set to this version. */
export function withVersion(pbxproj, { name, build }) {
  return pbxproj
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${name};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
}

function main() {
  const platform = process.env.CAPACITOR_PLATFORM_NAME;
  if (platform && platform !== 'ios') return;
  const version = appVersion(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
  const source = readFileSync(PBXPROJ, 'utf8');
  const updated = withVersion(source, version);
  if (updated === source) return;
  writeFileSync(PBXPROJ, updated);
  console.log(`iPhone app version ${version.name} (build ${version.build})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
