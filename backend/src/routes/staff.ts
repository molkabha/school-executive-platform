import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, safeJsonParse, getErrorMessage, assertSchoolAccess } from '../utils';
import { prisma } from '../prisma';
import { validateBody, staffEntrySchema } from '../middleware/validate';
import { STAFF_MODULES, STAFF_MODULE_IDS } from '../constants/modules';

interface StaffModuleEntryWithSchoolName {
  id: string;
  moduleName: string;
  schoolId: string;
  school: { name: string };
  title: string;
  status: string;
  metrics: string | null;
  linkedDocument: string | null;
  sourceRefs: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StaffModuleEntryWithSchoolIdName {
  id: string;
  moduleName: string;
  schoolId: string;
  school: { id: string; name: string };
  title: string;
  status: string;
  metrics: string | null;
  linkedDocument: string | null;
  sourceRefs: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

// ---- Module Definitions ----
// (STAFF_MODULES / STAFF_MODULE_IDS imported above from ../constants/modules,
// the single source of truth shared with routes/sources.ts — see C7 fix.)

/**
 * GET /api/staff/modules
 * Returns all 15 module definitions with their entries per school.
 */
router.get('/modules', async (req: AuthRequest, res) => {
  try {
    const { schoolId: querySchoolId } = req.query as { schoolId?: string };
    const schoolId = req.user!.schoolId || querySchoolId;
    const schoolFilter: any = {};
    if (schoolId) schoolFilter.schoolId = schoolId;

    const entries = await prisma.staffModuleEntry.findMany({
      where: schoolFilter,
      include: { school: { select: { name: true } } },
    });

    const modulesWithData = STAFF_MODULES.map((mod) => {
      const moduleEntries = entries.filter((e: StaffModuleEntryWithSchoolName) => e.moduleName === mod.id);

      return {
        ...mod,
        entries: moduleEntries.map((e: StaffModuleEntryWithSchoolName) => ({
          id: e.id,
          schoolName: e.school.name,
          status: e.status,
          metrics: safeJsonParse<Record<string, any>>(e.metrics, {}),
          notes: e.notes,
          linkedDocument: e.linkedDocument,
          sourceRefs: safeJsonParse<string[]>(e.sourceRefs, []),
          updatedAt: e.updatedAt,
        })),
      };
    });

    res.json({ data: modulesWithData });
  } catch (error: unknown) {
    console.error('[Staff Modules Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load staff modules' });
  }
});

/**
 * GET /api/staff/:module
 * Returns business entries for a specific module, including reference IDs.
 */
router.get('/:module', async (req: AuthRequest, res) => {
  try {
    const { module } = req.params;
    const { schoolId: querySchoolId } = req.query as { schoolId?: string };
    const schoolId = req.user!.schoolId || querySchoolId;
    const schoolFilter: any = {};
    if (schoolId) schoolFilter.schoolId = schoolId;

    const moduleDef = STAFF_MODULES.find((m) => m.id === module);
    if (!moduleDef) return res.status(404).json({ message: 'Module not found' });

    const entries = await prisma.staffModuleEntry.findMany({
      where: { ...schoolFilter, moduleName: module },
      include: { school: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      data: {
        module: moduleDef,
        entries: entries.map((e: StaffModuleEntryWithSchoolIdName) => ({
          ...e,
          metrics: safeJsonParse<Record<string, any>>(e.metrics, {}),
          sourceRefs: safeJsonParse<string[]>(e.sourceRefs, []),
        })),
      },
    });
  } catch (error: unknown) {
    console.error('[Staff Module Detail Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load module data' });
  }
});

/**
 * POST /api/staff/:module/entry
 * Create or update a staff module entry for a school.
 * Supports structured fields for attendance and housing modules.
 */
router.post('/:module/entry', validateBody(staffEntrySchema), async (req: AuthRequest, res) => {
  try {
    const { module } = req.params;
    if (!STAFF_MODULE_IDS.includes(module)) {
      return res.status(404).json({ message: 'Module not found' });
    }
    const {
      schoolId, title, status, metrics, notes, linkedDocument, sourceRefs,
      // Structured fields for attendance
      attendanceRate, absenceCount,
      // Structured fields for housing
      housingIssueCount, housingCategory, housingSeverity, resolutionSla,
    } = req.body;

    const effectiveSchoolId = req.user!.schoolId || schoolId;
    if (!effectiveSchoolId) {
      return res.status(400).json({ message: 'schoolId is required' });
    }

    const entry = await prisma.staffModuleEntry.create({
      data: {
        moduleName: module,
        schoolId: effectiveSchoolId,
        title,
        status: status || 'ACTIVE',
        metrics: metrics ? JSON.stringify(metrics) : null,
        notes: notes || null,
        linkedDocument: linkedDocument || null,
        sourceRefs: sourceRefs ? JSON.stringify(sourceRefs) : null,
        // Structured fields
        attendanceRate: attendanceRate !== undefined ? Number(attendanceRate) : null,
        absenceCount: absenceCount !== undefined ? Number(absenceCount) : null,
        housingIssueCount: housingIssueCount !== undefined ? Number(housingIssueCount) : null,
        housingCategory: housingCategory || null,
        housingSeverity: housingSeverity || null,
        resolutionSla: resolutionSla || null,
      },
      include: { school: { select: { name: true } } },
    });

    await audit(req.user!.id, 'create_staff_entry', 'StaffModuleEntry', entry.id, `${module} entry for ${entry.school.name}`);

    // --- Auto-Alert Generation ---
    // Only generate if conditions are met; deduplicate by checking recent open alerts
    const ATTENDANCE_THRESHOLD = 85;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (module === 'attendance' && attendanceRate !== undefined && Number(attendanceRate) < ATTENDANCE_THRESHOLD) {
      const existing = await prisma.alert.findFirst({
        where: {
          type: 'ATTENDANCE',
          schoolId,
          status: { not: 'RESOLVED' },
          createdAt: { gte: oneDayAgo },
        },
      });
      if (!existing) {
        await prisma.alert.create({
          data: {
            type: 'ATTENDANCE',
            source: 'attendance',
            priority: Number(attendanceRate) < 70 ? 'CRITICAL' : 'HIGH',
            title: `معدل الحضور منخفض: ${Number(attendanceRate).toFixed(1)}%`,
            details: `تسجيل حضور بنسبة ${Number(attendanceRate).toFixed(1)}% في ${entry.school.name} — أقل من الحد المقبول ${ATTENDANCE_THRESHOLD}%`,
            schoolId,
            status: 'OPEN',
          },
        });
      }
    }

    if (module === 'housing' && housingSeverity === 'CRITICAL') {
      const existing = await prisma.alert.findFirst({
        where: {
          type: 'HOUSING',
          schoolId,
          status: { not: 'RESOLVED' },
          createdAt: { gte: oneDayAgo },
        },
      });
      if (!existing) {
        await prisma.alert.create({
          data: {
            type: 'HOUSING',
            source: 'housing',
            priority: 'CRITICAL',
            title: `مشكلة إسكان حرجة في ${entry.school.name}`,
            details: `تم تسجيل ${housingIssueCount || 0} مشكلة إسكان (${housingCategory || 'عام'}) بمستوى حرج`,
            schoolId,
            status: 'OPEN',
          },
        });
      }
    }

    res.status(201).json({ data: entry });
  } catch (error: unknown) {
    console.error('[Staff Entry Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to create staff entry' });
  }
});

