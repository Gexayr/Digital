import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { PRODUCTS } from '../src/seed.js';

let server, base;
before(async () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'vellum-dist-'));
  writeFileSync(path.join(dist, 'index.html'),
    '<!doctype html><html><head><meta name="description" content="x" /><title>x</title></head><body><div id="root"></div></body></html>');
  const app = createApp({ db: openDb(':memory:'), clientDist: dist, siteUrl: 'https://example.test' });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));

test('product page has its own meta, canonical and JSON-LD', async () => {
  const r = await get('/product/p1');
  assert.equal(r.status, 200);
  assert.match(r.text, /<title>Nordic Light - Film Preset Pack by Elin Voss \| Vellum<\/title>/);
  assert.match(r.text, /<link rel="canonical" href="https:\/\/example.test\/product\/p1" \/>/);
  assert.match(r.text, /property="og:image" content="https:\/\/example.test\/images\/prod-1.jpg"/);
  const ld = JSON.parse(r.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(ld['@graph'][0]['@type'], 'Product');
  assert.equal(ld['@graph'][0].offers.priceCurrency, 'USD');
  assert.equal((r.text.match(/<title>/g) || []).length, 1);
  assert.equal((r.text.match(/name="description"/g) || []).length, 1);
});

test('unknown product and unknown path return 404 with noindex', async () => {
  for (const p of ['/product/nope', '/no/such/page']) {
    const r = await get(p);
    assert.equal(r.status, 404);
    assert.match(r.text, /name="robots" content="noindex/);
  }
});

test('private pages and filtered shop views are noindex', async () => {
  for (const p of ['/cart', '/checkout', '/order/VL-1', '/shop?search=x']) {
    const r = await get(p);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, follow', p);
  }
  const cat = await get('/shop?category=Fonts');
  assert.match(cat.text, /rel="canonical" href="https:\/\/example.test\/shop\?category=Fonts"/);
});

test('robots.txt and sitemap.xml', async () => {
  const robots = await get('/robots.txt');
  assert.match(robots.text, /Sitemap: https:\/\/example.test\/sitemap.xml/);
  assert.match(robots.text, /Disallow: \/api\//);
  const sm = await get('/sitemap.xml');
  assert.equal(sm.headers.get('content-type').split(';')[0], 'application/xml');
  assert.equal((sm.text.match(/<url>/g) || []).length, 1 + 1 + 8 + 2 + PRODUCTS.length);
});

test('user text is escaped in injected HTML', async () => {
  const r = await get('/product/%3Cscript%3E');
  assert.ok(!r.text.includes('<script>alert'));
  assert.equal(r.status, 404);
});
