import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

// Fake Google: the "credential" is a JSON payload; 'bad' throws like an invalid token.
const verifyGoogle = async (t) => { if (t === 'bad') throw new Error('invalid'); return JSON.parse(t); };
const cred = (p) => JSON.stringify({ email_verified: true, ...p });

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO users (email, name, pass_hash) VALUES ('ann@test.dev', 'Ann', ?)").run(await hashPassword('ann-pass-123'));
  const app = createApp({ db, clientDist: null, googleClientId: 'cid.apps.googleusercontent.com', verifyGoogle });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, cookie) {
  const r = await fetch(base + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

test('me exposes the Google client id', async () => {
  const r = await call('GET', '/auth/me');
  assert.equal(r.body.google, 'cid.apps.googleusercontent.com');
});

test('new Google user gets a passwordless account and can set a password', async () => {
  const r = await call('POST', '/auth/google', { credential: cred({ sub: 'g1', email: 'New@Test.dev', name: 'New Person' }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, 'new@test.dev');
  assert.equal(r.body.user.hasPassword, false);
  assert.equal(r.body.user.google, true);
  // Password login does not work for a passwordless account.
  assert.equal((await call('POST', '/auth/login', { email: 'new@test.dev', password: '' })).status, 401);
  // Sets a password without a current one.
  const s = await call('PUT', '/me', { newPassword: 'fresh-pass-1' }, r.cookie);
  assert.equal(s.status, 200);
  assert.equal(s.body.user.hasPassword, true);
  assert.equal((await call('POST', '/auth/login', { email: 'new@test.dev', password: 'fresh-pass-1' })).status, 200);
  // Same Google account signs into the same user again.
  const again = await call('POST', '/auth/google', { credential: cred({ sub: 'g1', email: 'new@test.dev' }) });
  assert.equal(again.body.user.id, r.body.user.id);
});

test('Google sign-in links an existing account with the same verified email', async () => {
  const r = await call('POST', '/auth/google', { credential: cred({ sub: 'g2', email: 'ann@test.dev', name: 'Ann G' }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Ann');
  assert.equal(r.body.user.hasPassword, true);
  // A different Google account with that email is refused.
  assert.equal((await call('POST', '/auth/google', { credential: cred({ sub: 'g3', email: 'ann@test.dev' }) })).status, 403);
});

test('invalid or unverified Google tokens are refused', async () => {
  assert.equal((await call('POST', '/auth/google', { credential: 'bad' })).status, 401);
  assert.equal((await call('POST', '/auth/google', { credential: cred({ sub: 'g4', email: 'x@test.dev', email_verified: false }) })).status, 401);
  assert.equal((await call('POST', '/auth/google', {})).status, 400);
});

test('disabled accounts cannot sign in with Google', async () => {
  db.prepare("INSERT INTO users (email, name, pass_hash, disabled) VALUES ('off@test.dev', 'Off', '', 1)").run();
  assert.equal((await call('POST', '/auth/google', { credential: cred({ sub: 'g5', email: 'off@test.dev' }) })).status, 403);
});

test('CSP allows Google Identity Services', async () => {
  const r = await fetch(base + '/api/health');
  assert.match(r.headers.get('content-security-policy'), /accounts\.google\.com\/gsi\/client/);
  assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
});

test('Google sign-in is off without a client id', async () => {
  const app = createApp({ db: openDb(':memory:'), clientDist: null });
  const s = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const u = `http://127.0.0.1:${s.address().port}/api`;
  assert.equal((await (await fetch(u + '/auth/me')).json()).google, null);
  assert.equal((await fetch(u + '/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"credential":"x"}' })).status, 503);
  s.close();
});
