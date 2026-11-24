# Docker Quick Start

## Local Development

### Build and run:
```bash
docker-compose up --build
```

App is live at `http://localhost:5173`.

### Stop:
```bash
docker-compose down
```

### View logs:
```bash
docker-compose logs -f
```

### Database and backups persist in Docker volumes:
```bash
# List volumes
docker volume ls

# Inspect data
docker volume inspect k_crm-data
```

---

## Production Deployment

### Quick choice:

| Platform | Setup Time | Cost | Recommendation |
| -------- | ---------- | ---- | --------------- |
| **Render** | 5 min | $7–50/mo | ✅ Best for getting started |
| **Fly.io** | 10 min | $5–50/mo | ✅ Great scaling, more control |
| **Railway** | 5 min | Free–$50/mo | ✅ Generous free tier |
| **AWS** | 30 min | $5–200/mo | For teams wanting full control |

### Render (recommended, fastest):

1. Push this repo to GitHub
2. Go to https://render.com
3. Click **New** → **Web Service**
4. Connect your GitHub repo
5. Set to **Docker** type
6. Deploy

That's it. Your app is live at `https://crm-app.onrender.com` (or custom domain).

---

### Fly.io (best scaling):

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch --dockerfile
# Answer the prompts, then:
fly deploy
```

Your app is at `https://crm-app.fly.dev`.

---

### Railway (easiest free tier):

1. Go to https://railway.app
2. Click **New** → **GitHub Repo**
3. Select this repo
4. Railway auto-detects the Dockerfile
5. Deploy

---

## Production Setup Checklist

- [ ] Choose platform (Render, Fly, or Railway)
- [ ] GitHub repo created and pushed
- [ ] Platform connected to GitHub
- [ ] Environment variables set (see `.env.example`)
- [ ] First deploy successful
- [ ] App accessible at your domain
- [ ] Database migrations ran (check logs)
- [ ] Health checks passing
- [ ] Backups scheduled (if needed; see `docs/DEPLOYMENT.md`)

---

## Environment Variables

For production, set these in your platform's dashboard:

```
NODE_ENV=production
PORT=5173
HOST=0.0.0.0
DATABASE_URL=file:/app/data/crm.db
CORS_ORIGINS=https://crm.yourcompany.com
```

See `.env.example` for all options.

---

## Common Issues

### "Build failed"
- Check logs in platform dashboard
- Verify Node.js dependencies install: `npm ci` should work
- Check that Prisma migrations exist: `server/prisma/migrations/`

### "Cannot find module"
- Rebuilding usually fixes it
- In platform dashboard, click "Rebuild and Deploy"

### Database errors
- Migrations run automatically in `docker-entrypoint.sh`
- If migration fails, check logs: `docker-compose logs crm`
- Verify `DATABASE_URL` is correct

### Slow first request
- Normal: Prisma generates client on first run (~2s)
- Subsequent requests are fast

---

## Detailed Guide

For database backups, persistent storage, scaling to PostgreSQL, and more, see **`docs/DEPLOYMENT.md`**.
