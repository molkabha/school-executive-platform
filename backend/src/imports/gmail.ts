import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Buffer } from 'buffer';
import jwt from 'jsonwebtoken';
import { decryptSecret, encryptSecret } from '../utils/encryption';
import { assertImportFileWithinLimit } from './parser';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GmailConnectionConfig {
  label?: string;
  sender?: string;
  subject?: string;
  dateFrom?: string;
  dateTo?: string;
  attachmentOnly?: boolean;
  attachmentTypes?: string[] | string;
  refreshToken?: string;
  connectedEmail?: string;
  verifiedAt?: string;
}

export interface GmailAttachmentFile {
  messageId: string;
  threadId?: string;
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  messageSubject?: string;
  from?: string;
  date?: string;
  buffer?: Buffer;
}

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export function loadGoogleOAuthConfig(): GmailOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth configuration is not complete. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGmailAuthUrl(sourceId: string, userId: string) {
  const config = loadGoogleOAuthConfig();
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured.');
  }
  const state = jwt.sign({ sourceId, userId, purpose: 'gmail_oauth' }, jwtSecret, { expiresIn: '10m' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

function decodeState(state: string) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured.');
  }

  const parsed = jwt.verify(state, jwtSecret) as {
    sourceId: string;
    userId: string;
    purpose: string;
  };

  if (parsed.purpose !== 'gmail_oauth') {
    throw new Error('Invalid Gmail OAuth state.');
  }

  return parsed;
}

export function verifyGmailState(state: string) {
  return decodeState(state);
}

async function tokenRequest(params: Record<string, string>) {
  const config = loadGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...params,
  });

  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google OAuth token request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  }>;
}

export async function exchangeGmailCode(code: string) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
  });
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const response = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decryptSecret(refreshToken),
  });
  return response.access_token;
}

async function gmailApiFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gmail API request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchGmailProfile(accessToken: string) {
  return gmailApiFetch<{ emailAddress: string }>('profile', accessToken);
}

export function buildGmailQuery(config: GmailConnectionConfig) {
  const parts: string[] = [];
  if (config.label) parts.push(`label:${config.label}`);
  if (config.sender) parts.push(`from:${config.sender}`);
  if (config.subject) parts.push(`subject:(${config.subject})`);
  if (config.dateFrom) parts.push(`after:${config.dateFrom}`);
  if (config.dateTo) parts.push(`before:${config.dateTo}`);
  if (config.attachmentOnly !== false) parts.push('has:attachment');
  return parts.join(' ');
}

function normalizeAttachmentTypes(value: string[] | string | undefined) {
  if (!value) return ['.xlsx', '.xls', '.csv'];
  if (Array.isArray(value)) return value;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function isSupportedAttachment(fileName: string, mimeType: string | null, allowedTypes?: string[]) {
  const lower = fileName.toLowerCase();
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  const supported = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ['.xlsx', '.xls', '.csv'];
  const extensionAllowed = supported.includes(extension);
  const mimeAllowed = !mimeType || [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ].some((allowed) => mimeType.includes(allowed));
  return extensionAllowed && mimeAllowed;
}

function collectParts(message: any, output: Array<{ filename: string; mimeType: string | null; attachmentId: string; size: number }> = []) {
  const payload = message?.payload;
  if (!payload) return output;

  const visit = (part: any) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      output.push({
        filename: part.filename,
        mimeType: part.mimeType || null,
        attachmentId: part.body.attachmentId,
        size: Number(part.body.size || 0),
      });
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) visit(child);
    }
  };

  visit(payload);
  return output;
}

function headerValue(message: any, name: string) {
  const headers = message?.payload?.headers || [];
  const entry = headers.find((header: any) => String(header.name || '').toLowerCase() === name.toLowerCase());
  return entry?.value || '';
}

export async function listGmailMessages(accessToken: string, query: string) {
  return gmailApiFetch<{ messages?: Array<{ id: string; threadId?: string }> }>(`messages?q=${encodeURIComponent(query)}&maxResults=20`, accessToken);
}

export async function getGmailMessage(accessToken: string, messageId: string) {
  return gmailApiFetch<any>(`messages/${messageId}?format=full`, accessToken);
}

export async function downloadGmailAttachment(accessToken: string, messageId: string, attachmentId: string) {
  const payload = await gmailApiFetch<{ data?: string; size?: number }>(`messages/${messageId}/attachments/${attachmentId}`, accessToken);
  const buffer = Buffer.from(payload.data || '', 'base64url');
  assertImportFileWithinLimit(buffer.byteLength);
  return buffer;
}

export async function resolveGmailAttachments(accessToken: string, config: GmailConnectionConfig) {
  const query = buildGmailQuery(config);
  const listing = await listGmailMessages(accessToken, query);
  const messages = listing.messages || [];
  const files: GmailAttachmentFile[] = [];
  const allowedTypes = normalizeAttachmentTypes(config.attachmentTypes);

  for (const messageRef of messages) {
    const message = await getGmailMessage(accessToken, messageRef.id);
    const attachments = collectParts(message);
    for (const attachment of attachments) {
      if (!isSupportedAttachment(attachment.filename, attachment.mimeType, allowedTypes)) continue;
      const buffer = await downloadGmailAttachment(accessToken, messageRef.id, attachment.attachmentId);
      files.push({
        messageId: messageRef.id,
        threadId: messageRef.threadId,
        attachmentId: attachment.attachmentId,
        fileName: attachment.filename,
        mimeType: attachment.mimeType,
        size: buffer.byteLength,
        messageSubject: headerValue(message, 'Subject'),
        from: headerValue(message, 'From'),
        date: headerValue(message, 'Date'),
        buffer,
      });
    }
  }

  return files;
}

export function encryptGmailRefreshToken(refreshToken: string) {
  return encryptSecret(refreshToken);
}
