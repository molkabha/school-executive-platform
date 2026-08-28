import { ReportItem } from '../../types';

export type ReportSeriesPoint = { label: string; value: number };

export interface ReportKpiCard {
  label: string;
  value: string;
  trend: string;
  status: 'success' | 'warning' | 'danger' | 'neutral' | 'brand';
  icon: string;
  hint: string;
}

export interface ReportRiskCard {
  risk: string;
  impact: string;
  priority: string;
  recommendedAction: string;
}

export interface ReportRecommendationCard {
  action: string;
  responsiblePerson: string;
  deadline: string;
  expectedImpact: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ReportViewModel {
  title: string;
  organization: string;
  reportingPeriod: string;
  generationDate: string;
  summary: string;
  performanceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  keyRecommendation: string;
  coverLabel: string;
  coverMeta: Array<{ label: string; value: string }>;
  kpis: ReportKpiCard[];
  chartSeries: Array<{
    title: string;
    subtitle: string;
    color: string;
    points: ReportSeriesPoint[];
  }>;
  risks: ReportRiskCard[];
  recommendations: ReportRecommendationCard[];
  actions: ReportRecommendationCard[];
  conclusion: string;
}

const EMPTY_SERIES: ReportSeriesPoint[] = [];

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function inferPriority(text: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const normalized = text.toLowerCase();
  if (normalized.includes('critical') || normalized.includes('حرج')) return 'HIGH';
  if (normalized.includes('high') || normalized.includes('عالي')) return 'HIGH';
  if (normalized.includes('medium') || normalized.includes('متوسط')) return 'MEDIUM';
  return 'LOW';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickPrimaryMetric(report: ReportItem): number {
  const ai = report.aiOutput;
  const kpis = safeArray<{ value: string | number }>(ai.kpiDashboard);
  const values = kpis.map((item) => toNumber(item.value)).filter((value) => value > 0);
  if (values.length > 0) return clampScore(average(values));
  return clampScore(78 + safeArray(ai.mainChanges).length * 2 - safeArray(ai.importantIssues).length * 3);
}

function statusFromScore(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 70) return 'warning';
  return 'danger';
}

function buildFixedKpis(report: ReportItem): ReportKpiCard[] {
  const ai = report.aiOutput;
  const source = safeArray<{ label: string; value: string | number; trend?: string; meaning?: string }>(ai.kpiDashboard);
  const byLabel = (matchers: string[]) => source.find((item) =>
    matchers.some((m) => item.label?.toLowerCase().includes(m.toLowerCase())),
  );

  const attendance = byLabel(['attendance', 'حضور']) || source[0];
  const staff = byLabel(['performance', 'staff', 'كادر']) || source[1];
  const complaints = byLabel(['complaint', 'issue', 'مشكلة']) || {
    label: 'Complaints',
    value: safeArray(ai.risks).length || safeArray(ai.importantIssues).length || 0,
    trend: '-3%',
    meaning: 'Issues requiring review',
  };
  const tasks = byLabel(['task', 'action', 'required']) || {
    label: 'Tasks',
    value: safeArray(ai.requiredActions).length || 0,
    trend: '+2%',
    meaning: 'Open work items',
  };
  const meetings = byLabel(['meeting', 'recommend']) || {
    label: 'Meetings',
    value: safeArray(ai.recommendations).length || 0,
    trend: '+1%',
    meaning: 'Follow-up sessions',
  };
  const budget = byLabel(['budget', 'cost', 'financial']) || {
    label: 'Budget',
    value: 'N/A',
    trend: 'Stable',
    meaning: 'No budget feed available',
  };

  const mapped = [
    {
      source: attendance,
      label: 'Attendance',
      icon: 'fa-clipboard-check',
      hint: 'Attendance and presence performance',
      status: statusFromScore(toNumber(attendance?.value, 0)),
    },
    {
      source: staff,
      label: 'Staff Performance',
      icon: 'fa-users-gear',
      hint: 'Staff productivity and follow-through',
      status: statusFromScore(toNumber(staff?.value, 0)),
    },
    {
      source: complaints,
      label: 'Complaints',
      icon: 'fa-triangle-exclamation',
      hint: 'Open issues and concerns',
      status: inferPriority(normalizeText(complaints?.trend || complaints?.meaning || 'warning')).toLowerCase() === 'high'
        ? 'danger'
        : 'warning',
    },
    {
      source: tasks,
      label: 'Tasks',
      icon: 'fa-list-check',
      hint: 'Action items awaiting closure',
      status: tasks && toNumber(tasks.value, 0) > 5 ? 'warning' : 'success',
    },
    {
      source: meetings,
      label: 'Meetings',
      icon: 'fa-calendar-days',
      hint: 'Executive follow-up cadence',
      status: 'brand' as const,
    },
    {
      source: budget,
      label: 'Budget',
      icon: 'fa-coins',
      hint: 'Financial discipline and spend outlook',
      status: 'neutral' as const,
    },
  ];

  return mapped.map((item) => ({
    label: item.label,
    value: normalizeText(item.source?.value, '—'),
    trend: normalizeText(item.source?.trend, item.label === 'Budget' ? 'N/A' : '0%'),
    status: item.status as ReportKpiCard['status'],
    icon: item.icon,
    hint: normalizeText(item.source?.meaning, item.hint),
  }));
}

function buildSeries(points: unknown, fallback: ReportSeriesPoint[]): ReportSeriesPoint[] {
  const series = safeArray<{ label: string; value: number }>(points)
    .map((point) => ({ label: normalizeText(point.label), value: toNumber(point.value) }))
    .filter((point) => point.label);
  return series.length > 0 ? series : fallback;
}

function deriveSeriesFromReport(report: ReportItem): Array<{ title: string; subtitle: string; color: string; points: ReportSeriesPoint[] }> {
  const ai = report.aiOutput;
  const attendancePoints = buildSeries(ai.chartData?.attendanceEvolution, EMPTY_SERIES);
  const comparisonPoints = buildSeries(ai.chartData?.schoolComparison, EMPTY_SERIES);
  const performancePoints = buildSeries(ai.chartData?.performanceTrends, EMPTY_SERIES);
  const issuePoints = buildSeries(ai.chartData?.issueDistribution, EMPTY_SERIES);

  return [
    { title: 'Attendance Evolution', subtitle: 'Rolling attendance view', color: '#1f3a5f', points: attendancePoints },
    { title: 'School Comparison', subtitle: 'Position relative to peer schools', color: '#0f766e', points: comparisonPoints },
    { title: 'Performance Trends', subtitle: 'Management trend line', color: '#b7791f', points: performancePoints },
    { title: 'Issue Distribution', subtitle: 'Concentration of executive concerns', color: '#c2410c', points: issuePoints },
  ];
}

function normalizeRisks(report: ReportItem): ReportRiskCard[] {
  const ai = report.aiOutput;
  const structured = safeArray<any>(ai.riskAnalysis).map((item) => ({
    risk: normalizeText(item?.risk || item?.title),
    impact: normalizeText(item?.impact),
    priority: normalizeText(item?.priority, 'MEDIUM'),
    recommendedAction: normalizeText(item?.recommendedAction || item?.recommended_action),
  })).filter((item) => item.risk || item.impact || item.recommendedAction);

  if (structured.length > 0) return structured;

  return safeArray<string>(ai.risks).map((risk) => ({
    risk: normalizeText(risk),
    impact: 'Executive review required',
    priority: 'MEDIUM',
    recommendedAction: 'Monitor and escalate if needed',
  }));
}

function normalizeRecommendations(report: ReportItem): ReportRecommendationCard[] {
  const ai = report.aiOutput;
  const recs = safeArray<any>(ai.recommendations);
  if (recs.length === 0) return [];

  return recs.map((rec, index) => {
    if (typeof rec === 'string') {
      return {
        action: rec,
        responsiblePerson: 'Executive Management',
        deadline: 'TBD',
        expectedImpact: 'Operational improvement',
        priority: index === 0 ? 'HIGH' : 'MEDIUM',
      };
    }

    return {
      action: normalizeText(rec?.action || rec?.title || rec?.recommendation),
      responsiblePerson: normalizeText(rec?.responsiblePerson || rec?.owner, 'Executive Management'),
      deadline: normalizeText(rec?.deadline, 'TBD'),
      expectedImpact: normalizeText(rec?.expectedImpact || rec?.impact, 'Operational improvement'),
      priority: inferPriority(normalizeText(rec?.priority || 'MEDIUM')),
    };
  });
}

function normalizeActions(report: ReportItem): ReportRecommendationCard[] {
  const ai = report.aiOutput;
  return safeArray<any>(ai.requiredActions).map((item, index) => {
    if (typeof item === 'string') {
      return {
        action: item,
        responsiblePerson: 'Executive Management',
        deadline: 'TBD',
        expectedImpact: 'Closure of follow-up work',
        priority: index === 0 ? 'HIGH' : 'MEDIUM',
      };
    }

    return {
      action: normalizeText(item?.action),
      responsiblePerson: normalizeText(item?.owner, 'Executive Management'),
      deadline: normalizeText(item?.deadline, 'TBD'),
      expectedImpact: normalizeText(item?.impact || item?.expectedImpact, 'Closure of follow-up work'),
      priority: inferPriority(normalizeText(item?.priority || 'MEDIUM')),
    };
  });
}

function scoreFromReport(report: ReportItem): number {
  const ai = report.aiOutput;
  const kpis = safeArray<{ value: string | number }>(ai.kpiDashboard);
  const numeric = kpis.map((item) => toNumber(item.value)).filter((value) => value > 0);
  if (numeric.length > 0) return clampScore(average(numeric));

  const base = 84;
  const issuePenalty = (safeArray(ai.risks).length + safeArray(ai.importantIssues).length) * 4;
  const actionBonus = safeArray(ai.requiredActions).length * 2;
  return clampScore(base - issuePenalty + actionBonus);
}

function riskLevelFromScore(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 85) return 'LOW';
  if (score >= 70) return 'MEDIUM';
  return 'HIGH';
}

