import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, safeJsonParse, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createReportSchema, generateReportSchema } from '../middleware/validate';
import { generateExecutiveReport } from '../services/ai';
const router = Router();

interface ReportRow {
  id: string;
  title: string;
  scope: string;
  period: string;
  modules: string;
  aiOutput: string;
  createdById: string;
  schoolId: string | null;
  createdAt: Date;
}

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/reports
 * List executive reports across the school group.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { schoolId, scope, period, page, limit } = req.query as {
      schoolId?: string; scope?: string; period?: string;
      page?: string; limit?: string;
    };

    const take = Math.min(Number(limit) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: any = {};
    if (schoolId) where.schoolId = schoolId;
    if (scope) where.scope = scope;
    if (period) where.period = period;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          school: { select: { id: true, name: true } },
          exports: { orderBy: { exportedAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      data: reports.map((r: ReportRow) => ({
        ...r,
        aiOutput: safeJsonParse<Record<string, any>>(r.aiOutput, {}),
        modules: r.modules.split(',').map((m: string) => m.trim()),
      })),
      pagination: { total, page: Math.max(Number(page) || 1, 1), limit: take },
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load reports' });
  }
});

/**
 * GET /api/reports/:id
 * Get single report with full AI output.
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
        exports: true,
      },
    });

    if (!report) return res.status(404).json({ message: 'Report not found' });

    res.json({
      data: {
        ...report,
        aiOutput: safeJsonParse<Record<string, any>>(report.aiOutput, {}),
        modules: report.modules.split(',').map((m: string) => m.trim()),
      },
    });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load report' });
  }
});

/**
 * POST /api/reports
 * Save a report manually (with pre-provided aiOutput).
 */
router.post('/', validateBody(createReportSchema), async (req: AuthRequest, res) => {
  try {
    const { title, scope, period, modules, schoolId, aiOutput } = req.body;

    const report = await prisma.report.create({
      data: {
        title,
        scope,
        period,
        modules: Array.isArray(modules) ? modules.join(',') : String(modules),
        aiOutput: JSON.stringify(aiOutput || {}),
        createdById: req.user!.id,
        schoolId: schoolId || null,
      },
    });

    await audit(req.user!.id, 'create_report', 'Report', report.id, `Created: ${title}`);
    res.status(201).json({ data: { ...report, aiOutput: aiOutput || {}, modules } });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to create report' });
  }
});

/**
 * POST /api/reports/generate
 * Generate a full AI-powered executive report and save it.
 */
router.post('/generate', validateBody(generateReportSchema), async (req: AuthRequest, res) => {
  try {
    const { title, scope, period, modules, schoolId } = req.body;

    let schoolName: string | undefined;
    if (schoolId) {
      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      schoolName = school?.name;
    }

    // Call AI service
    const aiOutput = await generateExecutiveReport({
      title,
      scope,
      period,
      modules,
      schoolId,
      schoolName,
    });

    // Save to DB
    const report = await prisma.report.create({
      data: {
        title,
        scope,
        period,
        modules: modules.join(','),
        aiOutput: JSON.stringify(aiOutput),
        createdById: req.user!.id,
        schoolId: schoolId || null,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        school: { select: { id: true, name: true } },
      },
    });

    await audit(req.user!.id, 'generate_report', 'Report', report.id, `AI-generated: ${title}`);

    res.status(201).json({
      data: {
        ...report,
        aiOutput,
        modules,
      },
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('[Report Generate Error]', errorMessage);

    if (errorMessage.includes('API key not configured')) {
      return res.status(503).json({ message: errorMessage });
    }

    res.status(500).json({ message: 'Failed to generate report' });
  }
});

export default router;
