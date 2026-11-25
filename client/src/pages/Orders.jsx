import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, fmtDate, fmtPrice } from '../api.js';
import { useStore } from '../store.jsx';
import { ErrorMsg, Icon, Img, Loading, useFetch } from '../components/ui.jsx';

export function OrderSuccess() {
  const { id } = useParams();
  const { state } = useLocation();
  const { orders } = useStore();
  const token = state?.order?.token || orders.find((o) => o.id === id)?.token;
  const { data: order, error, loading } = useFetch(
    () => (state?.order ? Promise.resolve(state.order) : token ? api.order(id, token) : Promise.reject(new Error('Order not found on this device.'))),
    [id],
  );

  if (loading) return <Loading />;
  if (error) return <div className="container page"><ErrorMsg error={error} /></div>;

  return (
    <div className="container page success">
      <div className="success-ic"><Icon.check /></div>
      <h1 className="h1">Order confirmed</h1>
      <div className="muted">Order #{order.id} · {fmtDate(order.createdAt)} · {fmtPrice(order.total)}</div>
      <p className="muted">A receipt for {order.email} is on its way. Your files are ready on your downloads page.</p>
      <Link to="/downloads" className="btn btn-primary btn-lg">Go to downloads</Link>
      <Link to="/" className="muted small">Continue shopping</Link>
    </div>
  );
}

export function Downloads() {
  const { orders } = useStore();
  const [state, setState] = useState({ loading: true, list: [] });

  useEffect(() => {
    let alive = true;
    Promise.allSettled(orders.map((o) => api.order(o.id, o.token))).then((res) => {
      if (alive) setState({ loading: false, list: res.filter((r) => r.status === 'fulfilled').map((r) => r.value) });
    });
    return () => { alive = false; };
  }, [orders]);

  return (
    <div className="container page narrow-md">
      <h1 className="h1">Your downloads</h1>
      {state.loading && <Loading />}
      {!state.loading && state.list.length === 0 && (
        <div className="state-msg">No purchases yet. <Link to="/shop" className="link-accent">Browse the shop →</Link></div>
      )}
      {state.list.map((o) => (
        <section key={o.id} className="order-block">
          <div className="muted small order-head">Order #{o.id} · {fmtDate(o.createdAt)} · {fmtPrice(o.total)}</div>
          <div className="stack">
            {o.items.map((it) => (
              <div className="line-item" key={it.id}>
                <Link to={`/product/${it.id}`} className="li-thumb"><Img name={it.img} alt="" /></Link>
                <div className="li-body">
                  <Link to={`/product/${it.id}`} className="li-title">{it.title}</Link>
                  <div className="muted small">{it.license} license · v2.1</div>
                </div>
                <a className="btn btn-primary btn-sm" href={api.downloadUrl(o.id, it.id, o.token)} download>Download</a>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
