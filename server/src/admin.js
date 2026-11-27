// Admin panel API (/api/admin/*): moderation, all products, users, orders.
import express from 'express';
import { publicUser, requireAdmin } from './auth.js';
import { rowToProduct } from './db.js';

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const STATUSES = ['draft', 'pending', 'published', 'rejected', 'archived'];

export function adminRoutes({ db, auth, siteUrl }) {
  const r = express.Router();
  r.use(requireAdmin);
  const origin = (req) => siteUrl || `${req.protocol}://${req.get('host')}`;
  const today = () => new Date().toISOString().slice(0, 10);

  const q = {
    byId: db.prepare('SELECT * FROM products WHERE id = ?'),
    setStatus: db.prepare('UPDATE products SET status = ?, reject_reason = ? WHERE id = ?'),
    publish: db.prepare("UPDATE products SET status = 'published', reject_reason = NULL, updated = ? WHERE id = ?"),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setDisabled: db.prepare('UPDATE users SET disabled = ? WHERE id = ?'),
    hideProducts: db.prepare("UPDATE products SET status = 'archived' WHERE owner_id = ? AND status IN ('published', 'pending')"),
  };

  const productRow = (row) => ({
    ...rowToProduct(row),
    status: row.status,
    rejectReason: row.reject_reason || null,
    owner: row.owner_id ? { id: row.owner_id, email: row.owner_email, name: row.owner_name } : null,
    file: row.file_key ? { name: row.file_name, size: row.file_size } : null,
    sold: row.sold ?? 0,
    createdAt: row.created_at,
  });

  r.get('/overview', (_req, res) => {
    const one = (sql) => db.prepare(sql).get();
    const byStatus = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM products GROUP BY status').all().map((x) => [x.status, x.n]));
    res.json({
      products: byStatus,
      users: one('SELECT COUNT(*) AS n FROM users').n,
      creators: one('SELECT COUNT(*) AS n FROM users WHERE creator_name IS NOT NULL').n,
      orders: one('SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM orders'),
      orders30: one("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM orders WHERE created_at >= datetime('now', '-30 days')"),
      newUsers30: one("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now', '-30 days')").n,
    });
  });

  r.get('/products', (req, res) => {
    const where = [];
    const params = [];
    if (STATUSES.includes(req.query.status)) { where.push('p.status = ?'); params.push(req.query.status); }
    const search = str(req.query.search, 100);
    if (search) {
      where.push("(p.title || ' ' || p.creator || ' ' || p.id || ' ' || COALESCE(u.email, '')) LIKE ? ESCAPE '\\'");
      params.push('%' + search.replace(/[\\%_]/g, (m) => '\\' + m) + '%');
    }
    // Pending first (oldest waiting first), then the rest by newest.
    const rows = db.prepare(`SELECT p.*, u.email AS owner_email, u.name AS owner_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.product_id = p.id) AS sold
      FROM products p LEFT JOIN users u ON u.id = p.owner_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (p.status = 'pending') DESC,
        CASE WHEN p.status = 'pending' THEN COALESCE(p.created_at, p.updated) END ASC,
        COALESCE(p.created_at, p.updated) DESC, p.id
      LIMIT 500`).all(...params);
    res.json(rows.map(productRow));
  });

  const act = (fn) => (req, res) => {
    const row = q.byId.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    const err = fn(row, req);
    if (err) return res.status(400).json({ error: err });
    res.json(productRow(q.byId.get(row.id)));
  };

  r.post('/products/:id/approve', act((row) => {
    const p = rowToProduct(row);
    if (!p.images.length) return 'This product has no images yet.';
    if (row.owner_id && !row.file_key) return 'This product has no downloadable file yet.';
    q.publish.run(row.status === 'published' ? row.updated : today(), row.id);
    return null;
  }));
  r.post('/products/:id/reject', act((row, req) => {
    const reason = str(req.body?.reason, 500);
    if (reason.length < 3) return 'Tell the creator what to fix.';
    q.setStatus.run('rejected', reason, row.id);
    return null;
  }));
  r.post('/products/:id/archive', act((row) => { q.setStatus.run('archived', null, row.id); return null; }));
  r.post('/products/:id/restore', act((row) => {
    if (row.owner_id && !row.file_key) return 'This product has no downloadable file.';
    q.setStatus.run('published', null, row.id);
    return null;
  }));

  r.get('/users', (req, res) => {
    const search = str(req.query.search, 100);
    const rows = db.prepare(`SELECT u.*,
        (SELECT COUNT(*) FROM products p WHERE p.owner_id = u.id AND p.status != 'archived') AS products,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders
      FROM users u ${search ? "WHERE (u.email || ' ' || u.name || ' ' || COALESCE(u.creator_name, '')) LIKE ? ESCAPE '\\'" : ''}
      ORDER BY u.id DESC LIMIT 500`).all(...(search ? ['%' + search.replace(/[\\%_]/g, (m) => '\\' + m) + '%'] : []));
    res.json(rows.map((u) => ({ ...publicUser(u), disabled: !!u.disabled, products: u.products, orders: u.orders })));
  });

  r.put('/users/:id', (req, res) => {
    const u = q.user.get(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found.' });
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role or block yourself.' });
    const b = req.body || {};
    if (b.role !== undefined) {
      if (!['user', 'admin'].includes(b.role)) return res.status(400).json({ error: 'Unknown role.' });
      q.setRole.run(b.role, u.id);
    }
    if (b.disabled !== undefined) {
      q.setDisabled.run(b.disabled ? 1 : 0, u.id);
      if (b.disabled) { auth.signOutEverywhere(u.id); q.hideProducts.run(u.id); }
    }
    const fresh = q.user.get(u.id);
    res.json({ ...publicUser(fresh), disabled: !!fresh.disabled });
  });

  // For users who forgot their password while email is not configured.
  r.post('/users/:id/reset-link', (req, res) => {
    const u = q.user.get(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found.' });
    res.json({ url: `${origin(req)}/reset?token=${auth.createResetToken(u.id)}`, expiresInMinutes: 60 });
  });

  r.get('/orders', (_req, res) => {
    const orders = db.prepare(`SELECT o.id, o.name, o.email, o.total, o.discount, o.coupon, o.payment, o.created_at, o.user_id,
        (SELECT GROUP_CONCAT(p.title, ' | ') FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id) AS items
      FROM orders o ORDER BY o.created_at DESC, o.id DESC LIMIT 300`).all();
    res.json(orders.map((o) => ({ ...o, createdAt: o.created_at })));
  });

  return r;
}