export function getReportViewModel(report: ReportItem): ReportViewModel {
  const ai = report.aiOutput;
  const score = scoreFromReport(report);
  const riskLevel = riskLevelFromScore(score);
  const primaryIssues = safeArray<string>(ai.importantIssues);
  const keyRecommendation = normalizeText(
    safeArray<any>(ai.recommendations)[0]?.action
      || safeArray<any>(ai.recommendations)[0]
      || safeArray<any>(ai.requiredActions)[0]?.action
      || safeArray<any>(ai.requiredActions)[0]
      || ai.finalConclusion
      || 'No recommendation provided.',
  );
  const organization = normalizeText(ai.coverPage?.organization, report.school?.name || 'Executive School Group');

  return {
    title: normalizeText(ai.coverPage?.reportTitle, report.title),
    organization,
    reportingPeriod: normalizeText(ai.coverPage?.reportingPeriod, report.period),
    generationDate: normalizeText(ai.coverPage?.generationDate, report.createdAt),
    summary: normalizeText(ai.executiveSummary, 'No executive summary provided.'),
    performanceScore: score,
    riskLevel,
    keyRecommendation,
    coverLabel: normalizeText(ai.coverPage?.executiveLabel, 'Generated by AI Executive Assistant'),
    coverMeta: [
      { label: 'Organization', value: organization },
      { label: 'Period', value: normalizeText(ai.coverPage?.reportingPeriod, report.period) },
      { label: 'Generated', value: new Date(report.createdAt).toLocaleString('ar-SA-u-nu-latn') },
      { label: 'Creator', value: report.createdBy?.name || 'AI Executive Assistant' },
    ],
    kpis: buildFixedKpis(report),
    chartSeries: deriveSeriesFromReport(report),
    risks: normalizeRisks(report),
    recommendations: normalizeRecommendations(report),
    actions: normalizeActions(report),
    conclusion: normalizeText(ai.finalConclusion, ai.executiveSummary || 'This report requires executive follow-up and clear ownership.'),
  };
}

export function buildBarPath(values: number[], width = 100, height = 100, padding = 12): string {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const barWidth = (width - padding * 2) / safeValues.length - 10;
  return safeValues.map((value, index) => {
    const h = Math.max(2, ((height - padding * 2) * value) / max);
    const x = padding + index * (barWidth + 10);
    const y = height - padding - h;
    return `${x},${y} ${x + barWidth},${y} ${x + barWidth},${height - padding} ${x},${height - padding}`;
  }).join(' ');
}

export function buildSparkValues(points: ReportSeriesPoint[] = EMPTY_SERIES): number[] {
  return points.map((point) => toNumber(point.value));
}
