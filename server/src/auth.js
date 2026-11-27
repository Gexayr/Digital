// Accounts: email + password, server-side sessions in SQLite, httpOnly cookie.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
export const COOKIE = 'vl_sid';
const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
const VERIFY_HOURS = 48;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Format: scrypt$N$r$p$saltHex$hashHex
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const want = Buffer.from(hash, 'hex');
  const key = await scrypt(password, Buffer.from(salt, 'hex'), want.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(key, want);
}
// Used when the email is unknown, so login takes the same time either way.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    creatorName: u.creator_name || null, bio: u.bio || '', payout: u.payout || '',
    hasPassword: !!u.pass_hash, google: !!u.google_id, emailVerified: !!u.email_verified,
    createdAt: u.created_at,
  };
}

export function createAuth(db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insUser: db.prepare('INSERT INTO users (email, name, pass_hash) VALUES (?, ?, ?)'),
    insSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`),
    delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?'),
    purge: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    purgeResets: db.prepare('DELETE FROM password_resets WHERE expires_at <= ?'),
    insReset: db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    reset: db.prepare('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?'),
    delResets: db.prepare('DELETE FROM password_resets WHERE user_id = ?'),
    setPass: db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?'),
    userByGoogle: db.prepare('SELECT * FROM users WHERE google_id = ?'),
    linkGoogle: db.prepare('UPDATE users SET google_id = ? WHERE id = ?'),
    insGoogleUser: db.prepare("INSERT INTO users (email, name, pass_hash, google_id, email_verified) VALUES (?, ?, '', ?, 1)"),
    markVerified: db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?'),
    insVerify: db.prepare('INSERT INTO email_verifications (token_hash, user_id, email, expires_at) VALUES (?, ?, ?, ?)'),
    verify: db.prepare(`SELECT v.user_id FROM email_verifications v JOIN users u ON u.id = v.user_id
      WHERE v.token_hash = ? AND v.expires_at > ? AND v.email = u.email COLLATE NOCASE`),
    delVerifies: db.prepare('DELETE FROM email_verifications WHERE user_id = ?'),
    purgeVerifies: db.prepare('DELETE FROM email_verifications WHERE expires_at <= ?'),
  };
  const purge = () => { q.purge.run(Date.now()); q.purgeResets.run(Date.now()); q.purgeVerifies.run(Date.now()); };
  purge();
  setInterval(purge, 60 * 60 * 1000).unref();

  function startSession(req, res, userId) {
    const token = randomBytes(32).toString('base64url');
    const expires = Date.now() + SESSION_DAYS * 864e5;
    q.insSession.run(sha256(token), userId, expires);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: SESSION_DAYS * 864e5,
    });
  }

  function endSession(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) q.delSession.run(sha256(token));
    res.clearCookie(COOKIE, { path: '/' });
  }

  // Attaches req.user (or null) on every request.
  function middleware(req, _res, next) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.sessionHash = token ? sha256(token) : null;
    req.user = token ? q.session.get(req.sessionHash, Date.now()) || null : null;
    next();
  }

  async function register({ email, name, password }) {
    const hash = await hashPassword(password);
    const { lastInsertRowid } = q.insUser.run(email, name, hash);
    return q.userById.get(lastInsertRowid);
  }

  async function login(email, password) {
    const u = q.userByEmail.get(email);
    if (!u) { await verifyPassword(password, await DUMMY_HASH); return null; }
    const ok = await verifyPassword(password, u.pass_hash);
    return ok && !u.disabled ? u : null;
  }

  // Sign in with a verified Google identity: by Google id, else link the account
  // with the same (Google-verified) email, else create a new passwordless account.
  // Returns null for disabled accounts.
  function googleLogin({ sub, email, name }) {
    let u = q.userByGoogle.get(sub);
    if (!u) {
      const byEmail = q.userByEmail.get(email);
      if (byEmail) {
        if (byEmail.google_id) return null; // email already linked to a different Google account
        q.linkGoogle.run(sub, byEmail.id);
        q.markVerified.run(byEmail.id); // Google confirmed this address
        u = q.userById.get(byEmail.id);
      } else {
        const { lastInsertRowid } = q.insGoogleUser.run(email, name, sub);
        u = q.userById.get(lastInsertRowid);
      }
    }
    return u && !u.disabled ? u : null;
  }

  async function setPassword(userId, password, keepSessionHash = null) {
    q.setPass.run(await hashPassword(password), userId);
    q.delResets.run(userId);
    // Changing the password signs out every other device.
    if (keepSessionHash) q.delOtherSessions.run(userId, keepSessionHash); else q.delUserSessions.run(userId);
  }

  function createResetToken(userId) {
    const token = randomBytes(32).toString('base64url');
    q.insReset.run(sha256(token), userId, Date.now() + RESET_MINUTES * 60_000);
    return token;
  }

  function createVerifyToken(user) {
    const token = randomBytes(32).toString('base64url');
    q.insVerify.run(sha256(token), user.id, user.email, Date.now() + VERIFY_HOURS * 3600_000);
    return token;
  }

  // Confirms the email the token was issued for (only if it is still the account's email).
  function verifyEmail(token) {
    const userId = typeof token === 'string' && token ? q.verify.get(sha256(token), Date.now())?.user_id : null;
    if (!userId) return null;
    q.markVerified.run(userId);
    q.delVerifies.run(userId);
    return q.userById.get(userId);
  }

  const resetUser = (token) => (typeof token === 'string' && token ? q.reset.get(sha256(token), Date.now())?.user_id ?? null : null);

  return {
    middleware, startSession, endSession, register, login, googleLogin, setPassword, createVerifyToken, verifyEmail, createResetToken, resetUser,
    signOutEverywhere: (userId) => q.delUserSessions.run(userId),
    userByEmail: (e) => q.userByEmail.get(e),
    userById: (id) => q.userById.get(id),
  };
}

export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in first.' }));
export const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: 'Admins only.' }));
