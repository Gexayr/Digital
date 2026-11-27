// Creator studio (/api/studio/*): creators list, edit and upload their own products.
// Admins can use the same endpoints on any product (including the seeded catalogue).
//
// Storage (inside DATA_DIR, i.e. the docker volume):
//   uploads/<productId>/<rand>.jpg   cover + gallery images, served at /images/u/<productId>/<rand>.jpg
//   files/<productId>/<rand>         the deliverable buyers download (never served statically)
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { requireUser } from './auth.js';
import { rowToProduct } from './db.js';
import { CATEGORIES } from './seed.js';

export const LICENSES = ['Personal', 'Standard', 'Commercial', 'Extended'];
export const BADGES = ['Featured', 'Trending', 'New', 'Sale'];
export const MAX_IMAGES = 6;
export const MAX_FILE_MB = 500;
export const FILE_TYPES = [
  'zip', '7z', 'rar', 'tar', 'gz', 'pdf', 'epub',
  'otf', 'ttf', 'woff', 'woff2',
  'psd', 'ai', 'eps', 'svg', 'fig', 'sketch', 'xd', 'afdesign', 'afphoto', 'indd', 'kra', 'procreate', 'aseprite',
  'png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp', 'dng', 'raw',
  'xmp', 'lrtemplate', 'dcp', 'cube', 'look', 'acv',
  'blend', 'fbx', 'obj', 'glb', 'gltf', 'stl', 'usdz', 'c4d', 'max', 'ma', 'mb',
  'wav', 'mp3', 'flac', 'aif', 'aiff', 'ogg', 'm4a', 'mid', 'midi',
  'mp4', 'mov', 'webm', 'prproj', 'aep', 'mogrt', 'drp',
  'docx', 'xlsx', 'pptx', 'key', 'pages', 'numbers', 'txt', 'md', 'csv', 'json',
];

