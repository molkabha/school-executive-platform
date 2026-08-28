/**
 * AI Service - Multi-Provider Abstraction Layer
 *
 * Supports: OpenAI-compatible, Google Gemini, Anthropic Claude, Groq
 * Provider/model/apiKey are read from AppConfig (DB) or environment variables.
 * Application logic never depends on a single provider.
 */

import { prisma } from '../prisma';
import { createAIProvider } from './providers';
import { getErrorMessage } from '../utils';
import { decryptSecret } from '../utils/encryption';
import {
  AIProviderConfig as SharedAIProviderConfig,
  normalizeProviderName,
  getEnvApiKey,
  getEnvModel,
  getDefaultModel,
  sanitizeOpenAIBaseUrl,
  isAuthFailure,
} from './providers/shared';
import { buildExecutiveReportSummary, type ExecutiveReportSummary } from './reportSummary';

// ---- Types ----

export type AIProviderConfig = SharedAIProviderConfig;

export interface AIAnalysisInput {
  documentType: 'excel' | 'pdf' | 'word' | 'email' | 'text';
  module: string;
  summaryType: 'executive' | 'detailed' | 'risks' | 'recommendations';
  text: string;
  documentName?: string;
}

export interface AIAnalysisOutput {
  executiveSummary: string;
  mainChanges: string[];
  risks: string[];
  recommendations: string[];
  requiredActions: string[];
  raw?: string;
}

export interface AIReportInput {
  title: string;
  scope: 'ALL_SCHOOLS' | 'SCHOOL_SPECIFIC';
  period: 'WEEKLY' | 'MONTHLY' | 'SEMESTER';
  modules: string[];
  schoolId?: string;
  schoolName?: string;
  contextData?: string;
}

export interface AIReportKpiItem {
  label: string;
  value: string | number;
  percentage?: string;
  trend?: string;
  meaning?: string;
}

export interface AIReportRiskItem {
  risk: string;
  impact: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  recommendedAction: string;
}

export interface AIReportRecommendationItem {
  action: string;
  responsiblePerson: string;
  deadline: string;
  expectedImpact: string;
}

export interface AIExecutiveReportOutput {
  coverPage?: {
    organization?: string;
    reportTitle?: string;
    reportingPeriod?: string;
    generationDate?: string;
    executiveLabel?: string;
  };
  executiveSummary: string;
  mainChanges: string[];
  importantIssues: string[];
  kpiDashboard: AIReportKpiItem[];
  chartData: {
    attendanceEvolution: Array<{ label: string; value: number }>;
    schoolComparison: Array<{ label: string; value: number }>;
    performanceTrends: Array<{ label: string; value: number }>;
    issueDistribution: Array<{ label: string; value: number }>;
    taskStatus: Array<{ label: string; value: number }>;
  };
  riskAnalysis: AIReportRiskItem[];
  recommendations: AIReportRecommendationItem[];
  requiredActions: Array<{ action: string; owner: string; deadline: string }>;
  finalConclusion: string;
  raw?: string;
}

// ---- Config Loader ----

export async function loadAIConfig(): Promise<AIProviderConfig> {
  const configs = await prisma.appConfig.findMany({
    where: { key: { in: ['ai_provider', 'ai_model', 'ai_api_key', 'ai_base_url'] } },
  });

  const configMap: Record<string, string> = {};
  for (const c of configs) configMap[c.key] = c.value;

  const providerRaw = configMap['ai_provider'] || process.env.AI_PROVIDER || undefined;
  const provider = normalizeProviderName(providerRaw) as AIProviderConfig['provider'] | null;

  if (!provider) {
    throw new Error('No AI provider configured. Set provider in the Settings page or via environment variable AI_PROVIDER.');
  }

  const model = configMap['ai_model'] || getEnvModel(provider) || getDefaultModel(provider);
  let apiKey = configMap['ai_api_key'];
  if (apiKey) {
    apiKey = decryptSecret(apiKey);
  } else {
    apiKey = getEnvApiKey(provider) || '';
  }

  const providedBase = configMap['ai_base_url'] || process.env.AI_BASE_URL || undefined;

  // Every OpenAI-compatible provider (openai, groq) must go through the SSRF
  // sanitizer — Groq previously bypassed it entirely by taking `providedBase`
  // as-is. `sanitizeOpenAIBaseUrl` still lets each provider's own default
  // origin through without requiring ALLOW_CUSTOM_AI_BASE_URL; anything else
  // (including an attacker-supplied internal/metadata URL) is checked.
  const baseUrl = provider === 'groq'
    ? await sanitizeOpenAIBaseUrl(providedBase || 'https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1')
    : await sanitizeOpenAIBaseUrl(providedBase);

  return { provider, apiKey, model, baseUrl };
}

