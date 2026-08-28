# Import Integration

This repository now includes a reusable import pipeline for real school data.
The supported connectors are Google Drive, Google Sheets, Excel Upload, Gmail,
OneDrive, SharePoint, and Outlook. Each one retrieves or uploads real file
bytes server-side and hands them to the same parsing and validation pipeline
used for direct imports.

## Architecture

`Google Drive / Google Sheets / Excel Upload / Gmail / OneDrive / SharePoint / Outlook -> file bytes -> parser -> normalization -> validation -> dataset mapping -> database write -> batch log -> dashboard/report/AI`

The key design rule is that source connectors only provide bytes or
authenticated access. They do not contain dataset-specific business logic. The
import engine owns parsing, mapping, validation, deduplication, and writes.

## Supported Datasets

- `attendance`
- `housing`
- `complaints`
- `tasks`
- `meetings`
- `staff_modules`
- `schools`
- `kpi_snapshots`

Attendance is the first priority because the existing dashboard and alert logic
already understand it.

## Google Drive Approach

The implementation uses a Google Drive service account that reads only the
configured folder or file with the `drive.readonly` scope.

Why this approach:

- the backend can access Drive without exposing credentials to the browser
- folder/file access is server-side only
- service-account credentials are easy to lock down and rotate
- the same connector can later be extended to other providers without changing
  the import engine

Required backend environment variables:

- `GOOGLE_DRIVE_CLIENT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY`
- `GOOGLE_DRIVE_TOKEN_URI` (optional, defaults to Google'"'"'s token endpoint)
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (optional alternative to the split vars)

Google Sheets uses the same Drive access path, but exports a spreadsheet to
XLSX first via `files.export` before it enters the parser.

## Excel Upload Approach

Excel Upload uses a multipart upload endpoint that accepts a real `.xlsx`, `.xls`,
or `.csv` file from the browser, stores it temporarily, previews it with the
existing parser, and then imports it through the same engine used by Google Drive.

The upload is validated server-side for file size and file type before any
preview or import can happen.

## Gmail Approach

Gmail uses the official Gmail API and a backend OAuth 2.0 flow. The backend
stores only encrypted refresh tokens and reads attachments through the Gmail
API. It never scrapes Gmail HTML.

Required backend environment variables:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `FRONTEND_URL`

## Microsoft Graph Approach

OneDrive, SharePoint, and Outlook use the Microsoft identity platform v2.0 and
Microsoft Graph. The backend stores only encrypted refresh tokens and keeps the
same connector patterns as Gmail for OAuth state, callbacks, and token refresh.

Required backend environment variables:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID` (optional, defaults to `common`)
- `MICROSOFT_REDIRECT_URI`
- `FRONTEND_URL`

OneDrive and SharePoint resolve shared links or direct drive items before the
download step. Outlook searches messages with attachments and downloads only
supported `.xlsx`, `.xls`, and `.csv` attachments.

## Column Mapping

The importer does not assume a client-specific Excel schema.

Each dataset has a default alias map, and the preview endpoint can return the
detected headers so the real client file can be mapped later without rewriting
the pipeline.

Examples:

- `School Code -> School.code`
- `Attendance % -> StaffModuleEntry.attendanceRate`
- `Absence Count -> StaffModuleEntry.absenceCount`
- `Status -> StaffModuleEntry.status`
- `Notes -> StaffModuleEntry.notes`

## Import Batch Strategy

Every import creates an `ImportBatch` row plus per-row `ImportBatchItem`
records.

The batch captures:

- source
- file name
- dataset type
- import date
- row counts
- imported / updated / skipped / failed counts
- row-level errors
- the user who triggered the import

Rollback uses the stored row items:

- created rows are deleted
- updated rows are restored from the saved before-state

## File Format Requirements

- `xlsx` and `csv` are supported
- the first worksheet in an Excel file is used
- files must include headers
- file size is capped by the backend importer before parsing

## Security Notes

- Google credentials stay server-side
- Microsoft refresh tokens stay encrypted at rest
- imported school codes are resolved against the database, not trusted blindly
- the import route requires authenticated supervisor access
- row data is stored only as needed for rollback and diagnostics
- connection tests do not expose secrets to the frontend

## Local Development

1. Set the backend env vars in `backend/.env`.
2. Run `npm install` in `backend/` and `frontend/`.
3. Run `npm run prisma:generate` in `backend/`.
4. Run `npm run build` in both apps.
5. Run `npm run test:imports` in `backend/`.

## Later Configuration for a Real Drive

When the client shares the real Drive location:

1. Share the target folder with the service-account email.
2. Store the Drive folder URL or file URL on the source record.
3. Open the source page, run the live connection test, and verify the latest file.
4. Choose the dataset type.
5. Preview the file.
6. Confirm the mapping.
7. Run the import.

## Troubleshooting

- `Google Drive service account credentials are not configured.`
  - Set the backend env vars.
- `No usable Excel or CSV files were found in the configured Google Drive folder.`
  - Confirm the folder contains a supported file type.
- `Missing required columns`
  - Update the dataset mapping for the real client headers.
- `Unknown school code`
  - Make sure the school exists in the platform before importing rows for it.
