import { useId, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { Loading } from './ui.jsx';

// options: [value, label] pairs (or plain strings) for as="select".
export function Field({ label, error, hint, wide, as = 'input', options, children, ...props }) {
  const id = useId();
  const Tag = as;
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <label htmlFor={id}>{label}</label>
      {children || (
        <Tag id={id} className={(as === 'select' ? 'input select-full' : 'input') + (error ? ' invalid' : '')} aria-invalid={!!error} {...props}>
          {options?.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
        </Tag>
      )}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

// Small helper for forms that post to the API and show field errors.
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (k) => ({
    value: values[k] ?? '',
    onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })),
    error: errors[k],
  });
  const submit = (fn) => async (e) => {
    e?.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try {
      return await fn(values);
    } catch (err) {
      setErrors(err.fields || {});
      setError(Object.keys(err.fields || {}).length ? '' : err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { values, setValues, errors, setErrors, error, setError, busy, bind, submit };
}

// Route guard: waits for the session check, then sends signed-out visitors to /login.
export function RequireUser({ admin = false, children }) {
  const { user } = useStore();
  const loc = useLocation();
  if (user === undefined) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && user.role !== 'admin') return <div className="container page state-msg">This page is for administrators only.</div>;
  return children;
}