// ---- Prompt Builder ----

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي متخصص في تحليل بيانات الكادر التعليمي لمجموعة مدارس.
مهمتك: تقديم ملخصات تنفيذية احترافية باللغة العربية لمديرة إشراف تنفيذية.
أسلوبك: دقيق، واضح، وعملي. ركز على الأرقام والاتجاهات والتوصيات القابلة للتنفيذ.
لا تذكر عبارات مثل "كمساعد ذكاء اصطناعي" - قدم التحليل مباشرة.`;

function buildAnalysisPrompt(input: AIAnalysisInput): string {
  const moduleNames: Record<string, string> = {
    attendance: 'الحضور والانصراف',
    housing: 'السكن والإقامة',
    teacher_voice: 'صوت المعلم',
    evaluation: 'التقييم المهني',
    turnover: 'دوران الكادر',
    workforce_plan: 'خطة القوى العاملة',
    allocation: 'التوزيع والتخصيص',
    professional_development: 'التطوير المهني',
    new_staff: 'الموظفون الجدد',
    wellbeing: 'الرفاهية والصحة النفسية',
  };

  const moduleName = moduleNames[input.module] || input.module;
  const docName = input.documentName ? `المستند: "${input.documentName}"` : '';

  return `تحليل بيانات ${moduleName}
${docName}
نوع المستند: ${input.documentType}
نوع التحليل المطلوب: ${input.summaryType}

محتوى البيانات:
---
${input.text}
---

أنتج تحليلاً تنفيذياً منظماً بالتنسيق التالي (JSON فقط، بدون نص إضافي):
{
  "executiveSummary": "ملخص تنفيذي في 3-4 جمل",
  "mainChanges": ["تغيير 1", "تغيير 2"],
  "risks": ["خطر 1", "خطر 2"],
  "recommendations": ["توصية 1", "توصية 2"],
  "requiredActions": ["إجراء مطلوب 1", "إجراء مطلوب 2"]
}`;
}


function buildExecutiveReportPrompt(input: AIReportInput, summaryData: ExecutiveReportSummary): string {
  const moduleLabels = summaryData.moduleLabels.length > 0 ? summaryData.moduleLabels.join('، ') : input.modules.join('، ');

  const payload = {
    title: input.title,
    scope: summaryData.scopeLabel,
    period: summaryData.reportingPeriod,
    modules: moduleLabels,
    metrics: {
      schoolCount: summaryData.schoolCount,
      connectedSources: summaryData.connectedSources,
      totalStaff: summaryData.totalStaff,
      attendanceRate: summaryData.attendanceRate,
      turnoverCount: summaryData.turnoverCount,
      openIssues: summaryData.openIssues,
      criticalAlerts: summaryData.criticalAlerts,
    },
    bestSchool: summaryData.bestSchool,
    watchlistSchool: summaryData.watchlistSchool,
    strengths: summaryData.strengths,
    risks: summaryData.risks,
    recommendations: summaryData.recommendations,
    kpis: summaryData.kpis,
    chartData: summaryData.chartData,
    keyRecommendation: summaryData.keyRecommendation,
    conclusionHint: summaryData.conclusionHint,
    contextNotes: summaryData.contextNotes,
  };

  return `اكتب تقريراً تنفيذياً موجزاً باللغة العربية الفصحى.
