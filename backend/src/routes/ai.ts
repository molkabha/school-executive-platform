import { Router } from 'express';
import axios from 'axios';
import { authenticateToken, requireSupervisorAccess, audit, AuthRequest, getErrorMessage } from '../utils';
import { prisma } from '../prisma';
import { validateBody, analyzeSchema, aiReportSchema } from '../middleware/validate';
import { analyzeDocument, generateExecutiveReport, testAIConnection, loadAIConfig } from '../services/ai';

const router = Router();

router.use(authenticateToken);
router.use(requireSupervisorAccess);

/**
 * POST /api/ai/analyze
 * Analyze document content and return structured executive summary.
 */
router.post('/analyze', validateBody(analyzeSchema), async (req: AuthRequest, res) => {
  const { documentType, module, summaryType, text, documentName } = req.body;

  try {
    const result = await analyzeDocument({ documentType, module, summaryType, text, documentName });

    await audit(
      req.user!.id,
      'analyze_document',
      'AIAnalysis',
      'none',
      `Analyzed ${documentType} for ${module}: ${documentName || 'unnamed'}`,
    );

    res.json({ data: result });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('[AI Analyze Error]', errorMessage);

    if (errorMessage.includes('API key not configured')) {
      return res.status(503).json({ message: errorMessage });
    }
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(503).json({ message: 'AI provider authentication failed. Please check your API key in Settings.' });
      }
      if (error.response?.status === 429) {
        return res.status(429).json({ message: 'AI rate limit exceeded. Please wait a moment and try again.' });
      }
    }

    res.status(500).json({
      message: 'AI analysis failed',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
});

/**
 * POST /api/ai/report
 * Generate a full structured executive report.
 */
router.post('/report', validateBody(aiReportSchema), async (req: AuthRequest, res) => {
  const { title, scope, period, modules, schoolId: bodySchoolId } = req.body;
  const schoolId = req.user!.schoolId || bodySchoolId;

  try {
    let schoolName: string | undefined;
    if (schoolId) {
      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      schoolName = school?.name;
    }

    const result = await generateExecutiveReport({
      title: title || 'التقرير التنفيذي',
      scope,
      period,
      modules,
      schoolId,
      schoolName,
    });

    await audit(req.user!.id, 'generate_ai_report', 'AIReport', 'none', `Generated ${period} report for ${scope}`);

    res.json({ data: result });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    console.error('[AI Report Error]', errorMessage);

    if (errorMessage.includes('API key not configured')) {
      return res.status(503).json({ message: errorMessage });
    }

    res.status(500).json({
      message: 'AI report generation failed',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
});

/**
 * GET /api/ai/config
 * Get current AI provider configuration (without exposing full API key).
 */
router.get('/config', async (_req, res) => {
  try {
    const config = await loadAIConfig();
    res.json({
      data: {
        provider: config.provider,
        model: config.model,
        hasApiKey: !!config.apiKey && config.apiKey.length > 4,
        apiKeyPreview: config.apiKey ? `${config.apiKey.slice(0, 4)}${'*'.repeat(12)}` : null,
        baseUrl: config.baseUrl || null,
      },
    });
  } catch (error: unknown) {
    void error;
    const envProvider = process.env.AI_PROVIDER || null;
    const envModel = process.env.AI_MODEL || process.env.OPENAI_MODEL || null;
    const envApiKeyPreview = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || '';
    res.json({
      data: {
        provider: envProvider,
        model: envModel,
        hasApiKey: !!envApiKeyPreview,
        apiKeyPreview: envApiKeyPreview ? `${envApiKeyPreview.slice(0, 4)}${'*'.repeat(12)}` : null,
        baseUrl: process.env.AI_BASE_URL || null,
      },
    });
  }
});

/**
 * POST /api/ai/test
 * Test AI connection with current or provided config.
 */
router.post('/test', async (req: AuthRequest, res) => {
  try {
    const overrides = req.body || {};
    const result = await testAIConnection(overrides);
    if (result.connected) {
      return res.json({ data: { connected: true, message: result.message } });
    }
    return res.status(400).json({ data: { connected: false, message: result.message } });
  } catch (error: unknown) {
    res.status(500).json({ data: { connected: false, error: getErrorMessage(error) } });
  }
});

export default router;
