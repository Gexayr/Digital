// Server-side SEO: per-route <title>, meta description, canonical, Open Graph,
// Twitter cards and JSON-LD are injected into index.html, so crawlers and link
// previews (Telegram, Facebook, X, Slack) see real content without running JS.
// A small static HTML body is also placed inside #root; React replaces it on mount.
import { readFileSync } from 'node:fs';
import { rowToProduct } from './db.js';
import { CATEGORIES } from './seed.js';

const SITE = 'Vellum';
const TAGLINE = 'Digital Marketplace';
const DEFAULT_DESC = 'Vellum is a marketplace for presets, UI kits, fonts, 3D assets, templates and audio from independent creators. Every file reviewed, every creator paid directly.';
const NOINDEX = new Set(['/cart', '/checkout', '/wishlist', '/downloads', '/login', '/register', '/forgot', '/reset', '/verify', '/account']);
const PRIVATE_PREFIX = /^\/(order|studio|admin)(\/|$)/;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON inside <script> must not be able to close the tag.
const ldJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
const priceOf = (p) => p.sale ?? p.price;
const clip = (s, n = 160) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

export function productDescription(p) {
  if (p.description) return clip(`${p.title} by ${p.creator}. ${p.description.replace(/\s+/g, ' ')}`);
  return clip(`${p.title} by ${p.creator}. ${p.category} for ${p.software}: ${p.format}, ${p.size}, ${p.license} license. Rated ${p.rating}/5 by ${p.sales.toLocaleString('en-US')} buyers. Instant download on Vellum.`);
}

