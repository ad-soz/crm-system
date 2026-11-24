# Docker Deployment Guide

This CRM is containerized and ready to deploy to any Docker-compatible platform.

## Local Testing

### Prerequisites
- Docker and Docker Compose installed

### Run locally
```bash
docker-compose up --build
```

The app will be available at `http://localhost:5173`.

**On first run:**
- Database migrations run automatically
- Prisma client is generated
- The app starts and serves the frontend and API from the same process

**Stop:**
```bash
docker-compose down
```

**Keep data between runs:**
Database and logs are stored in named volumes (`crm-data`, `crm-logs`), so they persist across restarts.

**View logs:**
```bash
docker-compose logs -f crm
```

---

## Production Deployment

### Option 1: Render (Recommended)

[Render](https://render.com) is the easiest. Free tier available, very straightforward.

**Steps:**

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) and sign in with GitHub
3. Click **New +** → **Web Service**
4. Connect your repository
5. Configure:
   - **Name:** `crm-app` (or your choice)
   - **Environment:** `Docker`
   - **Region:** closest to your users
   - **Plan:** Starter ($7/month) or higher
6. Add environment variables (optional, defaults work):
   ```
   NODE_ENV=production
   PORT=5173
   HOST=0.0.0.0
   DATABASE_URL=file:/var/data/crm.db
   ```
7. Click **Create Web Service**

Render will:
- Build the image from your Dockerfile
- Start the container
- Restart it if it crashes
- Provide a free `.onrender.com` domain or connect your own

**Backups:** Render's ephemeral file system means data is lost on deploy. Add a cron job to back up to S3:
```bash
# In a separate "Background Worker" service or external script
0 2 * * * /app/scripts/backup-to-s3.sh
```

---

### Option 2: Fly.io

