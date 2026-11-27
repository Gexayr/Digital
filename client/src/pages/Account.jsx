import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtPrice } from '../api.js';
import { useStore } from '../store.jsx';
import { usePageMeta } from '../components/ui.jsx';
import { Field, RequireUser, useForm } from '../components/form.jsx';
import { GoogleButton } from '../components/GoogleButton.jsx';

// Only same-site paths are allowed as a post-login destination.
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

function AuthShell({ title, sub, children, foot }) {
  return (
    <div className="container page auth-page">
      <div className="panel auth-card">
        <h1 className="h2">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {children}
        {foot && <div className="auth-foot muted small">{foot}</div>}
      </div>
    </div>
  );
}

export function Login() {
  usePageMeta('Sign in | Vellum');
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const f = useForm({ email: '', password: '' });
  const go = f.submit(async (v) => {
    const r = await api.login(v);
    signedIn(r.user);
    nav(safeNext(sp.get('next')), { replace: true });
  });
  const next = sp.get('next');
  return (
    <AuthShell
      title="Sign in" sub="Your purchases, wishlist and creator studio in one place."
      foot={<>New to Vellum? <Link className="link-accent" to={'/register' + (next ? '?next=' + encodeURIComponent(next) : '')}>Create an account</Link></>}
    >
      <GoogleButton onDone={(u) => { signedIn(u); nav(safeNext(next), { replace: true }); }} />
      <form className="stack" onSubmit={go} noValidate>
        <Field label="Email" type="email" autoComplete="email" inputMode="email" autoFocus {...f.bind('email')} />
        <Field label="Password" type="password" autoComplete="current-password" {...f.bind('password')} />
        {f.error && <div className="form-error">{f.error}</div>}
        <button className="btn btn-primary btn-block" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/forgot" className="center muted small">Forgot your password?</Link>
      </form>
    </AuthShell>
  );
}

