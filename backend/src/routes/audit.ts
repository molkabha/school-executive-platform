import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess } from '../utils';
import { prisma } from '../prisma';

const router = Router();

router.use(authenticateToken);
// Aligned with the pattern used in all other route files (dashboard.ts, staff.ts, etc.):
// apply requireSupervisorAccess at the router level rather than per-route.
router.use(requireSupervisorAccess);

router.get('/', async (_req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    res.json({ data: logs });
  } catch (error: unknown) {
    console.error('[Audit GET /]', error);
    res.status(500).json({ message: 'Failed to load audit logs' });
  }
});

export default router;