const round2 = (n) => Math.round(n * 100) / 100;
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const today = () => new Date().toISOString().slice(0, 10);
const rand = () => randomBytes(9).toString('base64url');
export const humanSize = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.max(1, Math.round(b / 1e6))} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// Validates editable product fields. Returns { values, fields } (fields = per-field errors).
export function parseProduct(b = {}, { admin = false } = {}) {
  const fields = {};
  const v = {};
  v.title = str(b.title, 100);
  if (v.title.length < 3) fields.title = 'Give the product a title (3-100 characters).';
  v.category = CATEGORIES.includes(b.category) ? b.category : null;
  if (!v.category) fields.category = 'Choose a category.';
  v.price = round2(Number(b.price));
  if (!Number.isFinite(v.price) || v.price < 1 || v.price > 1000) fields.price = 'Price must be between $1 and $1000.';
  if (b.sale === '' || b.sale == null) v.sale = null;
  else {
    v.sale = round2(Number(b.sale));
    if (!Number.isFinite(v.sale) || v.sale < 0.5 || !(v.sale < v.price)) fields.sale = 'Sale price must be lower than the regular price.';
  }
  v.description = str(b.description, 5000);
  if (v.description.length < 20) fields.description = 'Describe what buyers get (at least 20 characters).';
  const tags = Array.isArray(b.tags) ? b.tags : String(b.tags ?? '').split(',');
  v.tags = [...new Set(tags.map((t) => str(String(t), 24).toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 8);
  v.format = str(b.format, 60);
  if (!v.format) fields.format = 'List the file formats, e.g. ".psd / .png".';
  v.software = str(b.software, 120) || 'Any';
  v.license = LICENSES.includes(b.license) ? b.license : null;
  if (!v.license) fields.license = 'Choose a license.';
  if (admin && 'badge' in b) v.badge = BADGES.includes(b.badge) ? b.badge : null;
  return { values: v, fields };
}

export function studioRoutes({ db, dataDir, filesDir, requireVerified = false }) {
  const uploadsDir = path.join(dataDir, 'uploads');
  const tmpDir = path.join(dataDir, 'tmp');
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: MAX_IMAGES, fields: 5 },
  }).array('images', MAX_IMAGES);
  const fileUpload = multer({
    storage: multer.diskStorage({ destination: tmpDir, filename: (_r, _f, cb) => cb(null, rand()) }),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1, fields: 5 },
    fileFilter: (_r, f, cb) => {
      const ext = path.extname(f.originalname || '').slice(1).toLowerCase();
      cb(FILE_TYPES.includes(ext) ? null : Object.assign(new Error(`Files of type .${ext || '?'} are not accepted. Pack them into a .zip.`), { status: 400 }), true);
    },
  }).single('file');
  // Turn multer errors into readable JSON.
  const run = (mw) => (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Upload up to ${MAX_IMAGES} images at a time.`
        : err.status === 400 ? err.message : 'Upload failed. Please try again.';
    res.status(400).json({ error: msg });
  });

  const q = {
    byId: db.prepare('SELECT * FROM products WHERE id = ?'),
    mine: db.prepare(`SELECT p.*, COALESCE(s.n, 0) AS sold, COALESCE(s.revenue, 0) AS revenue FROM products p
      LEFT JOIN (SELECT product_id, COUNT(*) AS n, SUM(price) AS revenue FROM order_items GROUP BY product_id) s ON s.product_id = p.id
      WHERE p.owner_id = ? AND p.status != 'archived' ORDER BY COALESCE(p.created_at, p.updated) DESC`),
    nameTaken: db.prepare('SELECT 1 FROM users WHERE creator_name = ? AND id != ?'),
    nameUsedByCatalogue: db.prepare('SELECT 1 FROM products WHERE creator = ? COLLATE NOCASE AND (owner_id IS NULL OR owner_id != ?) LIMIT 1'),
    setProfile: db.prepare('UPDATE users SET creator_name = ?, bio = ?, payout = ? WHERE id = ?'),
    renameProducts: db.prepare('UPDATE products SET creator = ? WHERE owner_id = ?'),
    insert: db.prepare(`INSERT INTO products (id, title, category, creator, price, sale, rating, sales, badge, tags, img, images,
      format, size, license, software, updated, owner_id, status, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, '', '[]', ?, '-', ?, ?, ?, ?, 'draft', ?, datetime('now'))`),
    update: db.prepare(`UPDATE products SET title = ?, category = ?, price = ?, sale = ?, tags = ?, format = ?, license = ?,
      software = ?, description = ?, badge = ?, status = ? WHERE id = ?`),
    setImages: db.prepare('UPDATE products SET img = ?, images = ?, status = ? WHERE id = ?'),
    setFile: db.prepare('UPDATE products SET file_key = ?, file_name = ?, file_size = ?, size = ?, status = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE products SET status = ?, reject_reason = ? WHERE id = ?'),
    soldCount: db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?'),
    del: db.prepare('DELETE FROM products WHERE id = ?'),
  };

  const r = express.Router();
  r.use(requireUser);

  const isAdmin = (req) => req.user.role === 'admin';
  // Loads a product the current user may edit, or answers 404.
  function editable(req, res) {
    const row = q.byId.get(req.params.id);
    if (!row || (!isAdmin(req) && row.owner_id !== req.user.id) || (!isAdmin(req) && row.status === 'archived')) {
      res.status(404).json({ error: 'Product not found.' });
      return null;
    }
    return row;
  }
  // Ownership is checked before a (possibly large) upload is accepted.
  const own = (req, res, next) => { if (editable(req, res)) next(); };
  // A creator changing a live product sends it back to review; admins edit in place.
  const nextStatus = (req, row) => (!isAdmin(req) && row.status === 'published' ? 'pending' : row.status);

  function detail(row) {
    const sold = q.soldCount.get(row.id).n;
    return {
      ...rowToProduct(row),
      status: row.status,
      ownerId: row.owner_id,
      rejectReason: row.reject_reason || null,
      file: row.file_key ? { name: row.file_name, size: row.file_size } : null,
      sold,
    };
  }

  r.get('/', (req, res) => {
    const products = q.mine.all(req.user.id).map((row) => ({
      ...rowToProduct(row), status: row.status, rejectReason: row.reject_reason || null, sold: row.sold, revenue: round2(row.revenue),
    }));
    const revenue = round2(products.reduce((s, p) => s + p.revenue, 0));
    res.json({
      profile: { creatorName: req.user.creator_name || null, bio: req.user.bio || '', payout: req.user.payout || '' },
      share: SHARE,
      totals: { products: products.length, live: products.filter((p) => p.status === 'published').length, sold: products.reduce((s, p) => s + p.sold, 0), revenue, earnings: round2(revenue * SHARE) },
      products,
    });
  });

  r.put('/profile', (req, res) => {
    const name = str(req.body?.creatorName, 40).replace(/\s+/g, ' ');
    const bio = str(req.body?.bio, 600);
    const payout = str(req.body?.payout, 300);
    const fields = {};
    if (name.length < 2) fields.creatorName = 'Choose a public creator name (2-40 characters).';
    else if (q.nameTaken.get(name, req.user.id) || q.nameUsedByCatalogue.get(name, req.user.id)) fields.creatorName = 'This creator name is already taken.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
    q.setProfile.run(name, bio, payout, req.user.id);
    q.renameProducts.run(name, req.user.id);
    res.json({ creatorName: name, bio, payout });
  });

  r.post('/products', (req, res) => {
    if (!req.user.creator_name) return res.status(400).json({ error: 'Set up your creator profile first.' });
    const { values: v, fields } = parseProduct(req.body);
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
    let id;
    do { id = 'u' + randomBytes(4).toString('hex'); } while (q.byId.get(id));
    q.insert.run(id, v.title, v.category, req.user.creator_name, v.price, v.sale, JSON.stringify(v.tags), v.format, v.license, v.software, today(), req.user.id, v.description);
    res.status(201).json(detail(q.byId.get(id)));
  });

  r.get('/products/:id', (req, res) => {
    const row = editable(req, res);
    if (row) res.json(detail(row));
  });

  r.put('/products/:id', (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    const { values: v, fields } = parseProduct(req.body, { admin: isAdmin(req) });
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
    q.update.run(v.title, v.category, v.price, v.sale, JSON.stringify(v.tags), v.format, v.license, v.software, v.description,
      'badge' in v ? v.badge : row.badge, nextStatus(req, row), row.id);
    res.json(detail(q.byId.get(row.id)));
  });

  // ---- Images ----
  const imagesOf = (row) => rowToProduct(row).images;
  function saveImages(req, row, list) {
    q.setImages.run(list[0] || '', JSON.stringify(list), nextStatus(req, row), row.id);
  }
  const removeUpload = (key) => {
    if (!key.startsWith(`u/`)) return; // seed images ship with the client build
    try { unlinkSync(path.join(uploadsDir, key.slice(2) + '.jpg')); } catch { /* already gone */ }
  };

  r.post('/products/:id/images', own, run(imageUpload), async (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Choose at least one image.' });
    const list = imagesOf(row);
    if (list.length + files.length > MAX_IMAGES) return res.status(400).json({ error: `A product can have up to ${MAX_IMAGES} images.` });
    const dir = path.join(uploadsDir, row.id);
    mkdirSync(dir, { recursive: true });
    const added = [];
    try {
      for (const f of files) {
        // Re-encoding drops EXIF/GPS data and anything that is not a real image.
        const name = rand();
        await sharp(f.buffer, { limitInputPixels: 80e6 })
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 85, mozjpeg: true })
          .toFile(path.join(dir, name + '.jpg'));
        added.push(`u/${row.id}/${name}`);
      }
    } catch {
      added.forEach(removeUpload);
      return res.status(400).json({ error: 'One of the files is not an image we can read. Use JPG, PNG or WebP.' });
    }
    saveImages(req, row, [...list, ...added]);
    res.json(detail(q.byId.get(row.id)));
  });

  // Body: { images: [...] } - the new order; keys left out are deleted.
  r.put('/products/:id/images', (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    const list = imagesOf(row);
    const want = Array.isArray(req.body?.images) ? req.body.images.filter((k) => list.includes(k)) : null;
    if (!want) return res.status(400).json({ error: 'Send the list of images to keep.' });
    const next = [...new Set(want)];
    list.filter((k) => !next.includes(k)).forEach(removeUpload);
    saveImages(req, row, next);
    res.json(detail(q.byId.get(row.id)));
  });

  // ---- Deliverable ----
  r.post('/products/:id/file', own, run(fileUpload), (req, res) => {
    const row = editable(req, res);
    if (!row) { if (req.file) rmSync(req.file.path, { force: true }); return; }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    const dir = path.join(filesDir, row.id);
    mkdirSync(dir, { recursive: true });
    const key = `${row.id}/${rand()}`;
    renameSync(req.file.path, path.join(filesDir, key));
    if (row.file_key) rmSync(path.join(filesDir, row.file_key), { force: true });
    const size = statSync(path.join(filesDir, key)).size;
    const name = path.basename(req.file.originalname).replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'download.zip';
    q.setFile.run(key, name, size, humanSize(size), nextStatus(req, row), row.id);
    res.json(detail(q.byId.get(row.id)));
  });

  r.get('/products/:id/file', (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    if (!row.file_key) return res.status(404).json({ error: 'No file uploaded yet.' });
    res.download(path.join(filesDir, row.file_key), row.file_name, { headers: { 'Content-Type': 'application/octet-stream' } });
  });

  // ---- Review flow ----
  r.post('/products/:id/submit', (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    if (requireVerified && !isAdmin(req) && !req.user.email_verified) return res.status(403).json({ error: 'Confirm your email before submitting. We sent you a link; you can ask for a new one on your account page.', code: 'email_unverified' });
    const missing = [];
    const p = rowToProduct(row);
    if (!p.images.length) missing.push('at least one image');
    if (!row.file_key && row.owner_id) missing.push('the file buyers will download');
    if (missing.length) return res.status(400).json({ error: `Add ${missing.join(' and ')} before submitting.` });
    if (row.status === 'published') return res.json(detail(row));
    q.setStatus.run('pending', null, row.id);
    res.json(detail(q.byId.get(row.id)));
  });

  // Never-sold drafts are deleted for good; anything that was bought is archived so buyers keep their downloads.
  r.delete('/products/:id', (req, res) => {
    const row = editable(req, res);
    if (!row) return;
    if (q.soldCount.get(row.id).n || !row.owner_id) {
      q.setStatus.run('archived', null, row.id);
      return res.json({ ok: true, archived: true });
    }
    q.del.run(row.id);
    rmSync(path.join(uploadsDir, row.id), { recursive: true, force: true });
    rmSync(path.join(filesDir, row.id), { recursive: true, force: true });
    res.json({ ok: true, deleted: true });
  });

  return { router: r, uploadsDir };
}

// Share of each sale that goes to the creator (the rest is the platform fee).
export const SHARE = Math.min(1, Math.max(0, Number(process.env.CREATOR_SHARE) || 0.8));
