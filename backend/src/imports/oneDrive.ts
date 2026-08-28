import { Buffer } from 'buffer';
import { assertImportFileWithinLimit, MAX_IMPORT_BYTES } from './parser';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import {
  getMicrosoftDriveItem,
  getMicrosoftShareDriveItem,
  getMicrosoftSiteDriveItem,
  type MicrosoftProfile,
} from './microsoftGraph';

export interface OneDriveResolvedSource {
  driveId: string;
  itemId: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  webViewLink: string | null;
  accessToken: string;
}

export function extractOneDriveId(reference: string): string | null {
  const input = reference.trim();
  if (!input) return null;

  const driveItemMatch = input.match(/\/drives\/([^/]+)\/items\/([^/?#]+)/i);
  if (driveItemMatch) return `${driveItemMatch[1]}:${driveItemMatch[2]}`;

  const siteMatch = input.match(/\/sites\/([^/]+)/i);
  if (siteMatch) return siteMatch[1];

  const queryMatch = input.match(/[?&]id=([^&#]+)/i);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);

  return input.includes('http') ? input : null;
}

export function extractSharePointId(reference: string): string | null {
  const input = reference.trim();
  if (!input) return null;

  const siteMatch = input.match(/\/sites\/([^/]+)/i);
  if (siteMatch) return siteMatch[1];

  return extractOneDriveId(reference);
}

async function resolveDriveReference(reference: string, accessToken: string, kind: 'onedrive' | 'sharepoint'): Promise<OneDriveResolvedSource> {
  const input = reference.trim();
  if (!input) {
    throw new Error(`Unable to determine a ${kind === 'onedrive' ? 'OneDrive' : 'SharePoint'} reference.`);
  }

  if (input.includes('/shares/') || input.includes('1drv.ms') || input.includes('sharepoint.com')) {
    const item = await getMicrosoftShareDriveItem(input, accessToken);
    const driveId = item.parentReference?.driveId || '';
    if (!driveId) {
      throw new Error('Unable to resolve a Microsoft drive ID from the provided shared link.');
    }
    return {
      driveId,
      itemId: item.id,
      fileName: item.name,
      mimeType: null,
      size: item.size ?? null,
      webViewLink: item.webUrl || null,
      accessToken,
    };
  }

  const itemId = extractOneDriveId(input);
  if (!itemId) {
    throw new Error(`Unable to determine a ${kind === 'onedrive' ? 'OneDrive' : 'SharePoint'} item ID from the configured reference.`);
  }

  const driveId = itemId.includes(':') ? itemId.split(':')[0] : '';
  const resolvedItemId = itemId.includes(':') ? itemId.split(':')[1] : itemId;
  if (!driveId) {
    throw new Error('Unable to determine the Microsoft drive ID for this reference.');
  }

  const item = kind === 'sharepoint'
    ? await getMicrosoftSiteDriveItem(driveId, resolvedItemId, accessToken)
    : await getMicrosoftDriveItem(driveId, resolvedItemId, accessToken);

  return {
    driveId,
    itemId: item.id,
    fileName: item.name,
    mimeType: null,
    size: item.size ?? null,
    webViewLink: item.webUrl || null,
    accessToken,
  };
}

export async function resolveOneDriveSource(reference: string, accessToken: string) {
  return resolveDriveReference(reference, accessToken, 'onedrive');
}

export async function resolveSharePointSource(reference: string, accessToken: string) {
  return resolveDriveReference(reference, accessToken, 'sharepoint');
}

async function downloadDriveItemContent(path: string, accessToken: string): Promise<Buffer> {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0${path}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 60_000);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft file download failed (${response.status}): ${text.slice(0, 200)}`);
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

export async function downloadOneDriveFile(driveId: string, itemId: string, accessToken: string) {
  return downloadDriveItemContent(`/drives/${driveId}/items/${itemId}`, accessToken);
}

export async function downloadSharePointFile(siteId: string, itemId: string, accessToken: string) {
  return downloadDriveItemContent(`/sites/${siteId}/drive/items/${itemId}`, accessToken);
}

export async function testOneDriveConnection(reference: string, accessToken: string) {
  return resolveOneDriveSource(reference, accessToken);
}

export async function testSharePointConnection(reference: string, accessToken: string) {
  return resolveSharePointSource(reference, accessToken);
}

