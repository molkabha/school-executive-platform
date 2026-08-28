# Backend

Backend service for the executive school supervision platform.

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Apply database migrations: `npm run prisma:migrate:deploy`
5. Seed initial data: `npm run seed`
6. Run locally: `npm run dev`

## API Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/schools`
- `GET /api/staff/modules`
- `GET /api/sources`
- `GET /api/sources/modules`
- `POST /api/sources`
- `POST /api/sources/test-connection`
- `PUT /api/sources/:id/connect`
- `GET /api/imports/batches`
- `GET /api/imports/batches/:id`
- `POST /api/imports/batches/:id/rollback`
- `POST /api/imports/sources/:sourceId/preview`
- `POST /api/imports/sources/:sourceId/import`
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`
- `POST /api/reports/generate`
- `GET /api/alerts`
- `GET /api/config`
- `PUT /api/config/:key`
- `POST /api/ai/analyze`
- `POST /api/ai/report`

## Notes

- Report generation saves the structured `aiOutput` to the database.
- Report viewing reads the saved JSON only and does not call AI.
- Printing is handled in the browser with standard print CSS.
