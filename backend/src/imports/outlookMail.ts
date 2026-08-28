import { Buffer } from 'buffer';
import { assertImportFileWithinLimit } from './parser';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface OutlookConnectionConfig {
  sender?: string;
  subject?: string;
  dateFrom?: string;
  dateTo?: string;
  attachmentTypes?: string[] | string;
}

export interface OutlookAttachmentFile {
  messageId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  messageSubject?: string;
  from?: string;
  date?: string;
  buffer?: Buffer;
}

function normalizeAttachmentTypes(value: string[] | string | undefined) {
  if (!value) return ['.xlsx', '.xls', '.csv'];
  if (Array.isArray(value)) return value;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function isSupportedAttachment(fileName: string, mimeType: string | null, allowedTypes?: string[]) {
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

async function graphFetch<T>(path: string, accessToken: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft Graph API request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

function headerValue(message: any, name: string) {
  const headers = message?.internetMessageHeaders || [];
  const entry = headers.find((header: any) => String(header.name || '').toLowerCase() === name.toLowerCase());
  return entry?.value || '';
}

function collectAttachments(message: any, output: Array<{ id: string; name: string; contentType: string | null; size: number }> = []) {
  const attachments = message?.value || message || [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (attachment.name && attachment.id) {
      output.push({
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType || null,
        size: Number(attachment.size || 0),
      });
    }
  }
  return output;
}

export async function listOutlookMessages(accessToken: string, query: string) {
  const url = new URL('https://graph.microsoft.com/v1.0/me/messages');
  url.searchParams.set('$select', 'id,subject,from,receivedDateTime,hasAttachments,internetMessageHeaders');
  url.searchParams.set('$top', '20');
  url.searchParams.set('$filter', 'hasAttachments eq true');
  if (query.trim()) {
    url.searchParams.set('$search', `"${query.replace(/"/g, '\\"')}"`);
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: 'eventual',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft Outlook query failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<{ value?: Array<{ id: string }> }>;
}

export async function getOutlookMessage(accessToken: string, messageId: string) {
  return graphFetch<any>(`/me/messages/${messageId}?$select=id,subject,from,receivedDateTime,internetMessageHeaders`, accessToken);
}

export async function listOutlookAttachments(accessToken: string, messageId: string) {
  return graphFetch<{ value?: Array<{ id: string; name: string; contentType?: string; size?: number }> }>(
    `/me/messages/${messageId}/attachments?$select=id,name,contentType,size`,
    accessToken,
  );
}

export async function downloadOutlookAttachment(accessToken: string, messageId: string, attachmentId: string) {
  const payload = await graphFetch<{ contentBytes?: string; size?: number }>(
    `/me/messages/${messageId}/attachments/${attachmentId}?$select=id,name,contentType,size,contentBytes`,
    accessToken,
    undefined,
    60_000,
  );
  const buffer = Buffer.from(payload.contentBytes || '', 'base64');
  assertImportFileWithinLimit(buffer.byteLength);
  return buffer;
}

export async function resolveOutlookAttachments(accessToken: string, config: OutlookConnectionConfig) {
  const parts: string[] = [];
  if (config.sender) parts.push(config.sender);
  if (config.subject) parts.push(config.subject);
  if (config.dateFrom) parts.push(config.dateFrom);
  if (config.dateTo) parts.push(config.dateTo);

  const listing = await listOutlookMessages(accessToken, parts.join(' '));
  const messages = listing.value || [];
  const files: OutlookAttachmentFile[] = [];
  const allowedTypes = normalizeAttachmentTypes(config.attachmentTypes);

  for (const messageRef of messages) {
    const message = await getOutlookMessage(accessToken, messageRef.id);
    const attachments = await listOutlookAttachments(accessToken, messageRef.id);
    const filtered = collectAttachments(attachments);
    for (const attachment of filtered) {
      if (!isSupportedAttachment(attachment.name, attachment.contentType, allowedTypes)) continue;
      const buffer = await downloadOutlookAttachment(accessToken, messageRef.id, attachment.id);
      files.push({
        messageId: messageRef.id,
        attachmentId: attachment.id,
        fileName: attachment.name,
        mimeType: attachment.contentType,
        size: buffer.byteLength,
        messageSubject: message.subject,
        from: message.from?.emailAddress?.address || '',
        date: message.receivedDateTime,
        buffer,
      });
    }
  }

  return files;
}

