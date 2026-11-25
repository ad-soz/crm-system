# Deployment & Database Migration Guide

## Critical Rule: Schema Changes Require Migrations

**Every time you modify the database schema, you must create and run a migration before deploying.**

This is non-negotiable. The app will fail to start if schema changes exist in code but migrations haven't been applied to the database.

## Workflow for Schema Changes

### 1. Modify Schema Locally
Edit `server/prisma/schema.prisma` with your changes.

### 2. Create a Migration
```bash
npx prisma migrate dev --name <descriptive_name>
```

Replace `<descriptive_name>` with something short and clear, e.g.:
- `add_company_website_field`
- `create_tasks_table`
- `add_contact_phone_index`

This command:
- Generates a SQL migration file in `server/prisma/migrations/`
- Applies the migration to your local SQLite database
- Regenerates the Prisma client

### 3. Test Locally
Verify the schema change works:
```bash
npm run dev
```

or via Docker:
```bash
docker-compose up
```

### 4. Commit to Git
```bash
git add server/prisma/migrations/
git commit -m "Add migration: <descriptive_name>"
```

**Always commit the migration files.** They are version-controlled and must be in the repo before deployment.

### 5. Deploy to Render
When you push to `main` (or your deployment branch), the Docker entrypoint automatically:
1. Runs `npx prisma migrate deploy` to apply any new migrations
2. Regenerates the Prisma client
3. Starts the app

If migrations have not been created or committed, the app will start with stale code and fail.

## Why This Matters

- **SQLite database is persistent** on Render via a Docker volume at `/app/data/crm.db`
- **Schema and data must stay in sync** — if code expects a column that doesn't exist in the database, the app crashes
- **Migrations are the bridge** between schema changes in code and actual database structure
- **Entrypoint runs migrations automatically** — but only if they exist in the repo

## Entrypoint Process (Already Set Up)

The file `scripts/docker-entrypoint.sh` runs:
1. `npx prisma migrate deploy` — applies all pending migrations
2. `npx prisma generate` — regenerates Prisma client based on schema
3. `npm run start` — starts the app

You do not need to manually run migrations on Render. Just make sure they're committed before pushing.

## Checklist Before Every Deployment

- [ ] Schema changes are in `server/prisma/schema.prisma`
- [ ] Migration created with `npx prisma migrate dev --name <name>`
- [ ] Migration files are committed in `server/prisma/migrations/`
- [ ] Tested locally (`npm run dev` or `docker-compose up`)
- [ ] Ready to push to GitHub and deploy on Render

## Troubleshooting

### App fails to start with Prisma errors
- Check Render logs: does `npx prisma migrate deploy` show errors?
- Verify migration files are in the repo (check GitHub).
- If in doubt, roll back to the last working commit and re-create the migration.

### Local SQLite is out of sync
- Delete `server/prisma/dev.db` and re-run `npm run dev` to start fresh.
- Or manually run `npx prisma migrate deploy` on the existing database.

### Need to roll back a migration (rare)
- In Render, manually reset the database (delete the volume and restart), or
- Create a new migration that reverses the previous one (best practice).
- Consult Prisma docs for `prisma migrate resolve` if needed.

## References
- Prisma Migrations: https://www.prisma.io/docs/orm/prisma-migrate/getting-started
- Current migrations: `server/prisma/migrations/`
- Deployment config: `Dockerfile`, `scripts/docker-entrypoint.sh`
