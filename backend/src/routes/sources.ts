import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, safeJsonParse } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createSourceSchema, connectionConfigSchemaForType } from '../middleware/validate';
import { SOURCE_MODULE_OPTIONS } from '../constants/modules';
import { testGoogleDriveConnection, extractDriveId } from '../imports/googleDrive';
import { resolveGoogleSheetsSource } from '../imports/googleDrive';
import { testOneDriveConnection, testSharePointConnection } from '../imports/oneDrive';
import { resolveOutlookAttachments } from '../imports/outlookMail';
import {
  buildGmailAuthUrl,
  encryptGmailRefreshToken,
  exchangeGmailCode,
  fetchGmailProfile,
  refreshGmailAccessToken,
  verifyGmailState,
} from '../imports/gmail';
import {
  buildMicrosoftAuthUrl,
  encryptMicrosoftRefreshToken,
  exchangeMicrosoftCode,
  fetchMicrosoftProfile,
  refreshMicrosoftAccessToken,
  verifyMicrosoftState,
} from '../imports/microsoftGraph';
const router = Router();

interface DataSourceRow {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: string;
  module: string;
  lastSync: Date | null;
  ownerId: string;
  schoolId: string | null;
  externalFileId: string | null;
  externalUrl: string | null;
  metadata: string | null;
  connectionConfig: string | null;
  analysisHistory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/sources
 * List data sources across the school group.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { module, status, schoolId } = req.query as { module?: string; status?: string; schoolId?: string };

    const where: any = {};

    if (user.role !== 'GENERAL_SUPERVISOR') {
      where.ownerId = user.id;
    } else if (schoolId) {
      // SCOPING NOTE (Item 9): When a specific schoolId is supplied, this endpoint uses a STRICT
      // filter (exact match only) — it intentionally excludes global sources (schoolId = null).
      // Rationale: the Sources list is a management view where the user wants to see exactly what
      // belongs to the selected school. Global (null) sources appear in ALL schools' lists, so
      // they are shown when no school is filtered (the OR-null branch below).
      //
      // This differs from dashboard.ts / agent.ts / reportSummary.ts which use OR-null even when
      // a specific school is selected, because those views need to aggregate global data into the
      // school context for AI analysis. If you need global sources to appear in the school-scoped
      // list here too, change this branch to:
      //   where.OR = [{ schoolId }, { schoolId: null }];
      where.schoolId = schoolId;
    } else {
      const activeSchools = await prisma.school.findMany({ where: { isActive: true }, select: { id: true } });
      const activeSchoolIds = activeSchools.map((s: { id: string }) => s.id);
      where.OR = [{ schoolId: { in: activeSchoolIds } }, { schoolId: null }];
    }

    if (module) where.module = module;
    if (status) where.status = status;

    const sources = await prisma.dataSource.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      data: sources.map((s: DataSourceRow) => ({
        ...s,
        metadata: safeJsonParse<Record<string, any>>(s.metadata, {}),
        connectionConfig: undefined, // never expose credentials
        analysisHistory: safeJsonParse<any[]>(s.analysisHistory, []),
      })),
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load data sources' });
  }
});

/**
 * POST /api/sources
 * Create a new data source connection.
 */
