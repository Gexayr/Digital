import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from './api.js';

// Cart, wishlist, theme and past orders persist in localStorage so a reload
// (or the browser back button) no longer wipes them as in the prototype.
const read = (key, fallback) => {
  try {
    const v = localStorage.getItem('vellum:' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try { localStorage.setItem('vellum:' + key, JSON.stringify(value)); } catch { /* private mode */ }
};

function usePersisted(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => write(key, value), [key, value]);
  // Keep cart/wishlist in sync across open tabs.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'vellum:' + key) setValue(read(key, fallback)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue];
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [cart, setCart] = usePersisted('cart', []); // product objects
  const [wishlist, setWishlist] = usePersisted('wishlist', []); // product objects
  const [orders, setOrders] = usePersisted('orders', []); // { id, token, createdAt }
  const [theme, setTheme] = usePersisted('theme', 'dark');
  const [coupon, setCoupon] = usePersisted('coupon', null); // { code, percent }
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(undefined); // undefined while loading, null when signed out
  const [mailEnabled, setMailEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(null);

  useEffect(() => {
    api.me().then((r) => { setUser(r.user); setMailEnabled(r.mail); setGoogleClientId(r.google || null); }, () => setUser(null));
  }, []);

  // Once signed in: attach this device's orders to the account and merge wishlists.
  const ordersRef = useRef(orders); ordersRef.current = orders;
  const wishRef = useRef(wishlist); wishRef.current = wishlist;
  useEffect(() => {
    if (!user) return;
    const local = ordersRef.current;
    if (local.length) api.claimOrders(local.map(({ id, token }) => ({ id, token }))).catch(() => {});
    api.myWishlist().then((server) => {
      const ids = [...new Set([...server.map((p) => p.id), ...wishRef.current.map((p) => p.id)])];
      return ids.length !== server.length ? api.saveWishlist(ids) : server;
    }).then((list) => setWishlist(list.map(slim))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1c1915' : '#faf8f5');
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((msg) => setToast({ msg, key: Date.now() }), []);

  const value = useMemo(() => ({
    cart, wishlist, orders, theme, toast, coupon,
    notify, setCoupon,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    inCart: (id) => cart.some((p) => p.id === id),
    addToCart: (p) => {
      if (cart.some((c) => c.id === p.id)) { notify('Already in your cart'); return; }
      setCart([...cart, slim(p)]);
      notify('Added to cart');
    },
    removeFromCart: (id) => setCart(cart.filter((p) => p.id !== id)),
    clearCart: () => { setCart([]); setCoupon(null); },
    isWishlisted: (id) => wishlist.some((p) => p.id === id),
    toggleWishlist: (p) => {
      const next = wishlist.some((w) => w.id === p.id) ? wishlist.filter((w) => w.id !== p.id) : [...wishlist, slim(p)];
      if (next.length > wishlist.length) notify('Saved to wishlist');
      setWishlist(next);
      if (user) api.saveWishlist(next.map((w) => w.id)).catch(() => {});
    },
    addOrder: (o) => setOrders([{ id: o.id, token: o.token, createdAt: o.createdAt }, ...orders]),
    user, mailEnabled, googleClientId,
    signedIn: (u) => setUser(u),
    signOut: async () => {
      await api.logout().catch(() => {});
      // Purchases and wishlist live on the account now; don't leave them on a shared device.
      setUser(null); setOrders([]); setWishlist([]);
    },
  }), [cart, wishlist, orders, theme, toast, coupon, notify, setCart, setWishlist, setOrders, setTheme, setCoupon, user, mailEnabled, googleClientId]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

// Keep only what the cards need; the server re-prices everything at checkout.
const slim = ({ id, title, category, creator, price, sale, rating, sales, badge, img, license }) =>
  ({ id, title, category, creator, price, sale, rating, sales, badge, img, license });

export const useStore = () => useContext(StoreCtx);
