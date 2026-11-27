import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist';
import './styles.css';
import { StoreProvider } from './store.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import { Downloads, OrderSuccess } from './pages/Orders.jsx';
import { Categories, Creators, NotFound, Wishlist } from './pages/Misc.jsx';
import { Loading } from './components/ui.jsx';

// Account, studio and admin screens load on demand.
const page = (load, name) => {
  const C = lazy(() => load().then((m) => ({ default: m[name] })));
  return <Suspense fallback={<Loading />}><C /></Suspense>;
};
const acc = () => import('./pages/Account.jsx');
const studio = () => import('./pages/Studio.jsx');
const admin = () => import('./pages/Admin.jsx');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<Shop />} />
            <Route path="categories" element={<Categories />} />
            <Route path="creators" element={<Creators />} />
            <Route path="product/:id" element={<Product />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order/:id" element={<OrderSuccess />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="login" element={page(acc, 'Login')} />
            <Route path="register" element={page(acc, 'Register')} />
            <Route path="forgot" element={page(acc, 'Forgot')} />
            <Route path="reset" element={page(acc, 'Reset')} />
            <Route path="verify" element={page(acc, 'Verify')} />
            <Route path="account" element={page(acc, 'Account')} />
            <Route path="studio" element={page(studio, 'Studio')} />
            <Route path="studio/new" element={page(studio, 'StudioEditor')} />
            <Route path="studio/:id" element={page(studio, 'StudioEditor')} />
            <Route path="admin" element={page(admin, 'default')} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>,
);
