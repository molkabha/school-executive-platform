import { Router } from 'express';
import { safeJsonParse } from '../utils';
import { prisma } from '../prisma';
import {
  encryptGmailRefreshToken,
  exchangeGmailCode,
  fetchGmailProfile,
  verifyGmailState,
} from '../imports/gmail';
import {
  encryptMicrosoftRefreshToken,
  exchangeMicrosoftCode,
  fetchMicrosoftProfile,
  verifyMicrosoftState,
} from '../imports/microsoftGraph';

/**
 * Unauthenticated OAuth callback router.
 *
 * These routes MUST NOT be behind authenticateToken because the user's
 * session cookie may have expired during the OAuth round-trip (Google /
 * Microsoft redirect). The state JWT (signed with JWT_SECRET, 10-minute
 * expiry) provides CSRF protection and ownership verification instead.
 */
const router = Router();

router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    if (error) {
      return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent('Missing OAuth callback parameters.')}`);
    }

    const payload = verifyGmailState(state);
    const source = await prisma.dataSource.findUnique({ where: { id: payload.sourceId } });
    if (!source) {
      return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent('Source not found.')}`);
    }
    if (source.ownerId !== payload.userId) {
      return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent('Source ownership mismatch.')}`);
    }

    const tokens = await exchangeGmailCode(code);
    const profile = await fetchGmailProfile(tokens.access_token);
    if (!tokens.refresh_token) {
      return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent('Google did not return a refresh token. Reconnect Gmail with consent.')}`);
    }

    const existingConfig = safeJsonParse<Record<string, any>>(source.connectionConfig, {});
    const connectionConfig = {
      ...existingConfig,
      refreshToken: encryptGmailRefreshToken(tokens.refresh_token),
      connectedEmail: profile.emailAddress,
      verifiedAt: new Date().toISOString(),
    };

    await prisma.dataSource.update({
      where: { id: source.id },
      data: {
        status: 'CONNECTED',
        lastSync: new Date(),
        connectionConfig: JSON.stringify(connectionConfig),
        metadata: JSON.stringify({
          ...safeJsonParse<Record<string, any>>(source.metadata, {}),
          gmailConnectedAt: new Date().toISOString(),
          gmailEmail: profile.emailAddress,
        }),
      },
    });

    return res.redirect(`${frontendUrl}/sources?gmailStatus=connected&sourceId=${encodeURIComponent(source.id)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete Gmail connection';
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/sources?gmailStatus=error&message=${encodeURIComponent(message)}`);
  }
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    if (error) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent('Missing OAuth callback parameters.')}`);
    }

    const payload = verifyMicrosoftState(state);
    const source = await prisma.dataSource.findUnique({ where: { id: payload.sourceId } });
    if (!source) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent('Source not found.')}`);
    }
    if (source.ownerId !== payload.userId) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent('Source ownership mismatch.')}`);
    }
    if (!['ONEDRIVE', 'SHAREPOINT', 'OUTLOOK'].includes(source.type)) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent('Microsoft OAuth is only available for Microsoft-backed sources.')}`);
    }

    const tokens = await exchangeMicrosoftCode(code);
    const profile = await fetchMicrosoftProfile(tokens.access_token);
    if (!tokens.refresh_token) {
      return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent('Microsoft did not return a refresh token. Reconnect with consent.')}`);
    }

    const existingConfig = safeJsonParse<Record<string, any>>(source.connectionConfig, {});
    const connectionConfig = {
      ...existingConfig,
      refreshToken: encryptMicrosoftRefreshToken(tokens.refresh_token),
      connectedEmail: profile.emailAddress,
      verifiedAt: new Date().toISOString(),
    };

    await prisma.dataSource.update({
      where: { id: source.id },
      data: {
        status: 'CONNECTED',
        lastSync: new Date(),
        connectionConfig: JSON.stringify(connectionConfig),
        metadata: JSON.stringify({
          ...safeJsonParse<Record<string, any>>(source.metadata, {}),
          microsoftConnectedAt: new Date().toISOString(),
          microsoftEmail: profile.emailAddress,
        }),
      },
    });

    return res.redirect(`${frontendUrl}/sources?microsoftStatus=connected&sourceId=${encodeURIComponent(source.id)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete Microsoft connection';
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/sources?microsoftStatus=error&message=${encodeURIComponent(message)}`);
  }
});

export default router;
