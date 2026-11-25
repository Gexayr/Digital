# Vellum — Digital Marketplace

A marketplace for digital goods: presets, UI kits, fonts, 3D assets, templates and audio.

- **Frontend:** React 18 + Vite + React Router (`client/`). Responsive down to 320px, with dark and light themes.
- **Backend:** Node.js + Express 5 + SQLite via the built-in `node:sqlite` module, so there are no native builds (`server/`).
- **Deploy:** Docker / docker-compose **or** PM2. Nginx example in `deploy/`.

The original Claude Design prototype is kept for reference in `design/`.

## Quick start (development)

```bash
npm run install:all
npm run dev:server     # API on http://localhost:3000
npm run dev:client     # UI on http://localhost:5173 (proxies /api)
npm test               # API tests
```

Requires Node **22.13+** (Node 24 recommended).

## Deploy with Docker

```bash
docker compose up -d --build        # http://localhost:3000
PORT=8080 docker compose up -d      # different host port
```

Data (the SQLite DB and deliverable files) lives in the `vellum-data` volume, mounted at `/data`.

## Deploy with PM2

```bash
npm i -g pm2
npm run deploy:pm2      # install → build → start/reload → save
pm2 startup             # once, so it restarts after a reboot
```

Data is stored in `./data/`. Put nginx in front with `deploy/nginx.conf` and add TLS with certbot.

## Configuration (env vars)

| Var | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | SQLite DB location |
| `FILES_DIR` | `$DATA_DIR/files` | Real deliverables: `<productId>.zip` |
| `CLIENT_DIST` | `client/dist` | Built frontend |

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/home` | Featured / trending / latest / top creators |
| GET | `/api/categories` | Categories with counts |
| GET | `/api/creators` | All creators |
| GET | `/api/products?category=&search=&maxPrice=&sort=` | Sort: `Featured, Newest, PriceLow, PriceHigh, Rating, BestSelling` |
| GET | `/api/products/:id` | Product + reviews + related |
| POST | `/api/newsletter` | `{ email }` |
| POST | `/api/coupons/validate` | `{ code }`. Seeded codes: `WELCOME10`, `CREATOR20` |
| POST | `/api/orders` | `{ items, customer, payment, terms, coupon }`; prices are computed on the server |
| GET | `/api/orders/:id` | Header `x-order-token` |
| GET | `/api/orders/:id/download/:productId?token=` | Serves `FILES_DIR/<productId>.zip`, or a placeholder |

> **Payments are in demo mode.** No charge is made and card details never leave the browser. Wire a provider such as Stripe Checkout into `POST /api/orders` before going live.

## Images

Product photos are free placeholder images from [Picsum](https://picsum.photos), which serves Unsplash photos under the Unsplash License. They are stored in `client/public/images/`:

- `hero.jpg`: homepage hero (about 1400×1100)
- `prod-N.jpg`: main image for product `pN` (4:3, about 960×720)
- `prod-N-alt-1..3.jpg`: gallery images

To replace an image, overwrite the file with the same name and rebuild. A missing image falls back to a styled placeholder.
