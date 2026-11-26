import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { PRODUCTS } from '../src/seed.js';

let server, base;
before(async () => {
  const app = createApp({ db: openDb(':memory:'), clientDist: null, filesDir: '/nonexistent' });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const json = (path, opts = {}) => fetch(base + path, {
  ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test('lists and filters products', async () => {
  const all = await json('/products');
  assert.equal(all.body.length, PRODUCTS.length);
  const fonts = await json('/products?category=Fonts');
  assert.ok(fonts.body.every((p) => p.category === 'Fonts'));
  const cheap = await json('/products?maxPrice=20&sort=PriceLow');
  assert.ok(cheap.body.every((p) => (p.sale ?? p.price) <= 20));
  const prices = cheap.body.map((p) => p.sale ?? p.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const search = await json('/products?search=' + encodeURIComponent('100%'));
  assert.equal(search.body.length, 0);
});

test('newest sort uses real dates', async () => {
  const { body } = await json('/products?sort=Newest');
  const newest = [...PRODUCTS].sort((a, b) => b.updated.localeCompare(a.updated))[0];
  assert.equal(body[0].id, newest.id);
});

test('home sections have no duplicates and are full', async () => {
  const { body } = await json('/home');
  for (const key of ['featured', 'trending', 'latest']) {
    assert.equal(body[key].length, 4, key);
    assert.equal(new Set(body[key].map((p) => p.id)).size, 4, key);
  }
});

test('product detail always has related items', async () => {
  const { body } = await json('/products/p7');
  assert.equal(body.related.length, 4);
  assert.ok(!body.related.some((p) => p.id === 'p7'));
  assert.equal((await json('/products/nope')).status, 404);
});

test('order flow computes prices server-side and guards downloads', async () => {
  const bad = await json('/orders', { method: 'POST', body: JSON.stringify({ items: ['p2'], customer: { name: 'A', email: 'x' } }) });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fields.email && bad.body.fields.terms);

  const ok = await json('/orders', { method: 'POST', body: JSON.stringify({
    items: ['p2', 'p2', 'p5'], customer: { name: 'Ann Lee', email: 'ann@example.com' },
    payment: 'paypal', terms: true, coupon: 'welcome10', total: 0.01,
  }) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.items.length, 2);
  assert.equal(ok.body.subtotal, 56);
  assert.equal(ok.body.discount, 5.6);
  assert.equal(ok.body.total, 50.4);

  assert.equal((await json(`/orders/${ok.body.id}`)).status, 404);
  const fetched = await json(`/orders/${ok.body.id}`, { headers: { 'x-order-token': ok.body.token } });
  assert.equal(fetched.body.id, ok.body.id);

  const dl = await fetch(`${base}/orders/${ok.body.id}/download/p2?token=${ok.body.token}`);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const dlBad = await fetch(`${base}/orders/${ok.body.id}/download/p1?token=${ok.body.token}`);
  assert.equal(dlBad.status, 404);
});

test('newsletter and coupons validate input', async () => {
  assert.equal((await json('/newsletter', { method: 'POST', body: '{"email":"nope"}' })).status, 400);
  assert.equal((await json('/newsletter', { method: 'POST', body: '{"email":"a@b.co"}' })).status, 200);
  assert.equal((await json('/coupons/validate', { method: 'POST', body: '{"code":"FAKE"}' })).status, 404);
  assert.equal((await json('/coupons/validate', { method: 'POST', body: '{"code":"creator20"}' })).body.percent, 20);
});

test('every category has at least 5 products', async () => {
  const cats = await json('/categories');
  for (const c of cats.body) assert.ok(c.count >= 5, `${c.name}: ${c.count}`);
});

test('re-opening an existing database adds new seed products once', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'vellum-db-')), 'v.db');
  const db1 = openDb(file);
  db1.exec("DELETE FROM products WHERE id = 'p40'; UPDATE products SET category = 'Digital Art' WHERE id = 'p6'");
  const before = db1.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  db1.close();
  const db2 = openDb(file);
  assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM products').get().n, PRODUCTS.length);
  assert.equal(db2.prepare("SELECT category FROM products WHERE id = 'p6'").get().category, 'Photography');
  assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM reviews').get().n, before + 2);
  db2.close();
});
