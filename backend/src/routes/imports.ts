import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requireSupervisorAccess, AuthRequest, safeJsonParse } from '../utils';
import { prisma } from '../prisma';
import { validateBody } from '../middleware/validate';
import { DATASET_DEFINITIONS } from '../imports/datasets';
import { downloadGoogleDriveFile, resolveGoogleDriveSource, resolveGoogleSheetsSource, testGoogleDriveConnection } from '../imports/googleDrive';
import { importParsedFile, previewImportFile, rollbackImportBatch } from '../imports/engine';
import { DatasetType } from '../imports/types';
import { MAX_IMPORT_BYTES, assertImportFileWithinLimit } from '../imports/parser';
import multer from 'multer';
import { createTempUpload, deleteTempUpload, readTempUpload } from '../imports/tempUploads';
import {
  buildGmailAuthUrl,
  encryptGmailRefreshToken,
  exchangeGmailCode,
  fetchGmailProfile,
  refreshGmailAccessToken,
  resolveGmailAttachments,
  verifyGmailState,
  type GmailConnectionConfig,
} from '../imports/gmail';
import { refreshMicrosoftAccessToken } from '../imports/microsoftGraph';
import { downloadOneDriveFile, downloadSharePointFile, resolveOneDriveSource, resolveSharePointSource } from '../imports/oneDrive';
import { resolveOutlookAttachments } from '../imports/outlookMail';

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

const datasetTypeSchema = z.enum([
  'attendance',
  'housing',
  'complaints',
  'tasks',
  'meetings',
  'staff_modules',
  'schools',
  'kpi_snapshots',
]);

const mappingSchema = z.record(z.string(), z.string()).optional();

const previewSchema = z.object({
  datasetType: datasetTypeSchema,
  mapping: mappingSchema,
});

const importSchema = previewSchema;
const excelUploadImportSchema = z.object({
  uploadId: z.string().min(1),
  datasetType: datasetTypeSchema,
  mapping: mappingSchema,
  sourceName: z.string().min(1),
  module: z.string().min(1),
  schoolId: z.string().optional(),
  externalUrl: z.string().optional(),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES },
});

function sendImportError(res: any, error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const clientErrorPatterns = [
    'Missing required columns',
    'Mapping header not found',
    'Unsupported file type',
    'The file is empty',
    'maximum allowed size',
    'Unknown school code',
    'schoolCode is required',
    'attendanceRate is required',
    'attendanceRate must be between 0 and 100',
    'title and description are required',
    'title and date are required',
    'metricName and value are required',
    'Unsupported attachment type',
    'Google OAuth configuration is not complete',
    'Gmail API request failed',
    'Excel file is required',
    'No supported Gmail attachments were found',
    'Gmail source is not connected',
    'Microsoft OAuth configuration is not complete',
    'Microsoft Graph API request failed',
    'Microsoft Outlook query failed',
    'Microsoft source is not connected',
    'No supported Outlook attachments were found',
    'Unable to determine a OneDrive reference',
    'Unable to determine a OneDrive item ID',
    'Unable to determine a SharePoint reference',
    'Unable to determine a SharePoint item ID',
    'Unable to resolve a Microsoft drive ID',
    'Unable to determine the Microsoft drive ID',
    'Microsoft file download failed',
    'Google Sheets export failed',
    'Uploaded file not found or has expired',
    'The workbook does not contain',
  ];

  const status = clientErrorPatterns.some((pattern) => message.includes(pattern)) ? 400 : 500;
  res.status(status).json({ message });
}

function getSourceConnectionConfig(source: { connectionConfig: string | null }): Record<string, any> {
  return safeJsonParse<Record<string, any>>(source.connectionConfig, {});
}

async function resolveGoogleDriveSourceFile(source: {
  externalUrl: string | null;
  externalFileId: string | null;
  connectionConfig: string | null;
}) {
  const reference = source.externalUrl || source.externalFileId || '';
  const connectionConfig = safeJsonParse<Record<string, any>>(source.connectionConfig, {});
  return resolveGoogleDriveSource(reference, connectionConfig.fileId || source.externalFileId);
}

