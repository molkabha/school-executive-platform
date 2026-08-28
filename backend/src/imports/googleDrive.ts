import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { MAX_IMPORT_BYTES, assertImportFileWithinLimit } from './parser';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface GoogleDriveCredentials {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

export function extractDriveId(ref: string): string | null {
  const input = ref.trim();
  if (!input) return null;
  if (!input.includes('http')) return input;

  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const fileMatch = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const queryMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  return null;
}

export function loadGoogleDriveCredentials(): GoogleDriveCredentials {
  const fromJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  if (fromJson) {
    const parsed = JSON.parse(fromJson) as { client_email?: string; private_key?: string; token_uri?: string };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.');
    }

    return {
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
      tokenUri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
    };
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error('Google Drive service account credentials are not configured.');
  }

  return {
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    tokenUri: process.env.GOOGLE_DRIVE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
  };
}

async function fetchAccessToken(creds: GoogleDriveCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: creds.clientEmail,
      scope: DRIVE_SCOPE,
      aud: creds.tokenUri,
      iat: now,
      exp: now + 3600,
    },
    creds.privateKey,
    { algorithm: 'RS256' }
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetchWithTimeout(creds.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}.`);
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Google token exchange did not return an access token.');
  }

  return data.access_token;
}

async function googleDriveFetch<T>(path: string, params: Record<string, string | number | boolean | undefined>, accessToken: string): Promise<T> {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Drive API request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export async function testGoogleDriveConnection(reference: string, fileId?: string | null) {
  const folderOrFileId = fileId || extractDriveId(reference);
  if (!folderOrFileId) {
    throw new Error('Unable to determine a Google Drive folder or file ID from the configured reference.');
  }

  const DRIVE_ID_RE = /^[a-zA-Z0-9_-]+$/;
  if (!DRIVE_ID_RE.test(folderOrFileId)) {
    throw new Error('Invalid Google Drive file or folder ID format.');
  }

  const creds = loadGoogleDriveCredentials();
  const accessToken = await fetchAccessToken(creds);

  if (reference.toLowerCase().includes('/folders/') || !fileId) {
    const folderListing = await googleDriveFetch<{ files: GoogleDriveFile[] }>('files', {
      q: `'${folderOrFileId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime,size,md5Checksum,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 10,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    }, accessToken);

    return {
      kind: 'folder' as const,
      folderId: folderOrFileId,
      files: folderListing.files || [],
    };
  }

  const file = await googleDriveFetch<GoogleDriveFile>(`files/${folderOrFileId}`, {
    fields: 'id,name,mimeType,modifiedTime,size,md5Checksum,webViewLink',
    supportsAllDrives: true,
  }, accessToken);

  return {
    kind: 'file' as const,
    file,
  };
}

export async function resolveGoogleDriveSource(reference: string, fileId?: string | null) {
  const folderOrFileId = fileId || extractDriveId(reference);
  if (!folderOrFileId) {
    throw new Error('Unable to determine a Google Drive folder or file ID from the configured source.');
  }

  const DRIVE_ID_RE = /^[a-zA-Z0-9_-]+$/;
  if (!DRIVE_ID_RE.test(folderOrFileId)) {
    throw new Error('Invalid Google Drive file or folder ID format.');
  }

  const creds = loadGoogleDriveCredentials();
  const accessToken = await fetchAccessToken(creds);

  if (reference.toLowerCase().includes('/folders/') || !fileId) {
    const folderListing = await googleDriveFetch<{ files: GoogleDriveFile[] }>('files', {
      q: `'${folderOrFileId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime,size,md5Checksum,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 20,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    }, accessToken);

    const latestFile = (folderListing.files || []).find((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
        || file.mimeType === 'text/csv'
        || file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || file.mimeType === 'application/vnd.ms-excel';
    }) || folderListing.files?.[0];

    if (!latestFile) {
      throw new Error('No usable Excel or CSV files were found in the configured Google Drive folder.');
    }

    return {
      fileId: latestFile.id,
      fileName: latestFile.name,
      mimeType: latestFile.mimeType || null,
      size: latestFile.size ? Number(latestFile.size) : null,
      checksum: latestFile.md5Checksum || null,
      webViewLink: latestFile.webViewLink || null,
      accessToken,
    };
  }

  const file = await googleDriveFetch<GoogleDriveFile>(`files/${folderOrFileId}`, {
    fields: 'id,name,mimeType,modifiedTime,size,md5Checksum,webViewLink',
    supportsAllDrives: true,
  }, accessToken);

  return {
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType || null,
    size: file.size ? Number(file.size) : null,
    checksum: file.md5Checksum || null,
    webViewLink: file.webViewLink || null,
    accessToken,
  };
}

export async function downloadGoogleDriveFile(fileId: string, accessToken: string): Promise<Buffer> {
  const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }, 60_000);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Drive file download failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength)) {
      assertImportFileWithinLimit(parsedLength);
    }
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertImportFileWithinLimit(bytes.byteLength);
    return Buffer.from(bytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_IMPORT_BYTES) {
        await reader.cancel().catch(() => undefined);
        assertImportFileWithinLimit(total);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  assertImportFileWithinLimit(total);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export async function resolveGoogleSheetsSource(reference: string, fileId?: string | null) {
  const source = await resolveGoogleDriveSource(reference, fileId);
  if (source.mimeType === 'application/vnd.google-apps.spreadsheet' || source.fileName.toLowerCase().endsWith('.gsheet')) {
    const buffer = await exportGoogleSheetAsXlsx(source.fileId, source.accessToken);
    return {
      ...source,
      fileName: source.fileName.toLowerCase().endsWith('.xlsx') ? source.fileName : `${source.fileName}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.byteLength,
      buffer,
    };
  }

  const buffer = await downloadGoogleDriveFile(source.fileId, source.accessToken);
  return {
    ...source,
    buffer,
  };
}

export async function exportGoogleSheetAsXlsx(fileId: string, accessToken: string): Promise<Buffer> {
  const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }, 60_000);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Sheets export failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength)) {
      assertImportFileWithinLimit(parsedLength);
    }
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertImportFileWithinLimit(bytes.byteLength);
    return Buffer.from(bytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_IMPORT_BYTES) {
        await reader.cancel().catch(() => undefined);
        assertImportFileWithinLimit(total);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  assertImportFileWithinLimit(total);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}
