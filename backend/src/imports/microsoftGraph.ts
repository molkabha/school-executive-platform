import jwt from 'jsonwebtoken';
import { decryptSecret, encryptSecret } from '../utils/encryption';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

export interface MicrosoftProfile {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

const MICROSOFT_SCOPES = [
  'offline_access',
  'User.Read',
  'Files.Read.All',
  'Sites.Read.All',
  'Mail.Read',
];

export function loadMicrosoftOAuthConfig(): MicrosoftOAuthConfig {
  const clientId = process.env.MICROSOFT_CLIENT_ID || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || '';

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Microsoft OAuth configuration is not complete. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI.');
  }

  return { clientId, clientSecret, tenantId, redirectUri };
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

  if (parsed.purpose !== 'microsoft_oauth') {
    throw new Error('Invalid Microsoft OAuth state.');
  }

  return parsed;
}

export function buildMicrosoftAuthUrl(sourceId: string, userId: string) {
  const config = loadMicrosoftOAuthConfig();
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT secret is not configured.');
  }

  const state = jwt.sign({ sourceId, userId, purpose: 'microsoft_oauth' }, jwtSecret, { expiresIn: '10m' });
  const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export function verifyMicrosoftState(state: string) {
  return decodeState(state);
}

async function tokenRequest(params: Record<string, string>) {
  const config = loadMicrosoftOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    scope: MICROSOFT_SCOPES.join(' '),
    ...params,
  });

  const response = await fetchWithTimeout(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft OAuth token request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  }>;
}

export async function exchangeMicrosoftCode(code: string) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
  });
}

export async function refreshMicrosoftAccessToken(encryptedRefreshToken: string) {
  const response = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: decryptSecret(encryptedRefreshToken),
  });
  return response.access_token;
}

async function microsoftApiFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft Graph API request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return (await response.text()) as T;
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const profile = await microsoftApiFetch<MicrosoftProfile>('/me?$select=id,displayName,mail,userPrincipalName', accessToken);
  return {
    emailAddress: profile.mail || profile.userPrincipalName || '',
    displayName: profile.displayName || '',
    raw: profile,
  };
}

export function encryptMicrosoftRefreshToken(token: string) {
  return encryptSecret(token);
}

export async function getMicrosoftShareDriveItem(shareUrl: string, accessToken: string) {
  const shareId = `u!${Buffer.from(shareUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
  return microsoftApiFetch<{ id: string; name: string; size?: number; webUrl?: string; parentReference?: { driveId?: string } }>(
    `/shares/${shareId}/driveItem?$select=id,name,size,webUrl,parentReference`,
    accessToken,
  );
}

export async function getMicrosoftDriveItem(driveId: string, itemId: string, accessToken: string) {
  return microsoftApiFetch<{ id: string; name: string; size?: number; webUrl?: string; parentReference?: { driveId?: string } }>(
    `/drives/${driveId}/items/${itemId}?$select=id,name,size,webUrl,parentReference`,
    accessToken,
  );
}

export async function getMicrosoftSiteDriveItem(siteId: string, itemId: string, accessToken: string) {
  return microsoftApiFetch<{ id: string; name: string; size?: number; webUrl?: string; parentReference?: { driveId?: string } }>(
    `/sites/${siteId}/drive/items/${itemId}?$select=id,name,size,webUrl,parentReference`,
    accessToken,
  );
}

