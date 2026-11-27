import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate, fmtPrice, priceOf } from '../api.js';
import { useStore } from '../store.jsx';
import { ErrorMsg, Img, Loading, useFetch, usePageMeta } from '../components/ui.jsx';
import { RequireUser } from '../components/form.jsx';
import { STATUS, StatusChip } from './Studio.jsx';

const TABS = [['review', 'Review queue'], ['products', 'All products'], ['users', 'Users'], ['orders', 'Orders']];

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Overview({ tick }) {
  const { data } = useFetch(api.admin.overview, [tick]);
  if (!data) return null;
  const p = data.products;
  return (
    <div className="stat-tiles">
      <div className="panel stat-tile"><span className="muted small">Waiting for review</span><strong>{p.pending || 0}</strong></div>
      <div className="panel stat-tile"><span className="muted small">Live products</span><strong>{p.published || 0}</strong><span className="muted small">{p.draft || 0} drafts</span></div>
      <div className="panel stat-tile"><span className="muted small">Users</span><strong>{data.users}</strong><span className="muted small">{data.creators} creators · +{data.newUsers30} in 30 days</span></div>
      <div className="panel stat-tile"><span className="muted small">Orders, 30 days</span><strong>{data.orders30.n}</strong><span className="muted small">{fmtPrice(data.orders30.total)} · all time {data.orders.n}</span></div>
    </div>
  );
}

function ProductRow({ p, onChange, review }) {
  const { notify } = useStore();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const act = async (action, body, msg) => {
    setErr('');
    try { onChange(await api.admin.action(p.id, action, body)); notify(msg); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="panel admin-row">
      <Link to={`/product/${p.id}`} className="li-thumb"><Img name={p.img} alt="" /></Link>
      <div className="li-body">
        <Link to={`/studio/${p.id}`} className="li-title">{p.title}</Link>
        <div className="muted small">
          {p.category} · {fmtPrice(priceOf(p))} · by {p.creator}{p.owner ? ` (${p.owner.email})` : ' (catalogue)'}
          {p.sold ? ` · ${p.sold} sold` : ''}
        </div>
        {review && p.description && <p className="small admin-desc">{p.description}</p>}
        {review && <div className="muted small">{p.images.length} images · {p.file ? `${p.file.name}` : 'no file'}</div>}
        {p.status === 'rejected' && p.rejectReason && <div className="small reject-note">Asked: {p.rejectReason}</div>}
        {open && (
          <div className="row-gap reject-form">
            <input className="input" placeholder="What should the creator fix?" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => act('reject', { reason }, 'Sent back to the creator')}>Send</button>
          </div>
        )}
        {err && <div className="form-error">{err}</div>}
      </div>
      <div className="admin-actions">
        <StatusChip status={p.status} />
        {p.status !== 'published' && p.status !== 'archived' && <button type="button" className="btn btn-primary btn-sm" onClick={() => act('approve', {}, 'Published')}>Approve</button>}
        {(p.status === 'pending' || p.status === 'published') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>Request changes</button>}
        {p.status === 'archived'
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => act('restore', {}, 'Restored')}>Restore</button>
          : !review && <button type="button" className="text-btn danger" onClick={() => window.confirm(`Remove "${p.title}" from the shop?`) && act('archive', {}, 'Archived')}>Remove</button>}
        <Link to={`/studio/${p.id}`} className="text-btn">Edit</Link>
      </div>
    </div>
  );
}