export function createSeo({ db, indexFile, siteUrl }) {
  const template = readFileSync(indexFile, 'utf8');
  const q = {
    byId: db.prepare("SELECT * FROM products WHERE id = ? AND status = 'published'"),
    all: db.prepare("SELECT * FROM products WHERE status = 'published' ORDER BY sales DESC"),
    byCategory: db.prepare("SELECT * FROM products WHERE category = ? AND status = 'published' ORDER BY sales DESC"),
    reviewCount: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE product_id = ?'),
  };
  const origin = (req) => siteUrl || `${req.protocol}://${req.get('host')}`;

  function productLinks(products) {
    return '<ul>' + products.map((p) =>
      `<li><a href="/product/${esc(p.id)}">${esc(p.title)}</a> by ${esc(p.creator)}, $${priceOf(p)}</li>`).join('') + '</ul>';
  }

  function breadcrumb(base, items) {
    return {
      '@type': 'BreadcrumbList',
      itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + path })),
    };
  }

  // Returns { status, title, description, canonical, image, type, noindex, ld[], body }
  function routeMeta(req) {
    const base = origin(req);
    const path = req.path.replace(/\/+$/, '') || '/';
    const defImage = `${base}/og-image.png`;
    const meta = { status: 200, title: `${SITE} - ${TAGLINE}`, description: DEFAULT_DESC, canonical: base + path, image: defImage, type: 'website', noindex: false, ld: [], body: '' };

    if (path === '/') {
      const all = q.all.all().map(rowToProduct);
      meta.title = `${SITE} - Presets, UI Kits, Fonts and 3D Assets from Independent Creators`;
      meta.canonical = base + '/';
      meta.ld.push(
        { '@type': 'WebSite', name: SITE, url: base + '/', potentialAction: { '@type': 'SearchAction', target: `${base}/shop?search={search_term_string}`, 'query-input': 'required name=search_term_string' } },
        { '@type': 'Organization', name: SITE, url: base + '/', logo: `${base}/apple-touch-icon.png` },
      );
      meta.body = `<h1>A marketplace for beautifully made things.</h1><p>${esc(DEFAULT_DESC)}</p>`
        + `<h2>Categories</h2><ul>${CATEGORIES.map((c) => `<li><a href="/shop?category=${encodeURIComponent(c)}">${esc(c)}</a></li>`).join('')}</ul>`
        + `<h2>Popular products</h2>${productLinks(all.slice(0, 12))}`;
      return meta;
    }

    if (path === '/shop') {
      const cat = CATEGORIES.includes(req.query.category) ? req.query.category : null;
      const products = (cat ? q.byCategory.all(cat) : q.all.all()).map(rowToProduct);
      if (cat) {
        meta.title = `${cat} - Buy and Download Digital ${cat} | ${SITE}`;
        meta.description = clip(`Browse ${products.length} hand-picked ${cat.toLowerCase()} from independent creators on ${SITE}. Instant download, clear licensing, creators paid directly.`);
        meta.canonical = `${base}/shop?category=${encodeURIComponent(cat)}`;
        meta.ld.push(breadcrumb(base, [['Home', '/'], ['Shop', '/shop'], [cat, `/shop?category=${encodeURIComponent(cat)}`]]));
      } else {
        meta.title = `Shop All Digital Products | ${SITE}`;
        meta.description = `Shop presets, UI kits, fonts, 3D assets, templates and audio from independent creators on ${SITE}. Filter by category and price, instant download.`;
        meta.canonical = base + '/shop';
      }
      // Search, sort and price filters are views of the same list: keep them out of the index.
      if (req.query.search || req.query.sort || req.query.maxPrice) meta.noindex = true;
      meta.ld.push({
        '@type': 'ItemList',
        itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/product/${p.id}`, name: p.title })),
      });
      meta.body = `<h1>${esc(cat || 'Shop all products')}</h1><p>${esc(meta.description)}</p>${productLinks(products)}`;
      return meta;
    }

    if (path === '/categories') {
      meta.title = `Categories | ${SITE}`;
      meta.description = `Explore ${SITE} by category: ${CATEGORIES.join(', ')}.`;
      meta.body = `<h1>Categories</h1><ul>${CATEGORIES.map((c) => `<li><a href="/shop?category=${encodeURIComponent(c)}">${esc(c)}</a></li>`).join('')}</ul>`;
      return meta;
    }

    if (path === '/creators') {
      const creators = [...new Set(q.all.all().map((p) => p.creator))];
      meta.title = `Creators | ${SITE}`;
      meta.description = clip(`Meet the independent creators selling on ${SITE}: ${creators.join(', ')}.`);
      meta.body = `<h1>Creators</h1><ul>${creators.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
      return meta;
    }

    const m = path.match(/^\/product\/([^/]+)$/);
    if (m) {
      const p = rowToProduct(q.byId.get(decodeURIComponent(m[1])));
      if (!p) return { ...meta, status: 404, title: `Product not found | ${SITE}`, noindex: true, body: '<h1>Product not found</h1>' };
      const url = `${base}/product/${encodeURIComponent(p.id)}`;
      const reviews = q.reviewCount.get(p.id).n;
      const images = (p.images.length ? p.images : [p.img]).map((i) => `${base}/images/${i}.jpg`);
      meta.title = `${p.title} by ${p.creator} | ${SITE}`;
      meta.description = productDescription(p);
      meta.canonical = url;
      meta.image = images[0];
      meta.type = 'product';
      meta.product = p;
      meta.ld.push(
        {
          '@type': 'Product',
          name: p.title,
          description: meta.description,
          image: images,
          sku: p.id,
          category: p.category,
          brand: { '@type': 'Brand', name: p.creator },
          ...(reviews ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, bestRating: 5, reviewCount: reviews } } : {}),
          offers: { '@type': 'Offer', url, price: priceOf(p).toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
        },
        breadcrumb(base, [['Home', '/'], [p.category, `/shop?category=${encodeURIComponent(p.category)}`], [p.title, `/product/${encodeURIComponent(p.id)}`]]),
      );
      meta.body = `<h1>${esc(p.title)}</h1><p>by ${esc(p.creator)} · ${esc(p.category)} · $${priceOf(p)}</p><p>${esc(meta.description)}</p>`
        + `<p><a href="/shop?category=${encodeURIComponent(p.category)}">More ${esc(p.category)}</a></p>`;
      return meta;
    }

    if (NOINDEX.has(path) || PRIVATE_PREFIX.test(path)) {
      const names = {
        '/cart': 'Shopping cart', '/checkout': 'Checkout', '/wishlist': 'Wishlist', '/downloads': 'Your downloads',
        '/login': 'Sign in', '/register': 'Create an account', '/forgot': 'Reset password', '/reset': 'Reset password', '/verify': 'Confirm your email', '/account': 'Your account',
      };
      const section = { order: 'Order', studio: 'Creator studio', admin: 'Admin' }[path.split('/')[1]];
      meta.title = `${names[path] || section} | ${SITE}`;
      meta.noindex = true;
      return meta;
    }

    return { ...meta, status: 404, title: `Page not found | ${SITE}`, noindex: true, body: '<h1>Page not found</h1>' };
  }

  function render(req) {
    const meta = routeMeta(req);
    const head = [
      `<title>${esc(meta.title)}</title>`,
      `<meta name="description" content="${esc(meta.description)}" />`,
      meta.noindex ? '<meta name="robots" content="noindex, follow" />' : `<link rel="canonical" href="${esc(meta.canonical)}" />`,
      `<meta property="og:site_name" content="${SITE}" />`,
      `<meta property="og:type" content="${meta.type}" />`,
      `<meta property="og:title" content="${esc(meta.title)}" />`,
      `<meta property="og:description" content="${esc(meta.description)}" />`,
      `<meta property="og:url" content="${esc(meta.canonical)}" />`,
      `<meta property="og:image" content="${esc(meta.image)}" />`,
      `<meta property="og:image:alt" content="${esc(meta.product ? meta.product.title : SITE)}" />`,
      '<meta property="og:locale" content="en_US" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${esc(meta.title)}" />`,
      `<meta name="twitter:description" content="${esc(meta.description)}" />`,
      `<meta name="twitter:image" content="${esc(meta.image)}" />`,
      ...(meta.product ? [
        `<meta property="product:price:amount" content="${priceOf(meta.product).toFixed(2)}" />`,
        '<meta property="product:price:currency" content="USD" />',
      ] : []),
      ...(meta.ld.length ? [`<script type="application/ld+json">${ldJson({ '@context': 'https://schema.org', '@graph': meta.ld })}</script>`] : []),
    ].join('\n    ');

    const html = template
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace('</head>', `    ${head}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${meta.body ? `<div class="container page seo-fallback">${meta.body}</div>` : ''}</div>`);
    return { status: meta.status, html, noindex: meta.noindex };
  }

  function robots(req) {
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Disallow: /wishlist',
      'Disallow: /downloads',
      'Disallow: /order/',
      'Disallow: /account',
      'Disallow: /studio',
      'Disallow: /admin',
      'Disallow: /stats/',
      '',
      `Sitemap: ${origin(req)}/sitemap.xml`,
      '',
    ].join('\n');
  }

  function sitemap(req) {
    const base = origin(req);
    const products = q.all.all();
    const latest = products.reduce((d, p) => (p.updated > d ? p.updated : d), '2000-01-01');
    const urls = [
      [`${base}/`, latest, '1.0'],
      [`${base}/shop`, latest, '0.9'],
      ...CATEGORIES.map((c) => [`${base}/shop?category=${encodeURIComponent(c)}`, latest, '0.8']),
      [`${base}/categories`, latest, '0.5'],
      [`${base}/creators`, latest, '0.5'],
      ...products.map((p) => [`${base}/product/${encodeURIComponent(p.id)}`, p.updated, '0.7']),
    ];
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + urls.map(([loc, mod, pr]) => `  <url><loc>${esc(loc)}</loc><lastmod>${mod.slice(0, 10)}</lastmod><priority>${pr}</priority></url>`).join('\n')
      + '\n</urlset>\n';
  }

  return { render, robots, sitemap };
}
