import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Avatar, ErrorMsg, Img, Loading, useFetch } from '../components/ui.jsx';

const TESTIMONIALS = [
  { name: 'Priya Nair', role: 'Freelance designer', quote: 'Found presets and a UI kit in one afternoon that would’ve taken me a week to build from scratch.' },
  { name: 'Owen Baxter', role: 'Indie game dev', quote: 'The 3D assets came properly organized and dropped straight into my Blender scene. No cleanup needed.' },
  { name: 'Sana Iqbal', role: 'Content creator', quote: 'Checkout took under a minute and the files were in my inbox before I’d closed the tab.' },
];

const FAQ = [
  { q: 'How do I receive my files after purchase?', a: 'Files unlock instantly on the order confirmation page and stay available in your Downloads page, along with an email copy of your receipt and download links.' },
  { q: 'What license do I get with a purchase?', a: 'Each product lists its license type (Personal, Standard, Extended or Commercial) on its product page — covering exactly what you can build or resell with the files.' },
  { q: 'Can I get a refund?', a: 'Yes, within 14 days if the files are defective or materially different from the listing. Reach out through Support and we’ll review your order.' },
  { q: 'Do creators get paid directly?', a: 'Yes — creators keep the large majority of every sale, paid out automatically on a rolling schedule.' },
];

const HERO_STATS = [{ value: '2.4K+', label: 'Creators' }, { value: '38K+', label: 'Products' }, { value: '1.2M', label: 'Downloads' }];
const GLOBAL_STATS = [{ value: '$4.2M', label: 'Paid to creators' }, { value: '38,400', label: 'Digital products' }, { value: '2,410', label: 'Active creators' }, { value: '96%', label: 'Would buy again' }];

export function CategoryGrid() {
  const { data } = useFetch(api.categories, []);
  const nav = useNavigate();
  if (!data) return null;
  return (
    <div className="grid grid-4 cat-grid">
      {data.map((c) => (
        <button type="button" key={c.name} className="cat-tile" onClick={() => nav('/shop?category=' + encodeURIComponent(c.name))}>
          <span className="cat-initial">{c.name[0]}</span>
          <span className="cat-name">{c.name}</span>
          <span className="cat-count">{c.count} {c.count === 1 ? 'product' : 'products'}</span>
        </button>
      ))}
    </div>
  );
}

function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState({ kind: null, msg: '' });
  const submit = async (e) => {
    e.preventDefault();
    setStatus({ kind: 'busy', msg: '' });
    try {
      await api.subscribe(email);
      setStatus({ kind: 'ok', msg: 'You’re on the list — see you next week.' });
      setEmail('');
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    }
  };
  return (
    <section className="section newsletter">
      <h2 className="h2">Get new drops in your inbox</h2>
      <p className="muted">One email a week. New creators, new products, occasional discounts.</p>
      <form className="newsletter-form" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="nl-email">Email</label>
        <input id="nl-email" className="input" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn btn-primary" disabled={status.kind === 'busy'}>Subscribe</button>
      </form>
      {status.msg && <p className={status.kind === 'err' ? 'form-error' : 'form-ok'} role="status">{status.msg}</p>}
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState(null);
  return (
    <section className="section narrow" id="faq">
      <h2 className="h2 center">Frequently asked questions</h2>
      <div className="faq">
        {FAQ.map((f, i) => (
          <div className="faq-item" key={f.q}>
            <button type="button" className="faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span>{f.q}</span><span className="faq-sign">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { data, error, loading } = useFetch(api.home, []);

  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">Digital goods, made by independent creators</div>
          <h1 className="hero-title">A marketplace for beautifully made things.</h1>
          <p className="hero-sub">Presets, UI kits, fonts, 3D assets and more — every file reviewed, every creator paid directly.</p>
          <div className="hero-ctas">
            <Link to="/shop" className="btn btn-primary btn-lg">Explore marketplace</Link>
            <Link to="/categories" className="btn btn-ghost btn-lg">Browse categories</Link>
          </div>
          <div className="hero-stats">
            {HERO_STATS.map((s) => <div key={s.label}><div className="stat-v">{s.value}</div><div className="stat-l">{s.label}</div></div>)}
          </div>
        </div>
        <div className="hero-media"><Img name="hero" alt="Showcase of creative work available on Vellum" eager /></div>
      </section>

      <section className="section container">
        <div className="section-head"><h2 className="h2">Browse by category</h2></div>
        <CategoryGrid />
      </section>

      {loading && <Loading />}
      {error && <ErrorMsg error={error} />}
      {data && (
        <>
          <section className="section container">
            <div className="section-head">
              <h2 className="h2">Featured products</h2>
              <Link to="/shop" className="link-accent">View all →</Link>
            </div>
            <ProductGrid products={data.featured} />
          </section>
          <section className="section container">
            <div className="section-head"><h2 className="h2">Trending this week</h2></div>
            <ProductGrid products={data.trending} />
          </section>
          <section className="section container">
            <div className="section-head">
              <h2 className="h2">Latest uploads</h2>
              <Link to="/shop?sort=Newest" className="link-accent">See newest →</Link>
            </div>
            <ProductGrid products={data.latest} />
          </section>
          <section className="section container">
            <div className="section-head">
              <h2 className="h2">Popular creators</h2>
              <Link to="/creators" className="link-accent">All creators →</Link>
            </div>
            <div className="grid grid-4">
              {data.creators.map((c) => (
                <Link key={c.name} to={'/shop?search=' + encodeURIComponent(c.name)} className="creator-card">
                  <Avatar name={c.name} />
                  <div className="creator-name">{c.name}</div>
                  <div className="muted small">{c.count} products · {c.rating}★</div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="section container">
        <h2 className="h2">What customers say</h2>
        <div className="grid grid-3">
          {TESTIMONIALS.map((t) => (
            <figure className="panel quote" key={t.name}>
              <blockquote>“{t.quote}”</blockquote>
              <figcaption className="muted">{t.name} · {t.role}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="stats-band">
        <div className="container grid grid-4 stats-grid">
          {GLOBAL_STATS.map((s) => <div key={s.label}><div className="stat-big">{s.value}</div><div className="stat-l">{s.label}</div></div>)}
        </div>
      </section>

      <Newsletter />
      <Faq />
    </>
  );
}
