import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtPrice, priceOf } from '../api.js';
import { useStore } from '../store.jsx';
import { Summary } from './Cart.jsx';
import { usePageMeta } from '../components/ui.jsx';

const METHODS = [['card', 'Card'], ['paypal', 'PayPal'], ['applepay', 'Apple Pay'], ['googlepay', 'Google Pay']];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (f.payment === 'card') {
    if (!/^\d{13,19}$/.test(f.cardNumber.replace(/\s+/g, ''))) e.cardNumber = 'Enter a valid card number.';
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(f.expiry);
    if (!m || +m[1] < 1 || +m[1] > 12) e.expiry = 'Use MM/YY.';
    if (!/^\d{3,4}$/.test(f.cvv)) e.cvv = '3-4 digits.';
  }
  if (!f.terms) e.terms = 'You must accept the terms.';
  return e;
}

export default function Checkout() {
  usePageMeta('Checkout | Vellum');
  const { cart, coupon, clearCart, addOrder, user } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', country: 'United States', address: '', payment: 'card', cardNumber: '', expiry: '', cvv: '', terms: false });
  // The session check may finish after the first render.
  useEffect(() => {
    if (user) setF((s) => ({ ...s, name: s.name || user.name, email: s.email || user.email }));
  }, [user]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const upd = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  if (cart.length === 0) {
    return <div className="container page state-msg">Your cart is empty. <Link to="/shop" className="link-accent">Browse the shop →</Link></div>;
  }

  const submit = async (e) => {
    e.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    setServerErr('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      // Card details never leave the browser - this is a demo checkout.
      const order = await api.createOrder({
        items: cart.map((p) => p.id),
        customer: { name: f.name, email: f.email, country: f.country, address: f.address },
        payment: f.payment, terms: f.terms, coupon: coupon?.code,
      });
      addOrder(order);
      clearCart();
      nav(`/order/${order.id}`, { state: { order } });
    } catch (err) {
      setErrors(err.fields || {});
      setServerErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, props = {}) => (
    <div className={'field' + (props.wide ? ' wide' : '')}>
      <label htmlFor={'co-' + k}>{label}</label>
      <input id={'co-' + k} className={'input' + (errors[k] ? ' invalid' : '')} value={f[k]} onChange={upd(k)} aria-invalid={!!errors[k]} {...props.input} />
      {errors[k] && <span className="field-error">{errors[k]}</span>}
    </div>
  );

  return (
    <div className="container page narrow-lg">
      <h1 className="h1">Checkout</h1>
      <form className="two-col" onSubmit={submit} noValidate>
        <div className="stack-lg">
          <fieldset>
            <legend className="h3">Customer information</legend>
            {user === null && <p className="muted small checkout-signin"><Link to="/login?next=/checkout" className="link-accent">Sign in</Link> to keep this purchase in your account, or continue as a guest.</p>}
            <div className="form-grid">
              {field('name', 'Full name', { wide: true, input: { autoComplete: 'name' } })}
              {field('email', 'Email', { wide: true, input: { type: 'email', autoComplete: 'email', inputMode: 'email' } })}
              {field('country', 'Country', { input: { autoComplete: 'country-name' } })}
              {field('address', 'Billing address', { input: { autoComplete: 'street-address' } })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="h3">Payment method</legend>
            <div className="pay-methods" role="radiogroup">
              {METHODS.map(([k, l]) => (
                <button type="button" role="radio" aria-checked={f.payment === k} key={k} className={'pay-opt' + (f.payment === k ? ' on' : '')} onClick={() => setF((s) => ({ ...s, payment: k }))}>{l}</button>
              ))}
            </div>
            {f.payment === 'card' && (
              <div className="form-grid card-grid">
                {field('cardNumber', 'Card number', { wide: true, input: { inputMode: 'numeric', autoComplete: 'cc-number', placeholder: '4242 4242 4242 4242' } })}
                {field('expiry', 'Expiry', { input: { inputMode: 'numeric', autoComplete: 'cc-exp', placeholder: 'MM/YY' } })}
                {field('cvv', 'CVV', { input: { inputMode: 'numeric', autoComplete: 'cc-csc', placeholder: '123' } })}
              </div>
            )}
            <p className="muted small demo-note">Demo mode - no payment is processed and card details are not sent to the server.</p>
          </fieldset>
          <div>
            <label className="check">
              <input type="checkbox" checked={f.terms} onChange={upd('terms')} /> I accept the Terms of Service and Privacy Policy
            </label>
            {errors.terms && <span className="field-error">{errors.terms}</span>}
          </div>
        </div>
        <Summary items={(
          <div className="rows items">
            {cart.map((p) => <div className="row" key={p.id}><span>{p.title}</span><span>{fmtPrice(priceOf(p))}</span></div>)}
          </div>
        )}>
          {serverErr && <div className="form-error">{serverErr}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Processing…' : 'Pay Securely'}</button>
          <Link to="/shop" className="center muted small">Continue shopping</Link>
        </Summary>
      </form>
    </div>
  );
}