الأسلوب: مهني، واضح، ومباشر.
الطول: مختصر، بدون حشو أو عبارات عامة.
التركيز: مؤشرات الأداء، المخاطر، المدارس التي تحتاج متابعة، والتوصيات العملية.
لا تستخدم عبارات مثل "بناءً على البيانات المتاحة" ولا تكرر نفس الفكرة بصيغ مختلفة.

قاعدة صارمة بخصوص "kpiDashboard": القيم الرقمية والنسب المئوية للاتجاه (trend) يجب أن تُبنى فقط على الأرقام الواردة في "metrics" أو "kpis" أدناه.
- إذا كانت قيمة مؤشر ما في "kpis" أدناه هي "غير متوفر حالياً"، انسخ هذه العبارة كما هي كقيمة (value) لنفس المؤشر ولا تستبدلها برقم مبتكر مهما بدا معقولاً.
- إذا كان اتجاه مؤشر ما (trend) في "kpis" أدناه هو "لا توجد مقارنة سابقة"، انسخه كما هو ولا تحسب نسبة تغيّر (مثل "+٥٪" أو "-١٠٠٪") من بيانات غير موجودة.
- لا تخترع أي نسبة اتجاه (trend) لأي مؤشر لا توجد له قيمة أساس (baseline) واضحة في البيانات المرسلة إليك.

أخرج JSON فقط بالشكل التالي:
{
  "coverPage": { "organization": "string", "reportTitle": "string", "reportingPeriod": "string", "generationDate": "string", "executiveLabel": "string" },
  "executiveSummary": "string",
  "mainChanges": ["string"],
  "importantIssues": ["string"],
  "kpiDashboard": [{"label":"string","value":"string","trend":"string","meaning":"string"}],
  "chartData": {
    "attendanceEvolution": [{"label":"string","value":0}],
    "schoolComparison": [{"label":"string","value":0}],
    "performanceTrends": [{"label":"string","value":0}],
    "issueDistribution": [{"label":"string","value":0}],
    "taskStatus": [{"label":"string","value":0}]
  },
  "riskAnalysis": [{"risk":"string","impact":"string","priority":"LOW|MEDIUM|HIGH|CRITICAL","recommendedAction":"string"}],
  "recommendations": [{"action":"string","responsiblePerson":"string","deadline":"string","expectedImpact":"string"}],
  "requiredActions": [{"action":"string","owner":"string","deadline":"string"}],
  "finalConclusion": "string"
}

