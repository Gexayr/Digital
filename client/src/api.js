async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.fields = data.fields || {};
    throw err;
  }
  return data;
}

export const api = {
  home: () => request('/home'),
  categories: () => request('/categories'),
  creators: () => request('/creators'),
  products: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return request('/products' + (qs.toString() ? '?' + qs : ''));
  },
  product: (id) => request('/products/' + encodeURIComponent(id)),
  subscribe: (email) => request('/newsletter', { method: 'POST', body: { email } }),
  validateCoupon: (code) => request('/coupons/validate', { method: 'POST', body: { code } }),
  createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  order: (id, token) => request('/orders/' + encodeURIComponent(id), { headers: { 'x-order-token': token } }),
  downloadUrl: (orderId, productId, token) =>
    `/api/orders/${encodeURIComponent(orderId)}/download/${encodeURIComponent(productId)}?token=${encodeURIComponent(token)}`,
};

export function fmtPrice(n) {
  if (n == null || Number.isNaN(Number(n))) return '$0';
  return '$' + Number(n).toFixed(2).replace(/\.00$/, '');
}

export const priceOf = (p) => p.sale ?? p.price;

export function fmtDate(iso) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
