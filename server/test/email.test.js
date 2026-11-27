import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

const sent = [];
const mailer = { enabled: true, send: async (m) => { sent.push(m); return true; } };
const linkToken = (m) => m.text.match(/verify\?token=([\w-]+)/)[1];
const tick = () => new Promise((r) => setTimeout(r, 20));

let server, base;
before(async () => {
  const app = createApp({ db: openDb(':memory:'), clientDist: null, mailer });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

let cookie = '';
async function call(method, path, body) {
  const r = await fetch(base + '/api' + path, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  return { status: r.status, body: await r.json() };
}

test('registration sends a confirmation email; the link confirms it', async () => {
  const r = await call('POST', '/auth/register', { name: 'Bo Creator', email: 'bo@test.dev', password: 'bo-pass-123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.emailVerified, false);
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'bo@test.dev');
  assert.match(sent[0].subject, /confirm your email/i);

  // Unconfirmed creators cannot submit for review.
  assert.equal((await call('PUT', '/studio/profile', { creatorName: 'Bo Studio' })).status, 200);
  const p = await call('POST', '/studio/products', { title: 'Test Prints', category: 'Digital Art', price: 10, description: 'Twelve risograph style posters in print-ready resolution.', format: '.png', license: 'Commercial' });
  assert.ok(p.body.id, JSON.stringify(p.body));
  const s = await call('POST', `/studio/products/${p.body.id}/submit`);
  assert.equal(s.status, 403);
  assert.equal(s.body.code, 'email_unverified');

  assert.equal((await call('POST', '/auth/verify', { token: 'nope' })).status, 400);
  const v = await call('POST', '/auth/verify', { token: linkToken(sent[0]) });
  assert.equal(v.status, 200);
  assert.equal(v.body.user.emailVerified, true);
  // Used link no longer works.
  assert.equal((await call('POST', '/auth/verify', { token: linkToken(sent[0]) })).status, 400);
});

test('changing email un-confirms it and sends a new link; old link is dead', async () => {
  const before = sent.length;
  await call('POST', '/me/verify'); // already verified: no mail
  assert.equal(sent.length, before);
  const r = await call('PUT', '/me', { email: 'bo2@test.dev', currentPassword: 'bo-pass-123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.emailVerified, false);
  await tick();
  assert.equal(sent.at(-1).to, 'bo2@test.dev');
  // Resend works too, and every fresh link is valid.
  assert.equal((await call('POST', '/me/verify')).status, 200);
  const v = await call('POST', '/auth/verify', { token: linkToken(sent.at(-1)) });
  assert.equal(v.body.user.emailVerified, true);
});

test('password reset email works once mail is enabled', async () => {
  assert.equal((await call('POST', '/auth/forgot', { email: 'bo2@test.dev' })).status, 200);
  assert.match(sent.at(-1).text, /reset\?token=/);
});
