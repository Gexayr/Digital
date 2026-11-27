import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rowToProduct as baseRow } from './db.js';
import { CATEGORIES } from './seed.js';
import { createSeo } from './seo.js';
import { createAuth } from './auth.js';
import { accountRoutes } from './account.js';
import { studioRoutes } from './studio.js';
import { adminRoutes } from './admin.js';
import { createMailer } from './mail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAYMENTS = ['card', 'paypal', 'applepay', 'googlepay'];
const SORTS = {
  Featured: "(badge = 'Featured') DESC, sales DESC",
  Newest: 'updated DESC',
  PriceLow: 'COALESCE(sale, price) ASC',
  PriceHigh: 'COALESCE(sale, price) DESC',
  Rating: 'rating DESC, sales DESC',
  BestSelling: 'sales DESC',
};
const round2 = (n) => Math.round(n * 100) / 100;
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function createApp({ db, clientDist, filesDir, dataDir, siteUrl, mailer = createMailer(), googleClientId = '', verifyGoogle }) {
  dataDir ||= mkdtempSync(path.join(tmpdir(), 'vellum-')); // tests
  filesDir ||= path.join(dataDir, 'files');
  // Media extras that live next to the built client:
  //   previews/<id>.mp3 (+ <id>.peaks.json)  -> audio preview with waveform
  //   compare/<id>-<n>-before.jpg / -after.jpg -> before/after pairs for presets
  const media = { previews: new Map(), compare: new Map() };
  const dir = (d) => { try { return readdirSync(path.join(clientDist, d)); } catch { return []; } };
  if (clientDist) {
    for (const f of dir('previews')) {
      const m = f.match(/^(\w+)\.mp3$/);
      if (!m) continue;
      let peaks = [];
      try { peaks = JSON.parse(readFileSync(path.join(clientDist, 'previews', `${m[1]}.peaks.json`), 'utf8')); } catch { /* optional */ }
      media.previews.set(m[1], { url: `/previews/${f}`, peaks });
    }
    const files = new Set(dir('compare'));
    for (const f of files) {
      const m = f.match(/^(\w+)-(\d+)-before\.jpg$/);
      if (!m || !files.has(`${m[1]}-${m[2]}-after.jpg`)) continue;
      const list = media.compare.get(m[1]) || [];
      list[Number(m[2])] = { before: `/compare/${f}`, after: `/compare/${m[1]}-${m[2]}-after.jpg` };
      media.compare.set(m[1], list);
    }
  }
  const rowToProduct = (r) => {
    const p = baseRow(r);
    if (!p) return p;
    const preview = media.previews.get(p.id);
    const compare = media.compare.get(p.id)?.filter(Boolean);
    return { ...p, ...(preview ? { preview } : {}), ...(compare?.length ? { compare } : {}) };
  };

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        frameSrc: ['https://accounts.google.com/gsi/'],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: null,
      },
    },
    // Google sign-in opens a popup that must be able to post back to this window.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  }));
  app.use(compression());
  app.use(express.json({ limit: '50kb' }));

  const auth = createAuth(db);
  app.use(auth.middleware);
  // CSRF guard: on top of SameSite=Lax cookies, browsers must not post to the API from other sites.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const from = req.get('origin');
    if (from) {
      let host = null;
      try { host = new URL(from).host; } catch { /* malformed */ }
      if (host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
    next();
  });

  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

  const q = {
    all: db.prepare("SELECT * FROM products WHERE status = 'published'"),
    byId: db.prepare("SELECT * FROM products WHERE id = ? AND status = 'published'"),
    byIdAny: db.prepare('SELECT * FROM products WHERE id = ?'),
    reviews: db.prepare('SELECT name, stars, text, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC'),
    coupon: db.prepare('SELECT code, percent FROM coupons WHERE code = ? COLLATE NOCASE'),
    insOrder: db.prepare(`INSERT INTO orders (id,token,name,email,country,address,payment,coupon,subtotal,discount,total,user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`),
    insItem: db.prepare('INSERT INTO order_items (order_id, product_id, price) VALUES (?,?,?)'),
    bumpSales: db.prepare('UPDATE products SET sales = sales + 1 WHERE id = ?'),
    order: db.prepare('SELECT * FROM orders WHERE id = ?'),
    orderItems: db.prepare(`SELECT p.*, oi.price AS paid FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`),
    orderItemRows: db.prepare(`SELECT p.* FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? AND p.id = ?`),
    subscribe: db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)'),
  };

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  api.get('/categories', (_req, res) => {
    const rows = db.prepare("SELECT category, COUNT(*) AS count FROM products WHERE status = 'published' GROUP BY category").all();
    const counts = Object.fromEntries(rows.map((r) => [r.category, r.count]));
    res.json(CATEGORIES.map((name) => ({ name, count: counts[name] || 0 })));
  });

  api.get('/products', (req, res) => {
    const where = ["status = 'published'"];
    const params = [];
    const { category, search, badge } = req.query;
    if (category && category !== 'All') { where.push('category = ?'); params.push(String(category)); }
    if (badge) { where.push('badge = ?'); params.push(String(badge)); }
    if (search) {
      where.push("(title || ' ' || category || ' ' || creator || ' ' || tags) LIKE ? ESCAPE '\\'");
      params.push('%' + String(search).slice(0, 100).replace(/[\\%_]/g, (m) => '\\' + m) + '%');
    }
    const maxPrice = Number(req.query.maxPrice);
    if (Number.isFinite(maxPrice) && maxPrice > 0) { where.push('COALESCE(sale, price) <= ?'); params.push(maxPrice); }
    const order = SORTS[req.query.sort] || SORTS.Featured;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 100);
    const sql = `SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY ${order}, id LIMIT ${limit}`;
    res.json(db.prepare(sql).all(...params).map(rowToProduct));
  });

  api.get('/products/:id', (req, res) => {
    // Owners and admins can preview products that are not live yet.
    const row = q.byIdAny.get(req.params.id);
    const canPreview = row && req.user && (req.user.role === 'admin' || row.owner_id === req.user.id);
    const p = row && (row.status === 'published' || canPreview) ? rowToProduct(row) : null;
    if (!p) return res.status(404).json({ error: 'Product not found' });
    // Same category first, then fill with best sellers so the section is never empty.
    let related = db.prepare("SELECT * FROM products WHERE category = ? AND id != ? AND status = 'published' ORDER BY sales DESC LIMIT 4").all(p.category, p.id);
    if (related.length < 4) {
      const skip = new Set([p.id, ...related.map((r) => r.id)]);
      related = related.concat(q.all.all().filter((r) => !skip.has(r.id)).sort((a, b) => b.sales - a.sales).slice(0, 4 - related.length));
    }
    res.json({ ...p, canEdit: !!canPreview, reviews: q.reviews.all(p.id), related: related.map(rowToProduct) });
  });

  function creatorsOf(all) {
    const map = new Map();
    for (const p of all) {
      const c = map.get(p.creator) || { name: p.creator, count: 0, sales: 0, ratingSum: 0, categories: new Set() };
      c.count++; c.sales += p.sales; c.ratingSum += p.rating; c.categories.add(p.category);
      map.set(p.creator, c);
    }
    return [...map.values()]
      .sort((a, b) => b.sales - a.sales)
      .map(({ ratingSum, categories, ...c }) => ({ ...c, categories: [...categories], rating: (ratingSum / c.count).toFixed(1) }));
  }

  api.get('/creators', (_req, res) => res.json(creatorsOf(q.all.all().map(rowToProduct))));

  api.get('/home', (_req, res) => {
    const all = q.all.all().map(rowToProduct);
    const bySales = [...all].sort((a, b) => b.sales - a.sales);
    const uniqTop = (first, n = 4) => {
      const seen = new Set();
      return [...first, ...bySales].filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, n);
    };
    const creators = creatorsOf(all).slice(0, 4);
    res.json({
      featured: uniqTop(all.filter((p) => p.badge === 'Featured')),
      trending: uniqTop(all.filter((p) => p.badge === 'Trending')),
      latest: [...all].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 4),
      creators,
    });
  });

  api.post('/newsletter', writeLimiter, (req, res) => {
    const email = str(req.body?.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    q.subscribe.run(email);
    res.json({ ok: true });
  });

  api.post('/coupons/validate', writeLimiter, (req, res) => {
    const c = q.coupon.get(str(req.body?.code, 40));
    if (!c) return res.status(404).json({ error: 'Coupon code not recognised.' });
    res.json({ code: c.code, percent: c.percent });
  });

  api.post('/orders', writeLimiter, (req, res) => {
    const b = req.body || {};
    const ids = Array.isArray(b.items) ? [...new Set(b.items.map(String))].slice(0, 50) : [];
    const name = str(b.customer?.name) || (req.user ? req.user.name : '');
    const email = (str(b.customer?.email, 254) || (req.user ? req.user.email : '')).toLowerCase();
    const country = str(b.customer?.country, 80);
    const address = str(b.customer?.address, 300);
    const payment = PAYMENTS.includes(b.payment) ? b.payment : null;

    const errors = {};
    if (!ids.length) errors.items = 'Your cart is empty.';
    if (name.length < 2) errors.name = 'Enter your full name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (!payment) errors.payment = 'Choose a payment method.';
    if (b.terms !== true) errors.terms = 'You must accept the terms.';
    const products = ids.map((id) => rowToProduct(q.byId.get(id)));
    if (products.some((p) => !p)) errors.items = 'Some items are no longer available.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });

    // Prices are always computed server-side; the client total is never trusted.
    const subtotal = round2(products.reduce((s, p) => s + (p.sale ?? p.price), 0));
    const coupon = b.coupon ? q.coupon.get(str(b.coupon, 40)) : null;
    const discount = coupon ? round2(subtotal * coupon.percent / 100) : 0;
    const total = round2(subtotal - discount);

    // NOTE: demo checkout - no real charge happens. Plug a payment provider
    // (e.g. Stripe Checkout) in here before going live.
    let id;
    do { id = 'VL-' + randomInt(100000, 1000000); } while (q.order.get(id));
    const token = randomBytes(24).toString('hex');

    db.exec('BEGIN');
    try {
      q.insOrder.run(id, token, name, email, country, address, payment, coupon?.code ?? null, subtotal, discount, total, req.user?.id ?? null);
      for (const p of products) { q.insItem.run(id, p.id, p.sale ?? p.price); q.bumpSales.run(p.id); }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.status(201).json(loadOrder(id));
  });

  // Order access is guarded by the random token returned at purchase time.
  const tokenOk = (order, token) => {
    if (!order || typeof token !== 'string' || token.length !== order.token.length) return false;
    return timingSafeEqual(Buffer.from(order.token), Buffer.from(token));
  };

  function loadOrder(id) {
    const o = q.order.get(id);
    return {
      id: o.id, token: o.token, name: o.name, email: o.email, payment: o.payment, coupon: o.coupon,
      subtotal: o.subtotal, discount: o.discount, total: o.total, createdAt: o.created_at,
      items: q.orderItems.all(id).map(rowToProduct),
    };
  }

  // Signed-in owners of an order do not need the token.
  const canSee = (req, o, token) => !!o && ((req.user && o.user_id === req.user.id) || tokenOk(o, token));

  api.get('/orders/:id', (req, res) => {
    const o = q.order.get(req.params.id);
    if (!canSee(req, o, req.get('x-order-token') || req.query.token)) return res.status(404).json({ error: 'Order not found' });
    res.json(loadOrder(o.id));
  });

  api.get('/orders/:id/download/:productId', (req, res) => {
    const o = q.order.get(req.params.id);
    if (!canSee(req, o, req.query.token)) return res.status(404).json({ error: 'Order not found' });
    const item = q.orderItemRows.get(o.id, req.params.productId);
    if (!item) return res.status(404).json({ error: 'Item not in this order' });
    // Files uploaded by the creator in the studio.
    if (item.file_key) {
      return res.download(path.join(filesDir, item.file_key), item.file_name, { headers: { 'Content-Type': 'application/octet-stream' } });
    }
    // Seed catalogue: drop a file at <FILES_DIR>/<productId>.zip and it is served instead of the placeholder.
    const file = path.join(filesDir, `${item.id}.zip`);
    if (existsSync(file)) return res.download(file, `${item.title.replace(/[^\w\- ]+/g, '').trim()}.zip`);
    res.attachment(`${item.id}-README.txt`).type('text/plain').send(
      `${item.title}\nby ${item.creator}\n\nLicense: ${item.license}\nOrder: ${o.id}\n\n` +
      `This is a placeholder deliverable. Upload the real file to the server's files directory as ${item.id}.zip.\n`);
  });

  api.use(accountRoutes({ db, auth, mailer, siteUrl, loadOrder, googleClientId, verifyGoogle }));
  const studio = studioRoutes({ db, dataDir, filesDir, requireVerified: mailer.enabled });
  api.use('/studio', studio.router);
  api.use('/admin', adminRoutes({ db, auth, siteUrl }));

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);
  // Images uploaded by creators (random names, so they can be cached forever).
  app.use('/images/u', express.static(studio.uploadsDir, { immutable: true, maxAge: '1y', index: false }), (_req, res) => res.status(404).end());

  if (clientDist && existsSync(clientDist)) {
    const seo = createSeo({ db, indexFile: path.join(clientDist, 'index.html'), siteUrl });
    app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(seo.robots(req)));
    app.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(seo.sitemap(req)));
    app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    // Every other route gets index.html with route-specific meta tags (see seo.js).
    app.get(/.*/, (req, res) => {
      const { status, html, noindex } = seo.render(req);
      if (noindex) res.set('X-Robots-Tag', 'noindex, follow');
      res.status(status).type('html').set('Cache-Control', 'no-cache').send(html);
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
