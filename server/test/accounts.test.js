import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  db.prepare("INSERT INTO users (email, name, pass_hash, role) VALUES ('admin@test.dev', 'Admin', ?, 'admin')").run(await hashPassword('admin-pass-123'));
  const app = createApp({ db, clientDist: null });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Tiny cookie-keeping client, one per simulated browser.
function client() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const isForm = body instanceof FormData;
    const r = await fetch(base + '/api' + path, {
      method,
      headers: { ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.includes('json') ? await r.json() : await r.text(), headers: r.headers };
  };
  return {
    get: (p, h) => call('GET', p, null, h), post: (p, b, h) => call('POST', p, b || {}, h),
    put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p),
  };
}

const PRODUCT = {
  title: 'Paper Moon - Risograph Poster Set', category: 'Digital Art', price: 30, sale: '',
  description: 'Twelve risograph style posters in print-ready resolution.', tags: 'poster, riso, print',
  format: '.png / .pdf', software: 'Any', license: 'Commercial',
};
const pngBlob = async () => new Blob([await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#c83' } }).png().toBuffer()], { type: 'image/png' });

test('register, sign in, sign out, wrong password', async () => {
  const a = client();
  const bad = await a.post('/auth/register', { email: 'x', name: 'A', password: '123' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.email && bad.body.fields.password && bad.body.fields.name);

  const reg = await a.post('/auth/register', { email: 'Buyer@Test.dev', name: 'Bea Buyer', password: 'buyer-pass-1' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.email, 'buyer@test.dev');
  assert.match(reg.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await a.get('/auth/me')).body.user.name, 'Bea Buyer');

  const dup = await client().post('/auth/register', { email: 'buyer@test.dev', name: 'Other', password: 'whatever-1' });
  assert.equal(dup.status, 400);

  await a.post('/auth/logout');
  assert.equal((await a.get('/auth/me')).body.user, null);
  assert.equal((await a.post('/auth/login', { email: 'buyer@test.dev', password: 'nope-nope' })).status, 401);
  assert.equal((await a.post('/auth/login', { email: 'BUYER@test.dev', password: 'buyer-pass-1' })).status, 200);
  assert.equal((await a.get('/auth/me')).body.user.email, 'buyer@test.dev');
});

test('cross-site POSTs are blocked', async () => {
  const r = await client().post('/auth/login', { email: 'a@b.cd', password: 'x' }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('creator uploads a product, admin approves, buyer purchases and downloads', async () => {
  const anon = client();
  assert.equal((await anon.get('/studio')).status, 401);

  const creator = client();
  await creator.post('/auth/register', { email: 'maker@test.dev', name: 'Mia Maker', password: 'maker-pass-1' });
  assert.equal((await creator.post('/studio/products', PRODUCT)).status, 400, 'needs a creator profile first');
  assert.equal((await creator.put('/studio/profile', { creatorName: 'Rowan Cole' })).status, 400, 'seed creator names are taken');
  assert.equal((await creator.put('/studio/profile', { creatorName: 'Mia Prints', bio: 'Riso nerd' })).status, 200);

  assert.equal((await creator.post('/studio/products', { ...PRODUCT, price: 0 })).body.fields.price !== undefined, true);
  const made = await creator.post('/studio/products', PRODUCT);
  assert.equal(made.status, 201);
  const id = made.body.id;
  assert.equal(made.body.status, 'draft');
  assert.equal(made.body.creator, 'Mia Prints');

  // Not visible to the public yet, visible to the owner.
  assert.equal((await anon.get('/products/' + id)).status, 404);
  assert.equal((await creator.get('/products/' + id)).status, 200);
  assert.ok(!(await anon.get('/products?search=Paper%20Moon')).body.length);

  assert.equal((await creator.post(`/studio/products/${id}/submit`)).status, 400, 'needs images and a file');

  // Another user cannot touch it.
  const other = client();
  await other.post('/auth/register', { email: 'other@test.dev', name: 'Otto', password: 'other-pass-1' });
  assert.equal((await other.put('/studio/products/' + id, PRODUCT)).status, 404);

  // Images: re-encoded to JPEG; junk rejected.
  const junk = new FormData(); junk.append('images', new Blob(['not an image']), 'x.png');
  assert.equal((await creator.post(`/studio/products/${id}/images`, junk)).status, 400);
  const fd = new FormData();
  fd.append('images', await pngBlob(), 'a.png');
  fd.append('images', await pngBlob(), 'b.png');
  const up = await creator.post(`/studio/products/${id}/images`, fd);
  assert.equal(up.status, 200);
  assert.equal(up.body.images.length, 2);
  assert.match(up.body.img, /^u\/u[0-9a-f]{8}\/[\w-]+$/);
  const img = await fetch(`${base}/images/${up.body.img}.jpg`);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await sharp(Buffer.from(await img.arrayBuffer())).metadata()).format, 'jpeg');

  // Reorder / delete images.
  const [first, second] = up.body.images;
  const re = await creator.put(`/studio/products/${id}/images`, { images: [second] });
  assert.deepEqual(re.body.images, [second]);
  assert.equal((await fetch(`${base}/images/${first}.jpg`)).status, 404);

  // Deliverable: only allowed types.
  const exe = new FormData(); exe.append('file', new Blob(['MZ']), 'setup.exe');
  assert.equal((await creator.post(`/studio/products/${id}/file`, exe)).status, 400);
  const zip = new FormData(); zip.append('file', new Blob(['PK-real-file-contents']), 'Paper Moon.zip');
  const f = await creator.post(`/studio/products/${id}/file`, zip);
  assert.equal(f.status, 200);
  assert.equal(f.body.file.name, 'Paper Moon.zip');

  assert.equal((await creator.post(`/studio/products/${id}/submit`)).body.status, 'pending');

  // Admin review.
  const admin = client();
  await admin.post('/auth/login', { email: 'admin@test.dev', password: 'admin-pass-123' });
  assert.equal((await creator.get('/admin/products')).status, 403);
  const queue = await admin.get('/admin/products?status=pending');
  assert.deepEqual(queue.body.map((p) => p.id), [id]);
  assert.equal((await admin.post(`/admin/products/${id}/reject`, { reason: '' })).status, 400);
  const rej = await admin.post(`/admin/products/${id}/reject`, { reason: 'Add a print size to the description.' });
  assert.equal(rej.body.status, 'rejected');
  assert.equal((await creator.get('/studio/products/' + id)).body.rejectReason, 'Add a print size to the description.');
  await creator.put('/studio/products/' + id, { ...PRODUCT, description: PRODUCT.description + ' A2 and A3 sizes.' });
  await creator.post(`/studio/products/${id}/submit`);
  assert.equal((await admin.post(`/admin/products/${id}/approve`)).body.status, 'published');

  const pub = await anon.get('/products/' + id);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.file_key, undefined, 'storage paths stay private');
  assert.equal(pub.body.owner_id, undefined);

  // A signed-in buyer purchases it; the order is tied to the account.
  const buyer = client();
  await buyer.post('/auth/login', { email: 'buyer@test.dev', password: 'buyer-pass-1' });
  const order = await buyer.post('/orders', { items: [id], customer: { name: 'Bea Buyer', email: 'buyer@test.dev' }, payment: 'card', terms: true });
  assert.equal(order.status, 201);
  const mine = await buyer.get('/me/orders');
  assert.deepEqual(mine.body.map((o) => o.id), [order.body.id]);
  // Downloads work without the token for the signed-in owner, and serve the real file.
  const dl = await buyer.get(`/orders/${order.body.id}/download/${id}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.body, 'PK-real-file-contents');
  assert.match(dl.headers.get('content-disposition'), /Paper Moon\.zip/);
  assert.equal((await other.get(`/orders/${order.body.id}/download/${id}`)).status, 404);

  // Creator stats and the edit-goes-back-to-review rule.
  const studio = await creator.get('/studio');
  assert.equal(studio.body.totals.sold, 1);
  assert.equal(studio.body.totals.earnings, 24);
  const edited = await creator.put('/studio/products/' + id, { ...PRODUCT, price: 35 });
  assert.equal(edited.body.status, 'pending');
  assert.equal((await anon.get('/products/' + id)).status, 404);
  await admin.post(`/admin/products/${id}/approve`);

  // Sold products are archived, not deleted, so the buyer keeps the download.
  assert.equal((await creator.del('/studio/products/' + id)).body.archived, true);
  assert.equal((await buyer.get(`/orders/${order.body.id}/download/${id}`)).status, 200);
});

test('guest orders are claimed after sign-in; wishlist syncs', async () => {
  const guest = client();
  const o = await guest.post('/orders', { items: ['p1'], customer: { name: 'Gus Guest', email: 'gus@test.dev' }, payment: 'card', terms: true });
  await guest.post('/auth/register', { email: 'gus@test.dev', name: 'Gus Guest', password: 'guest-pass-1' });
  const thief = client();
  await thief.post('/auth/register', { email: 'thief@test.dev', name: 'Thief', password: 'thief-pass-1' });
  assert.equal((await thief.post('/me/orders/claim', { orders: [{ id: o.body.id, token: 'x'.repeat(48) }] })).body.claimed, 0);
  assert.equal((await guest.post('/me/orders/claim', { orders: [{ id: o.body.id, token: o.body.token }] })).body.claimed, 1);
  assert.deepEqual((await guest.get('/me/orders')).body.map((x) => x.id), [o.body.id]);

  const w = await guest.put('/me/wishlist', { ids: ['p3', 'p1', 'nope'] });
  assert.deepEqual(w.body.map((p) => p.id), ['p3', 'p1']);
  assert.deepEqual((await guest.get('/me/wishlist')).body.map((p) => p.id), ['p3', 'p1']);
});

test('profile changes need the current password; admin reset link works', async () => {
  const u = client();
  await u.post('/auth/register', { email: 'pat@test.dev', name: 'Pat', password: 'pat-pass-111' });
  assert.equal((await u.put('/me', { newPassword: 'pat-pass-222' })).status, 400);
  assert.equal((await u.put('/me', { name: 'Pat Q', newPassword: 'pat-pass-222', currentPassword: 'pat-pass-111' })).status, 200);
  assert.equal((await client().post('/auth/login', { email: 'pat@test.dev', password: 'pat-pass-222' })).status, 200);

  const admin = client();
  await admin.post('/auth/login', { email: 'admin@test.dev', password: 'admin-pass-123' });
  const pat = (await admin.get('/admin/users?search=pat@')).body[0];
  const link = await admin.post(`/admin/users/${pat.id}/reset-link`);
  const token = new URL(link.body.url).searchParams.get('token');
  assert.equal((await client().post('/auth/reset', { token, password: 'pat-pass-333' })).status, 200);
  assert.equal((await client().post('/auth/reset', { token, password: 'pat-pass-444' })).status, 400, 'single use');
  assert.equal((await u.get('/auth/me')).body.user, null, 'reset signs out other sessions');
  assert.equal((await client().post('/auth/login', { email: 'pat@test.dev', password: 'pat-pass-333' })).status, 200);

  // Blocking signs the user out.
  const blocked = client();
  await blocked.post('/auth/login', { email: 'pat@test.dev', password: 'pat-pass-333' });
  await admin.put(`/admin/users/${pat.id}`, { disabled: true });
  assert.equal((await blocked.get('/auth/me')).body.user, null);
  assert.equal((await blocked.post('/auth/login', { email: 'pat@test.dev', password: 'pat-pass-333' })).status, 401);
  assert.equal((await admin.put('/admin/users/1', { role: 'user' })).status, 400, 'admins cannot demote themselves');
});
