import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { fmtPrice, priceOf } from '../api.js';
import { Icon, Img } from './ui.jsx';
import { CardPlayButton } from './media.jsx';

export default function ProductCard({ product: p }) {
  const { addToCart, toggleWishlist, isWishlisted } = useStore();
  const nav = useNavigate();
  const saved = isWishlisted(p.id);
  const badgeClass = { Sale: 'badge-sale', New: 'badge-new' }[p.badge] || '';

  return (
    <article className="card">
      <div className="card-media">
        <Link to={`/product/${p.id}`} tabIndex={-1} aria-hidden="true"><Img name={p.img} alt={p.title} /></Link>
        {p.badge && <span className={'badge ' + badgeClass}>{p.badge}</span>}
        <button
          type="button"
          className={'icon-chip wish' + (saved ? ' on' : '')}
          onClick={() => toggleWishlist(p)}
          aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={saved}
        >
          <Icon.heart width="16" height="16" fill={saved ? 'currentColor' : 'none'} />
        </button>
        {p.preview && <CardPlayButton preview={p.preview} title={p.title} />}
        <div className="quick">
          <button type="button" className="quick-btn" onClick={() => nav(`/product/${p.id}`)}>
            <Icon.eye /> Quick preview
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="card-meta"><span>{p.category}</span><span>{p.creator}</span></div>
        <h3 className="card-title"><Link to={`/product/${p.id}`}>{p.title}</Link></h3>
        <div className="card-rating">
          <Icon.star className="star-ic" /> <span>{p.rating}</span><span className="dot">·</span>
          <span>{(p.sales || 0).toLocaleString()} sales</span>
        </div>
        <div className="card-foot">
          <div className="price">
            <span className="price-now">{fmtPrice(priceOf(p))}</span>
            {p.sale != null && <span className="price-was">{fmtPrice(p.price)}</span>}
          </div>
          <button type="button" className="add-btn" onClick={() => addToCart(p)} aria-label={`Add ${p.title} to cart`}>
            <Icon.cart width="16" height="16" strokeWidth="2" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, cols = 4 }) {
  return (
    <div className={`grid grid-${cols}`}>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