Summary payload:
${JSON.stringify(payload)}`;
}

// ---- Helpers ----

function parseAIOutput(raw: string): Record<string, any> {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      executiveSummary: raw,
      mainChanges: [],
      risks: [],
      recommendations: [],
      requiredActions: [],
    };
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item == null) return '';
    if (typeof item === 'object') return JSON.stringify(item);
    return String(item);
  }).filter(Boolean);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function normalizeExecutiveReportOutput(raw: string, parsed: Record<string, any>, input: AIReportInput): AIExecutiveReportOutput {
  const coverPage = parsed.coverPage && typeof parsed.coverPage === 'object'
    ? {
        organization: String(parsed.coverPage.organization || 'مجموعة المدارس'),
        reportTitle: String(parsed.coverPage.reportTitle || input.title || 'التقرير التنفيذي'),
        reportingPeriod: String(parsed.coverPage.reportingPeriod || input.period),
        generationDate: String(parsed.coverPage.generationDate || new Date().toISOString()),
        executiveLabel: String(parsed.coverPage.executiveLabel || 'Generated by AI Executive Assistant'),
      }
    : {
        organization: 'مجموعة المدارس',
        reportTitle: input.title || 'التقرير التنفيذي',
        reportingPeriod: input.period,
        generationDate: new Date().toISOString(),
        executiveLabel: 'Generated by AI Executive Assistant',
      };

  const kpiDashboard = Array.isArray(parsed.kpiDashboard)
    ? parsed.kpiDashboard.map((item: any) => ({
        label: String(item?.label || item?.name || 'KPI'),
        value: item?.value ?? '',
        percentage: item?.percentage != null ? String(item.percentage) : undefined,
        trend: item?.trend != null ? String(item.trend) : undefined,
        meaning: item?.meaning != null ? String(item.meaning) : undefined,
      }))
    : [];

  const chartData = {
    attendanceEvolution: Array.isArray(parsed.chartData?.attendanceEvolution)
      ? parsed.chartData.attendanceEvolution.map((item: any) => ({
          label: String(item?.label || ''),
          value: toNumber(item?.value),
        }))
      : [],
    schoolComparison: Array.isArray(parsed.chartData?.schoolComparison)
      ? parsed.chartData.schoolComparison.map((item: any) => ({
          label: String(item?.label || ''),
          value: toNumber(item?.value),
        }))
      : [],
    performanceTrends: Array.isArray(parsed.chartData?.performanceTrends)
      ? parsed.chartData.performanceTrends.map((item: any) => ({
          label: String(item?.label || ''),
          value: toNumber(item?.value),
        }))
      : [],
    issueDistribution: Array.isArray(parsed.chartData?.issueDistribution)
      ? parsed.chartData.issueDistribution.map((item: any) => ({
          label: String(item?.label || ''),
          value: toNumber(item?.value),
        }))
      : [],
    taskStatus: Array.isArray(parsed.chartData?.taskStatus)
      ? parsed.chartData.taskStatus.map((item: any) => ({
          label: String(item?.label || ''),
          value: toNumber(item?.value),
        }))
      : [],
  };

  const riskSource = Array.isArray(parsed.riskAnalysis) ? parsed.riskAnalysis : Array.isArray(parsed.risks) ? parsed.risks : [];
  const riskAnalysis = riskSource.map((item: any) => ({
        risk: String(item?.risk || item?.title || ''),
        impact: String(item?.impact || ''),
        priority: String(item?.priority || 'MEDIUM'),
        recommendedAction: String(item?.recommendedAction || item?.recommended_action || ''),
      })).filter((item: AIReportRiskItem) => item.risk || item.impact || item.recommendedAction);

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((item: any) => ({
        action: String(item?.action || item || ''),
        responsiblePerson: String(item?.responsiblePerson || item?.owner || 'غير محدد'),
        deadline: String(item?.deadline || 'غير محدد'),
        expectedImpact: String(item?.expectedImpact || item?.impact || 'غير محدد'),
      }))
    : [];

  const requiredActions = Array.isArray(parsed.requiredActions)
    ? parsed.requiredActions.map((item: any) => {
        if (typeof item === 'string') {
          return { action: item, owner: 'غير محدد', deadline: 'غير محدد' };
        }
        return {
          action: String(item?.action || ''),
          owner: String(item?.owner || 'غير محدد'),
          deadline: String(item?.deadline || 'غير محدد'),
        };
      })
    : [];

  return {
    coverPage,
    executiveSummary: String(parsed.executiveSummary || input.title || ''),
    mainChanges: toStringArray(parsed.mainChanges),
    importantIssues: toStringArray(parsed.importantIssues),
    kpiDashboard,
    chartData,
    riskAnalysis,
    recommendations,
    requiredActions,
    finalConclusion: String(parsed.finalConclusion || parsed.conclusion || ''),
    raw,
  };
}

function normalizeExecutiveReportOutputWithSummary(
  raw: string,
  parsed: Record<string, any>,
  input: AIReportInput,
  summaryData: ExecutiveReportSummary,
): AIExecutiveReportOutput {
  const normalized = normalizeExecutiveReportOutput(raw, parsed, input);

  return {
    ...normalized,
    coverPage: {
      ...normalized.coverPage,
      organization: normalized.coverPage?.organization || summaryData.organization,
      reportTitle: normalized.coverPage?.reportTitle || summaryData.reportTitle,
      reportingPeriod: normalized.coverPage?.reportingPeriod || summaryData.reportingPeriod,
      generationDate: normalized.coverPage?.generationDate || summaryData.generationDate,
      executiveLabel: normalized.coverPage?.executiveLabel || summaryData.conclusionHint,
    },
    executiveSummary: normalized.executiveSummary || summaryData.strengths[0] || input.title,
    mainChanges: normalized.mainChanges.length > 0 ? normalized.mainChanges : summaryData.strengths.slice(0, 3),
    importantIssues:
      normalized.importantIssues.length > 0
        ? normalized.importantIssues
        : summaryData.risks.map((risk) => `${risk.risk}: ${risk.impact}`),
    kpiDashboard:
      normalized.kpiDashboard.length > 0
        ? normalized.kpiDashboard
        : summaryData.kpis.map((item) => ({
            label: item.label,
            value: item.value,
            trend: item.trend,
            meaning: item.meaning,
          })),
    chartData:
      normalized.chartData?.attendanceEvolution?.length
        ? normalized.chartData
        : summaryData.chartData,
    riskAnalysis:
      normalized.riskAnalysis.length > 0
        ? normalized.riskAnalysis
        : summaryData.risks.map((risk) => ({
            risk: risk.risk,
            impact: risk.impact,
            priority: risk.priority,
            recommendedAction: risk.recommendedAction,
          })),
    recommendations:
      normalized.recommendations.length > 0
        ? normalized.recommendations
        : summaryData.recommendations.map((item) => ({
            action: item.action,
            responsiblePerson: item.responsiblePerson,
            deadline: item.deadline,
            expectedImpact: item.expectedImpact,
          })),
    requiredActions:
      normalized.requiredActions.length > 0
        ? normalized.requiredActions
        : summaryData.recommendations.map((item) => ({
            action: item.action,
            owner: item.responsiblePerson,
            deadline: item.deadline,
          })),
    finalConclusion: normalized.finalConclusion || summaryData.conclusionHint,
  };
}

// ---- Retry Helpers ----

const AI_MAX_ATTEMPTS = 3;
const AI_RETRY_BASE_DELAY_MS = 500;

/**
 * Decide whether an error from an AI provider call is worth retrying.
 * Retries: network errors (no response received), HTTP 429, and temporary 5xx.
 * Does not retry: 400, 401/403, or any other client-side/auth failure.
 */
function isRetryableAIError(error: any): boolean {
  // Axios network-level errors have no `response` (DNS failure, timeout, connection reset, etc.)
  if (!error?.response) return true;

  const status = error.response.status;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Main AI Caller ----

async function callAI(
  config: AIProviderConfig,
  userPrompt: string,
  options: { temperature?: number; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('AI provider API key not configured. Please set it in Settings.');
  }

  const provider = createAIProvider(config);

  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    try {
      return await provider.generateText(userPrompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        json: options.json,
      });
    } catch (err: unknown) {
      lastError = err;

      if (isAuthFailure(err)) {
        const e = new Error('Authentication failed when connecting to AI provider');
        (e as Error & { cause?: unknown }).cause = err;
        throw e;
      }

      const canRetry = attempt < AI_MAX_ATTEMPTS && isRetryableAIError(err);
      if (!canRetry) {
        throw err;
      }

      const backoffMs = AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `[AI Retry] Attempt ${attempt}/${AI_MAX_ATTEMPTS} failed (${getErrorMessage(err)}). Retrying in ${backoffMs}ms.`,
      );
      await delay(backoffMs);
    }
  }

  // Unreachable in practice, but keeps TypeScript satisfied.
  throw lastError;
}

// ---- Public API ----

export async function analyzeDocument(input: AIAnalysisInput): Promise<AIAnalysisOutput> {
  const config = await loadAIConfig();
  const prompt = buildAnalysisPrompt(input);
  const raw = await callAI(config, prompt, { json: true, temperature: 0.3, maxTokens: 1500 });
  const parsed = parseAIOutput(raw);

  return {
    executiveSummary: parsed.executiveSummary || '',
    mainChanges: Array.isArray(parsed.mainChanges) ? parsed.mainChanges : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    requiredActions: Array.isArray(parsed.requiredActions) ? parsed.requiredActions : [],
    raw,
  };
}

export async function generateExecutiveReport(input: AIReportInput): Promise<AIExecutiveReportOutput> {
  const config = await loadAIConfig();
  const summaryData = await buildExecutiveReportSummary({
    title: input.title,
    scope: input.scope,
    period: input.period,
    modules: input.modules,
    schoolId: input.schoolId,
    schoolName: input.schoolName,
  });
  const prompt = buildExecutiveReportPrompt(input, summaryData);
  console.info('[Report AI Prompt]', {
    bytes: Buffer.byteLength(prompt, 'utf8'),
    modules: input.modules.length,
    schools: summaryData.schoolCount,
  });
  const raw = await callAI(config, prompt, { json: true, temperature: 0.25, maxTokens: 3500 });
  const parsed = parseAIOutput(raw);
  return normalizeExecutiveReportOutputWithSummary(raw, parsed, input, summaryData);
}

export interface AIConnectionResult {
  connected: boolean;
  message?: string;
}

export async function testAIConnection(providerOverride?: Partial<AIProviderConfig>): Promise<AIConnectionResult> {
  const config = await loadAIConfig();
  const requestedProvider = normalizeProviderName(providerOverride?.provider) || config.provider;
  const requestedBase = providerOverride?.baseUrl || config.baseUrl;

  // `providerOverride` comes directly from the request body of POST /api/ai/test
  // (an authenticated but user-controlled input). It must be sanitized exactly
  // like loadAIConfig does — previously a `provider: 'groq'` override skipped
  // sanitization entirely, making this endpoint a direct, unauthenticated-of-URL
  // SSRF probe: any internal/metadata URL could be submitted and the server
  // would connect to it and report back whether it succeeded.
  const sanitizedBaseUrl = requestedProvider === 'groq'
    ? await sanitizeOpenAIBaseUrl(requestedBase || 'https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1')
    : await sanitizeOpenAIBaseUrl(requestedBase);

  const testConfig: AIProviderConfig = {
    ...config,
    ...providerOverride,
    provider: requestedProvider,
    baseUrl: sanitizedBaseUrl,
  } as AIProviderConfig;

  if ((requestedProvider === 'openai' || requestedProvider === 'groq') && requestedBase && !sanitizedBaseUrl) {
    return { connected: false, message: 'Rejected base URL: it must be a public, resolvable HTTPS endpoint (custom base URLs are also disabled unless ALLOW_CUSTOM_AI_BASE_URL=true).' };
  }

  if (!testConfig.apiKey) {
    return { connected: false, message: 'No API key configured for selected provider' };
  }

  try {
    await callAI(testConfig, 'اكتب كلمة "متصل" فقط للتأكيد.', { maxTokens: 10 });
    if (testConfig.provider === 'gemini') return { connected: true, message: 'Gemini connection successful' };
    if (testConfig.provider === 'openai') return { connected: true, message: 'OpenAI connection successful' };
    if (testConfig.provider === 'claude') return { connected: true, message: 'Claude connection successful' };
    if (testConfig.provider === 'groq') return { connected: true, message: 'Groq connection successful' };
    return { connected: true, message: 'Connection successful' };
  } catch (err: unknown) {
    if (isAuthFailure(err)) {
      return { connected: false, message: 'Invalid API key or authentication failed' };
    }
    return { connected: false, message: getErrorMessage(err) || 'Unknown error' };
  }
}
