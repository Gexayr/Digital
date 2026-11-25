import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, fmtPrice } from '../api.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { ErrorMsg, Icon, Loading, useFetch, usePageMeta } from '../components/ui.jsx';

const SORTS = [
  ['Featured', 'Featured'], ['Newest', 'Newest'], ['PriceLow', 'Price: Low to high'],
  ['PriceHigh', 'Price: High to low'], ['Rating', 'Highest rated'], ['BestSelling', 'Best selling'],
];
const MAX_PRICE = 80;

// Filters live in the URL, so they survive reloads, can be shared, and the
// back button works - the prototype kept them in memory only.
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || 'All';
  const sort = params.get('sort') || 'Featured';
  const maxPrice = Number(params.get('maxPrice')) || MAX_PRICE;
  const search = params.get('search') || '';
  const [searchInput, setSearchInput] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const set = (key, value, def) => {
    const next = new URLSearchParams(params);
    if (value === def || value === '') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    const t = setTimeout(() => { if (searchInput !== search) set('search', searchInput.trim(), ''); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const cats = useFetch(api.categories, []);
  const { data, error, loading } = useFetch(
    () => api.products({ category, sort, search, maxPrice: maxPrice < MAX_PRICE ? maxPrice : '' }),
    [category, sort, search, maxPrice],
  );
  usePageMeta(category === 'All' ? 'Shop All Digital Products | Vellum' : `${category} - Buy and Download Digital ${category} | Vellum`);
  const activeCount = (category !== 'All') + (maxPrice < MAX_PRICE) + !!search;

  return (
    <div className="container page">
      <h1 className="h1">{category === 'All' ? 'Shop all products' : category}</h1>
      <div className="shop">
        <aside className={'filters' + (filtersOpen ? ' open' : '')} aria-label="Filters">
          <div className="filter-block">
            <label className="filter-label" htmlFor="shop-search">Search</label>
            <input id="shop-search" type="search" className="input" placeholder="Search products…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div className="filter-block">
            <div className="filter-label">Category</div>
            <div className="cat-list">
              {['All', ...(cats.data || []).map((c) => c.name)].map((name) => (
                <button type="button" key={name} className={'cat-opt' + (name === category ? ' on' : '')} onClick={() => { set('category', name, 'All'); setFiltersOpen(false); }}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-block">
            <label className="filter-label" htmlFor="shop-price">Max price: {maxPrice >= MAX_PRICE ? 'Any' : fmtPrice(maxPrice)}</label>
            <input id="shop-price" type="range" min="10" max={MAX_PRICE} step="1" value={maxPrice} onChange={(e) => set('maxPrice', e.target.value, String(MAX_PRICE))} className="range" />
          </div>
          {activeCount > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setParams({}, { replace: true }); }}>Clear filters</button>
          )}
        </aside>

        <div>
          <div className="shop-bar">
            <button type="button" className="btn btn-ghost btn-sm filters-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              <Icon.filter /> Filters{activeCount ? ` (${activeCount})` : ''}
            </button>
            <div className="muted small">{data ? `${data.length} ${data.length === 1 ? 'product' : 'products'}` : ' '}</div>
            <label className="sr-only" htmlFor="shop-sort">Sort by</label>
            <select id="shop-sort" className="select" value={sort} onChange={(e) => set('sort', e.target.value, 'Featured')}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {loading && !data && <Loading />}
          {error && <ErrorMsg error={error} />}
          {data && data.length > 0 && <ProductGrid products={data} cols={3} />}
          {data && data.length === 0 && <div className="state-msg">No products match your filters.</div>}
        </div>
      </div>
    </div>
  );
}
