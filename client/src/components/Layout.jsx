import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Icon } from './ui.jsx';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/categories', label: 'Categories' },
  { to: '/creators', label: 'Creators' },
];

export function Logo() {
  return (
    <>
      <svg className="logo-mark" width="26" height="26" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="16" y="4" width="28" height="28" rx="7" fill="currentColor" opacity=".35" />
        <rect x="10" y="10" width="28" height="28" rx="7" fill="currentColor" opacity=".65" />
        <rect x="4" y="16" width="28" height="28" rx="7" fill="currentColor" />
      </svg>
      <span>Vellum</span>
    </>
  );
}

function Nav() {
  const { cart, wishlist, theme, toggleTheme, orders, user } = useStore();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  // Come back to the same page after signing in.
  const here = loc.pathname + loc.search;
  const loginHref = ['/', '/login', '/register', '/forgot', '/reset'].includes(loc.pathname) ? '/login' : `/login?next=${encodeURIComponent(here)}`;
  useEffect(() => {
    document.body.classList.toggle('no-scroll', open);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="nav">
      <div className="nav-inner">
        <button type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Icon.menu />
        </button>
        <Link to="/" className="logo" aria-label="Vellum home"><Logo /></Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          {(orders.length > 0 || user) && <NavLink to="/downloads">Downloads</NavLink>}
        </nav>
        <div className="spacer" />
        <div className="nav-actions">
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            <span className="knob">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>
          <Link to="/wishlist" className="icon-btn counter" aria-label={`Wishlist, ${wishlist.length} items`}>
            <Icon.heart width="20" height="20" />
            {wishlist.length > 0 && <span className="count">{wishlist.length}</span>}
          </Link>
          <Link to="/cart" className="icon-btn counter" aria-label={`Cart, ${cart.length} items`}>
            <Icon.cart width="20" height="20" />
            {cart.length > 0 && <span className="count">{cart.length}</span>}
          </Link>
          {user
            ? <Link to="/account" className="icon-btn user-btn" aria-label="Your account" title={user.name}><span className="user-initial">{user.name.slice(0, 1).toUpperCase()}</span></Link>
            : <Link to={loginHref} className="btn btn-ghost btn-sm signin-btn">Sign in</Link>}
        </div>
      </div>

      <div className={'drawer-backdrop' + (open ? ' open' : '')} onClick={() => setOpen(false)} />
      <aside className={'drawer' + (open ? ' open' : '')} aria-hidden={!open} inert={open ? undefined : ''}>
        <div className="drawer-head">
          <span className="logo"><Logo /></span>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close menu"><Icon.close /></button>
        </div>
        <nav className="drawer-links" aria-label="Mobile">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          <NavLink to="/wishlist">Wishlist ({wishlist.length})</NavLink>
          <NavLink to="/cart">Cart ({cart.length})</NavLink>
          <NavLink to="/downloads">Downloads</NavLink>
          {user ? <NavLink to="/account">Account</NavLink> : <NavLink to={loginHref}>Sign in</NavLink>}
          <NavLink to="/studio">Sell on Vellum</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      </aside>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="logo"><Logo /></div>
          <p className="muted footer-blurb">A marketplace for premium digital assets, built for the people who make them.</p>
        </div>
        <div className="footer-col">
          <h4>Marketplace</h4>
          <Link to="/shop">Shop</Link><Link to="/categories">Categories</Link><Link to="/creators">Creators</Link>
        </div>
        <div className="footer-col">
          <h4>Account</h4>
          <Link to="/account">Your account</Link><Link to="/cart">Cart</Link><Link to="/wishlist">Wishlist</Link><Link to="/downloads">Downloads</Link>
        </div>
        <div className="footer-col">
          <h4>Creators</h4>
          <Link to="/studio">Sell on Vellum</Link>
          <Link to="/#faq">FAQ</Link>
        </div>
      </div>
      <div className="container footer-bottom">© {new Date().getFullYear()} Vellum. All rights reserved.</div>
    </footer>
  );
}

function Toast() {
  const { toast } = useStore();
  return <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast?.msg}</div>;
}

export default function Layout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth' }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  const hideFooter = pathname === '/checkout' || pathname.startsWith('/order/');

  return (
    <div className="app">
      <Nav />
      <main><Outlet /></main>
      {!hideFooter && <Footer />}
      <Toast />
    </div>
  );
}
