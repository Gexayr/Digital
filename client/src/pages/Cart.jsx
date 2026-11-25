import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtPrice, priceOf } from '../api.js';
import { useStore } from '../store.jsx';
import { Img } from '../components/ui.jsx';

export function useTotals() {
  const { cart, coupon } = useStore();
  const subtotal = Math.round(cart.reduce((s, p) => s + priceOf(p), 0) * 100) / 100;
  const discount = coupon ? Math.round(subtotal * coupon.percent) / 100 : 0;
  return { subtotal, discount, total: Math.round((subtotal - discount) * 100) / 100 };
}

export function Summary({ children, items, editable = false }) {
  const { coupon, setCoupon } = useStore();
  const { subtotal, discount, total } = useTotals();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const apply = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setErr('');
    try { setCoupon(await api.validateCoupon(code.trim())); setCode(''); } catch (ex) { setErr(ex.message); }
  };

  return (
    <div className="panel summary">
      <h2 className="h3">Order summary</h2>
      {editable && !coupon && (
        <form className="coupon" onSubmit={apply}>
          <label className="sr-only" htmlFor="coupon">Coupon code</label>
          <input id="coupon" className="input" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-ghost btn-sm">Apply</button>
        </form>
      )}
      {err && <div className="form-error">{err}</div>}
      {items}
      <div className="rows">
        <div className="row"><span>Subtotal</span><span>{fmtPrice(subtotal)}</span></div>
        {coupon && (
          <div className="row">
            <span>Discount ({coupon.code}, {coupon.percent}%){editable && <button type="button" className="text-btn" onClick={() => setCoupon(null)}> · remove</button>}</span>
            <span>−{fmtPrice(discount)}</span>
          </div>
        )}
        <div className="row"><span>Tax</span><span>{fmtPrice(0)}</span></div>
        <div className="row total"><span>Total</span><span>{fmtPrice(total)}</span></div>
      </div>
      {children}
    </div>
  );
}

export default function Cart() {
  const { cart, removeFromCart } = useStore();
  const nav = useNavigate();

  return (
    <div className="container page narrow-lg">
      <h1 className="h1">Shopping cart</h1>
      {cart.length === 0 ? (
        <div className="state-msg">Your cart is empty. <Link to="/shop" className="link-accent">Browse the shop →</Link></div>
      ) : (
        <div className="two-col">
          <div className="stack">
            {cart.map((p) => (
              <div className="line-item" key={p.id}>
                <Link to={`/product/${p.id}`} className="li-thumb"><Img name={p.img} alt="" /></Link>
                <div className="li-body">
                  <Link to={`/product/${p.id}`} className="li-title">{p.title}</Link>
                  <div className="muted small">{p.license} license</div>
                </div>
                <div className="li-price">{fmtPrice(priceOf(p))}</div>
                <button type="button" className="text-btn li-remove" onClick={() => removeFromCart(p.id)}>Remove</button>
              </div>
            ))}
          </div>
          <Summary editable>
            <button type="button" className="btn btn-primary btn-block" onClick={() => nav('/checkout')}>Checkout</button>
          </Summary>
        </div>
      )}
    </div>
  );
}
