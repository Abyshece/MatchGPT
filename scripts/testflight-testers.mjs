// ============================================================================
// After an upload to TestFlight: wait until Apple has processed the build,
// then give it to the testers (.github/workflows/testflight.yml runs this).
//
// Apple processes every upload before TestFlight offers it, which takes 10–30
// minutes, sometimes longer. An internal group made without "automatic
// distribution" then only gets the build once someone adds it by hand; this
// adds it to every such group, and writes "What to Test" from the commit.
// Groups that get every build already are left alone, and so are external
// groups (their builds go through Apple's beta review first).
//
// Talks to the App Store Connect API with the same API key the upload uses:
//   ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY (the .p8 file's text)
//   BUNDLE_ID     com.shaadi24.app
//   BUILD         the build number to wait for, e.g. 261007.1529
//   WHATS_NEW     optional: "What to Test" for the testers
//   WAIT_MINUTES  optional: how long to wait for Apple (default 50)
// Writes what happened to $GITHUB_STEP_SUMMARY when it's set.
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.appstoreconnect.apple.com';

/** A signed token for the App Store Connect API (ES256; Apple allows 20 minutes at most). */
export function apiToken({ issuerId, keyId, key }, now = Math.floor(Date.now() / 1000)) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${part({
    iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1',
  })}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}

/** "Title (#40)\n\nMore" → "Title": the first line of a commit, for testers. */
export function whatToTest(message) {
  const first = (message ?? '').split('\n')[0].replace(/\s*\(#\d+\)\s*$/, '').trim();
  return first.slice(0, 4000);
}

class ApiError extends Error {
  constructor(status, body) {
    const first = body?.errors?.[0];
    super(`App Store Connect answered ${status}${first ? `: ${first.title ?? ''} ${first.detail ?? ''}`.trimEnd() : ''}`);
    this.status = status;
  }
}

export function client({ issuerId, keyId, key, api = API, retryDelayMs = 5000 }) {
  const privateKey = crypto.createPrivateKey(key.replace(/\\n/g, '\n').trim());
  return async function call(method, path, body) {
    // Apple's servers sometimes fail or ask us to slow down: try those again
    const wait = (attempt) => new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetch(`${api}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiToken({ issuerId, keyId, key: privateKey })}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt < 4) { await wait(attempt); continue; }
        throw new Error(`Couldn't reach App Store Connect: ${e.message}`);
      }
      if (res.status === 204) return null;
      const json = await res.json().catch(() => null);
      if (res.ok) return json;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) { await wait(attempt); continue; }
      throw new ApiError(res.status, json);
    }
  };
}

/**
 * Waits for the build, adds it to the internal groups that need it and sets
 * What to Test. Returns what happened, in words for the run's summary.
 */
export async function giveToTesters({ call, bundleId, build, whatsNew = '', waitMinutes = 50, pollMs = 30000, log = console.log }) {
  const apps = await call('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=name,bundleId&limit=1`);
  const app = apps?.data?.[0];
  if (!app) throw new Error(`No app with the bundle ID ${bundleId} in App Store Connect`);

  // The build shows up a few minutes after the upload, as PROCESSING
  const deadline = Date.now() + waitMinutes * 60_000;
  let found = null;
  let lastState = null;
  for (;;) {
    const builds = await call('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(build)}`
      + '&fields[builds]=version,processingState,usesNonExemptEncryption&limit=1');
    found = builds?.data?.[0] ?? null;
    const state = found?.attributes?.processingState ?? 'not listed yet';
    if (state !== lastState) log(`Build ${build}: ${state}`);
    lastState = state;
    if (state === 'VALID') break;
    if (state === 'INVALID' || state === 'FAILED') {
      throw new Error(`Apple couldn't process build ${build} (${state}). Apple emails the reason to the account holder.`);
    }
    if (Date.now() + pollMs > deadline) {
      return { done: false, lines: [`Build ${build} was still ${lastState === 'not listed yet' ? 'not listed' : 'processing'} at Apple after ${waitMinutes} minutes.`
        + ' It goes to TestFlight once Apple finishes; if a tester group doesn\'t get it, add it there by hand (TestFlight → the group → Builds → +).'] };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  // The app says it uses no encryption needing export papers (Info.plist,
  // ITSAppUsesNonExemptEncryption); without that answer TestFlight holds the build
  if (found.attributes.usesNonExemptEncryption == null) {
    await call('PATCH', `/v1/builds/${found.id}`, {
      data: { type: 'builds', id: found.id, attributes: { usesNonExemptEncryption: false } },
    });
  }

  const groups = (await call('GET', `/v1/betaGroups?filter[app]=${app.id}&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds&limit=200`))?.data ?? [];
  const internal = groups.filter((g) => g.attributes?.isInternalGroup);
  const automatic = internal.filter((g) => g.attributes.hasAccessToAllBuilds);
  const byHand = internal.filter((g) => !g.attributes.hasAccessToAllBuilds);
  if (byHand.length) {
    await call('POST', `/v1/builds/${found.id}/relationships/betaGroups`, {
      data: byHand.map((g) => ({ type: 'betaGroups', id: g.id })),
    });
  }

  const lines = [`Build **${build}** is processed and ready in TestFlight.`];
  if (byHand.length) lines.push(`- Added to: ${byHand.map((g) => g.attributes.name).join(', ')}`);
  if (automatic.length) lines.push(`- Gets every build already: ${automatic.map((g) => g.attributes.name).join(', ')}`);
  if (!internal.length) lines.push('- No internal tester group yet: make one in App Store Connect → TestFlight → Internal Testing.');

  const text = whatToTest(whatsNew);
  if (text) {
    try {
      const existing = (await call('GET', `/v1/builds/${found.id}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale,whatsNew`))?.data ?? [];
      if (existing.length) {
        for (const loc of existing) {
          await call('PATCH', `/v1/betaBuildLocalizations/${loc.id}`, {
            data: { type: 'betaBuildLocalizations', id: loc.id, attributes: { whatsNew: text } },
          });
        }
      } else {
        await call('POST', '/v1/betaBuildLocalizations', {
          data: {
            type: 'betaBuildLocalizations',
            attributes: { locale: 'en-US', whatsNew: text },
            relationships: { build: { data: { type: 'builds', id: found.id } } },
          },
        });
      }
      lines.push(`- What to Test: ${text}`);
    } catch (e) {
      // Nice to have: the build reaches the testers either way
      lines.push(`- What to Test wasn't set (${e.message})`);
    }
  }
  return { done: true, lines };
}

async function main() {
  const need = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} isn't set`);
    return value;
  };
  const call = client({
    issuerId: need('ASC_ISSUER_ID'), keyId: need('ASC_KEY_ID'), key: need('ASC_KEY'),
    api: process.env.ASC_API_URL || API,
  });
  const result = await giveToTesters({
    call,
    bundleId: process.env.BUNDLE_ID || 'com.shaadi24.app',
    build: need('BUILD'),
    whatsNew: process.env.WHATS_NEW ?? '',
    waitMinutes: Number(process.env.WAIT_MINUTES) || 50,
  });
  for (const line of result.lines) console.log(line);
  if (!result.done) console.log(`::warning::${result.lines[0]}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### TestFlight testers\n${result.lines.join('\n')}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.log(`::error::${e.message}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### TestFlight testers\n${e.message}\n`);
    }
    process.exit(1);
  });
}
