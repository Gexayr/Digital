import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const CLIENT_DIST = path.resolve(process.env.CLIENT_DIST || path.join(root, 'client', 'dist'));
const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(DATA_DIR, 'files'));

const db = openDb(path.join(DATA_DIR, 'vellum.db'));
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
const app = createApp({ db, clientDist: CLIENT_DIST, filesDir: FILES_DIR, siteUrl: SITE_URL });

const server = app.listen(PORT, HOST, () => {
  console.log(`Vellum listening on http://${HOST}:${PORT}`);
});

const shutdown = () => {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
