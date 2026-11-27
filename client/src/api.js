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

// Multipart upload with progress (fetch has no upload progress events).
export function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api' + path);
    xhr.responseType = 'json';
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error(data.error || (xhr.status === 413 ? 'That file is too large.' : `Upload failed (${xhr.status})`)), { status: xhr.status, fields: data.fields || {} }));
    };
    xhr.onerror = () => reject(new Error('Network error during upload. Please try again.'));
    xhr.send(form);
  });
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
  // Accounts
  me: () => request('/auth/me'),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  verifyEmail: (token) => request('/auth/verify', { method: 'POST', body: { token } }),
  resendVerification: () => request('/me/verify', { method: 'POST', body: {} }),
  googleLogin: (credential) => request('/auth/google', { method: 'POST', body: { credential } }),
  logout: () => request('/auth/logout', { method: 'POST', body: {} }),
  forgot: (email) => request('/auth/forgot', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/auth/reset', { method: 'POST', body: { token, password } }),
  updateMe: (body) => request('/me', { method: 'PUT', body }),
  myOrders: () => request('/me/orders'),
  claimOrders: (orders) => request('/me/orders/claim', { method: 'POST', body: { orders } }),
  myWishlist: () => request('/me/wishlist'),
  saveWishlist: (ids) => request('/me/wishlist', { method: 'PUT', body: { ids } }),
  // Creator studio
  studio: () => request('/studio'),
  saveCreatorProfile: (body) => request('/studio/profile', { method: 'PUT', body }),
  createProduct: (body) => request('/studio/products', { method: 'POST', body }),
  studioProduct: (id) => request('/studio/products/' + encodeURIComponent(id)),
  updateProduct: (id, body) => request('/studio/products/' + encodeURIComponent(id), { method: 'PUT', body }),
  setImages: (id, images) => request(`/studio/products/${encodeURIComponent(id)}/images`, { method: 'PUT', body: { images } }),
  submitProduct: (id) => request(`/studio/products/${encodeURIComponent(id)}/submit`, { method: 'POST', body: {} }),
  deleteProduct: (id) => request('/studio/products/' + encodeURIComponent(id), { method: 'DELETE' }),
  studioFileUrl: (id) => `/api/studio/products/${encodeURIComponent(id)}/file`,
  // Admin
  admin: {
    overview: () => request('/admin/overview'),
    products: (params = {}) => request('/admin/products?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v))),
    action: (id, action, body = {}) => request(`/admin/products/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }),
    users: (search = '') => request('/admin/users' + (search ? '?search=' + encodeURIComponent(search) : '')),
    updateUser: (id, body) => request('/admin/users/' + id, { method: 'PUT', body }),
    resetLink: (id) => request(`/admin/users/${id}/reset-link`, { method: 'POST', body: {} }),
    orders: () => request('/admin/orders'),
  },
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
