import { useEffect, useState } from 'react';

// Keeps <title> and the meta description in sync during client-side navigation.
// The server injects the same values on first load (server/src/seo.js).
export function usePageMeta(title, description) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}

export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// Product image with a graceful fallback when a file is missing.
export function Img({ name, alt = '', className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [name]);
  if (!name || failed) {
    return <div className={'img img-fallback ' + className} role="img" aria-label={alt}><span>{alt}</span></div>;
  }
  return (
    <img
      className={'img ' + className}
      src={`/images/${name}.jpg`}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function Avatar({ name, size = 64 }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, '--h': hue }} aria-hidden="true">
      {initials}
    </div>
  );
}

export const Loading = () => <div className="state-msg" aria-busy="true"><span className="spinner" /> Loading…</div>;
export const ErrorMsg = ({ error }) => <div className="state-msg">{error?.message || 'Something went wrong.'}</div>;

export function Stars({ value }) {
  return <span className="stars" aria-label={`${value} out of 5 stars`}>{'★'.repeat(value)}{'☆'.repeat(5 - value)}</span>;
}

export const Icon = {
  heart: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 21s-7.5-4.6-10-9.3C.5 8.4 2 4.8 5.6 4c2.1-.5 4.2.4 5.4 2.2C12.2 4.4 14.3 3.5 16.4 4c3.6.8 5.1 4.4 3.6 7.7C19.5 16.4 12 21 12 21z" />
    </svg>
  ),
  cart: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  ),
  star: (p) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.3l1.6-6.8L2.2 8.9l6.9-.6z" />
    </svg>
  ),
  eye: (p) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="3" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    </svg>
  ),
  check: (p) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}><path d="M20 6L9 17l-5-5" /></svg>
  ),
  menu: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
  ),
  close: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  filter: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
  ),
};