/**
 * PATCH /api/staff/:module/entry/:id
 * Update an existing staff module entry.
 */
router.patch('/:module/entry/:id', validateBody(staffEntrySchema), async (req: AuthRequest, res) => {
  try {
    const { module, id } = req.params;
    if (!STAFF_MODULE_IDS.includes(module)) {
      return res.status(404).json({ message: 'Module not found' });
    }
    
    // Ensure entry exists and belongs to module
    const existing = await prisma.staffModuleEntry.findUnique({
      where: { id },
    });
    if (!existing || existing.moduleName !== module) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    const {
      schoolId, title, status, metrics, notes, linkedDocument, sourceRefs,
      attendanceRate, absenceCount,
      housingIssueCount, housingCategory, housingSeverity, resolutionSla,
    } = req.body;

    const effectiveSchoolId = req.user!.schoolId || schoolId || existing.schoolId;

    const entry = await prisma.staffModuleEntry.update({
      where: { id },
      data: {
        schoolId: effectiveSchoolId,
        title,
        status: status || existing.status,
        metrics: metrics ? JSON.stringify(metrics) : existing.metrics,
        notes: notes !== undefined ? notes : existing.notes,
        linkedDocument: linkedDocument !== undefined ? linkedDocument : existing.linkedDocument,
        sourceRefs: sourceRefs ? JSON.stringify(sourceRefs) : existing.sourceRefs,
        attendanceRate: attendanceRate !== undefined ? Number(attendanceRate) : existing.attendanceRate,
        absenceCount: absenceCount !== undefined ? Number(absenceCount) : existing.absenceCount,
        housingIssueCount: housingIssueCount !== undefined ? Number(housingIssueCount) : existing.housingIssueCount,
        housingCategory: housingCategory !== undefined ? housingCategory : existing.housingCategory,
        housingSeverity: housingSeverity !== undefined ? housingSeverity : existing.housingSeverity,
        resolutionSla: resolutionSla !== undefined ? resolutionSla : existing.resolutionSla,
      },
      include: { school: { select: { name: true } } },
    });

    await audit(req.user!.id, 'update_staff_entry', 'StaffModuleEntry', entry.id, `Updated ${module} entry for ${entry.school.name}`);

    res.json({ data: entry });
  } catch (error: unknown) {
    console.error('[Staff Entry Update Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update staff entry' });
  }
});

/**
 * DELETE /api/staff/:module/entry/:id
 * Delete a staff module entry.
 */
router.delete('/:module/entry/:id', async (req: AuthRequest, res) => {
  try {
    const { module, id } = req.params;
    if (!STAFF_MODULE_IDS.includes(module)) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const existing = await prisma.staffModuleEntry.findUnique({
      where: { id },
      include: { school: { select: { name: true } } },
    });
    if (!existing || existing.moduleName !== module) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    await prisma.staffModuleEntry.delete({ where: { id } });
    await audit(req.user!.id, 'delete_staff_entry', 'StaffModuleEntry', id, `Deleted ${module} entry for ${existing.school.name}`);

    res.json({ message: 'Entry deleted successfully' });
  } catch (error: unknown) {
    console.error('[Staff Entry Delete Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to delete staff entry' });
  }
});

export default router;
