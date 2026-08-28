import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, safeJsonParse, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createDocumentSchema } from '../middleware/validate';
const router = Router();

interface DocumentRow {
  id: string;
  name: string;
  sourceType: string;
  externalUrl: string | null;
  module: string;
  lastUpdated: Date;
  metadata: string | null;
  analysisHistory: string | null;
  ownerId: string;
  schoolId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/documents
 * List document references. Never stores file content — only metadata + external URL.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { module, schoolId: querySchoolId } = req.query as { module?: string; schoolId?: string };

    const where: any = {};
    const schoolId = user.schoolId || querySchoolId;

    if (schoolId) {
      // SCOPING NOTE (Item 9): Strict filter — only documents explicitly linked to this school.
      // Global documents (schoolId = null) are intentionally excluded from school-scoped views
      // so the library shows only school-specific files. They appear in the "all schools" view
      // via the OR-null branch below.
      // See sources.ts for a fuller explanation of this intentional asymmetry vs dashboard/agent.
      where.schoolId = schoolId;
    } else {
      const activeSchools = await prisma.school.findMany({ where: { isActive: true }, select: { id: true } });
      const activeSchoolIds = activeSchools.map((s: { id: string }) => s.id);
      where.OR = [{ schoolId: { in: activeSchoolIds } }, { schoolId: null }];
    }

    if (module) where.module = module;

    const documents = await prisma.document.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
      orderBy: { lastUpdated: 'desc' },
    });

    res.json({
      data: documents.map((d: DocumentRow) => ({
        ...d,
        metadata: safeJsonParse<Record<string, any>>(d.metadata, {}),
        analysisHistory: safeJsonParse<any[]>(d.analysisHistory, []),
      })),
    });
  } catch (error: unknown) {
    console.error('[Documents GET Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load documents' });
  }
});

/**
 * POST /api/documents
 * Register a document reference. File stays in the original source.
 */
router.post('/', validateBody(createDocumentSchema), async (req: AuthRequest, res) => {
  try {
    const { name, sourceType, externalUrl, module, metadata, schoolId } = req.body;

    const document = await prisma.document.create({
      data: {
        name,
        sourceType,
        externalUrl: externalUrl || null,
        module,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ownerId: req.user!.id,
        schoolId: req.user!.schoolId || schoolId || null,
        analysisHistory: '[]',
      },
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    await audit(req.user!.id, 'create_document', 'Document', document.id, `Registered ${name}`);

    res.status(201).json({
      data: {
        ...document,
        metadata: safeJsonParse<Record<string, any>>(document.metadata, {}),
        analysisHistory: [],
      },
    });
  } catch (error: unknown) {
    console.error('[Documents POST Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to register document' });
  }
});

/**
 * GET /api/documents/:id
 * Get single document with full analysis history.
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    if (!document) return res.status(404).json({ message: 'Document not found' });

    res.json({
      data: {
        ...document,
        metadata: safeJsonParse<Record<string, any>>(document.metadata, {}),
        analysisHistory: safeJsonParse<any[]>(document.analysisHistory, []),
      },
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load document' });
  }
});

/**
 * DELETE /api/documents/:id
 * Remove document reference (does NOT delete the actual file from source).
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ message: 'Document not found' });

    if (document.ownerId !== req.user!.id && req.user!.role !== 'GENERAL_SUPERVISOR') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await prisma.document.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, 'delete_document', 'Document', req.params.id, `Deleted ${document.name}`);

    res.json({ message: 'Document reference removed' });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to delete document' });
  }
});

/**
 * POST /api/documents/:id/analysis
 * Save an AI analysis result to the document's analysisHistory.
 */
router.post('/:id/analysis', async (req: AuthRequest, res) => {
  try {
    const { analysis } = req.body;
    if (!analysis) return res.status(400).json({ message: 'Analysis result is required' });

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) return res.status(404).json({ message: 'Document not found' });

    const history = safeJsonParse<any[]>(document.analysisHistory, []);
    history.unshift({ ...analysis, analyzedAt: new Date().toISOString() });

    // Keep last 10 analyses
    const trimmed = history.slice(0, 10);

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: { analysisHistory: JSON.stringify(trimmed), lastUpdated: new Date() },
    });

    await audit(req.user!.id, 'analyze_document', 'Document', req.params.id, `AI analysis saved for ${document.name}`);

    res.json({ data: { analysisHistory: trimmed } });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to save analysis' });
  }
});

export default router;