[Fly.io](https://fly.io) is Docker-native and handles scaling well.

**Steps:**

1. Install `flyctl`: https://fly.io/docs/hands-on/install-flyctl/
2. In your project root:
   ```bash
   fly auth login
   fly launch --dockerfile
   ```
3. Answer prompts:
   - App name: `crm-app` (or your choice)
   - Region: closest to you
   - Add Postgres: **no** (SQLite is fine)
4. Edit `fly.toml` if needed (usually not)
5. Deploy:
   ```bash
   fly deploy
   ```

Your app will be live at `https://crm-app.fly.dev` (or your custom domain).

**Persistent storage:** Fly uses ephemeral storage. Add a volume:
```toml
# In fly.toml
[[mounts]]
source = "crm_data"
destination = "/app/data"
```

Then:
```bash
fly volumes create crm_data -s 10  # 10GB
fly deploy
```

---

### Option 3: Railway

[Railway](https://railway.app) is simple and has a generous free tier.

**Steps:**

1. Connect your GitHub repo at [railway.app](https://railway.app)
2. Click **New** → **GitHub Repo**
3. Select your repo
4. Railway auto-detects the Dockerfile
5. Add environment variables if desired
6. Deploy

Your app gets a URL like `https://crm-app.up.railway.app`.

**Data persistence:** Railway file storage is ephemeral. Use their PostgreSQL plugin for persistent data, or back up SQLite to S3 regularly.

---

### Option 4: AWS (Fargate or EC2)

For more control and scaling.

**Using Fargate (serverless containers):**
1. Push image to AWS ECR (Elastic Container Registry)
2. Create an ECS task definition pointing to that image
3. Create a Fargate service from the task definition
4. Attach an Application Load Balancer
5. Point your domain to the load balancer

**Using EC2:**
1. Launch an Ubuntu instance
2. Install Docker and Docker Compose
3. Clone your repo and `docker-compose up -d`
4. Use nginx in front with Let's Encrypt TLS
5. Set up CloudWatch monitoring

---

### Option 5: DigitalOcean App Platform

**Steps:**

1. Push to GitHub
2. At [DigitalOcean](https://www.digitalocean.com/products/app-platform)
3. Click **Create Apps** → connect GitHub repo
4. Configure:
   - **Source:** GitHub
   - **Repository:** select yours
   - **Branch:** main
   - **Source type:** Dockerfile
5. Set resource allocation and environment variables
6. Deploy

---

## Persistent Data

The database is stored at `/app/data/crm.db` inside the container. To ensure it survives:

### On Container Platforms (Render, Fly, Railway, etc.)

**Problem:** These platforms have ephemeral file systems; files created at runtime are lost on redeploy.

**Solution 1: Named volumes**
```yaml
# docker-compose.yml (for platforms that support it)
volumes:
  - crm-data:/data
```

**Solution 2: Back up to object storage (S3, Azure Blob, etc.)**

Create a backup script:
```bash
#!/bin/bash
# /app/scripts/backup-to-s3.sh
aws s3 cp /app/data/crm.db s3://my-bucket/backups/crm-$(date +%Y%m%d-%H%M%S).db
```

Run it via a cron job on the server, or trigger it from your app (e.g., every 12 hours).

**Solution 3: Use a managed PostgreSQL database**

Replace SQLite with PostgreSQL (more DevOps but guaranteed persistence):
```bash
DATABASE_URL=postgresql://user:pass@db.example.com:5432/crm
```

For now, stick with Solution 2 (S3 backups) or Solution 1 (volumes, if your platform supports it).

---

## Domain and TLS

### Set up a custom domain

1. Register a domain (e.g., `crm.yourcompany.com`)
2. Point the DNS to your platform's nameservers or IP
3. Each platform provides TLS automatically:
   - **Render, Railway, Fly:** automatic Let's Encrypt
   - **AWS, DigitalOcean:** either use their managed TLS or Certbot

### Behind a reverse proxy

If self-hosting, put nginx in front:
```nginx
server {
    listen 443 ssl;
    server_name crm.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/crm.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.yourcompany.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Monitoring and Logs

### Health checks

The Dockerfile includes a health check:
```bash
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5173/api/health', (r) => { ... })"
```

Each platform will restart the container if health checks fail.

### View logs

**Local (docker-compose):**
```bash
docker-compose logs -f crm
```

**On Render, Fly, Railway, etc.:**
- Use their web UI dashboard
- Or use the CLI:
  ```bash
  # Render
  render logs --service crm-app

  # Fly
  fly logs

  # Railway
  railway logs
  ```

### Send logs to external service

For production, ship logs to Sentry, LogRocket, Datadog, or similar:
```javascript
// In server/src/main.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

---

## Scaling

SQLite is fine for small teams. As you grow:

- **Up to ~10 users:** SQLite works well, no changes needed
- **10–100 users:** SQLite still works; consider daily backups to S3
- **100+ users:** Migrate to PostgreSQL, deploy multiple instances behind a load balancer

For PostgreSQL migration, see `server/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"  // Change from "sqlite"
  url      = env("DATABASE_URL")
}
```

Then run migrations with Prisma. The schema is the same; only the backend changes.

---

## First Deploy Checklist

- [ ] Environment variables set (or use defaults)
- [ ] `DATABASE_URL` points to persistent storage (or use S3 backups)
- [ ] Health checks pass in platform dashboard
- [ ] Domain and TLS configured
- [ ] Database migrations run on startup (see `docker-entrypoint.sh`)
- [ ] Logs visible in platform dashboard
- [ ] Manual backup scheduled (if not using volumes)
- [ ] Team can access the app

---

## Troubleshooting

### App won't start

1. Check logs: `docker-compose logs crm` or platform dashboard
2. Common issues:
   - **DATABASE_URL incorrect:** migrations fail silently
   - **PORT already in use:** try a different port
   - **Out of disk:** SQLite can't write; check container disk space
   - **Permissions:** logs directory not writable

### Database locked

SQLite locks during writes. Normally recovers in a few seconds. If persistent:
1. Check for hung processes: `ps aux | grep node`
2. Restart the container
3. If data corrupted, restore from backup

### Slow on first request

The first request triggers:
1. Prisma client generation (usually ~2s)
2. Database migration (a few seconds)

This is normal and happens once per deploy. Subsequent requests are fast.

---

## Questions?

- Render docs: https://render.com/docs
- Fly docs: https://fly.io/docs
- Railway docs: https://docs.railway.app
- Docker Compose: https://docs.docker.com/compose
