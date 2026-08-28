# School Executive Platform

A private internal executive platform for a single school organization, built for strategic supervision, data visibility, and AI-assisted reporting.

## Highlights

- Executive dashboard with consolidated KPIs and AI summaries
- AI report generation that saves the JSON output to the database
- Browser-based report viewing and print-to-PDF flow
- Data Center, staff monitoring, sources, documents, alerts, and settings

## Current Pages

- `/login` - login page
- `/` - executive dashboard
- `/assistant` - executive AI agent
- `/staff` - school monitoring
- `/sources` - data sources
- `/documents` - documents
- `/reports` - reports archive
- `/reports/:id` - saved report detail and print view
- `/alerts` - alerts
- `/data-center` - data center
- `/settings` - AI configuration

## Report Flow

1. Click `Generate Report` on `/reports`.
2. The backend runs AI once and stores the resulting `aiOutput` in the database.
3. Open a saved report from the archive or the detail page.
4. Use `Print / Download PDF` to open the browser print dialog.

## API Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/schools`
- `POST /api/schools`
- `POST /api/schools/bulk`
- `PUT /api/schools/:id`
- `DELETE /api/schools/:id`
- `GET /api/sources`
- `POST /api/sources`
- `POST /api/sources/test-connection`
- `PUT /api/sources/:id/connect`
- `PATCH /api/sources/:id/status`
- `DELETE /api/sources/:id`
- `GET /api/sources/modules`
- `GET /api/imports/batches`
- `GET /api/imports/batches/:id`
- `POST /api/imports/batches/:id/rollback`
- `POST /api/imports/sources/:sourceId/preview`
- `POST /api/imports/sources/:sourceId/import`
- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id`
- `DELETE /api/documents/:id`
- `POST /api/documents/:id/analysis`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`
- `POST /api/reports/generate`
- `GET /api/alerts`
- `POST /api/alerts`
- `PATCH /api/alerts/:id/status`
- `PATCH /api/alerts/:id/resolve`
- `DELETE /api/alerts/:id`
- `GET /api/staff/modules`
- `GET /api/staff/:module`
- `POST /api/staff/:module/entry`
- `GET /api/ai/config`
- `POST /api/ai/test`
- `POST /api/ai/report`
- `POST /api/agent/chat`
- `GET /api/agent/history`
- `DELETE /api/agent/history`
- `GET /api/agent/summary-today`
- `GET /api/config`
- `PUT /api/config/:key`
- `POST /api/config/bulk`

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env` with:

```text
VITE_API_URL=http://localhost:4000
VITE_ALLOW_CUSTOM_AI_BASE_URL=false
```

For Google Drive imports, also set these backend variables:

```text
GOOGLE_DRIVE_CLIENT_EMAIL=...
GOOGLE_DRIVE_PRIVATE_KEY=...
GOOGLE_DRIVE_TOKEN_URI=https://oauth2.googleapis.com/token
```

For Gmail imports, also set:

```text
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/sources/gmail/callback
FRONTEND_URL=http://localhost:5173
```

## Production Notes

- Use PostgreSQL in production.
- Keep `JWT_SECRET` and AI keys private.
- Build the frontend with `npm run build`.
- Build the backend with `npm run build` and run `node dist/index.js`.

## Render Deployment Configuration

To ensure database migrations are safely applied and `sourceRefs` issues are avoided on Render, configure your Web Service as follows:

- **Build Command:** `npm run render:build`
  *(This installs dependencies, generates the Prisma client, and compiles TypeScript)*
- **Pre-Deploy Command:** `npm run prisma:migrate:deploy`
  *(This safely applies database migrations before the new version starts handling traffic)*
- **Start Command:** `npm run render:start`
  *(This starts the Node process)*

### First login on a fresh production database

Migrations create the schema, not the data. `npm run seed` refuses to run when `NODE_ENV=production` (it's demo data, not meant for prod). On a brand-new production database there is no user yet, so run this **once**, from a shell with the production `DATABASE_URL` available (e.g. Render Shell), after migrations have applied:

```bash
ADMIN_EMAIL=supervisor@yourdomain.com \
ADMIN_PASSWORD='choose-a-strong-password' \
ADMIN_NAME='اسم المشرف العام' \
npm run create-admin
```

This creates exactly one `GENERAL_SUPERVISOR` account and does nothing else. It's safe to re-run — it no-ops if the email already exists. Change the default seed credentials before using them anywhere near production.