function Products({ review, onTick }) {
  const [status, setStatus] = useState(review ? 'pending' : '');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, error, loading } = useFetch(() => api.admin.products({ status: review ? 'pending' : status, search: q }), [status, q, review]);
  const [list, setList] = useState([]);
  useEffect(() => { if (data) setList(data); }, [data]);
  const update = (p) => {
    setList((l) => (review && p.status !== 'pending' ? l.filter((x) => x.id !== p.id) : l.map((x) => (x.id === p.id ? p : x))));
    onTick();
  };
  return (
    <div className="stack">
      {!review && (
        <div className="row-gap admin-filters">
          <input className="input" placeholder="Search title, creator, email, id" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input select-full" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
      {loading && !list.length && <Loading />}
      {error && <ErrorMsg error={error} />}
      {!loading && !list.length && <div className="panel state-msg">{review ? 'Nothing to review. All caught up.' : 'No products match.'}</div>}
      {list.map((p) => <ProductRow key={p.id} p={p} review={review} onChange={update} />)}
    </div>
  );
}

function Users() {
  const { user: me, notify } = useStore();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, error, loading } = useFetch(() => api.admin.users(q), [q]);
  const [list, setList] = useState([]);
  const [link, setLink] = useState(null);
  useEffect(() => { if (data) setList(data); }, [data]);
  const upd = async (u, body, msg) => {
    try { const r = await api.admin.updateUser(u.id, body); setList((l) => l.map((x) => (x.id === u.id ? { ...x, ...r } : x))); notify(msg); } catch (e) { notify(e.message); }
  };
  const reset = async (u) => {
    try { const r = await api.admin.resetLink(u.id); setLink({ email: u.email, url: r.url }); } catch (e) { notify(e.message); }
  };
  return (
    <div className="stack">
      <input className="input" placeholder="Search name, email, creator name" value={search} onChange={(e) => setSearch(e.target.value)} />
      {link && (
        <div className="panel stack-sm">
          <div className="small">Reset link for <strong>{link.email}</strong>, valid for 1 hour. Send it to the user:</div>
          <div className="row-gap"><input className="input" readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(link.url).then(() => notify('Copied'))}>Copy</button></div>
        </div>
      )}
      {loading && !list.length && <Loading />}
      {error && <ErrorMsg error={error} />}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>User</th><th>Creator</th><th>Products</th><th>Orders</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className={u.disabled ? 'dim' : ''}>
                <td><strong>{u.name}</strong>{u.role === 'admin' && <span className="status-chip st-live">Admin</span>}{u.disabled && <span className="status-chip st-rejected">Blocked</span>}<div className="muted small">{u.email}</div></td>
                <td>{u.creatorName || <span className="muted">-</span>}{u.payout && <div className="muted small" title="Payout details">{u.payout}</div>}</td>
                <td>{u.products}</td>
                <td>{u.orders}</td>
                <td className="muted small">{fmtDate(u.createdAt)}</td>
                <td className="actions">
                  {u.id !== me.id && (
                    <>
                      <button type="button" className="text-btn" onClick={() => reset(u)}>Reset link</button>
                      <button type="button" className="text-btn" onClick={() => upd(u, { role: u.role === 'admin' ? 'user' : 'admin' }, 'Role updated')}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>
                      <button
                        type="button" className="text-btn danger"
                        onClick={() => (u.disabled || window.confirm(`Block ${u.email}? They will be signed out and their products hidden.`)) && upd(u, { disabled: !u.disabled }, u.disabled ? 'Unblocked' : 'Blocked')}
                      >{u.disabled ? 'Unblock' : 'Block'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Orders() {
  const { data, error, loading } = useFetch(api.admin.orders, []);
  if (loading) return <Loading />;
  if (error) return <ErrorMsg error={error} />;
  if (!data.length) return <div className="panel state-msg">No orders yet.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th></tr></thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.id}</strong><div className="muted small">{o.payment}{o.user_id ? ' · account' : ' · guest'}</div></td>
              <td>{o.name}<div className="muted small">{o.email}</div></td>
              <td className="small">{o.items}</td>
              <td>{fmtPrice(o.total)}{o.coupon && <div className="muted small">{o.coupon} -{fmtPrice(o.discount)}</div>}</td>
              <td className="muted small">{fmtDate(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminHome() {
  usePageMeta('Admin | Vellum');
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'review';
  const [tick, setTick] = useState(0);
  return (
    <div className="container page stack-lg">
      <div className="account-head">
        <h1 className="h1">Admin</h1>
        <Link to="/studio/new" className="btn btn-ghost btn-sm">+ Add product</Link>
      </div>
      <Overview tick={tick} />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setSp(k === 'review' ? {} : { tab: k })}>{l}</button>
        ))}
      </div>
      {tab === 'review' && <Products review onTick={() => setTick((t) => t + 1)} />}
      {tab === 'products' && <Products onTick={() => setTick((t) => t + 1)} />}
      {tab === 'users' && <Users />}
      {tab === 'orders' && <Orders />}
    </div>
  );
}

export default function Admin() { return <RequireUser admin><AdminHome /></RequireUser>; }