async function resolveGmailSourceFile(source: {
  id: string;
  name: string;
  type: string;
  module: string;
  schoolId: string | null;
  connectionConfig: string | null;
}, datasetType: DatasetType) {
  const connectionConfig = getSourceConnectionConfig(source);
  if (!connectionConfig.refreshToken) {
    throw new Error('Gmail source is not connected. Please reconnect Gmail.');
  }

  const accessToken = await refreshGmailAccessToken(connectionConfig.refreshToken);
  const attachments = await resolveGmailAttachments(accessToken, connectionConfig);
  const selectedAttachment = attachments[0];
  if (!selectedAttachment) {
    throw new Error('No supported Gmail attachments were found for the configured query.');
  }

  return {
    fileId: selectedAttachment.messageId,
    fileName: selectedAttachment.fileName,
    mimeType: selectedAttachment.mimeType,
    size: selectedAttachment.size,
    checksum: null,
    webViewLink: null,
    accessToken,
    attachment: selectedAttachment,
    datasetType,
  };
}

async function resolveMicrosoftSourceFile(source: {
  name: string;
  type: string;
  module: string;
  schoolId: string | null;
  externalUrl: string | null;
  externalFileId: string | null;
  connectionConfig: string | null;
}, datasetType: DatasetType) {
  const connectionConfig = getSourceConnectionConfig(source);
  if (!connectionConfig.refreshToken) {
    throw new Error('Microsoft source is not connected. Please reconnect with Microsoft.');
  }

  const accessToken = await refreshMicrosoftAccessToken(connectionConfig.refreshToken);
  const reference = source.externalUrl || source.externalFileId || '';

  if (source.type === 'ONEDRIVE') {
    const resolved = await resolveOneDriveSource(reference, accessToken);
    const buffer = await downloadOneDriveFile(resolved.driveId, resolved.itemId, accessToken);
    return {
      fileId: resolved.itemId,
      fileName: resolved.fileName,
      mimeType: resolved.mimeType,
      size: resolved.size,
      checksum: null,
      webViewLink: resolved.webViewLink,
      accessToken,
      buffer,
      datasetType,
    };
  }

  if (source.type === 'SHAREPOINT') {
    const resolved = await resolveSharePointSource(reference, accessToken);
    const buffer = await downloadSharePointFile(resolved.driveId, resolved.itemId, accessToken);
    return {
      fileId: resolved.itemId,
      fileName: resolved.fileName,
      mimeType: resolved.mimeType,
      size: resolved.size,
      checksum: null,
      webViewLink: resolved.webViewLink,
      accessToken,
      buffer,
      datasetType,
    };
  }

  const attachments = await resolveOutlookAttachments(accessToken, connectionConfig);
  const selectedAttachment = attachments[0];
  if (!selectedAttachment) {
    throw new Error('No supported Outlook attachments were found for the configured query.');
  }

  return {
    fileId: selectedAttachment.messageId,
    fileName: selectedAttachment.fileName,
    mimeType: selectedAttachment.mimeType,
    size: selectedAttachment.size,
    checksum: null,
    webViewLink: null,
    accessToken,
    buffer: selectedAttachment.buffer || Buffer.alloc(0),
    attachment: selectedAttachment,
    datasetType,
  };
}

async function resolveGoogleSheetsSourceFile(source: {
  externalUrl: string | null;
  externalFileId: string | null;
  connectionConfig: string | null;
}) {
  const reference = source.externalUrl || source.externalFileId || '';
  const connectionConfig = safeJsonParse<Record<string, any>>(source.connectionConfig, {});
  return resolveGoogleSheetsSource(reference, connectionConfig.fileId || source.externalFileId);
}

router.get('/batches', async (req: AuthRequest, res) => {
  try {
    const { datasetType, sourceId, status, schoolId, limit } = req.query as {
      datasetType?: string;
      sourceId?: string;
      status?: string;
      schoolId?: string;
      limit?: string;
    };

    const where: any = {};
    if (datasetType) where.datasetType = datasetType;
    if (sourceId) where.sourceId = sourceId;
    if (status) where.status = status;
    if (schoolId) where.schoolId = schoolId;

    // Enforce school scope for school-scoped supervisors
    if (req.user!.schoolId) {
      where.schoolId = req.user!.schoolId;
    }

    const batches = await prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 100),
      include: {
        source: { select: { id: true, name: true, type: true, module: true } },
        school: { select: { id: true, name: true, code: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
        items: { orderBy: { rowNumber: 'asc' } },
      },
    });

    res.json({ data: batches });
  } catch (error) {
    console.error('[Import Batches GET Error]', error);
    res.status(500).json({ message: 'Failed to load import batches' });
  }
});

