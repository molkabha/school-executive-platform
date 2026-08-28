import { Router } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, getErrorMessage, safeJsonParse } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createMeetingSchema, updateMeetingSchema } from '../middleware/validate';

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/** Enrich meetings with school names from JSON schoolIds field */
async function enrichMeetings(meetings: any[]) {
  if (meetings.length === 0) return meetings;

  // Collect all schoolIds referenced by these meetings
  const neededIds = new Set<string>();
  for (const m of meetings) {
    const ids: string[] = safeJsonParse<string[]>(m.schoolIds, []);
    ids.forEach((id) => neededIds.add(id));
  }

  if (neededIds.size === 0) {
    return meetings.map((m: any) => ({ ...m, schoolNames: [] }));
  }

  const schools = await prisma.school.findMany({
    where: { id: { in: Array.from(neededIds) } },
    select: { id: true, name: true },
  });
  const schoolMap = new Map(schools.map((s: { id: string; name: string }) => [s.id, s.name]));

  return meetings.map((m: any) => {
    const ids: string[] = safeJsonParse<string[]>(m.schoolIds, []);
    const schoolNames = ids.map((id: string) => ({ id, name: schoolMap.get(id) || id }));
    return { ...m, schoolNames };
  });
}

/**
 * GET /api/meetings/today
 * Returns today's SCHEDULED meetings. Used by the dashboard.
 * IMPORTANT: This route must be defined BEFORE /:id to avoid path conflict.
 */
router.get('/today', async (req: AuthRequest, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const meetings = await prisma.meeting.findMany({
      where: {
        date: { gte: start, lte: end },
        status: 'SCHEDULED',
      },
      orderBy: { date: 'asc' },
    });

    let filtered = meetings;
    if (req.user?.schoolId) {
      filtered = meetings.filter((m: any) => {
        try {
          const ids = safeJsonParse<string[]>(m.schoolIds, []);
          return ids.length === 0 || ids.includes(req.user!.schoolId!);
        } catch {
          return false;
        }
      });
    }

    const enriched = await enrichMeetings(filtered);
    res.json({ data: enriched });
  } catch (error: unknown) {
    console.error('[Meetings Today Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load today meetings' });
  }
});

/**
 * GET /api/meetings
 * List meetings with optional filters.
 * Query: date (YYYY-MM-DD), status, upcoming (true)
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { date, status, upcoming, schoolId: querySchoolId } = req.query as {
      date?: string; status?: string; upcoming?: string; schoolId?: string;
    };
    const schoolId = req.user!.schoolId || querySchoolId;

    const where: any = {};

    if (date) {
      const day = new Date(date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = { gte: day, lt: nextDay };
    }

    if (upcoming === 'true') {
      where.date = { gte: new Date() };
      where.status = 'SCHEDULED';
    } else if (status) {
      where.status = status;
    }

    const meetings = await prisma.meeting.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // Post-filter by schoolId since schoolIds is stored as a JSON string array
    let filtered = meetings;
    if (schoolId) {
      filtered = meetings.filter((m: any) => {
        try {
          const ids = safeJsonParse<string[]>(m.schoolIds, []);
          return ids.length === 0 || ids.includes(schoolId);
        } catch {
          return false;
        }
      });
    }

    const enriched = await enrichMeetings(filtered);
    res.json({ data: enriched });
  } catch (error: unknown) {
    console.error('[Meetings GET Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load meetings' });
  }
});

/**
 * POST /api/meetings
 * Create a new meeting.
 */
router.post('/', validateBody(createMeetingSchema), async (req: AuthRequest, res) => {
  try {
    const { title, date, location, schoolIds, participants, agenda } = req.body;
    let finalSchoolIds: string[] = schoolIds || [];
    if (req.user!.schoolId && !finalSchoolIds.includes(req.user!.schoolId)) {
      finalSchoolIds.push(req.user!.schoolId);
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        date: new Date(date),
        location: location || null,
        schoolIds: JSON.stringify(finalSchoolIds),
        participants: participants || null,
        agenda: agenda || null,
        status: 'SCHEDULED',
      },
    });

    await audit(req.user!.id, 'create_meeting', 'Meeting', meeting.id, `Created: ${title}`);
    const enriched = await enrichMeetings([meeting]);
    res.status(201).json({ data: enriched[0] });
  } catch (error: unknown) {
    console.error('[Meeting Create Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to create meeting' });
  }
});

/**
 * PATCH /api/meetings/:id
 * Update meeting status / notes / date / location.
 */
router.patch('/:id', validateBody(updateMeetingSchema), async (req: AuthRequest, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (req.user!.schoolId) {
      const meetingSchoolIds: string[] = safeJsonParse(meeting.schoolIds, []);
      if (meetingSchoolIds.length > 0 && !meetingSchoolIds.includes(req.user!.schoolId)) {
        return res.status(403).json({ message: 'Forbidden: this meeting does not involve your school.' });
      }
    }

    const { status, notes, date, location, participants, agenda, title } = req.body;

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (date !== undefined) updateData.date = new Date(date);
    if (location !== undefined) updateData.location = location;
    if (participants !== undefined) updateData.participants = participants;
    if (agenda !== undefined) updateData.agenda = agenda;
    if (title !== undefined) updateData.title = title;

    const updated = await prisma.meeting.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await audit(req.user!.id, 'update_meeting', 'Meeting', updated.id,
      `Updated: status=${status || 'unchanged'}`);
    const enriched = await enrichMeetings([updated]);
    res.json({ data: enriched[0] });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    console.error('[Meeting Update Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update meeting' });
  }
});

/**
 * DELETE /api/meetings/:id
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (req.user!.schoolId) {
      const meetingSchoolIds: string[] = safeJsonParse(meeting.schoolIds, []);
      if (meetingSchoolIds.length > 0 && !meetingSchoolIds.includes(req.user!.schoolId)) {
        return res.status(403).json({ message: 'Forbidden: this meeting does not involve your school.' });
      }
    }

    await prisma.meeting.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, 'delete_meeting', 'Meeting', req.params.id, 'Meeting deleted');
    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    console.error('[Meeting Delete Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to delete meeting' });
  }
});

export default router;

