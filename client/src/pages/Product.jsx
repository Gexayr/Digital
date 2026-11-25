import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtPrice, priceOf } from '../api.js';
import { useStore } from '../store.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { ErrorMsg, Icon, Img, Loading, Stars, useFetch, usePageMeta } from '../components/ui.jsx';

const TABS = [['description', 'Description'], ['features', 'Features'], ['files', 'File Info'], ['reviews', 'Reviews']];

export default function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, error, loading } = useFetch(() => api.product(id), [id]);
  const { addToCart, inCart, toggleWishlist, isWishlisted, notify } = useStore();
  const [gallery, setGallery] = useState(0);
  const [tab, setTab] = useState('description');
  useEffect(() => { setGallery(0); setTab('description'); }, [id]);
  usePageMeta(
    p ? `${p.title} by ${p.creator} | Vellum` : error ? 'Product not found | Vellum' : null,
    p ? `${p.title} by ${p.creator}. ${p.category} for ${p.software}: ${p.format}, ${p.size}, ${p.license} license. Instant download on Vellum.` : undefined,
  );

  if (loading) return <Loading />;
  if (error) {
    return (
      <div className="container page state-msg">
        {error.status === 404 ? 'This product doesn’t exist.' : error.message} <Link to="/shop" className="link-accent">Back to shop →</Link>
      </div>
    );
  }

  const imgs = [p.img, `${p.img}-alt-1`, `${p.img}-alt-2`, `${p.img}-alt-3`];
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.title, url });
      else { await navigator.clipboard.writeText(url); notify('Link copied'); }
    } catch { /* user cancelled */ }
  };
  const avg = p.reviews.length ? (p.reviews.reduce((s, r) => s + r.stars, 0) / p.reviews.length).toFixed(1) : null;

  return (
    <div className="container page">
      <button type="button" className="back-link" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/shop'))}>← Back</button>
      <div className="pdp">
        <div className="pdp-gallery">
          <div className="pdp-main"><Img name={imgs[gallery]} alt={`${p.title} - preview ${gallery + 1}`} eager /></div>
          <div className="pdp-thumbs">
            {imgs.map((name, i) => (
              <button type="button" key={name} className={'thumb' + (gallery === i ? ' on' : '')} onClick={() => setGallery(i)} aria-label={`Show preview ${i + 1}`}>
                <Img name={name} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="pdp-info">
          <div className="eyebrow">{p.category}</div>
          <h1 className="pdp-title">{p.title}</h1>
          <div className="muted">by <Link className="strong" to={'/shop?search=' + encodeURIComponent(p.creator)}>{p.creator}</Link></div>
          <div className="pdp-rating muted">
            <Icon.star className="star-ic" width="14" height="14" /> {p.rating} rating · {p.sales.toLocaleString()} sales
          </div>
          <div className="price pdp-price">
            <span className="price-now">{fmtPrice(priceOf(p))}</span>
            {p.sale != null && <span className="price-was">{fmtPrice(p.price)}</span>}
          </div>
          <p className="muted">Instant digital delivery after purchase. Includes lifetime updates on this version line and a {p.license} license.</p>
          <div className="pdp-ctas">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => { if (!inCart(p.id)) addToCart(p); nav('/checkout'); }}>Buy Now</button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => (inCart(p.id) ? nav('/cart') : addToCart(p))}>
              {inCart(p.id) ? 'View cart' : 'Add to Cart'}
            </button>
          </div>
          <div className="pdp-links">
            <button type="button" className="text-btn" onClick={() => toggleWishlist(p)}>{isWishlisted(p.id) ? '♥ In wishlist' : '♡ Add to wishlist'}</button>
            <button type="button" className="text-btn" onClick={share}>Share</button>
          </div>
          <dl className="spec">
            <div><dt>File format</dt><dd>{p.format}</dd></div>
            <div><dt>File size</dt><dd>{p.size}</dd></div>
            <div><dt>Compatible with</dt><dd>{p.software}</dd></div>
            <div><dt>Last updated</dt><dd>{fmtDate(p.updated)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button type="button" role="tab" key={key} aria-selected={tab === key} className={'tab' + (tab === key ? ' on' : '')} onClick={() => setTab(key)}>
            {label}{key === 'reviews' ? ` (${p.reviews.length})` : ''}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {tab === 'description' && (
          <p>A carefully crafted {p.category} asset built for working creative professionals. Every file is tested across the listed software before release, and updated whenever the underlying tools change. {p.creator} has been publishing on Vellum since 2023.</p>
        )}
        {tab === 'features' && (
          <ul className="bullets">
            <li>Non-destructive, fully editable source files</li>
            <li>Organized layers and naming conventions</li>
            <li>Free updates for the current major version</li>
            <li>Commercial-use documentation included</li>
          </ul>
        )}
        {tab === 'files' && (
          <div className="stack-sm">
            <div>Format: {p.format}</div><div>Size: {p.size}</div><div>License: {p.license}</div>
            <div>Compatible software: {p.software}</div><div>Version history: v2.1 - {fmtDate(p.updated)}</div>
          </div>
        )}
        {tab === 'reviews' && (
          <div className="stack">
            {avg && <div className="muted">Average {avg} from {p.reviews.length} reviews</div>}
            {p.reviews.map((r, i) => (
              <div className="review" key={i}>
                <div className="strong">{r.name} - <Stars value={r.stars} /></div>
                <div>{r.text}</div>
              </div>
            ))}
            {!p.reviews.length && <div>No reviews yet.</div>}
          </div>
        )}
      </div>

      {p.related.length > 0 && (
        <section className="section-tight">
          <h2 className="h2">Related products</h2>
          <ProductGrid products={p.related} />
        </section>
      )}
    </div>
  );
}
