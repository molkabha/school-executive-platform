import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createSchoolSchema, bulkCreateSchoolSchema } from '../middleware/validate';
const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

router.get('/', async (_req, res) => {
  try {
    const schools = await prisma.school.findMany({
      include: {
        sources: {
          select: { lastSync: true },
        },
        _count: {
          select: { sources: true, reports: true },
        },
      },
    });
    res.json({ data: schools });
  } catch (error: unknown) {
    console.error('[Schools GET /]', error);
    res.status(500).json({ message: 'Failed to load schools' });
  }
});

router.post('/', requireSupervisorAccess, validateBody(createSchoolSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code } = req.body;
    const existing = await prisma.school.findUnique({ where: { code } });
    if (existing) return res.status(409).json({ message: 'School code already exists' });

    const school = await prisma.school.create({
      data: { name, code },
    });

    await audit(req.user?.id || null, 'CREATE', 'School', school.id, `Created school ${name}`);
    res.status(201).json({ data: school });
  } catch (error: unknown) {
    console.error('[Schools POST /]', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'School code already exists' });
      }
    }
    res.status(500).json({ message: 'Failed to create school' });
  }
});

router.post('/bulk', requireSupervisorAccess, validateBody(bulkCreateSchoolSchema), async (req: AuthRequest, res) => {
  try {
    const { schools } = req.body;
    const formattedSchools = schools.map((item: { name: string; code: string }) => ({
      name: item.name,
      code: item.code,
    }));

    // Filter existing codes before bulk insert so the import remains idempotent.
    const existingSchools = await prisma.school.findMany({
      select: { code: true }
    });
    const existingCodes = new Set(existingSchools.map((s: { code: string }) => s.code));
    const toInsert = formattedSchools.filter(
      (item: { name: string; code: string }) => !existingCodes.has(item.code)
    );

    let importedCount = 0;
    if (toInsert.length > 0) {
      const result = await prisma.school.createMany({
        data: toInsert,
      });
      importedCount = result.count;
    }

    await audit(req.user?.id || null, 'IMPORT', 'School', 'bulk', `Imported ${importedCount} schools`);
    res.json({ data: { importedCount, totalCount: schools.length } });
  } catch (error: unknown) {
    console.error('[Schools POST /bulk]', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'One or more school codes already exist' });
      }
    }
    res.status(500).json({ message: 'Failed to bulk import schools' });
  }
});

router.put('/:id', requireSupervisorAccess, validateBody(createSchoolSchema), async (req: AuthRequest, res) => {
  try {
    const { name, code } = req.body;
    const schoolId = req.params.id;

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return res.status(404).json({ message: 'School not found' });

    const duplicate = await prisma.school.findUnique({ where: { code } });
    if (duplicate && duplicate.id !== schoolId) {
      return res.status(409).json({ message: 'School code already exists' });
    }

    const updatedSchool = await prisma.school.update({
      where: { id: schoolId },
      data: { name, code },
    });

    await audit(req.user?.id || null, 'UPDATE', 'School', updatedSchool.id, `Updated school ${updatedSchool.name}`);
    res.json({ data: updatedSchool });
  } catch (error: unknown) {
    console.error('[Schools PUT /:id]', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: 'School not found' });
      }
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'School code already exists' });
      }
    }
    res.status(500).json({ message: 'Failed to update school' });
  }
});

/**
 * PATCH /api/schools/:id/status
 * Toggle a school's active/inactive state. Inactive schools are excluded
 * from the dashboard, reports, and AI assistant context (see dashboard.ts,
 * reportSummary.ts, agent.ts) but their historical records are preserved —
 * this is the safe Phase 1 alternative to deleting a school to make the
 * displayed school count match reality.
 */
router.patch('/:id/status', requireSupervisorAccess, async (req: AuthRequest, res) => {
  try {
    const schoolId = req.params.id;
    const { isActive } = req.body as { isActive?: unknown };
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return res.status(404).json({ message: 'School not found' });

    const updated = await prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
    });

    await audit(
      req.user?.id || null,
      isActive ? 'ACTIVATE' : 'DEACTIVATE',
      'School',
      updated.id,
      `${isActive ? 'Activated' : 'Deactivated'} school ${updated.name}`
    );
    res.json({ data: updated });
  } catch (error: unknown) {
    console.error('[Schools PATCH /:id/status]', error);
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'School not found' });
    }
    res.status(500).json({ message: 'Failed to update school status' });
  }
});

router.delete('/:id', requireSupervisorAccess, async (req: AuthRequest, res) => {
  try {
    const schoolId = req.params.id;
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return res.status(404).json({ message: 'School not found' });

    await prisma.school.delete({ where: { id: schoolId } });
    await audit(req.user?.id || null, 'DELETE', 'School', schoolId, `Deleted school ${school.name}`);
    res.json({ data: { id: schoolId } });
  } catch (error: unknown) {
    console.error('[Schools DELETE /:id]', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: 'School not found' });
      }
      if (error.code === 'P2003') {
        return res.status(409).json({ message: 'Cannot delete school: it has related records (users, sources, etc.)' });
      }
    }
    res.status(500).json({ message: 'Failed to delete school' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.params.id },
      include: { sources: true, reports: true },
    });
    if (!school) return res.status(404).json({ message: 'School not found' });
    res.json({ data: school });
  } catch (error: unknown) {
    console.error('[Schools GET /:id]', error);
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'School not found' });
    }
    res.status(500).json({ message: 'Failed to load school' });
  }
});

export default router;
