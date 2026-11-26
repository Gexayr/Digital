import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server, base;
before(async () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'vellum-media-'));
  writeFileSync(path.join(dist, 'index.html'), '<html><head><title>x</title></head><body><div id="root"></div></body></html>');
  mkdirSync(path.join(dist, 'previews'));
  writeFileSync(path.join(dist, 'previews', 'p37.mp3'), 'x');
  writeFileSync(path.join(dist, 'previews', 'p37.peaks.json'), '[0.1,1,0.5]');
  writeFileSync(path.join(dist, 'previews', 'p38.mp3'), 'x'); // no peaks file
  mkdirSync(path.join(dist, 'compare'));
  for (const n of [0, 1]) for (const s of ['before', 'after']) writeFileSync(path.join(dist, 'compare', `p13-${n}-${s}.jpg`), 'x');
  writeFileSync(path.join(dist, 'compare', 'p14-0-before.jpg'), 'x'); // incomplete pair
  const app = createApp({ db: openDb(':memory:'), clientDist: dist, filesDir: '/nonexistent' });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());
const get = (p) => fetch(base + p).then((r) => r.json());

test('audio products expose a preview with waveform peaks', async () => {
  assert.deepEqual((await get('/products/p37')).preview, { url: '/previews/p37.mp3', peaks: [0.1, 1, 0.5] });
  assert.deepEqual((await get('/products/p38')).preview, { url: '/previews/p38.mp3', peaks: [] });
  const list = await get('/products?category=Audio');
  assert.ok(list.find((p) => p.id === 'p37').preview);
});

test('presets expose complete before/after pairs only', async () => {
  const p13 = await get('/products/p13');
  assert.deepEqual(p13.compare, [
    { before: '/compare/p13-0-before.jpg', after: '/compare/p13-0-after.jpg' },
    { before: '/compare/p13-1-before.jpg', after: '/compare/p13-1-after.jpg' },
  ]);
  assert.equal((await get('/products/p14')).compare, undefined);
  const plain = await get('/products/p2');
  assert.equal(plain.preview, undefined);
  assert.equal(plain.compare, undefined);
});