router.get('/batches/:id', async (req, res) => {
  try {
    const batch = await prisma.importBatch.findUnique({
      where: { id: req.params.id },
      include: {
        source: { select: { id: true, name: true, type: true, module: true } },
        school: { select: { id: true, name: true, code: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
        rolledBackBy: { select: { id: true, name: true, email: true } },
        items: { orderBy: { rowNumber: 'asc' } },
      },
    });

    if (!batch) return res.status(404).json({ message: 'Import batch not found' });
    res.json({ data: batch });
  } catch (error) {
    console.error('[Import Batch Detail Error]', error);
    res.status(500).json({ message: 'Failed to load import batch' });
  }
});

router.post('/batches/:id/rollback', async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.importBatch.findUnique({
      where: { id: req.params.id },
      select: { id: true, triggeredById: true, schoolId: true },
    });
    if (!batch) return res.status(404).json({ message: 'Import batch not found' });
    if (batch.triggeredById !== req.user!.id) {
      return res.status(403).json({ message: 'You are not authorized to roll back this import batch.' });
    }

    const result = await rollbackImportBatch(prisma, req.params.id, req.user!.id);
    res.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rollback import batch';
    if (message === 'Import batch not found.') {
      return res.status(404).json({ message });
    }
    console.error('[Import Batch Rollback Error]', error);
    res.status(500).json({ message });
  }
});

