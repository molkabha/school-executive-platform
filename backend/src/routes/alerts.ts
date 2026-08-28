import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, assertSchoolAccess } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createAlertSchema } from '../middleware/validate';
const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/alerts
 * List alerts across the full school group.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, priority, type, schoolId } = req.query as {
      status?: string; priority?: string; type?: string; schoolId?: string;
    };

    const where: any = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (schoolId) where.schoolId = schoolId;

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ data: alerts });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to load alerts' });
  }
});

/**
 * POST /api/alerts
 * Create a new alert.
 */
router.post('/', validateBody(createAlertSchema), async (req: AuthRequest, res) => {
  try {
    const { type, source, priority, title, details, schoolId } = req.body;

    const alert = await prisma.alert.create({
      data: {
        type,
        source,
        priority,
        title,
        details: details || null,
        schoolId: schoolId || null,
        status: 'OPEN',
      },
    });

    await audit(req.user!.id, 'create_alert', 'Alert', alert.id, `Created: ${title}`);
    res.status(201).json({ data: alert });
  } catch (error: unknown) {
    void error;
    res.status(500).json({ message: 'Failed to create alert' });
  }
});

/**
 * PATCH /api/alerts/:id/status
 * Update alert status (OPEN | IN_PROGRESS | RESOLVED).
 */
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Use OPEN, IN_PROGRESS, or RESOLVED' });
    }

    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    if (!assertSchoolAccess(req.user!.schoolId, alert.schoolId, res)) return;

    const updated = await prisma.alert.update({
      where: { id: req.params.id },
      data: {
        status,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    await audit(req.user!.id, 'update_alert_status', 'Alert', updated.id, `Status → ${status}`);
    res.json({ data: updated });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.status(500).json({ message: 'Failed to update alert status' });
  }
});

/**
 * PATCH /api/alerts/:id/resolve
 * Shortcut to resolve an alert.
 */
router.patch('/:id/resolve', async (req: AuthRequest, res) => {
  try {
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    if (!assertSchoolAccess(req.user!.schoolId, alert.schoolId, res)) return;

    const updated = await prisma.alert.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), updatedAt: new Date() },
    });

    await audit(req.user!.id, 'resolve_alert', 'Alert', updated.id, `Resolved: ${updated.title}`);
    res.json({ data: updated });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.status(500).json({ message: 'Failed to resolve alert' });
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete an alert.
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    if (!assertSchoolAccess(user.schoolId, alert.schoolId, res)) return;

    await prisma.alert.delete({ where: { id: req.params.id } });
    await audit(user.id, 'delete_alert', 'Alert', req.params.id, 'Alert deleted');
    res.json({ message: 'Alert deleted' });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Alert not found' });
    }
    res.status(500).json({ message: 'Failed to delete alert' });
  }
});

export default router;

