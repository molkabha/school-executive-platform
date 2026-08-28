import { Router } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, getErrorMessage, assertSchoolAccess } from '../utils';
import { prisma } from '../prisma';
import { validateBody, createTaskSchema, updateTaskSchema } from '../middleware/validate';

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * GET /api/tasks
 * List tasks with optional filters, ordered by dueDate asc (nulls last) then createdAt desc.
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

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
        include: { school: { select: { id: true, name: true } } },
        take,
        skip,
      }),
      prisma.task.count({ where }),
    ]);

    res.json({ data: tasks, pagination: { total, page: Math.max(Number(page) || 1, 1), limit: take } });
  } catch (error: unknown) {
    console.error('[Tasks GET Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to load tasks' });
  }
});

/**
 * POST /api/tasks
 * Create a new task.
 */
router.post('/', validateBody(createTaskSchema), async (req: AuthRequest, res) => {
  try {
    const { title, description, schoolId, priority, dueDate, assignedTo } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        schoolId: schoolId || null,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo: assignedTo || null,
      },
      include: { school: { select: { id: true, name: true } } },
    });

    await audit(req.user!.id, 'create_task', 'Task', task.id, `Created: ${title}`);
    res.status(201).json({ data: task });
  } catch (error: unknown) {
    console.error('[Task Create Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to create task' });
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task status / priority / due date / assignment.
 */
router.patch('/:id', validateBody(updateTaskSchema), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Task not found' });
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    const { status, priority, dueDate, assignedTo, description } = req.body;

    const updateData: any = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'DONE') {
        updateData.completedAt = new Date();
      } else {
        updateData.completedAt = null;
      }
    }
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (description !== undefined) updateData.description = description;

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: { school: { select: { id: true, name: true } } },
    });

    await audit(req.user!.id, 'update_task', 'Task', task.id,
      `Updated: status=${status || 'unchanged'}`);
    res.json({ data: task });
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Task not found' });
    }
    console.error('[Task Update Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Task not found' });
    if (!assertSchoolAccess(req.user!.schoolId, existing.schoolId, res)) return;

    await prisma.task.delete({ where: { id: req.params.id } });
    await audit(req.user!.id, 'delete_task', 'Task', req.params.id, 'Task deleted');
    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ message: 'Task not found' });
    }
    console.error('[Task Delete Error]', getErrorMessage(error));
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

export default router;

