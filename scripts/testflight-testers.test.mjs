// scripts/testflight-testers.mjs against a stand-in for the App Store Connect
// API, which checks each request's token the way Apple does (ES256 with the
// key's public half, the right issuer, key ID and audience, at most 20
// minutes). Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { apiToken, client, giveToTesters, whatToTest } from './testflight-testers.mjs';

const ISSUER = '69a6de7e-0000-47e3-e053-5b8c7c11a4d1';
const KEY_ID = 'ABC123DEFG';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

function verify(token) {
  const [header, payload, signature] = token.split('.');
  const ok = crypto.verify('sha256', Buffer.from(`${header}.${payload}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  const h = JSON.parse(Buffer.from(header, 'base64url'));
  const p = JSON.parse(Buffer.from(payload, 'base64url'));
  return ok && h.alg === 'ES256' && h.kid === KEY_ID && h.typ === 'JWT'
    && p.iss === ISSUER && p.aud === 'appstoreconnect-v1' && p.exp - p.iat <= 20 * 60;
}

// The app, its builds and groups, as App Store Connect would list them
function standIn({ states, groups, localizations = [], encryption = false, failFirst = 0 }) {
  const calls = [];
  let polls = 0;
  let failures = failFirst;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : null;
      calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(json ? JSON.stringify(json) : ''); };
      if (!verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))) {
        return send(401, { errors: [{ status: '401', title: 'Authentication credentials are missing or invalid.' }] });
      }
      if (failures > 0) { failures--; return send(503, { errors: [{ status: '503', title: 'Service Unavailable' }] }); }
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /v1/apps') {
        return send(200, { data: url.searchParams.get('filter[bundleId]') === 'com.shaadi24.app' ? [{ type: 'apps', id: '6747000001' }] : [] });
      }
      if (route === 'GET /v1/builds') {
        assert.equal(url.searchParams.get('filter[app]'), '6747000001');
        const state = states[Math.min(polls++, states.length - 1)];
        return send(200, { data: state && url.searchParams.get('filter[version]') === '261007.1529'
          ? [{ type: 'builds', id: 'build-1', attributes: { version: '261007.1529', processingState: state, usesNonExemptEncryption: encryption } }]
          : [] });
      }
      if (route === 'PATCH /v1/builds/build-1') return send(200, { data: { type: 'builds', id: 'build-1' } });
      if (route === 'GET /v1/betaGroups') {
        assert.equal(url.searchParams.get('filter[app]'), '6747000001');
        return send(200, { data: groups });
      }
      if (route === 'POST /v1/builds/build-1/relationships/betaGroups') return send(204);
      if (route === 'GET /v1/builds/build-1/betaBuildLocalizations') return send(200, { data: localizations });
      if (route === 'POST /v1/betaBuildLocalizations') return send(201, { data: { type: 'betaBuildLocalizations', id: 'loc-new' } });
      if (route.startsWith('PATCH /v1/betaBuildLocalizations/')) return send(200, { data: { type: 'betaBuildLocalizations', id: url.pathname.split('/').pop() } });
      return send(404, { errors: [{ status: '404', title: `No route ${route}` }] });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, url, close: () => server.close(), call: client({ issuerId: ISSUER, keyId: KEY_ID, key: PEM, api: url, retryDelayMs: 1 }) });
  }));
}

const group = (id, name, isInternalGroup, hasAccessToAllBuilds) => ({ type: 'betaGroups', id, attributes: { name, isInternalGroup, hasAccessToAllBuilds } });
const quiet = () => {};

test('a token Apple accepts', () => {
  assert.ok(verify(apiToken({ issuerId: ISSUER, keyId: KEY_ID, key: privateKey })));
});

test('What to Test is the first line of the commit, without the pull request number', () => {
  assert.equal(whatToTest("The apps open on a welcome screen like ChatGPT's (#40)\n\nThe apps open…"), "The apps open on a welcome screen like ChatGPT's");
  assert.equal(whatToTest(''), '');
  assert.equal(whatToTest(undefined), '');
});

test('waits for Apple, then adds the build to the internal groups that need it', async () => {
  const api = await standIn({
    states: [null, null, 'PROCESSING', 'PROCESSING', 'VALID'],
    groups: [
      group('g-team', 'Team', true, false),
      group('g-auto', 'Everyone', true, true),
      group('g-ext', 'Friends', false, null),
    ],
  });
  try {
    const seen = [];
    const result = await giveToTesters({
      call: api.call, bundleId: 'com.shaadi24.app', build: '261007.1529',
      whatsNew: "The apps open on a welcome screen like ChatGPT's (#40)", pollMs: 5, log: (l) => seen.push(l),
    });
    assert.equal(result.done, true);
    assert.deepEqual(seen, ['Build 261007.1529: not listed yet', 'Build 261007.1529: PROCESSING', 'Build 261007.1529: VALID']);
    const add = api.calls.filter((c) => c.path === '/v1/builds/build-1/relationships/betaGroups');
    assert.equal(add.length, 1);
    assert.deepEqual(add[0].body, { data: [{ type: 'betaGroups', id: 'g-team' }] }, 'only the internal group without automatic distribution');
    assert.equal(api.calls.filter((c) => c.method === 'PATCH' && c.path === '/v1/builds/build-1').length, 0, 'encryption already answered');
    const loc = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/betaBuildLocalizations');
    assert.deepEqual(loc.body.data.attributes, { locale: 'en-US', whatsNew: "The apps open on a welcome screen like ChatGPT's" });
    assert.deepEqual(loc.body.data.relationships.build.data, { type: 'builds', id: 'build-1' });
    assert.match(result.lines.join('\n'), /Added to: Team/);
    assert.match(result.lines.join('\n'), /Gets every build already: Everyone/);
  } finally {
    api.close();
  }
});

test('updates What to Test when the build has it already, answers the encryption question, survives a busy Apple', async () => {
  const api = await standIn({
    states: ['VALID'],
    groups: [group('g-team', 'Team', true, true)],
    localizations: [{ type: 'betaBuildLocalizations', id: 'loc-1', attributes: { locale: 'en-GB', whatsNew: null } }],
    encryption: null,
    failFirst: 2,
  });
  try {
    const result = await giveToTesters({ call: api.call, bundleId: 'com.shaadi24.app', build: '261007.1529', whatsNew: 'Fixes', pollMs: 5, log: quiet });
    assert.equal(result.done, true);
    assert.equal(api.calls.filter((c) => c.path === '/v1/builds/build-1/relationships/betaGroups').length, 0, 'the group gets every build');
    const patch = api.calls.find((c) => c.method === 'PATCH' && c.path === '/v1/builds/build-1');
    assert.deepEqual(patch.body.data.attributes, { usesNonExemptEncryption: false });
    const loc = api.calls.find((c) => c.method === 'PATCH' && c.path === '/v1/betaBuildLocalizations/loc-1');
    assert.deepEqual(loc.body.data, { type: 'betaBuildLocalizations', id: 'loc-1', attributes: { whatsNew: 'Fixes' } });
  } finally {
    api.close();
  }
});

test('says so when Apple rejects the build, or is still processing it at the deadline', async () => {
  let api = await standIn({ states: ['PROCESSING', 'INVALID'], groups: [] });
  try {
    await assert.rejects(giveToTesters({ call: api.call, bundleId: 'com.shaadi24.app', build: '261007.1529', pollMs: 5, log: quiet }),
      /couldn't process build 261007\.1529 \(INVALID\)/);
  } finally {
    api.close();
  }
  api = await standIn({ states: ['PROCESSING'], groups: [] });
  try {
    const result = await giveToTesters({ call: api.call, bundleId: 'com.shaadi24.app', build: '261007.1529', pollMs: 5, waitMinutes: 0.0005, log: quiet });
    assert.equal(result.done, false);
    assert.match(result.lines[0], /still processing at Apple/);
    assert.equal(api.calls.filter((c) => c.method !== 'GET').length, 0, 'nothing changed');
  } finally {
    api.close();
  }
});

test('a wrong key is refused, with Apple\'s words', async () => {
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  const api = await standIn({ states: ['VALID'], groups: [] });
  try {
    const wrong = client({ issuerId: ISSUER, keyId: KEY_ID, key: other, api: api.url, retryDelayMs: 1 });
    await assert.rejects(giveToTesters({ call: wrong, bundleId: 'com.shaadi24.app', build: '261007.1529', pollMs: 5, log: quiet }),
      /App Store Connect answered 401: Authentication credentials are missing or invalid\./);
  } finally {
    api.close();
  }
});