router.post('/', validateBody(createSourceSchema), async (req: AuthRequest, res) => {
  try {
    const { name, type, provider, module, connectionConfig, externalFileId, externalUrl, schoolId } = req.body;
    const user = req.user!;

    // A5: re-validate connectionConfig against the type-specific schema
    // (same one used by PUT /:id/connect) so creation can't bypass the
    // stricter, type-aware shape with the more permissive generic one above.
    if (connectionConfig) {
      const typedSchema = connectionConfigSchemaForType(type);
      const typedResult = typedSchema.safeParse(connectionConfig);
      if (!typedResult.success) {
        const errors = typedResult.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
        return res.status(400).json({ message: 'Invalid connectionConfig', errors });
      }
    }

    const connectionReady = (type === 'GOOGLE_DRIVE' || type === 'GOOGLE_SHEETS') && connectionConfig?.liveTested === true;

    const source = await prisma.dataSource.create({
      data: {
        name,
        type,
        provider: provider || type,
        module,
        status: connectionReady ? 'CONNECTED' : 'NOT_CONNECTED',
        ownerId: user.id,
        schoolId: schoolId || null,
        lastSync: connectionReady ? new Date() : null,
        connectionConfig: connectionConfig ? JSON.stringify(connectionConfig) : null,
        metadata: JSON.stringify({ createdBy: user.name, createdAt: new Date().toISOString() }),
        externalFileId: externalFileId || null,
        externalUrl: externalUrl || null,
        analysisHistory: '[]',
      },
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    await audit(user.id, 'create_source', 'DataSource', source.id, `Connected: ${name} (${type})`);

    res.status(201).json({
      data: {
        ...source,
        metadata: safeJsonParse<Record<string, any>>(source.metadata, {}),
        connectionConfig: undefined,
        analysisHistory: [],
      },
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to create data source' });
  }
});

router.post('/:id/gmail/connect', async (req: AuthRequest, res) => {
  try {
    const source = await prisma.dataSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: 'Source not found' });
    if (source.type !== 'GMAIL') {
      return res.status(400).json({ message: 'Gmail connection is only available for Gmail sources.' });
    }

    const authUrl = buildGmailAuthUrl(source.id, req.user!.id);
    res.json({ data: { authUrl } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start Gmail connection';
    res.status(500).json({ message });
  }
});

router.post('/:id/microsoft/connect', async (req: AuthRequest, res) => {
  try {
    const source = await prisma.dataSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: 'Source not found' });
    if (!['ONEDRIVE', 'SHAREPOINT', 'OUTLOOK'].includes(source.type)) {
      return res.status(400).json({ message: 'Microsoft connection is only available for OneDrive, SharePoint, or Outlook sources.' });
    }

    const authUrl = buildMicrosoftAuthUrl(source.id, req.user!.id);
    res.json({ data: { authUrl } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start Microsoft connection';
    res.status(500).json({ message });
  }
});

/**
 * PUT /api/sources/:id/connect
 * Update connection configuration and mark as connected.
 */
router.put('/:id/connect', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.dataSource.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Source not found' });
    if (existing.ownerId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden: you do not own this data source.' });
    }
    const existingStoredConfig = safeJsonParse<Record<string, any>>(existing.connectionConfig, {});

    // Validate the shape of connectionConfig based on the source's existing type,
    // to reject arbitrary/oversized JSON while staying permissive enough that
    // existing connected sources keep working.
    const schema = connectionConfigSchemaForType(existing.type);
    const result = schema.safeParse(req.body?.connectionConfig ?? {});
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ message: 'Invalid connectionConfig', errors });
    }
    const connectionConfig = result.data as {
      externalUrl?: string;
      fileId?: string;
      folderId?: string;
    };

    if (existing.type === 'GOOGLE_DRIVE') {
      const reference = connectionConfig.externalUrl || existing.externalUrl || existing.externalFileId || '';
      const fileOrFolderId = connectionConfig.fileId || connectionConfig.folderId || existing.externalFileId || null;

      try {
        await testGoogleDriveConnection(reference, fileOrFolderId);
      } catch (error) {
        await prisma.dataSource.update({
          where: { id: req.params.id },
          data: { status: 'ERROR', updatedAt: new Date() },
        });
        const message = error instanceof Error ? error.message : 'Failed to test Google Drive connection';
        return res.status(400).json({ message });
      }
    } else if (existing.type === 'GOOGLE_SHEETS') {
      const reference = connectionConfig.externalUrl || existing.externalUrl || existing.externalFileId || '';
      const fileOrFolderId = connectionConfig.fileId || connectionConfig.folderId || existing.externalFileId || null;

      try {
        await resolveGoogleSheetsSource(reference, fileOrFolderId);
      } catch (error) {
        await prisma.dataSource.update({
          where: { id: req.params.id },
          data: { status: 'ERROR', updatedAt: new Date() },
        });
        const message = error instanceof Error ? error.message : 'Failed to test Google Sheets connection';
        return res.status(400).json({ message });
      }
    } else if (existing.type === 'GMAIL') {
      const refreshToken = existingStoredConfig.refreshToken;
      if (!refreshToken) {
        return res.status(400).json({ message: 'Gmail source is not connected. Please use Connect with Gmail instead of Reconnect.' });
      }

      try {
        const accessToken = await refreshGmailAccessToken(refreshToken);
        await fetchGmailProfile(accessToken);
      } catch (error) {
        await prisma.dataSource.update({
          where: { id: req.params.id },
          data: { status: 'ERROR', updatedAt: new Date() },
        });
        const message = error instanceof Error ? error.message : 'Failed to test Gmail connection';
        return res.status(400).json({ message });
      }
    } else if (['ONEDRIVE', 'SHAREPOINT', 'OUTLOOK'].includes(existing.type)) {
      const reference = connectionConfig.externalUrl || existing.externalUrl || '';
      const refreshToken = existingStoredConfig.refreshToken;

      if (!refreshToken) {
        return res.status(400).json({ message: 'Microsoft source is not connected. Please use Connect with Microsoft instead of Reconnect.' });
      }

      try {
        const accessToken = await refreshMicrosoftAccessToken(refreshToken);
        if (existing.type === 'ONEDRIVE') {
          await testOneDriveConnection(reference, accessToken);
        } else if (existing.type === 'SHAREPOINT') {
          await testSharePointConnection(reference, accessToken);
        } else {
          await resolveOutlookAttachments(accessToken, existingStoredConfig);
        }
      } catch (error) {
        await prisma.dataSource.update({
          where: { id: req.params.id },
          data: { status: 'ERROR', updatedAt: new Date() },
        });
        const message = error instanceof Error ? error.message : 'Failed to test Microsoft connection';
        return res.status(400).json({ message });
      }
    }

    const source = await prisma.dataSource.update({
      where: { id: req.params.id },
      data: {
        status: 'CONNECTED',
        connectionConfig: JSON.stringify({ ...existingStoredConfig, ...connectionConfig }),
        lastSync: new Date(),
        metadata: JSON.stringify({ connectedAt: new Date().toISOString(), connectedBy: req.user!.name }),
      },
      include: { owner: { select: { id: true, name: true } } },
    });

    await audit(req.user!.id, 'connect_source', 'DataSource', source.id, `Connected: ${source.name}`);
    res.json({ data: { ...source, connectionConfig: undefined } });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Source not found' });
    }
    res.status(500).json({ message: 'Failed to connect source' });
  }
});

