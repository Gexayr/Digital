import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';

// "Sign in with Google" (Google Identity Services). Renders nothing when the
// server has no GOOGLE_CLIENT_ID. onDone(user) runs after a successful sign-in.
let gsiLoading = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gsiLoading = null; reject(new Error('Could not load Google sign-in.')); };
    document.head.appendChild(s);
  });
  return gsiLoading;
}

export function GoogleButton({ text = 'signin_with', onDone }) {
  const { googleClientId, theme } = useStore();
  const ref = useRef(null);
  const done = useRef(onDone); done.current = onDone;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!googleClientId) return;
    let alive = true;
    loadGsi().then(() => {
      if (!alive || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        ux_mode: 'popup',
        callback: async ({ credential }) => {
          setError('');
          try {
            const r = await api.googleLogin(credential);
            done.current?.(r.user);
          } catch (e) { setError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard', theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large',
        shape: 'pill', text, logo_alignment: 'center', width: Math.min(ref.current.offsetWidth || 360, 400),
      });
    }, (e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [googleClientId, theme, text]);

  if (!googleClientId) return null;
  return (
    <div className="stack-sm">
      <div ref={ref} className="google-btn" />
      {error && <div className="form-error">{error}</div>}
      <div className="or-divider"><span>or</span></div>
    </div>
  );
}
