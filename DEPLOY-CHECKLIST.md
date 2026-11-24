# Production Deployment Checklist

## Before First Deploy

- [ ] Code is clean and builds locally: `npm run build`
- [ ] Tests pass: `npm run test`
- [ ] Git repo is on GitHub (private or public)
- [ ] `.env.example` is in the repo (never commit `.env`)
- [ ] All Docker files are committed:
  - [ ] `Dockerfile`
  - [ ] `docker-compose.yml`
  - [ ] `.dockerignore`
  - [ ] `scripts/docker-entrypoint.sh`
  - [ ] `DOCKER.md`

---

## Render (Step-by-Step)

### 1. Create Render Account
- [ ] Go to https://render.com
- [ ] Sign up with GitHub
- [ ] Connect your GitHub account

### 2. Create Web Service
- [ ] Click **New +** → **Web Service**
- [ ] Select your repository
- [ ] Click **Connect**

### 3. Configure
- [ ] **Name:** `crm-app` (or your choice)
- [ ] **Environment:** Docker
- [ ] **Region:** Choose closest to users
- [ ] **Plan:** Starter ($7/month) or higher
- [ ] **Build Command:** (leave empty; uses Dockerfile)
- [ ] **Start Command:** (leave empty; uses Dockerfile)

### 4. Add Environment Variables
In the **Environment** section, add:

```
NODE_ENV = production
PORT = 5173
HOST = 0.0.0.0
CORS_ORIGINS = https://your-domain.com
```

(Leave `DATABASE_URL` empty; defaults to `/app/data/crm.db`)

### 5. Deploy
- [ ] Click **Create Web Service**
- [ ] Wait 3–5 minutes for build and deploy
- [ ] Check **Logs** tab for any errors
- [ ] Visit the URL (e.g., `https://crm-app.onrender.com`)

### 6. First Run
- [ ] App loads at the URL
- [ ] Database migrations complete (check Logs)
- [ ] Sign in with default credentials (if set up)
- [ ] Create a test record to verify database works

### 7. Set Up Backups (Render Limitation)
Render's file system is ephemeral (data deleted on redeploy). Set up daily backups:

**Option A: S3 Backup (Recommended)**
- [ ] Create AWS S3 bucket
- [ ] Generate AWS credentials
- [ ] Add `scripts/backup-to-s3.sh` and trigger it via GitHub Actions or external cron
- See `docs/DEPLOYMENT.md` for details

**Option B: Render Persistent Disk (Premium)**
- [ ] Upgrade to Render Pro
- [ ] Add persistent disk
- [ ] Update `DATABASE_URL` to use persistent path

### 8. Connect Custom Domain
- [ ] In Render dashboard, go to your service → **Settings** → **Custom Domains**
- [ ] Add your domain (e.g., `crm.yourcompany.com`)
- [ ] Update DNS to point to Render (they give you the CNAME)
- [ ] SSL/TLS automatic (via Let's Encrypt)

---

## Fly.io (Step-by-Step)

### 1. Install flyctl
- [ ] Follow https://fly.io/docs/hands-on/install-flyctl/
- [ ] Run `fly auth login`

### 2. Create App
```bash
fly launch --dockerfile
```

- [ ] App name: `crm-app` (or your choice)
- [ ] Region: closest to you
- [ ] Add Postgres: **No** (we use SQLite)
- [ ] Save config: **Yes**

### 3. Configure fly.toml
- [ ] Edit `fly.toml`:
  ```toml
  [[mounts]]
  source = "crm_data"
  destination = "/app/data"
  ```

- [ ] Create the volume:
  ```bash
  fly volumes create crm_data -s 10  # 10GB
  ```

### 4. Add Environment Variables
```bash
fly secrets set NODE_ENV=production
fly secrets set CORS_ORIGINS=https://your-domain.com
```

### 5. Deploy
```bash
fly deploy
```

- [ ] Wait for build and deploy
- [ ] Check logs: `fly logs`
- [ ] Visit URL: `https://crm-app.fly.dev`

### 6. Custom Domain
```bash
fly certs create crm.yourcompany.com
```

- [ ] Update DNS CNAME to Fly's nameservers

---

## Railway (Step-by-Step)

### 1. Create Account
- [ ] Go to https://railway.app
- [ ] Sign up with GitHub

### 2. Create New Project
- [ ] Click **New** → **GitHub Repo**
- [ ] Connect your GitHub account
- [ ] Select your repository

### 3. Configure
- [ ] Railway auto-detects the Dockerfile
- [ ] Go to **Environment** tab
- [ ] Add variables:
  ```
  NODE_ENV=production
  CORS_ORIGINS=https://your-domain.com
  ```

### 4. Deploy
- [ ] Railway auto-deploys on every push to main
- [ ] Check **Deployment** tab for status
- [ ] Check **Logs** for any errors

### 5. Get URL and Custom Domain
- [ ] Go to **Settings** → **Domain**
- [ ] Copy the auto-generated URL
- [ ] Or add custom domain (requires DNS update)

### 6. Data Backup (Railway Limitation)
- [ ] Data is ephemeral; set up S3 backups (see `docs/DEPLOYMENT.md`)
- [ ] Or upgrade to Railway Pro for persistent storage

---

## Post-Deploy

### Verify Everything Works
- [ ] App loads at the URL
- [ ] Sign in works
- [ ] Create a test record
- [ ] Database query works (check audit log or view data)
- [ ] Health check passes (check platform dashboard)

### Set Up Monitoring
- [ ] Enable platform's error tracking (Render, Fly, Railway dashboards)
- [ ] Optional: Connect Sentry for error notifications: https://sentry.io
- [ ] Optional: Set up uptime monitoring: https://uptimerobot.com (free tier)

### Team Access
- [ ] Share the app URL with team
- [ ] Create user accounts
- [ ] Test multi-user access

### Backups
- [ ] If using S3: verify first backup succeeded (check S3 bucket)
- [ ] Set up backup restore test (once a month)

---

## Common First-Deploy Issues

| Issue | Fix |
|-------|-----|
| **Build fails** | Check Logs tab; usually missing dependencies or Prisma schema issue |
| **App won't start** | Check Logs; likely DATABASE_URL or CLIENT_DIST path wrong |
| **Can't access the app** | Wait 2–3 minutes (sometimes the platform is still starting the container) |
| **Health check fails** | App may still be starting migrations; wait 1–2 minutes and refresh |
| **Database is empty** | First deploy runs migrations to create tables; this is normal |
| **Sign in fails** | Check database was created; look in Logs for Prisma errors |

---

## Scaling Later

**If you outgrow SQLite:**

1. Add PostgreSQL to your platform (most support it as a service)
2. Set `DATABASE_URL` to the PostgreSQL connection string
3. Run `npm run prisma -- migrate deploy` (Prisma handles the rest)
4. Deploy
5. Done — no code changes needed

---

## Questions?

- **Quick start:** See `DOCKER.md`
- **Detailed guide:** See `docs/DEPLOYMENT.md`
- **Platform help:**
  - Render: https://render.com/docs
  - Fly: https://fly.io/docs
  - Railway: https://docs.railway.app

---

## First Deploy

**Recommended:** Start with Render (fastest, most straightforward).

Steps:
1. [ ] Push to GitHub
2. [ ] Go to Render, create Web Service, connect repo
3. [ ] Configure (see "Render Step-by-Step" above)
4. [ ] Deploy
5. [ ] Verify app works
6. [ ] Set up backups (if using Render)
7. [ ] Share URL with team

**Total time: ~10 minutes.**
