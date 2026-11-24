# Docker Troubleshooting Guide

## Local Testing (`docker-compose up`)

### Build fails

**Error:** `failed to load external module ts-node`

**Cause:** Node dependencies didn't install.

**Fix:**
```bash
docker-compose down
docker system prune -a  # remove all images
docker-compose up --build
```

---

### "Cannot find module" error

**Error:** `Error: Cannot find module '@nestjs/common'` or similar

**Cause:** `npm ci` failed during build, or node_modules got corrupted.

**Fix:**
```bash
docker-compose down -v  # -v removes volumes
docker-compose up --build
```

---

### App starts but can't sign in

**Errors:** 
- `Cannot GET /api/auth/login`
- `Unexpected token < in JSON at position 0`

**Cause:** Client build failed, so the API is trying to serve `index.html` to API requests.

**Fix:**
1. Check the client built: `ls client/dist/index.html`
2. Rebuild if needed: `npm run build -w client`
3. `docker-compose down && docker-compose up --build`

---

### "Database is locked" or migration fails

**Error:** 
- `database is locked`
- `UNIQUE constraint failed`
- `no such table: people` (after migration)

**Cause:** 
- Multiple processes writing to SQLite simultaneously
- Migration didn't run before the app started
- Database corrupted

**Fix:**
1. Stop: `docker-compose down`
2. Clear data: `docker volume rm k_crm-data`
3. Start fresh: `docker-compose up --build`

If persisting, the database may be corrupted:
```bash
# Inspect the volume
docker volume inspect k_crm-data
# Delete the .db file and try again
```

---

### "port 5173 is already in use"

**Error:** `Error: listen EADDRINUSE: address already in use :::5173`

**Cause:** Another process is using the port.

**Fix Option 1:** Stop the other thing
```bash
docker-compose down
```

**Fix Option 2:** Use a different port
Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:5173"  # local:container
```

Then visit `http://localhost:8080`.

---

### Logs show "ENOENT: no such file or directory, open '/app/data/crm.db'"

**Cause:** The `/app/data` directory wasn't created, or volume mount failed.

**Fix:**
```bash
docker-compose down -v
docker-compose up --build  # -v removes volumes, forcing a fresh start
```

---

### "Failed to verify health check"

**Error in logs:** `Health check for crm-app failed: exit code 1`

**Cause:** 
- App is still starting (migrations taking time)
- `/api/health` endpoint not responding

**Fix:** Wait 1–2 minutes. If persisting:
```bash
docker-compose logs crm  # see full logs
```

If `/api/health` doesn't exist, check the backend code and ensure it's compiled.

---

### Permission denied on `docker-entrypoint.sh`

**Error:** `/bin/sh: /app/docker-entrypoint.sh: Permission denied`

**Cause:** The script wasn't marked executable when copied.

**Fix:** Rebuild:
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

---

## Production Deployment

### Render

#### "Build failed"

**Check:**
1. Go to Render dashboard → Your service → **Logs**
2. Look for the first red error message

**Common causes:**
- `npm ERR! 404 Not Found`: a dependency doesn't exist (typo in `package.json`)
- `Error: ENOENT: no such file`: file referenced but doesn't exist (e.g., Prisma migrations folder)
- `Prisma error`: schema is invalid

**Fix:**
- Verify locally: `npm ci && npm run build`
- Check all files are committed and pushed
- Redeploy: Render dashboard → **Redeploy** (or just push to main again)

---

#### "Build succeeded but app won't start"

**Check logs:** Render dashboard → **Logs**

**Common issues:**
1. **DATABASE_URL invalid**
   - Render uses ephemeral file system; `/app/data/crm.db` works but data is lost on redeploy
   - Solution: Set up S3 backups or upgrade to persistent storage
   
2. **Migrations failed**
   - Check logs for Prisma errors
   - Try a manual migration in the entrypoint: `npx prisma migrate deploy`

3. **PORT conflict**
   - Set `PORT=5173` in environment variables

**Fix:**
- Check environment variables in Render dashboard
- Redeploy: Render dashboard → **Redeploy**

---

#### "Health checks failing"

**What to do:**
1. Wait 1–2 minutes (migrations may still be running)
2. Check logs for errors
3. If `/api/health` doesn't exist, the backend didn't build correctly

**Fix:** Redeploy manually: Render dashboard → **Redeploy**

---

#### "Data lost after redeploy"

**Why:** Render's file system is ephemeral (temporary).

**Solution:**
- **Backup to S3:** Set up automated backups (see `docs/DEPLOYMENT.md`)
- **Upgrade to Render Pro:** Persistent disk available
- **Switch platforms:** Fly.io and Railway support persistent volumes

---

### Fly.io

#### "Cannot allocate memory" or "out of memory"

**Cause:** App is too large for the free tier machine.

**Fix:**
```bash
fly scale memory 512  # increase to 512MB
```

---

#### "File not found" or "database locked"

**Cause:** Volume didn't mount or permissions are wrong.

**Check:**
```bash
fly ssh console
ls -la /app/data
```

**Fix:**
```bash
fly scale memory 512
fly volumes delete crm_data  # and recreate
fly volumes create crm_data -s 10
fly deploy
```

---

### Railway

#### "Build failed" or "app won't start"

Same as Render; check **Deployment** tab for logs.

---

## General Docker Issues

### "Docker daemon not running"

**Fix:**
- Windows: Start Docker Desktop app
- Linux: `sudo systemctl start docker`

---

### "command not found: docker"

**Fix:** Install Docker: https://docs.docker.com/get-docker/

---

### Image is huge (>1GB)

**Cause:** `node_modules` or build artifacts not excluded by `.dockerignore`.

**Fix:** Check `.dockerignore` includes:
```
node_modules
dist
coverage
```

Then rebuild: `docker-compose up --build`

---

### "cannot connect to Docker daemon"

**On Windows:**
- Docker Desktop not running
- Fix: Open Docker Desktop app

**On Linux:**
- Docker daemon stopped
- Fix: `sudo systemctl start docker`

---

## Debugging Steps

### 1. Check Logs

**Local:**
```bash
docker-compose logs -f crm
```

**Production:**
- Render: Dashboard → **Logs**
- Fly: `fly logs`
- Railway: Dashboard → **Logs**

### 2. Inspect Container

**Local:**
```bash
docker-compose exec crm sh
# Now you're inside the container
ls -la /app/data
ps aux  # see running processes
```

### 3. Check Environment

```bash
docker-compose exec crm env | grep -E "NODE_ENV|PORT|DATABASE_URL"
```

### 4. Test Health Endpoint

```bash
# From inside container
curl http://localhost:5173/api/health

# From host (local)
curl http://localhost:5173/api/health
```

### 5. Database

```bash
docker-compose exec crm sh
sqlite3 /app/data/crm.db ".tables"
```

---

## Still Stuck?

1. **Check all three sets of docs:**
   - `DOCKER.md` (quick start)
   - `docs/DEPLOYMENT.md` (detailed)
   - `DEPLOY-CHECKLIST.md` (step-by-step)

2. **Platform-specific help:**
   - Render: https://render.com/docs
   - Fly: https://fly.io/docs
   - Railway: https://docs.railway.app

3. **Docker docs:** https://docs.docker.com

4. **NestJS docs:** https://docs.nestjs.com

5. **Prisma docs:** https://www.prisma.io/docs
