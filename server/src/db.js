import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PRODUCTS, COUPONS, REVIEWS } from './seed.js';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      creator TEXT NOT NULL,
      price REAL NOT NULL,
      sale REAL,
      rating REAL NOT NULL DEFAULT 0,
      sales INTEGER NOT NULL DEFAULT 0,
      badge TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      img TEXT NOT NULL,
      format TEXT, size TEXT, license TEXT, software TEXT,
      updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      stars INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY,
      percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      country TEXT,
      address TEXT,
      payment TEXT NOT NULL,
      coupon TEXT,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      price REAL NOT NULL,
      PRIMARY KEY (order_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      email TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      creator_name TEXT UNIQUE COLLATE NOCASE,
      bio TEXT,
      payout TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, product_id)
    );
  `);

  // Columns added after the first release (accounts, creator uploads, moderation).
  addColumns(db, 'products', {
    owner_id: 'INTEGER REFERENCES users(id) ON DELETE SET NULL',
    // draft -> pending (review) -> published | rejected; archived = removed from the shop
    status: "TEXT NOT NULL DEFAULT 'published'",
    description: 'TEXT',
    images: 'TEXT', // JSON list of image keys; NULL = the seed layout <img>, <img>-alt-1..3
    file_name: 'TEXT',
    file_key: 'TEXT',
    file_size: 'INTEGER',
    reject_reason: 'TEXT',
    created_at: 'TEXT',
  });
  addColumns(db, 'orders', { user_id: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' });
  const hadVerified = db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'email_verified');
  addColumns(db, 'users', {
    google_id: 'TEXT', // Google account "sub"; pass_hash is '' for Google-only accounts
    email_verified: 'INTEGER NOT NULL DEFAULT 0',
  });
  // Accounts created before email confirmation existed count as confirmed.
  if (!hadVerified) db.exec('UPDATE users SET email_verified = 1');
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS products_status ON products(status);
    CREATE INDEX IF NOT EXISTS products_owner ON products(owner_id);
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_id) WHERE google_id IS NOT NULL;
  `);

  // Idempotent: a fresh DB gets the whole catalogue, an existing one gets
  // only the products added to seed.js since it was created.
  seed(db);
  // p6 is a photo set; it was listed under Digital Art originally.
  db.prepare("UPDATE products SET category = 'Photography' WHERE id = 'p6' AND category = 'Digital Art'").run();
  return db;
}

function seed(db) {
  const insP = db.prepare(`INSERT OR IGNORE INTO products
    (id,title,category,creator,price,sale,rating,sales,badge,tags,img,format,size,license,software,updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare('INSERT INTO reviews (product_id,name,stars,text) VALUES (?,?,?,?)');
  const insC = db.prepare('INSERT OR IGNORE INTO coupons (code,percent) VALUES (?,?)');
  db.exec('BEGIN');
  try {
    for (const p of PRODUCTS) {
      const { changes } = insP.run(p.id, p.title, p.category, p.creator, p.price, p.sale, p.rating, p.sales, p.badge,
        JSON.stringify(p.tags), p.img, p.format, p.size, p.license, p.software, p.updated);
      if (changes) for (const r of REVIEWS) insR.run(p.id, r.name, r.stars, r.text);
    }
    for (const c of COUPONS) insC.run(c.code, c.percent);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function addColumns(db, table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, def] of Object.entries(cols)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

// Public shape of a product. Internal columns (file location, owner) stay on the server.
export function rowToProduct(r) {
  if (!r) return null;
  const { tags, images, file_key: _k, owner_id: _o, reject_reason: _r, created_at: _c, file_name: _n, file_size: _s, ...rest } = r;
  let list = null;
  try { list = images ? JSON.parse(images) : null; } catch { list = null; }
  const imgs = list?.length ? list : list ? [] : [r.img, `${r.img}-alt-1`, `${r.img}-alt-2`, `${r.img}-alt-3`];
  return { ...rest, img: imgs[0] || r.img, images: imgs, tags: JSON.parse(tags || '[]') };
}
