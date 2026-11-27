import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtPrice, priceOf, upload } from '../api.js';
import { useStore } from '../store.jsx';
import { ErrorMsg, Img, Loading, useFetch, usePageMeta } from '../components/ui.jsx';
import { Field, RequireUser, useForm } from '../components/form.jsx';

export const STATUS = {
  draft: ['Draft', 'st-draft'],
  pending: ['In review', 'st-pending'],
  published: ['Live', 'st-live'],
  rejected: ['Needs changes', 'st-rejected'],
  archived: ['Archived', 'st-archived'],
};
export const StatusChip = ({ status }) => <span className={'status-chip ' + (STATUS[status]?.[1] || '')}>{STATUS[status]?.[0] || status}</span>;

const LICENSES = ['Personal', 'Standard', 'Commercial', 'Extended'];
const BADGES = ['', 'Featured', 'Trending', 'New', 'Sale'];
const MAX_IMAGES = 6;
const MAX_FILE_MB = 500;
const CATEGORIES = ['Photography', 'Digital Art', 'UI Kits', 'Presets', 'Fonts', '3D Assets', 'Templates', 'Audio'];
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function CreatorProfile({ profile, onSaved, intro }) {
  const { user, signedIn, notify } = useStore();
  const f = useForm({ creatorName: profile.creatorName || user.name, bio: profile.bio, payout: profile.payout });
  const save = f.submit(async (v) => {
    const r = await api.saveCreatorProfile(v);
    signedIn({ ...user, creatorName: r.creatorName, bio: r.bio, payout: r.payout });
    notify('Creator profile saved');
    onSaved(r);
  });
  return (
    <form className="panel stack" onSubmit={save} noValidate>
      {intro}
      <div className="form-grid">
        <Field label="Public creator name" hint="Shown on your products, e.g. your name or studio." {...f.bind('creatorName')} />
        <Field label="Payout details" hint="PayPal email or IBAN. Only admins see this." {...f.bind('payout')} />
        <Field label="About you (optional)" as="textarea" rows={3} wide {...f.bind('bio')} />
      </div>
      {f.error && <div className="form-error">{f.error}</div>}
      <div><button className="btn btn-primary" disabled={f.busy}>{profile.creatorName ? 'Save profile' : 'Create creator profile'}</button></div>
    </form>
  );
}

