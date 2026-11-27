// Admin tasks from the shell:
//   docker exec vellum node server/src/cli.js make-admin <email> [name]   creates the account if needed, prints a password
//   docker exec vellum node server/src/cli.js reset-password <email>       prints a new random password
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { hashPassword } from './auth.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const db = openDb(path.join(DATA_DIR, 'vellum.db'));
const [cmd, emailArg, ...rest] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();
const newPassword = () => randomBytes(12).toString('base64url');

if (!email || !['make-admin', 'reset-password'].includes(cmd)) {
  console.log('usage: cli.js make-admin <email> [name] | reset-password <email>');
  process.exit(1);
}
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (cmd === 'make-admin') {
  if (user) {
    db.prepare("UPDATE users SET role = 'admin', disabled = 0 WHERE id = ?").run(user.id);
    console.log(`${email} is now an admin (password unchanged).`);
  } else {
    const pw = newPassword();
    db.prepare("INSERT INTO users (email, name, pass_hash, role) VALUES (?, ?, ?, 'admin')").run(email, rest.join(' ') || 'Admin', await hashPassword(pw));
    console.log(`Created admin ${email}\npassword: ${pw}`);
  }
} else {
  if (!user) { console.log('No such user.'); process.exit(1); }
  const pw = newPassword();
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(await hashPassword(pw), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  console.log(`New password for ${email}: ${pw}`);
}
db.close();