router.post('/sources/:sourceId/preview', validateBody(previewSchema), async (req: AuthRequest, res) => {
  try {
    const datasetType = req.body.datasetType as DatasetType;
    const source = await prisma.dataSource.findUnique({
      where: { id: req.params.sourceId },
      include: { school: { select: { id: true, name: true, code: true } } },
    });

    if (!source) return res.status(404).json({ message: 'Source not found' });
    if (source.ownerId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden: you do not own this data source.' });
    }
    let sourceFile: {
      fileId: string;
      fileName: string;
      mimeType: string | null;
      size: number | null;
      checksum: string | null;
      webViewLink: string | null;
      accessToken?: string;
      attachment?: { buffer?: Buffer };
      buffer?: Buffer;
    };
    let buffer: Buffer;

    if (source.type === 'GOOGLE_DRIVE') {
      sourceFile = await resolveGoogleDriveSourceFile(source);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = await downloadGoogleDriveFile(sourceFile.fileId, sourceFile.accessToken!);
    } else if (source.type === 'GOOGLE_SHEETS') {
      sourceFile = await resolveGoogleSheetsSourceFile(source);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = sourceFile.buffer || Buffer.alloc(0);
    } else if (source.type === 'ONEDRIVE' || source.type === 'SHAREPOINT' || source.type === 'OUTLOOK') {
      sourceFile = await resolveMicrosoftSourceFile(source, datasetType);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = sourceFile.buffer || Buffer.alloc(0);
    } else if (source.type === 'GMAIL') {
      sourceFile = await resolveGmailSourceFile(source, datasetType);
      buffer = sourceFile.attachment?.buffer || Buffer.alloc(0);
      assertImportFileWithinLimit(buffer.byteLength);
    } else {
      return res.status(400).json({ message: 'Preview is currently supported for Google Drive, Google Sheets, Microsoft, and Gmail sources only.' });
    }

    assertImportFileWithinLimit(buffer.byteLength);
    const preview = await previewImportFile(prisma, buffer, sourceFile.fileName, sourceFile.mimeType, datasetType, req.body.mapping, {
      id: source.id,
      name: source.name,
      type: source.type,
      module: source.module,
      schoolId: source.schoolId,
      externalFileId: source.externalFileId,
      externalUrl: source.externalUrl,
      connectionConfig: source.connectionConfig,
    });

    res.json({
      data: {
        ...preview,
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          module: source.module,
          schoolId: source.schoolId,
          school: source.school,
        },
        file: {
          fileId: sourceFile.fileId,
          fileName: sourceFile.fileName,
          mimeType: sourceFile.mimeType,
          size: sourceFile.size,
          checksum: sourceFile.checksum,
          webViewLink: sourceFile.webViewLink,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview import file';
    console.error('[Import Preview Error]', message);
    sendImportError(res, error, 'Failed to preview import file');
  }
});

router.post('/sources/:sourceId/import', validateBody(importSchema), async (req: AuthRequest, res) => {
  try {
    const datasetType = req.body.datasetType as DatasetType;
    const source = await prisma.dataSource.findUnique({
      where: { id: req.params.sourceId },
      include: { school: { select: { id: true, name: true, code: true } } },
    });

    if (!source) return res.status(404).json({ message: 'Source not found' });
    if (source.ownerId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden: you do not own this data source.' });
    }
    let sourceFile: {
      fileId: string;
      fileName: string;
      mimeType: string | null;
      size: number | null;
      checksum: string | null;
      webViewLink: string | null;
      accessToken?: string;
      attachment?: { buffer?: Buffer };
      buffer?: Buffer;
    };
    let buffer: Buffer;

    if (source.type === 'GOOGLE_DRIVE') {
      sourceFile = await resolveGoogleDriveSourceFile(source);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = await downloadGoogleDriveFile(sourceFile.fileId, sourceFile.accessToken!);
    } else if (source.type === 'GOOGLE_SHEETS') {
      sourceFile = await resolveGoogleSheetsSourceFile(source);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = sourceFile.buffer || Buffer.alloc(0);
    } else if (source.type === 'ONEDRIVE' || source.type === 'SHAREPOINT' || source.type === 'OUTLOOK') {
      sourceFile = await resolveMicrosoftSourceFile(source, datasetType);
      if (sourceFile.size !== null) {
        assertImportFileWithinLimit(sourceFile.size);
      }
      buffer = sourceFile.buffer || Buffer.alloc(0);
    } else if (source.type === 'GMAIL') {
      sourceFile = await resolveGmailSourceFile(source, datasetType);
      buffer = sourceFile.attachment?.buffer || Buffer.alloc(0);
      assertImportFileWithinLimit(buffer.byteLength);
    } else {
      return res.status(400).json({ message: 'Import is currently supported for Google Drive, Google Sheets, Microsoft, and Gmail sources only.' });
    }

    assertImportFileWithinLimit(buffer.byteLength);
    const result = await importParsedFile(prisma, {
      datasetType,
      fileName: sourceFile.fileName,
      mimeType: sourceFile.mimeType,
      sourceId: source.id,
      sourceType: source.type,
      schoolId: source.schoolId,
      triggeredById: req.user!.id,
    }, buffer, req.body.mapping, {
      id: source.id,
      name: source.name,
      type: source.type,
      module: source.module,
      schoolId: source.schoolId,
      externalFileId: source.externalFileId,
      externalUrl: source.externalUrl,
      connectionConfig: source.connectionConfig,
    });

    res.status(201).json({
      data: {
        ...result,
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          module: source.module,
          schoolId: source.schoolId,
          school: source.school,
        },
        file: {
          fileId: sourceFile.fileId,
          fileName: sourceFile.fileName,
          mimeType: sourceFile.mimeType,
          size: sourceFile.size,
          checksum: sourceFile.checksum,
          webViewLink: sourceFile.webViewLink,
        },
        dataset: DATASET_DEFINITIONS[datasetType],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import source file';
    console.error('[Import Execute Error]', message);
    sendImportError(res, error, 'Failed to import source file');
  }
});

router.post('/excel-upload/preview', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Excel Preview Upload Debug]', {
        hasFile: Boolean(file),
        file: file
          ? {
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              fieldname: file.fieldname,
              encoding: file.encoding,
            }
          : null,
        files: (req as any).files ? Array.isArray((req as any).files) ? (req as any).files.length : Object.keys((req as any).files) : null,
        body: req.body,
      });
    }
    if (!file) {
      return res.status(400).json({ message: 'Excel file is required.' });
    }

    const datasetType = datasetTypeSchema.parse(String(req.body?.datasetType || ''));
    const mapping = typeof req.body?.mapping === 'string' && req.body.mapping.trim().length > 0
      ? safeJsonParse<Record<string, string>>(req.body.mapping, {})
      : undefined;

    assertImportFileWithinLimit(file.size);
    const preview = await previewImportFile(
      prisma,
      file.buffer,
      file.originalname,
      file.mimetype || null,
      datasetType,
      mapping,
    );
    const uploadRecord = await createTempUpload(file.buffer, file.originalname, file.mimetype || null, req.user!.id);

    res.json({
      data: {
        uploadId: uploadRecord.id,
        file: {
          fileName: uploadRecord.fileName,
          mimeType: uploadRecord.mimeType,
          size: uploadRecord.size,
        },
        preview,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview uploaded file';
    console.error('[Excel Preview Error]', message);
    sendImportError(res, error, 'Failed to preview uploaded file');
  }
});

router.post('/excel-upload/import', validateBody(excelUploadImportSchema), async (req: AuthRequest, res) => {
  let uploadId = '';
  try {
    const payload = req.body as z.infer<typeof excelUploadImportSchema>;
    uploadId = payload.uploadId;
    const { datasetType, mapping, sourceName, module, schoolId, externalUrl } = payload;
    const uploaded = await readTempUpload(uploadId, req.user!.id);
    assertImportFileWithinLimit(uploaded.buffer.byteLength);

    const source = await prisma.dataSource.create({
      data: {
        name: sourceName,
        type: 'EXCEL_UPLOAD',
        provider: 'EXCEL_UPLOAD',
        module,
        status: 'CONNECTED',
        ownerId: req.user!.id,
        schoolId: schoolId || null,
        lastSync: new Date(),
        connectionConfig: JSON.stringify({
          fileName: uploaded.info.fileName,
          mimeType: uploaded.info.mimeType,
          uploadId,
        }),
        metadata: JSON.stringify({
          importedFrom: 'excel_upload',
          uploadedAt: uploaded.info.createdAt,
          originalFileName: uploaded.info.fileName,
        }),
        externalUrl: externalUrl || null,
        analysisHistory: '[]',
      },
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    const result = await importParsedFile(prisma, {
      datasetType,
      fileName: uploaded.info.fileName,
      mimeType: uploaded.info.mimeType,
      sourceId: source.id,
      sourceType: 'EXCEL_UPLOAD',
      schoolId: source.schoolId,
      triggeredById: req.user!.id,
    }, uploaded.buffer, mapping, {
      id: source.id,
      name: source.name,
      type: source.type,
      module: source.module,
      schoolId: source.schoolId,
      externalFileId: null,
      externalUrl: source.externalUrl,
      connectionConfig: source.connectionConfig,
    });

    res.status(201).json({
      data: {
        ...result,
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          module: source.module,
          schoolId: source.schoolId,
          school: source.school,
        },
        file: {
          fileId: uploadId,
          fileName: uploaded.info.fileName,
          mimeType: uploaded.info.mimeType,
          size: uploaded.info.size,
        },
        dataset: DATASET_DEFINITIONS[datasetType],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import uploaded file';
    console.error('[Excel Import Error]', message);
    sendImportError(res, error, 'Failed to import uploaded file');
  } finally {
    if (uploadId) {
      await deleteTempUpload(uploadId).catch(() => undefined);
    }
  }
});

router.post('/sources/:sourceId/test-connection', async (req: AuthRequest, res) => {
  try {
    const source = await prisma.dataSource.findUnique({ where: { id: req.params.sourceId } });
    if (!source) return res.status(404).json({ message: 'Source not found' });

    let result: unknown;
    const reference = source.externalUrl || source.externalFileId || '';
    const connectionConfig = safeJsonParse<Record<string, any>>(source.connectionConfig, {});

    if (source.type === 'GOOGLE_DRIVE') {
      result = await testGoogleDriveConnection(reference, connectionConfig.fileId || source.externalFileId);
    } else if (source.type === 'GOOGLE_SHEETS') {
      const sheetResult = await resolveGoogleSheetsSource(reference, connectionConfig.fileId || source.externalFileId);
      const { buffer, accessToken, ...safeResult } = sheetResult as Record<string, any>;
      void buffer;
      void accessToken;
      result = safeResult;
    } else if (source.type === 'ONEDRIVE') {
      if (!connectionConfig.refreshToken) {
        return res.status(400).json({ message: 'Microsoft source is not connected. Please reconnect with Microsoft.' });
      }
      const accessToken = await refreshMicrosoftAccessToken(connectionConfig.refreshToken);
      result = await resolveOneDriveSource(reference, accessToken);
    } else if (source.type === 'SHAREPOINT') {
      if (!connectionConfig.refreshToken) {
        return res.status(400).json({ message: 'Microsoft source is not connected. Please reconnect with Microsoft.' });
      }
      const accessToken = await refreshMicrosoftAccessToken(connectionConfig.refreshToken);
      result = await resolveSharePointSource(reference, accessToken);
    } else if (source.type === 'OUTLOOK') {
      if (!connectionConfig.refreshToken) {
        return res.status(400).json({ message: 'Microsoft source is not connected. Please reconnect with Microsoft.' });
      }
      const accessToken = await refreshMicrosoftAccessToken(connectionConfig.refreshToken);
      const attachments = await resolveOutlookAttachments(accessToken, connectionConfig);
      result = attachments.map(({ buffer, ...attachment }) => attachment);
    } else {
      return res.status(400).json({ message: 'Connection testing is currently supported for file and email sources only.' });
    }

    res.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test Google Drive connection';
    console.error('[Import Connection Test Error]', message);
    res.status(500).json({ message });
  }
});

export default router;
