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
  `);

  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count === 0) seed(db);
  return db;
}

function seed(db) {
  const insP = db.prepare(`INSERT INTO products
    (id,title,category,creator,price,sale,rating,sales,badge,tags,img,format,size,license,software,updated)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insR = db.prepare('INSERT INTO reviews (product_id,name,stars,text) VALUES (?,?,?,?)');
  const insC = db.prepare('INSERT OR IGNORE INTO coupons (code,percent) VALUES (?,?)');
  db.exec('BEGIN');
  try {
    for (const p of PRODUCTS) {
      insP.run(p.id, p.title, p.category, p.creator, p.price, p.sale, p.rating, p.sales, p.badge,
        JSON.stringify(p.tags), p.img, p.format, p.size, p.license, p.software, p.updated);
      for (const r of REVIEWS) insR.run(p.id, r.name, r.stars, r.text);
    }
    for (const c of COUPONS) insC.run(c.code, c.percent);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function rowToProduct(r) {
  if (!r) return null;
  return { ...r, tags: JSON.parse(r.tags || '[]') };
}
