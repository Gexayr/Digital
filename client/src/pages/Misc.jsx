import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Avatar, ErrorMsg, Loading, useFetch } from '../components/ui.jsx';
import { CategoryGrid } from './Home.jsx';

export function Wishlist() {
  const { wishlist } = useStore();
  return (
    <div className="container page">
      <h1 className="h1">Wishlist</h1>
      {wishlist.length ? <ProductGrid products={wishlist} /> : (
        <div className="state-msg">Nothing saved yet. <Link to="/shop" className="link-accent">Browse the shop →</Link></div>
      )}
    </div>
  );
}

export function Categories() {
  return (
    <div className="container page">
      <h1 className="h1">Categories</h1>
      <CategoryGrid />
    </div>
  );
}

export function Creators() {
  const { data, error, loading } = useFetch(api.creators, []);
  return (
    <div className="container page">
      <h1 className="h1">Creators</h1>
      {loading && <Loading />}
      {error && <ErrorMsg error={error} />}
      {data && (
        <div className="grid grid-4">
          {data.map((c) => (
            <Link key={c.name} to={'/shop?search=' + encodeURIComponent(c.name)} className="creator-card">
              <Avatar name={c.name} />
              <div className="creator-name">{c.name}</div>
              <div className="muted small">{c.count} products · {c.rating}★ · {c.sales.toLocaleString()} sales</div>
              <div className="muted small">{c.categories.join(', ')}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container page state-msg">
      <h1 className="h1">Page not found</h1>
      <Link to="/" className="link-accent">Go home →</Link>
    </div>
  );
}
