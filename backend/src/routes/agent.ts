import { Router } from 'express';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, safeJsonParse } from '../utils';
import { prisma } from '../prisma';
import { processAgentMessage, getExecutiveSummaryToday } from '../services/agent';
import { validateBody, agentChatSchema } from '../middleware/validate';
const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * POST /api/agent/chat
 * Executive AI Agent RAG Chat Query
 */
router.post('/chat', validateBody(agentChatSchema), async (req: AuthRequest, res) => {
  const { message, history, schoolId: bodySchoolId } = req.body;
  const schoolId = req.user!.schoolId || bodySchoolId;

  try {
    const userId = req.user!.id;
    const result = await processAgentMessage(message.trim(), userId, history ?? [], schoolId);

    await audit(userId, 'chat_agent_query', 'AgentMessage', 'none', `User queried AI Agent: ${message.slice(0, 50)}`);

    res.json({ data: result });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Agent Chat Error]', errorMessage);

    if (errorMessage.includes('API key not configured') || errorMessage.includes('لم يتم إعداد')) {
      return res.status(530).json({
        message: 'مفتاح الذكاء الاصطناعي غير مضبوط. يرجى الذهاب إلى صفحة الإعدادات وتوفير API Key الخاص بـ OpenAI أو Gemini أو Claude.',
      });
    }

    res.status(500).json({
      message: 'فشل معالجة الاستعلام بواسطة المساعد التنفيذي',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
});

/**
 * GET /api/agent/history
 * Fetch conversation history
 */
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { schoolId: querySchoolId } = req.query as { schoolId?: string };
    const schoolId = req.user!.schoolId || querySchoolId;

    const where: any = { userId };
    if (schoolId) {
      // Include messages specifically for this school, or system-wide messages (null)
      where.OR = [{ schoolId }, { schoolId: null }];
    } else {
      // If no school selected, only show system-wide messages
      where.schoolId = null;
    }

    const messages = await prisma.agentMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const formatted = messages.map((m: {
      id: string;
      role: string;
      content: string;
      dataSourcesUsed: string | null;
      lastDataUpdate: Date | null;
      reportId: string | null;
      createdAt: Date;
    }) => {
      let sources: string[] = [];
      if (m.dataSourcesUsed) {
        try {
          sources = safeJsonParse<string[]>(m.dataSourcesUsed, []);
        } catch {}
      }
      const isDbFallback = m.content.includes('المساعد الذكي غير متاح حالياً') || m.content.includes('⚠️');
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        dataSourcesUsed: sources,
        lastDataUpdate: m.lastDataUpdate,
        reportId: m.reportId,
        createdAt: m.createdAt,
        generatedBy: isDbFallback ? 'database' : 'ai',
        aiUsed: !isDbFallback,
      };
    });

    res.json({ data: formatted });
  } catch (error: unknown) {
    console.error('[Agent History Error]', error);
    res.status(500).json({ message: 'فشل تحميل سجل المحادثة' });
  }
});

/**
 * DELETE /api/agent/history
 * Clear conversation history — scoped by schoolId if provided.
 * When schoolId is given, only messages tied to that school are removed.
 * When absent, ALL messages for the user are removed (cross-school purge).
 * The frontend should pass schoolId by default when a school is selected,
 * and warn the user explicitly before triggering a cross-school purge.
 */
router.delete('/history', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { schoolId: querySchoolId } = req.query as { schoolId?: string };
    const schoolId = req.user!.schoolId || querySchoolId;

    const where: any = { userId };
    if (schoolId) {
      // Scoped delete: only removes messages for this specific school
      where.schoolId = schoolId;
    }
    // If schoolId is absent, where = { userId } which deletes all messages (intended purge)

    await prisma.agentMessage.deleteMany({ where });
    const auditDetail = schoolId
      ? `Cleared chat history for school ${schoolId}`
      : 'Cleared ALL chat history (cross-school purge)';
    await audit(userId, 'clear_agent_history', 'AgentMessage', 'none', auditDetail);
    res.json({ message: 'تم مسح سجل المحادثات بنجاح' });
  } catch (error: unknown) {
    res.status(500).json({ message: 'فشل مسح المحادثة' });
  }
});

/**
 * GET /api/agent/summary-today
 * Executive Intelligence Summary for Dashboard Widget
 */
router.get('/summary-today', async (req: AuthRequest, res) => {
  try {
    const { schoolId: querySchoolId } = req.query as { schoolId?: string };
    const schoolId = req.user!.schoolId || querySchoolId;
    const summary = await getExecutiveSummaryToday(schoolId);
    res.json({ data: summary });
  } catch (error: unknown) {
    console.error('[Agent Summary-Today Error]', error);
    res.status(500).json({ message: 'فشل جلب التلخيص التنفيذي اليومي' });
  }
});

/**
 * POST /api/agent/summary-today/refresh
 * Force-clears the AI summary cache and regenerates it.
 */
router.post('/summary-today/refresh', async (req: AuthRequest, res) => {
  try {
    const { schoolId: bodySchoolId } = req.body;
    const schoolId = req.user!.schoolId || bodySchoolId;
    const cacheKey = schoolId ? `ai_summary_cache_${schoolId}` : 'ai_summary_cache';
    await prisma.appConfig.deleteMany({ where: { key: cacheKey } });
    const summary = await getExecutiveSummaryToday(schoolId);
    res.json({ data: summary });
  } catch (error: unknown) {
    console.error('[Agent Summary-Today Refresh Error]', error);
    res.status(500).json({ message: 'فشل تحديث التلخيص التنفيذي' });
  }
});

export default router;