/**
 * PATCH /api/sources/:id/status
 * Update source status.
 */
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!['CONNECTED', 'NOT_CONNECTED', 'ERROR'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const existing = await prisma.dataSource.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Source not found' });
    if (existing.ownerId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden: you do not own this data source.' });
    }

    const source = await prisma.dataSource.update({
      where: { id: req.params.id },
      data: { status, updatedAt: new Date() },
    });

    await audit(req.user!.id, 'update_source_status', 'DataSource', source.id, `Status → ${status}`);
    res.json({ data: { ...source, connectionConfig: undefined } });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Source not found' });
    }
    res.status(500).json({ message: 'Failed to update source status' });
  }
});

/**
 * DELETE /api/sources/:id
 * Remove a data source connection.
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const source = await prisma.dataSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: 'Source not found' });

    if (source.ownerId !== req.user!.id && req.user!.role !== 'GENERAL_SUPERVISOR') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await prisma.dataSource.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, 'delete_source', 'DataSource', req.params.id, `Deleted: ${source.name}`);
    res.json({ message: 'Data source removed' });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to delete source' });
  }
});

/**
 * GET /api/sources/modules
 * Return modules list (kept for backward compatibility).
 */
router.get('/modules', async (_req, res) => {
  // Derived from the shared STAFF_MODULES catalog so this list can never
  // drift out of sync with routes/staff.ts again (see audit item C7).
  res.json({ data: SOURCE_MODULE_OPTIONS });
});

const testConnectionSchema = z.object({
  type: z.enum(['GOOGLE_DRIVE', 'GOOGLE_SHEETS', 'ONEDRIVE', 'SHAREPOINT']),
  externalUrl: z.string().min(1),
  connectionConfig: z.object({
    fileId: z.string().optional(),
    folderId: z.string().optional(),
    driveId: z.string().optional(),
    itemId: z.string().optional(),
    siteId: z.string().optional(),
    refreshToken: z.string().optional(),
  }).optional(),
});

router.post('/test-connection', validateBody(testConnectionSchema), async (req: AuthRequest, res) => {
  try {
    const { externalUrl, connectionConfig, type } = req.body;
    const reference = externalUrl;
    const explicitFileId = connectionConfig?.fileId || connectionConfig?.folderId || connectionConfig?.driveId || connectionConfig?.itemId || undefined;
    let result: unknown;

    if (type === 'GOOGLE_DRIVE') {
      result = await testGoogleDriveConnection(reference, explicitFileId || extractDriveId(reference) || undefined);
    } else if (type === 'GOOGLE_SHEETS') {
      const sheetResult = await resolveGoogleSheetsSource(reference, explicitFileId || extractDriveId(reference) || undefined);
      const { buffer, accessToken, ...safeResult } = sheetResult as Record<string, any>;
      void buffer;
      void accessToken;
      result = safeResult;
    } else {
      result = { message: 'Microsoft sources are verified through OAuth and the dedicated Microsoft connect flow.' };
    }
    res.json({ data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to test connection';
    console.error('[Source Test Connection Error]', message);
    res.status(500).json({ message });
  }
});


export default router;