function StudioHome() {
  usePageMeta('Creator studio | Vellum');
  const [key, setKey] = useState(0);
  const { data, error, loading } = useFetch(api.studio, [key]);
  const [editProfile, setEditProfile] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <div className="container page"><ErrorMsg error={error} /></div>;
  const share = Math.round(data.share * 100);

  if (!data.profile.creatorName) {
    return (
      <div className="container page narrow-md stack-lg">
        <h1 className="h1">Sell on Vellum</h1>
        <ol className="steps">
          <li><strong>Create your creator profile.</strong> Pick the name buyers will see.</li>
          <li><strong>Add a product.</strong> Title, price, description, up to {MAX_IMAGES} preview images and the file buyers download (up to {MAX_FILE_MB} MB).</li>
          <li><strong>Submit for review.</strong> We check every product before it goes live, usually within a day.</li>
          <li><strong>Get paid.</strong> You keep {share}% of every sale.</li>
        </ol>
        <CreatorProfile profile={data.profile} onSaved={() => setKey((k) => k + 1)} />
      </div>
    );
  }

  const t = data.totals;
  return (
    <div className="container page stack-lg">
      <div className="account-head">
        <div>
          <div className="eyebrow">Creator studio</div>
          <h1 className="h1">{data.profile.creatorName}</h1>
        </div>
        <div className="row-gap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditProfile((v) => !v)}>Profile</button>
          <Link to="/studio/new" className="btn btn-primary">+ New product</Link>
        </div>
      </div>
      {editProfile && <CreatorProfile profile={data.profile} onSaved={() => { setEditProfile(false); setKey((k) => k + 1); }} />}

      <div className="stat-tiles">
        <div className="panel stat-tile"><span className="muted small">Products</span><strong>{t.products}</strong><span className="muted small">{t.live} live</span></div>
        <div className="panel stat-tile"><span className="muted small">Sales</span><strong>{t.sold}</strong></div>
        <div className="panel stat-tile"><span className="muted small">Revenue</span><strong>{fmtPrice(t.revenue)}</strong></div>
        <div className="panel stat-tile"><span className="muted small">Balance ({share}% of sales)</span><strong>{fmtPrice(t.earnings)}</strong><span className="muted small">Withdrawals coming soon</span></div>
      </div>

      {data.products.length === 0 ? (
        <div className="panel state-msg">No products yet. <Link to="/studio/new" className="link-accent">Add your first one →</Link></div>
      ) : (
        <div className="stack">
          {data.products.map((p) => (
            <div className="line-item studio-item" key={p.id}>
              <Link to={`/studio/${p.id}`} className="li-thumb"><Img name={p.img} alt="" /></Link>
              <div className="li-body">
                <Link to={`/studio/${p.id}`} className="li-title">{p.title}</Link>
                <div className="muted small">{p.category} · {fmtPrice(priceOf(p))} · {p.sold} sold · {fmtPrice(p.revenue)}</div>
                {p.status === 'rejected' && p.rejectReason && <div className="small reject-note">Reviewer: {p.rejectReason}</div>}
              </div>
              <StatusChip status={p.status} />
              <Link to={`/studio/${p.id}`} className="btn btn-ghost btn-sm">Edit</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const toForm = (p) => ({
  title: p?.title || '', category: p?.category || '', price: p?.price ?? '', sale: p?.sale ?? '',
  description: p?.description || '', tags: (p?.tags || []).join(', '), format: p?.format || '',
  software: p?.software || '', license: p?.license || 'Standard', badge: p?.badge || '',
});

function DetailsForm({ product, onSaved, admin }) {
  const nav = useNavigate();
  const { notify } = useStore();
  const f = useForm(toForm(product));
  useEffect(() => { f.setValues(toForm(product)); }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = product?.status === 'published';
  const save = f.submit(async (v) => {
    if (!product) {
      const p = await api.createProduct(v);
      nav(`/studio/${p.id}`, { replace: true });
      notify('Draft saved. Now add images and the file.');
      return;
    }
    onSaved(await api.updateProduct(product.id, v));
    notify('Saved');
  });
  return (
    <form className="panel stack" onSubmit={save} noValidate>
      <h2 className="h3">Details</h2>
      <div className="form-grid">
        <Field label="Title" wide placeholder="e.g. Paper Moon - Risograph Poster Set" {...f.bind('title')} />
        <Field label="Category" as="select" options={[['', 'Choose…'], ...CATEGORIES]} {...f.bind('category')} />
        <Field label="License" as="select" options={LICENSES} {...f.bind('license')} />
        <Field label="Price, USD" type="number" min="1" max="1000" step="0.01" inputMode="decimal" {...f.bind('price')} />
        <Field label="Sale price (optional)" type="number" min="0.5" step="0.01" inputMode="decimal" {...f.bind('sale')} />
        <Field label="Description" as="textarea" rows={6} wide hint="What is inside, sizes, how to use it." {...f.bind('description')} />
        <Field label="File formats" placeholder=".psd / .png" {...f.bind('format')} />
        <Field label="Works with" placeholder="Photoshop, Figma, Any" {...f.bind('software')} />
        <Field label="Tags" wide placeholder="poster, print, minimal" hint="Up to 8, separated by commas." {...f.bind('tags')} />
        {admin && <Field label="Badge (admin)" as="select" options={BADGES.map((b) => [b, b || 'None'])} {...f.bind('badge')} />}
      </div>
      {f.error && <div className="form-error">{f.error}</div>}
      {live && !admin && <p className="muted small">This product is live. Saving changes sends it back to review, and it is hidden from the shop until approved.</p>}
      <div><button className="btn btn-primary" disabled={f.busy}>{product ? 'Save details' : 'Save and continue'}</button></div>
    </form>
  );
}

function ImagesPanel({ product, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const imgs = product.images;
  const left = MAX_IMAGES - imgs.length;

  const send = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, left);
    if (!list.length) { setErr(left ? 'Choose JPG, PNG or WebP images.' : `Up to ${MAX_IMAGES} images.`); return; }
    const big = list.find((f) => f.size > 15 * 1024 * 1024);
    if (big) { setErr(`${big.name} is larger than 15 MB.`); return; }
    const fd = new FormData();
    list.forEach((f) => fd.append('images', f));
    setBusy(true); setErr(''); setProgress(0);
    try { onChange(await upload(`/studio/products/${product.id}/images`, fd, setProgress)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reorder = async (next) => {
    setErr('');
    try { onChange(await api.setImages(product.id, next)); } catch (e) { setErr(e.message); }
  };
  const move = (i, d) => { const n = [...imgs]; [n[i], n[i + d]] = [n[i + d], n[i]]; reorder(n); };

  return (
    <section className="panel stack">
      <div>
        <h2 className="h3">Preview images</h2>
        <p className="muted small">The first image is the cover. Portrait 3:4 looks best (for example 1200 × 1600). JPG, PNG or WebP up to 15 MB each, up to {MAX_IMAGES} images.</p>
      </div>
      {imgs.length > 0 && (
        <div className="img-grid">
          {imgs.map((k, i) => (
            <figure className="img-tile" key={k}>
              <Img name={k} alt={`Image ${i + 1}`} />
              {i === 0 && <span className="badge">Cover</span>}
              <div className="img-tile-bar">
                <button type="button" className="text-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left">←</button>
                {i > 0 && <button type="button" className="text-btn" onClick={() => reorder([k, ...imgs.filter((x) => x !== k)])}>Make cover</button>}
                <button type="button" className="text-btn" disabled={i === imgs.length - 1} onClick={() => move(i, 1)} aria-label="Move right">→</button>
                <button type="button" className="text-btn danger" onClick={() => reorder(imgs.filter((x) => x !== k))} aria-label="Remove image">✕</button>
              </div>
            </figure>
          ))}
        </div>
      )}
      {left > 0 && (
        <div
          className={'dropzone' + (drag ? ' on' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) send(e.dataTransfer.files); }}
        >
          {busy ? <span>Uploading… {Math.round(progress * 100)}%</span> : (
            <>
              <span>Drop images here or</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()}>Choose images</button>
            </>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}

function FilePanel({ product, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const send = async (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setErr(`The file is larger than ${MAX_FILE_MB} MB.`); return; }
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true); setErr(''); setProgress(0);
    try { onChange(await upload(`/studio/products/${product.id}/file`, fd, setProgress)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="panel stack">
      <div>
        <h2 className="h3">File for buyers</h2>
        <p className="muted small">What buyers download after paying. One file up to {MAX_FILE_MB} MB; for several files, pack them into a .zip.</p>
      </div>
      {product.file && (
        <div className="file-row">
          <span className="file-ic" aria-hidden="true">⬇</span>
          <div className="li-body"><strong>{product.file.name}</strong><div className="muted small">{fmtBytes(product.file.size)}</div></div>
          <a className="btn btn-ghost btn-sm" href={api.studioFileUrl(product.id)}>Download</a>
        </div>
      )}
      {busy ? (
        <div className="progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /><em>Uploading… {Math.round(progress * 100)}%</em></div>
      ) : (
        <div><button type="button" className="btn btn-ghost" onClick={() => input.current.click()}>{product.file ? 'Replace file' : 'Upload file'}</button></div>
      )}
      <input ref={input} type="file" hidden onChange={(e) => { send(e.target.files[0]); e.target.value = ''; }} />
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}

function StatusPanel({ product, onChange, admin }) {
  const nav = useNavigate();
  const { notify } = useStore();
  const [err, setErr] = useState('');
  const [reason, setReason] = useState('');
  const run = async (fn, msg) => {
    setErr('');
    try { const r = await fn(); if (r) onChange(r); if (msg) notify(msg); } catch (e) { setErr(e.message); }
  };
  const missing = [!product.images.length && 'images', product.ownerId && !product.file && 'the file'].filter(Boolean);
  const s = product.status;
  return (
    <section className="panel stack status-panel">
      <div className="row-between"><h2 className="h3">Status</h2><StatusChip status={s} /></div>
      {s === 'draft' && <p className="muted small">Only you can see this product. Submit it when it is ready.</p>}
      {s === 'pending' && <p className="muted small">Waiting for review. You will see the result here.</p>}
      {s === 'published' && <p className="muted small">Live in the shop.</p>}
      {s === 'rejected' && <div className="reject-note">{product.rejectReason || 'The reviewer asked for changes.'}<div className="muted small">Fix it and submit again.</div></div>}
      {s === 'archived' && <p className="muted small">Removed from the shop. Buyers keep their downloads.</p>}
      {missing.length > 0 && <p className="small">Still missing: {missing.join(' and ')}.</p>}
      {(s === 'draft' || s === 'rejected') && (
        <button type="button" className="btn btn-primary btn-block" disabled={missing.length > 0} onClick={() => run(() => api.submitProduct(product.id), 'Submitted for review')}>Submit for review</button>
      )}
      <Link to={`/product/${product.id}`} className="btn btn-ghost btn-block">Preview page</Link>
      {admin && (
        <div className="stack admin-box">
          <div className="eyebrow">Admin</div>
          {s !== 'published' && <button type="button" className="btn btn-primary btn-block" onClick={() => run(() => api.admin.action(product.id, 'approve'), 'Published')}>Approve and publish</button>}
          {s !== 'rejected' && s !== 'archived' && (
            <>
              <textarea className="input" rows={2} placeholder="What should the creator fix?" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn btn-ghost btn-block" onClick={() => run(() => api.admin.action(product.id, 'reject', { reason }), 'Sent back to the creator')}>Request changes</button>
            </>
          )}
          {s === 'archived'
            ? <button type="button" className="btn btn-ghost btn-block" onClick={() => run(() => api.admin.action(product.id, 'restore'), 'Restored')}>Restore to shop</button>
            : <button type="button" className="btn btn-ghost btn-block" onClick={() => run(() => api.admin.action(product.id, 'archive'), 'Archived')}>Remove from shop</button>}
        </div>
      )}
      {!admin && s !== 'archived' && (
        <button
          type="button" className="text-btn danger"
          onClick={() => window.confirm(product.sold ? 'Remove this product from the shop? Buyers keep their downloads.' : 'Delete this product for good?')
            && run(async () => { await api.deleteProduct(product.id); nav('/studio'); return null; }, 'Removed')}
        >{product.sold ? 'Remove from shop' : 'Delete product'}</button>
      )}
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}

function Editor() {
  const { id } = useParams();
  const { user } = useStore();
  const isNew = !id;
  const [product, setProduct] = useState(null);
  const { data, error, loading } = useFetch(() => (isNew ? Promise.resolve(null) : api.studioProduct(id)), [id]);
  useEffect(() => setProduct(data), [data]);
  usePageMeta(isNew ? 'New product | Vellum' : `Edit ${product?.title || 'product'} | Vellum`);
  if (loading) return <Loading />;
  if (error) return <div className="container page"><ErrorMsg error={error} /></div>;
  if (isNew && !user.creatorName) return <div className="container page state-msg">Set up your creator profile first. <Link to="/studio" className="link-accent">Go to studio →</Link></div>;
  const admin = user.role === 'admin';
  const back = admin && product && product.ownerId !== user.id ? '/admin' : '/studio';

  return (
    <div className="container page">
      <Link to={back} className="back-link">← {back === '/admin' ? 'Admin' : 'Studio'}</Link>
      <h1 className="h1">{isNew ? 'New product' : product?.title}</h1>
      {product && product.creator && admin && product.ownerId !== user.id && <div className="muted">by {product.creator}</div>}
      <div className="editor">
        <div className="stack-lg">
          <DetailsForm product={product} onSaved={setProduct} admin={admin} />
          {product && <ImagesPanel product={product} onChange={setProduct} />}
          {product && <FilePanel product={product} onChange={setProduct} />}
        </div>
        {product && <aside><StatusPanel product={product} onChange={setProduct} admin={admin} /></aside>}
      </div>
    </div>
  );
}

export function Studio() { return <RequireUser><StudioHome /></RequireUser>; }
export function StudioEditor() { return <RequireUser><Editor /></RequireUser>; }
export { CATEGORIES, LICENSES, BADGES };
