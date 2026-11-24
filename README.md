# CRM System

A browser-based CRM for managing people, companies, a sales pipeline, contacts (calls, emails, meetings and notes), and follow-up tasks. Built as a monorepo with a NestJS + Prisma + SQLite backend and a React + Vite + TypeScript frontend.

## Features

- **Users & role profiles** — No public sign-up: people with the "Manage users" permission invite users, who choose their own password at first sign-in. Each user has one **role profile**, a named set of permissions (see below).
- **People & Companies** — full CRUD with search, filtering, and relationship views
- **Sales Pipeline** — Kanban board with drag-and-drop stage changes, plus a table view
- **Contacts** — log emails, calls, meetings, and notes against people or deals. Each contact has a **Follow up** button that creates a task from it
- **Tasks** — follow-up tasks with due dates, priority, status, and assignment. A task can come from a contact, and a deal can have any number of tasks. The Tasks page lists open deals beside tasks (filter: tasks and deals, tasks only, open deals only)
- **Reference lists** — the fixed choices used across the app (company industries, deal stages, contact types, task statuses, task priorities) are managed in the UI: add, rename, recolour, reorder, retire, set a default, and (for industries) choose whether a record may have one value or several. See [Reference lists](#reference-lists) below.
- **Dashboard** — KPI cards, pipeline breakdown, upcoming tasks, recent contacts
- **Duplicate a deal** — a copy button on every deal (board, table and the deal's own page) opens the new deal already filled in, with the title selected; type a name and press Enter. The copy starts at the default stage, owned by you, without the original's contacts, tasks or history.
- **Dashboard drill-down** — click any top-line card (people, companies, open deals, pipeline value, weighted forecast) to analyse the rows behind it: search, filter by any field, group by any field or by month, chart, sort, choose columns, and export to CSV. Click a group or a pipeline stage to narrow further. The address keeps your choices, so a view can be bookmarked or shared.
- **Audit log** — every create, change and delete of every record, with who made it, when, and each field's old and new value (Settings → Audit log, and a History card on each person, company and deal). Also sign-ins, failed sign-ins, exports and backups. Passwords are never recorded. Entries cannot be edited or deleted. See [Audit log](#audit-log) below.
- **Global Search** — live search across people, companies, and deals
- **CSV Import/Export** — export people and import them with per-row error reporting
- **Admin Settings** — manage users and roles, manage reference lists, edit your profile
- **Appearance** — light/dark/system mode, accent colour (presets or any custom colour), font, text size, corner style, and glow (None, Light, Medium, Full, Too much: a halo in the accent colour around cards and primary buttons). Admins set an organisation default; each user can override it for themselves. Changes preview live, and a readability check flags low-contrast colours. Fonts use system font stacks, so nothing is downloaded.

## Tech Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Backend    | NestJS 10, Prisma 5, SQLite, Passport JWT, class-validator |
| Frontend   | React 18, Vite 5, TypeScript, TanStack Query/Table, React Router, Tailwind, shadcn-style UI |
| Testing    | Jest + Supertest (backend), Vitest + Testing Library (frontend) |

## Project Structure

```
/server    NestJS API; in always-on mode it also serves the built client
/client    React SPA
/scripts   Always-on supervisor and management script (Windows)
```

## Getting Started

From the repo root:

```bash
npm install                 # installs server + client workspaces
npm run build               # build both apps (optional, verifies compilation)
```

Set up secrets and the database, as described under [Secrets and data](#secrets-and-data). Then, from `/server`:

```bash
cd server
npx prisma migrate deploy   # create the schema in the database
npx prisma db seed          # sample data; WIPES existing data
```

The seed creates `admin@crm.com` and `rep@crm.com` with random temporary passwords, written to `%LOCALAPPDATA%\CRM\sign-in-details.txt`. Each person must choose their own password at first sign-in. Delete that file afterwards.

## Role profiles and permissions

A role profile is a named set of permissions. Manage them in **Settings → Role profiles**, and assign them when you invite someone or from the Users table.

**Permissions**
- For each of people, companies, deals, contacts, and tasks: **view, create, edit, delete**. Create, edit, and delete need view, so ticking one ticks view.
- **Administration:** manage users, manage role profiles, manage reference lists, organisation appearance, import CSV, export CSV, view audit log, view data model, edit data model.

Everyone signed in can *read* the reference lists (forms need them to show their options); only **manage reference lists** allows changing them.

**Built-in profiles**
- **Administrator:** always has every permission, including any added later. Locked: it can't be edited or deleted.
- **Sales Rep:** the same access reps had before profiles existed. You can edit or delete it.
- Existing users were moved onto these automatically.

**Rules**
- **Server-enforced:** every request is checked against the person's current profile, so changes apply immediately without signing in again. The app also hides what you can't use.
- **No escalation:** you can only create, edit, or hand out profiles whose permissions you hold yourself, and you can't manage someone with more access than you.
- **No lockout:** you can't change your own profile or edit the one you use, and there must always be at least one Administrator.
- **Safe deletes:** a profile that people still use can't be deleted.
- **Data model editing** also needs `SCHEMA_EDITING_ENABLED` switched on (see below).

## Reference lists

Several fields are fixed choices rather than free text. They're managed in **Settings → Reference lists** (needs the "Manage reference lists" permission):

- **Company industries** — can be single-choice or multi-choice per company (toggle in the list).
- **Deal stages** — each has an **outcome** (Open, Won, or Lost). The dashboard's "open deals" and pipeline value follow the Open outcome, so renaming or adding stages just works.
- **Contact types** — each has an icon (call, email, meeting, note).
- **Task statuses** — each has a **counts as done** flag, used for overdue and upcoming-task logic.
- **Task priorities.**

For each value you can set its name, colour, and order, mark it as the list default, and retire it (hidden from new records but kept on existing ones) or delete it when nothing uses it.

**Enforced in the database, not just the app.** Records reference these values by id through foreign keys, and SQLite triggers/indexes hold the rules for every client (app, API, imports, direct database access):

- A record can't use a value that doesn't exist, and a value in use can't be deleted (retire it instead).
- A retired value can't be newly chosen.
- Required lists always keep at least one active value and exactly one default.
- Single-vs-multiple is enforced for industries; switching to single is refused while any company still has several.
- Names are required, unique per list (case-insensitive), and length-limited; a deal stage's outcome must be Open, Won, or Lost.

Because Prisma can drop triggers when it recreates a table during a migration, the server re-creates any missing rule at startup and refuses to serve requests if it can't.

## Secrets and data

Nothing secret is kept in the project folder, which is synced by OneDrive. Everything sensitive lives in `%LOCALAPPDATA%\CRM`, which only your Windows account (plus SYSTEM and administrators) can read:

| File | Contents |
| ---- | -------- |
| `crm.env` | `JWT_SECRET` (random, at least 32 characters) and `SCHEMA_EDITING_ENABLED` |
| `crm.db` | The SQLite database |
| `sign-in-details.txt` | Temporary passwords from the seed or reset tool. Delete it once used. |

`server\.env` holds only `DATABASE_URL`, which points at `crm.db`. The server refuses to start if `JWT_SECRET` is missing, too short, or a known placeholder.

**Locked out?** From `/server`, run `npm run reset-password -- you@example.com`, or `npm run reset-password -- --admins` for everyone on the Administrator profile. New temporary passwords go to `sign-in-details.txt`, and the accounts' existing sessions are ended.

**Schema editor:** off by default. To change the data model, set `SCHEMA_EDITING_ENABLED="true"` in `crm.env`, restart, make your changes, then set it back to `"false"`.

## Deployment (Docker)

The app is containerized and ready for production deployment on any platform (Render, Fly.io, Railway, AWS, etc.).

**Local testing:**
```bash
docker-compose up --build
```

Then visit `http://localhost:5173`. Data persists in Docker volumes across restarts.

**Production deployment:** See `DOCKER.md` (5-minute quick start) or `docs/DEPLOYMENT.md` (detailed guide for all platforms).

---

## Always-on mode (Windows)

The CRM runs as one compiled process at http://localhost:5173, which serves both the app and the API, with no dev servers. A supervisor keeps it running:
- **Startup:** Task Scheduler starts it 30 seconds after you sign in to Windows.
- **Before each start:** it builds if there's no build yet, applies pending database migrations, and regenerates the Prisma client.
- **Recovery:** it restarts the app if the process exits or the health check stops responding, and backs off if it keeps crashing.

```powershell
.\scripts\crm-services.ps1 status      # what's running and whether it responds
.\scripts\crm-services.ps1 restart     # restart (also reloads the Prisma client)
.\scripts\crm-services.ps1 update      # rebuild from the current code, then restart
.\scripts\crm-services.ps1 stop        # stays stopped until you run start (or you next sign in to Windows)
.\scripts\crm-services.ps1 start
.\scripts\crm-services.ps1 install     # set up automatic start (already done)
.\scripts\crm-services.ps1 uninstall   # remove automatic start
```

Logs are in `logs\`. After a schema-editor change says a restart is needed, run `restart`.

## Developing

Run `crm-services.ps1 stop` first, because the dev servers use the same port. Then, from the repo root:

```bash
npm run dev                 # API on 3001, Vite on 5173 with hot reload
```

When you're done, run `crm-services.ps1 update` to rebuild and go back to always-on mode.

## Testing

```bash
# Backend (from /server)
npm test                              # unit tests
powershell -File scripts\run-e2e.ps1  # e2e tests against a throwaway database

# Frontend (from /client)
npm test                              # component/unit tests
```

## Settings

Settings has a menu on the left and one page per section, limited to what your role profile allows:

- **You:** My details, Appearance
- **Organisation:** Users, Role profiles, Reference lists, Backups
- **Advanced:** Data model

To add a section, add one entry to `client/src/components/settings/settingsSections.ts` and one route in `App.tsx`.

## Backups

The app saves a copy of the whole database automatically: shortly after it starts if the newest is over a day old, and then checked hourly. Each copy is opened and integrity-checked before it is kept, and a failed backup never stops the app. They are stored in `%LOCALAPPDATA%\CRM\backups` (outside the synced project folder, because they contain customer data). The newest 14 automatic, 10 manual and 5 pre-update copies are kept.

- **See them / back up now:** Settings → Backups (needs the "Manage backups" permission).
- **Before updates:** if database updates are waiting when the app starts, a safety copy is saved first.
- **Restore:** `.\scripts\restore-backup.ps1 -List`, then `.\scripts\restore-backup.ps1 -Name <file>` (or `-Latest`). It stops the app, saves your current data as a safety copy, restores, and starts the app, so a restore can itself be undone.
- Backups live on the same computer. They protect against mistakes and bad updates, not against losing the machine, so copy the folder somewhere else now and then.
- Check the scripts with `.\scripts\selftest-backup.ps1` (uses throwaway files only).

## Deal stage history

Moving a deal to another stage needs a **comment** (drag-and-drop on the board, the stage buttons on a deal, or the stage field when editing). The comment is saved with the date and time, who moved it, and the old and new stage, and shows in the deal's **Stage history**.

This is enforced by the database as well as the app: a stage can't be changed without a comment record, each comment authorises one move only, and history can't be edited or deleted (it goes only if its deal is deleted). Deals moved before this feature have no history; it starts with the next move.

## Sales forecast

Each deal stage has a **win chance** (Settings → Reference lists; Won is always 100% and Lost always 0%). The dashboard shows the **weighted forecast** (amount × win chance, open deals only) and a **Forecast by close month** card, with separate rows for overdue deals and deals with no close date. Project plan, backlog and acceptance records are in `docs/PROJECT.md`.

## Audit log

The database itself keeps the history, so nothing that changes data can skip it: the app, an import, a script, or a side effect such as a task losing its person when that person is deleted.

- **What is recorded:** a create (all the starting values), each field that really changed (old and new value), a delete (all the values it had). A save that changes nothing records nothing. Company industries show as a change to the company.
- **Who:** the signed-in user making the request. A change made by a script or the scheduled backup shows as *System*.
- **Not recorded:** passwords and the automatic last-saved stamp. Reading is not recorded.
- **How:** SQLite triggers write to the udit_log table. They are built when the server starts from the tables and columns that exist, so a new table or field is covered automatically. Other database rules refuse any edit or delete of udit_log.
- **Seeing it:** Settings → Audit log (filter by person, kind of record, action and dates), and a History card on person, company and deal pages. Both need the *View audit log* permission.
- **Size:** it only grows. A few hundred bytes per change, so a small business will not notice it.
- **Developers:** a migration that recreates a table drops that table's audit triggers; the server puts them back at the next start. Always rehearse migrations on a copy of the live database first (see docs/PROJECT.md).

## Notes

- Deal stage, contact type, and task status/priority are **reference tables** linked by foreign key (managed in Settings → Reference lists), not free text. The few remaining enum-like string fields (such as a stage's Open/Won/Lost outcome) are validated with `class-validator` and by database triggers, since SQLite has no Prisma enums.
- In development, the Vite dev server proxies `/api` to `http://127.0.0.1:3001`. IPv4 is used intentionally to avoid `localhost` resolving to IPv6 on Windows.
- The server listens on 127.0.0.1 only. Set `HOST=0.0.0.0` to expose it on the network, and only do that behind HTTPS.
- The e2e tests run against a throwaway database so they never touch live data: `server\scripts\run-e2e.ps1` builds a fresh SQLite file from the migrations and seed, runs the suite against it, and deletes it afterwards. (Running `npx jest --config ./test/jest-e2e.json` directly would use whatever `DATABASE_URL` is set, so prefer the script.)
- CSV exports prefix cells that start with `=`, `+`, `-` or `@` with a quote, so they open in Excel as text, not formulas.
