import { Router } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, getErrorMessage, assertSchoolAccess } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createComplaintSchema, updateComplaintSchema } from '../middleware/validate';

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/complaints
 * List complaints with optional filters.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { schoolId, status, priority, page, limit } = req.query as {
      schoolId?: string; status?: string; priority?: string;
      page?: string; limit?: string;
    };

    const take = Math.min(Number(limit) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: any = {};
    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { school: { select: { id: true, name: true } } },
        take,
        skip,
      }),
      prisma.complaint.count({ where }),
    ]);

    res.json({ data: complaints, pagination: { total, page: Math.max(Number(page) || 1, 1), limit: take } });
  } catch (error: unknown) {
    console.error('[Complaints GET Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load complaints' });
  }
});

/**
 * POST /api/complaints
 * Create a new complaint.
 */
router.post('/', validateBody(createComplaintSchema), async (req: AuthRequest, res) => {
  try {
    const { schoolId, source, title, description, priority, assignedTo } = req.body;

    const complaint = await prisma.complaint.create({
      data: {
        schoolId,
        source,
        title,
        description,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        assignedTo: assignedTo || null,
      },
      include: { school: { select: { id: true, name: true } } },
    });

    await audit(req.user!.id, 'create_complaint', 'Complaint', complaint.id, `Created: ${title}`);
    res.status(201).json({ data: complaint });
  } catch (error: unknown) {
    console.error('[Complaint Create Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to create complaint' });
  }
});

/**
 * PATCH /api/complaints/:id
 * Update complaint status / priority / assignment.
 */
router.patch('/:id', validateBody(updateComplaintSchema), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Complaint not found' });
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    const { status, priority, assignedTo, resolutionNote } = req.body;

    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'RESOLVED') {
        updateData.resolvedAt = new Date();
      } else {
        updateData.resolvedAt = null;
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (resolutionNote !== undefined) updateData.resolutionNote = resolutionNote;

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: updateData,
      include: { school: { select: { id: true, name: true } } },
    });

    await audit(req.user!.id, 'update_complaint', 'Complaint', complaint.id,
      `Updated: status=${status || 'unchanged'}`);
    res.json({ data: complaint });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    console.error('[Complaint Update Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update complaint' });
  }
});

/**
 * DELETE /api/complaints/:id
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Complaint not found' });
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    await prisma.complaint.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, 'delete_complaint', 'Complaint', req.params.id, 'Complaint deleted');
    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    console.error('[Complaint Delete Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to delete complaint' });
  }
});

export default router;

