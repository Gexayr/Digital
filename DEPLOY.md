# Deployment instructions (for an operator or AI agent)

This is a step-by-step runbook for deploying **Vellum** to a Linux server (Ubuntu or Debian).
Work through it top to bottom and run each **Verify** step before moving on.

- Repo: `git@github.com:Gexayr/Digital.git` (branch `main`)
- App: a single Node.js process. Express serves both the API (`/api/*`) and the built React frontend.
- Database: SQLite file at `$DATA_DIR/vellum.db`. It is created and seeded automatically on first start.
- Port: `3000` by default. Put nginx in front for ports 80/443.
- Health check: `GET /api/health` returns `{"ok":true}`.

Choose **one** method: **A. Docker** (recommended) or **B. PM2**.

---

## 0. Ask the owner before you start

Get these answers from the owner. Do not guess them.

1. The server's SSH address, and which user to run as.
2. The domain name, if any (for nginx and HTTPS). Without a domain, skip steps 3 and 4.
3. Which method to use: Docker or PM2.
4. Whether ports 80, 443 or 3000 are already used by something else (`sudo ss -ltnp`).

Never overwrite or delete an existing nginx site, container, PM2 process or `data/` directory without the owner's confirmation.

---

## 1. Get the code

```bash
sudo mkdir -p /var/www && cd /var/www
git clone git@github.com:Gexayr/Digital.git vellum   # or: git clone https://github.com/Gexayr/Digital.git vellum
cd vellum
```

**Verify:** `ls` shows `client/ server/ Dockerfile docker-compose.yml ecosystem.config.cjs`.

---

## 2A. Deploy with Docker (recommended)

Requirements: Docker 24+ with the compose plugin.

```bash
docker --version && docker compose version
# Install if missing: curl -fsSL https://get.docker.com | sh
```

Build and start:

```bash
cd /var/www/vellum
docker compose up -d --build
# To use another host port: PORT=8080 docker compose up -d --build
```

**Verify:**

```bash
docker compose ps                        # STATUS shows "Up" and later "(healthy)"
curl -s http://127.0.0.1:3000/api/health # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/   # 200
docker compose logs --tail=50 app        # "Vellum listening on http://0.0.0.0:3000"
```

Data is stored in the Docker volume `vellum-data`, mounted at `/data` inside the container. It survives rebuilds.
**Never run `docker compose down -v`**: the `-v` flag deletes the database.

To update to a new version:

```bash
cd /var/www/vellum && git pull && docker compose up -d --build
```

---

## 2B. Deploy with PM2 (no Docker)

Requirements: Node.js **22.13 or newer** (24 recommended). Older Node versions do not have `node:sqlite`.

```bash
node -v
# Install if missing or too old:
#   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo npm i -g pm2
```

Install, build and start:

```bash
cd /var/www/vellum
npm run deploy:pm2      # = npm ci (server+client) → vite build → pm2 startOrReload → pm2 save
pm2 startup             # prints a command; run the command it prints (with sudo), once
pm2 save
```

**Verify:**

```bash
pm2 status                               # "vellum" shows status "online"
curl -s http://127.0.0.1:3000/api/health # {"ok":true}
pm2 logs vellum --lines 30 --nostream
```

Data is stored in `/var/www/vellum/data/`; `git pull` does not touch it. Keep **one** instance only: SQLite allows a single writer, so do not use cluster mode.

To update to a new version:

```bash
cd /var/www/vellum && git pull && npm run deploy:pm2
```

---

## 3. nginx reverse proxy (only with a domain)

```bash
sudo apt-get install -y nginx
sudo cp /var/www/vellum/deploy/nginx.conf /etc/nginx/sites-available/vellum
sudo sed -i 's/example.com/YOUR_DOMAIN/' /etc/nginx/sites-available/vellum
sudo ln -s /etc/nginx/sites-available/vellum /etc/nginx/sites-enabled/vellum
sudo nginx -t && sudo systemctl reload nginx
```

If the app runs on a port other than 3000, change `proxy_pass` to match.
The domain's DNS A record must point to the server's IP address.

**Verify:** `curl -s http://YOUR_DOMAIN/api/health` returns `{"ok":true}`.

## 4. HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN --redirect
```

Certbot asks for an email address and asks you to accept its terms. **The owner must provide the email and agree to the terms.**

**Verify:** `curl -sI https://YOUR_DOMAIN | head -1` returns `HTTP/2 200`.

## 5. Firewall (optional)

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Behind nginx, port 3000 does not need to be public. To bind it to localhost only:
- **Docker:** change the port in `docker-compose.yml` to `"127.0.0.1:3000:3000"`.
- **PM2:** set `HOST: '127.0.0.1'` in `env_production`.

---

## Configuration

Set environment variables in `ecosystem.config.cjs` (`env_production`) for PM2, or under `environment:` in `docker-compose.yml` for Docker.

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` (Docker: `/data`) | SQLite DB directory |
| `FILES_DIR` | `$DATA_DIR/files` | Real product files, named `<productId>.zip` (e.g. `p1.zip`) |
| `SITE_URL` | request host | Public origin for canonical URLs, Open Graph and `sitemap.xml` |

There are no secrets or API keys to configure. Payments run in **demo mode**: nothing is charged.

## Backups

```bash
# Docker
docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/vellum.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db ./vellum-$(date +%F).db
# PM2
sqlite3 /var/www/vellum/data/vellum.db ".backup /var/www/vellum/vellum-$(date +%F).db"
```

## Rollback

```bash
git log --oneline            # find the previous good commit
git checkout <commit>        # then run the update command for your method
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot find module 'node:sqlite'` / `No such built-in module` | Node is older than 22.13. Upgrade Node. |
| `EADDRINUSE :3000` | Another process is using the port. Find it with `sudo ss -ltnp \| grep 3000`, then change `PORT`. |
| API works but `/` returns 404 | The frontend isn't built. Run `npm run build` (PM2), or rebuild the image. |
| `SQLITE_CANTOPEN` / permission denied | Make `DATA_DIR` writable by the user running the app (Docker runs as user `node`). |
| nginx 502 | The app isn't running. Check `pm2 status` or `docker compose ps`, then the logs. |

## Final checklist

- [ ] `/api/health` returns `{"ok":true}` on the public URL
- [ ] Home, Shop and a product page load, and images are visible
- [ ] Adding to the cart and the demo checkout (PayPal option) lead to "Order confirmed"
- [ ] The app survives a restart (`sudo reboot`, then check the health endpoint again)
- [ ] Report to the owner: URL, method used, where the data lives, and how to update
