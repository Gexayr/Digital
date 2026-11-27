// /api/auth/* (sign up, sign in, password reset) and /api/me/* (profile, orders, wishlist).
import express from 'express';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { EMAIL_RE, passwordProblem, publicUser, requireUser } from './auth.js';
import { rowToProduct } from './db.js';
import { SHARE } from './studio.js';
import { OAuth2Client } from 'google-auth-library';

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// verifyGoogle(idToken) -> { sub, email, email_verified, name } | throws. Injectable for tests.
function googleVerifier(clientId) {
  const client = new OAuth2Client();
  return async (idToken) => (await client.verifyIdToken({ idToken, audience: clientId })).getPayload();
}

export function accountRoutes({ db, auth, mailer, siteUrl, loadOrder, googleClientId = '', verifyGoogle }) {
  if (googleClientId && !verifyGoogle) verifyGoogle = googleVerifier(googleClientId);
  const r = express.Router();
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
  const q = {
    updProfile: db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?'),
    sales: db.prepare(`SELECT COALESCE(SUM(oi.price), 0) AS total FROM order_items oi
      JOIN products p ON p.id = oi.product_id WHERE p.owner_id = ?`),
    unverify: db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?'),
    myOrders: db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200'),
    order: db.prepare('SELECT id, token, user_id FROM orders WHERE id = ?'),
    claim: db.prepare('UPDATE orders SET user_id = ? WHERE id = ? AND user_id IS NULL'),
    wishlist: db.prepare(`SELECT p.* FROM wishlist w JOIN products p ON p.id = w.product_id
      WHERE w.user_id = ? AND p.status = 'published' ORDER BY w.rowid`),
    clearWish: db.prepare('DELETE FROM wishlist WHERE user_id = ?'),
    addWish: db.prepare(`INSERT OR IGNORE INTO wishlist (user_id, product_id)
      SELECT ?, id FROM products WHERE id = ? AND status = 'published'`),
  };
  const origin = (req) => siteUrl || `${req.protocol}://${req.get('host')}`;
  // Sends the "confirm your email" link. Returns false when mail is off or sending failed.
  const sendVerification = (req, u, welcome) => {
    if (!mailer.enabled) return Promise.resolve(false);
    const link = `${origin(req)}/verify?token=${auth.createVerifyToken(u)}`;
    return mailer.send({
      to: u.email,
      subject: welcome ? 'Welcome to Vellum: confirm your email' : 'Confirm your email for Vellum',
      text: `Hi ${u.name},\n\n${welcome ? 'Thanks for creating a Vellum account. ' : ''}Please confirm your email address by opening this link (valid for 48 hours):\n${link}\n\nIf you didn't ${welcome ? 'sign up' : 'ask for this'}, just ignore this email.\n\nVellum`,
    });
  };
  const verifyLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => String(req.user?.id), message: { error: 'Too many emails. Please wait an hour and try again.' } });

  // Creator balance = their share of all sales (no withdrawals yet).
  const withBalance = (u) => (u?.creatorName ? { ...u, balance: Math.round(q.sales.get(u.id).total * SHARE * 100) / 100 } : u);
  const me = (req) => ({ user: withBalance(publicUser(req.user)), mail: mailer.enabled, google: googleClientId || null });

  r.get('/auth/me', (req, res) => res.json(me(req)));

  r.post('/auth/register', authLimiter, async (req, res) => {
    const email = str(req.body?.email, 254).toLowerCase();
    const name = str(req.body?.name, 80);
    const password = req.body?.password;
    const fields = {};
    if (name.length < 2) fields.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
    const pw = passwordProblem(password);
    if (pw) fields.password = pw;
    if (!fields.email && auth.userByEmail(email)) fields.email = 'An account with this email already exists. Try signing in.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
    const u = await auth.register({ email, name, password });
    req.user = u;
    auth.startSession(req, res, u.id);
    sendVerification(req, u, true); // don't make the user wait for SMTP
    res.status(201).json(me(req));
  });

  r.post('/auth/login', authLimiter, async (req, res) => {
    const email = str(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
    const u = email && password ? await auth.login(email, password) : null;
    if (!u) return res.status(401).json({ error: 'Wrong email or password.' });
    req.user = u;
    auth.startSession(req, res, u.id);
    res.json(me(req));
  });

  r.post('/auth/google', authLimiter, async (req, res) => {
    if (!googleClientId) return res.status(503).json({ error: 'Google sign-in is not available.' });
    const credential = req.body?.credential;
    if (typeof credential !== 'string' || !credential || credential.length > 4096) return res.status(400).json({ error: 'Google sign-in failed. Please try again.' });
    let p;
    try { p = await verifyGoogle(credential); } catch { p = null; }
    const email = typeof p?.email === 'string' ? p.email.trim().toLowerCase() : '';
    if (!p?.sub || !EMAIL_RE.test(email) || p.email_verified !== true) return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
    const name = str(p.name, 80) || str(p.given_name, 80) || email.split('@')[0];
    const u = auth.googleLogin({ sub: String(p.sub), email, name: name.length >= 2 ? name : email.split('@')[0] });
    if (!u) return res.status(403).json({ error: 'This account cannot sign in with Google. Use your email and password, or contact the site administrator.' });
    req.user = u;
    auth.startSession(req, res, u.id);
    res.json(me(req));
  });

  r.post('/auth/verify', authLimiter, (req, res) => {
    const u = auth.verifyEmail(req.body?.token);
    if (!u) return res.status(400).json({ error: 'This confirmation link is invalid or has expired. Sign in and ask for a new one.' });
    if (req.user?.id === u.id) req.user = u;
    res.json(me(req));
  });

  r.post('/me/verify', requireUser, verifyLimiter, async (req, res) => {
    if (req.user.email_verified) return res.json({ ok: true, already: true });
    if (!mailer.enabled) return res.status(503).json({ error: 'Email is not available right now. Please try again later.' });
    const sent = await sendVerification(req, req.user, false);
    if (!sent) return res.status(502).json({ error: 'Could not send the email. Please try again later.' });
    res.json({ ok: true });
  });

  r.post('/auth/logout', (req, res) => {
    auth.endSession(req, res);
    res.json({ ok: true });
  });

  r.post('/auth/forgot', authLimiter, async (req, res) => {
    if (!mailer.enabled) return res.status(503).json({ error: 'Password reset by email is not available yet. Please contact the site administrator.' });
    const email = str(req.body?.email, 254).toLowerCase();
    const u = EMAIL_RE.test(email) ? auth.userByEmail(email) : null;
    if (u && !u.disabled) {
      const link = `${origin(req)}/reset?token=${auth.createResetToken(u.id)}`;
      await mailer.send({
        to: u.email,
        subject: 'Reset your Vellum password',
        text: `Hi ${u.name},\n\nOpen this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, just ignore this email.\n\nVellum`,
      });
    }
    // Same answer whether or not the account exists.
    res.json({ ok: true });
  });

  r.post('/auth/reset', authLimiter, async (req, res) => {
    const userId = auth.resetUser(req.body?.token);
    if (!userId) return res.status(400).json({ error: 'This reset link is invalid or has expired. Ask for a new one.' });
    const pw = passwordProblem(req.body?.password);
    if (pw) return res.status(400).json({ error: pw, fields: { password: pw } });
    await auth.setPassword(userId, req.body.password);
    req.user = auth.userById(userId);
    auth.startSession(req, res, userId);
    res.json(me(req));
  });

  // ---- Signed-in user ----
  r.put('/me', requireUser, authLimiter, async (req, res) => {
    const b = req.body || {};
    const name = b.name === undefined ? req.user.name : str(b.name, 80);
    const email = b.email === undefined ? req.user.email : str(b.email, 254).toLowerCase();
    const fields = {};
    if (name.length < 2) fields.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';
    else if (email !== req.user.email.toLowerCase() && auth.userByEmail(email)) fields.email = 'This email is already used by another account.';
    const changingSecret = email !== req.user.email.toLowerCase() || b.newPassword;
    if (b.newPassword) { const pw = passwordProblem(b.newPassword); if (pw) fields.newPassword = pw; }
    // Google-only accounts have no password yet: they can set one (and change email) without it.
    if (changingSecret && req.user.pass_hash && !fields.email && !fields.newPassword) {
      const ok = typeof b.currentPassword === 'string' && await auth.login(req.user.email, b.currentPassword);
      if (!ok) fields.currentPassword = 'Enter your current password to change email or password.';
    }
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
    const emailChanged = email !== req.user.email.toLowerCase();
    q.updProfile.run(name, email, req.user.id);
    if (emailChanged) q.unverify.run(req.user.id);
    if (b.newPassword) await auth.setPassword(req.user.id, b.newPassword, req.sessionHash);
    req.user = auth.userById(req.user.id);
    if (emailChanged) sendVerification(req, req.user, false);
    res.json(me(req));
  });

  r.get('/me/orders', requireUser, (req, res) => {
    res.json(q.myOrders.all(req.user.id).map((o) => loadOrder(o.id)));
  });

  // Orders placed on this device before signing in are attached to the account
  // (only when the device still holds the secret order token).
  r.post('/me/orders/claim', requireUser, (req, res) => {
    const list = Array.isArray(req.body?.orders) ? req.body.orders.slice(0, 100) : [];
    let claimed = 0;
    for (const { id, token } of list) {
      const o = typeof id === 'string' ? q.order.get(id) : null;
      if (!o || o.user_id || typeof token !== 'string' || token.length !== o.token.length) continue;
      if (timingSafeEqual(Buffer.from(o.token), Buffer.from(token))) claimed += q.claim.run(req.user.id, o.id).changes;
    }
    res.json({ claimed });
  });

  r.get('/me/wishlist', requireUser, (req, res) => res.json(q.wishlist.all(req.user.id).map(rowToProduct)));

  r.put('/me/wishlist', requireUser, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter((x) => typeof x === 'string'))].slice(0, 300) : [];
    db.exec('BEGIN');
    try {
      q.clearWish.run(req.user.id);
      for (const id of ids) q.addWish.run(req.user.id, id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json(q.wishlist.all(req.user.id).map(rowToProduct));
  });

  return r;
}