export function Register() {
  usePageMeta('Create an account | Vellum');
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const f = useForm({ name: '', email: '', password: '' });
  const go = f.submit(async (v) => {
    const r = await api.register(v);
    signedIn(r.user);
    nav(safeNext(sp.get('next')), { replace: true });
  });
  return (
    <AuthShell
      title="Create an account" sub="Buy and keep your downloads on every device, or start selling your own work."
      foot={<>Already have an account? <Link className="link-accent" to="/login">Sign in</Link></>}
    >
      <GoogleButton text="signup_with" onDone={(u) => { signedIn(u); nav(safeNext(sp.get('next')), { replace: true }); }} />
      <form className="stack" onSubmit={go} noValidate>
        <Field label="Name" autoComplete="name" autoFocus {...f.bind('name')} />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" {...f.bind('email')} />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." {...f.bind('password')} />
        {f.error && <div className="form-error">{f.error}</div>}
        <button className="btn btn-primary btn-block" disabled={f.busy}>{f.busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}

export function Forgot() {
  usePageMeta('Reset password | Vellum');
  const { mailEnabled } = useStore();
  const f = useForm({ email: '', sent: false });
  const go = f.submit(async (v) => { await api.forgot(v.email); f.setValues((s) => ({ ...s, sent: true })); });
  if (!mailEnabled) {
    return (
      <AuthShell title="Forgot your password?" foot={<Link className="link-accent" to="/login">Back to sign in</Link>}>
        <p>Password reset by email is not available yet. Please contact the site administrator: they can send you a reset link.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Forgot your password?" sub="We'll email you a link to choose a new one." foot={<Link className="link-accent" to="/login">Back to sign in</Link>}>
      {f.values.sent ? <div className="form-ok">If an account exists for {f.values.email}, a reset link is on its way. It is valid for 1 hour.</div> : (
        <form className="stack" onSubmit={go} noValidate>
          <Field label="Email" type="email" autoComplete="email" inputMode="email" autoFocus {...f.bind('email')} />
          {f.error && <div className="form-error">{f.error}</div>}
          <button className="btn btn-primary btn-block" disabled={f.busy}>Send reset link</button>
        </form>
      )}
    </AuthShell>
  );
}

export function Reset() {
  usePageMeta('Choose a new password | Vellum');
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const f = useForm({ password: '' });
  const go = f.submit(async (v) => {
    const r = await api.resetPassword(sp.get('token') || '', v.password);
    signedIn(r.user);
    nav('/account', { replace: true });
  });
  return (
    <AuthShell title="Choose a new password">
      <form className="stack" onSubmit={go} noValidate>
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." autoFocus {...f.bind('password')} />
        {f.error && <div className="form-error">{f.error}</div>}
        <button className="btn btn-primary btn-block" disabled={f.busy}>Save and sign in</button>
      </form>
    </AuthShell>
  );
}

export function Verify() {
  usePageMeta('Confirm your email | Vellum');
  const { user, signedIn } = useStore();
  const [sp] = useSearchParams();
  const [state, setState] = useState({ busy: true, error: '' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; // the token works once; StrictMode would run this twice
    ran.current = true;
    api.verifyEmail(sp.get('token') || '').then(
      (r) => { if (r.user) signedIn(r.user); setState({ busy: false, error: '' }); },
      (e) => setState({ busy: false, error: e.message }),
    );
  }, [sp, signedIn]);
  return (
    <AuthShell title="Confirm your email" foot={<Link className="link-accent" to={user ? '/account' : '/login'}>{user ? 'Go to your account' : 'Sign in'}</Link>}>
      {state.busy ? <p className="muted">Checking your link…</p>
        : state.error ? <div className="form-error">{state.error}</div>
        : <div className="form-ok">Thanks, your email is confirmed.</div>}
    </AuthShell>
  );
}

function VerifyBanner({ mail }) {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!mail) return null;
  const resend = async () => {
    setBusy(true); setError('');
    try { await api.resendVerification(); notify('Confirmation email sent'); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <div className="panel verify-banner">
      <div>
        <strong>Confirm your email</strong>
        <div className="muted small">We sent a link to your inbox. You need it to submit products for sale.</div>
        {error && <div className="form-error">{error}</div>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Send again'}</button>
    </div>
  );
}

function AccountPage() {
  usePageMeta('Your account | Vellum');
  const { user, signedIn, signOut, notify, mailEnabled } = useStore();
  const nav = useNavigate();
  const f = useForm({ name: user.name, email: user.email, currentPassword: '', newPassword: '' });
  const save = f.submit(async (v) => {
    const body = { name: v.name, email: v.email, ...(v.newPassword ? { newPassword: v.newPassword } : {}), ...(v.currentPassword ? { currentPassword: v.currentPassword } : {}) };
    const r = await api.updateMe(body);
    signedIn(r.user);
    f.setValues((s) => ({ ...s, currentPassword: '', newPassword: '' }));
    notify(r.user.emailVerified || !mailEnabled ? 'Saved' : 'Saved. Check your inbox to confirm your email.');
  });
  const needsCurrent = user.hasPassword && (f.values.email.trim().toLowerCase() !== user.email.toLowerCase() || f.values.newPassword);

  return (
    <div className="container page narrow-md stack-lg">
      <div className="account-head">
        <div>
          <h1 className="h1">Hi, {user.name.split(' ')[0]}</h1>
          <div className="muted">{user.email}{user.google ? ' · Google' : ''}{user.role === 'admin' ? ' · Administrator' : ''}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await signOut(); nav('/'); }}>Sign out</button>
      </div>

      {!user.emailVerified && <VerifyBanner mail={mailEnabled} />}

      <div className="account-tiles">
        <Link to="/downloads" className="panel account-tile"><strong>Purchases</strong><span className="muted small">Download what you bought</span></Link>
        <Link to="/wishlist" className="panel account-tile"><strong>Wishlist</strong><span className="muted small">Saved for later</span></Link>
        <Link to="/studio" className="panel account-tile">
          <strong>{user.creatorName ? 'Creator studio' : 'Start selling'}</strong>
          <span className="muted small">{user.creatorName ? `Balance ${fmtPrice(user.balance || 0)} · your products as ${user.creatorName}` : 'Upload your work and get paid'}</span>
        </Link>
        {user.role === 'admin' && <Link to="/admin" className="panel account-tile"><strong>Admin</strong><span className="muted small">Review queue, products, users</span></Link>}
      </div>

      <form className="panel stack" onSubmit={save} noValidate>
        <h2 className="h3">Profile and password</h2>
        <div className="form-grid">
          <Field label="Name" autoComplete="name" {...f.bind('name')} />
          <Field label="Email" type="email" autoComplete="email" {...f.bind('email')} />
          <Field
            label={user.hasPassword ? 'New password' : 'Set a password'} type="password" autoComplete="new-password"
            hint={user.hasPassword ? 'Leave empty to keep the current one.' : 'You sign in with Google. Add a password to also sign in with your email.'}
            {...f.bind('newPassword')}
          />
          {needsCurrent && <Field label="Current password" type="password" autoComplete="current-password" {...f.bind('currentPassword')} />}
        </div>
        {f.error && <div className="form-error">{f.error}</div>}
        <div><button className="btn btn-primary" disabled={f.busy}>Save changes</button></div>
      </form>
    </div>
  );
}

export function Account() {
  return <RequireUser><AccountPage /></RequireUser>;
}
