# Operations Guide

Concise reference for deploying, migrating, backing up, and recovering the
School Executive Platform. See also `docs/DATABASE-BACKUP.md` for backup
details and the root `README.md` for local setup and Render deployment
configuration.

## 1. Deployment (summary)

- **Backend:** Render Web Service.
  - Build: `npm run render:build` (installs deps, generates the Prisma
    client, compiles TypeScript).
  - Pre-Deploy: `npm run prisma:migrate:deploy` (applies migrations before
    the new version receives traffic).
  - Start: `npm run render:start`.
- **Frontend:** Vercel (see `frontend/vercel.json`).
- **Database:** Supabase PostgreSQL 17.

Full setup and environment variable steps are in the root `README.md`.

## 2. Migration procedure

Migrations are managed by Prisma and live in `backend/prisma/migrations/`.
This project does not auto-generate or apply migrations outside the
documented flow below — never run `prisma migrate dev` against production.

1. Develop and test the schema change locally against a disposable/dev
   database with `npx prisma migrate dev --name <description>`. This creates
   a new migration folder under `backend/prisma/migrations/`.
2. Commit the generated migration folder to version control as-is. Do not
   hand-edit generated SQL unless you fully understand the consequences.
3. In production, migrations are applied automatically by Render's
   **Pre-Deploy Command** (`npm run prisma:migrate:deploy`), which runs
   `prisma migrate deploy` — this only applies migrations that haven't run
   yet and never generates new ones or prompts interactively.
4. Verify after deploy: `npx prisma migrate status` (from a shell with the
   production `DATABASE_URL`) should report the database is up to date.

If a migration must be rolled back, write and deploy a new forward migration
that reverses the change — Prisma does not support automatic down-migrations
in production.

## 3. Backup

See `docs/DATABASE-BACKUP.md` for the full write-up. Summary:

- A GitHub Actions workflow (`.github/workflows/database-backup.yml`) runs
  `backend/scripts/backup-db.sh` daily (02:00 UTC) and on manual dispatch,
  producing a compressed `pg_dump` (`-Fc`) of the production database.
- The dump is uploaded as a GitHub Actions artifact and retained for
  **90 days** (`retention-days: 90`). Backups are never committed to the
  repository.
- The workflow authenticates using the `DATABASE_URL` GitHub secret, which
  is never logged or printed.

## 4. Recovery / restore procedure

1. Go to the **Actions** tab on GitHub → `Database Backup` workflow → select
   the run for the date you need → download the `database-backup-YYYY-MM-DD`
   artifact (a `.dump` file).
2. **Do not restore directly onto production without first verifying the
   target.** Restoring overwrites/replaces existing data.
3. Restore into the target database:
   ```bash
   pg_restore -d "postgresql://user:password@host:port/dbname" -1 --clean school-executive-YYYY-MM-DD.dump
   ```
   - `-1` / `--single-transaction` wraps the restore in one transaction, so
     either the whole restore succeeds or nothing is changed.
   - `--clean` drops existing objects before recreating them — this is
     destructive; only point it at the intended target database.
4. After restoring, run `npx prisma migrate status` against the restored
   database to confirm the migration history matches what the application
   expects before pointing traffic at it.
5. If restoring as part of incident response, rotate `JWT_SECRET` and
   `APP_ENCRYPTION_KEY` only if you have reason to believe they were
   compromised — rotating `APP_ENCRYPTION_KEY` will make existing encrypted
   API keys (AI provider keys stored via Settings) undecryptable and require
   re-entering them (see Security Assumptions below).

## 5. Admin bootstrap

On a brand-new production database (schema created, no users yet), run once
from a shell with the production `DATABASE_URL` available:

```bash
ADMIN_EMAIL=supervisor@yourdomain.com \
ADMIN_PASSWORD='choose-a-strong-password' \
ADMIN_NAME='اسم المشرف العام' \
npm run create-admin
```

This creates exactly one `GENERAL_SUPERVISOR` account and is safe to re-run
(no-ops if the email already exists). `npm run seed` is demo data only and
refuses to run when `NODE_ENV=production`.

## 6. Security assumptions

These are the assumptions the current implementation relies on — review
them before changing infrastructure or environment configuration:

- **Secrets never committed:** `JWT_SECRET`, `APP_ENCRYPTION_KEY`,
  `DATABASE_URL`, and AI provider API keys are supplied via environment
  variables / GitHub secrets only, never via `.env` files committed to the
  repo.
- **Placeholder secrets are rejected in production:** the backend refuses to
  start in production (`NODE_ENV=production`) if `JWT_SECRET` or
  `APP_ENCRYPTION_KEY` are missing or match a known placeholder value (see
  `backend/src/index.ts`).
- **AI provider API keys at rest:** stored encrypted (AES-256-GCM) via
  `backend/src/utils/encryption.ts`. New encryptions use a per-secret random
  salt with `scrypt` key derivation (v2 format); values encrypted before
  this change remain readable via the original (v1) derivation for backward
  compatibility — see the comments in that file before touching it. Changing
  `APP_ENCRYPTION_KEY` in production will make stored keys unreadable; they
  would need to be re-entered in Settings.
- **School data isolation:** enforced at the query layer (Prisma `where`
  clauses scoped by `schoolId`), not by separate databases/schemas. Some
  management views intentionally use an "OR schoolId IS NULL" pattern to
  surface organization-wide records alongside a specific school's records
  (documented inline in `routes/dashboard.ts`, `routes/sources.ts`,
  `routes/agent.ts`, `services/reportSummary.ts`) — this is by design, not a
  leak. See `backend/scripts/test-school-isolation.ts` for regression tests
  covering this behavior.
- **AI provider requests:** the Gemini provider URL-encodes the
  database-stored model name before building the request URL to avoid
  request/path injection from a value editable in Settings. No user-supplied
  URL is ever fetched server-side for the "Data Source connection test" —
  that step is explicitly format/URL-shape validation only, not a live
  network request, to avoid SSRF risk (see `DataSourceConnector.tsx`).
- **Auth transport:** the JWT is delivered via a secure `httpOnly` cookie,
  not `localStorage`, and `SameSite=None; Secure` is used in production for
  the cross-origin frontend/backend setup (Vercel + Render).
- **Failed login visibility:** failed login attempts are recorded in the
  existing `AuditLog` table (action `failed_login`) with the attempted email
  only — passwords, JWTs, and other credential material are never logged or
  persisted anywhere.
