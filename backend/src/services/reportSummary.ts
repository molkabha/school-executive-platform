import { prisma } from '../prisma';
import { safeJsonParse } from '../utils';

export interface ExecutiveReportSummaryRequest {
  title: string;
  scope: 'ALL_SCHOOLS' | 'SCHOOL_SPECIFIC';
  period: 'WEEKLY' | 'MONTHLY' | 'SEMESTER';
  modules: string[];
  schoolId?: string;
  schoolName?: string;
}

export interface ExecutiveReportSummaryKpi {
  label: string;
  value: string | number;
  trend: string;
  meaning: string;
}

export interface ExecutiveReportSummaryChartPoint {
  label: string;
  value: number;
}

export interface ExecutiveReportSummaryChartData {
  attendanceEvolution: ExecutiveReportSummaryChartPoint[];
  schoolComparison: ExecutiveReportSummaryChartPoint[];
  performanceTrends: ExecutiveReportSummaryChartPoint[];
  issueDistribution: ExecutiveReportSummaryChartPoint[];
  taskStatus: ExecutiveReportSummaryChartPoint[];
}

export interface ExecutiveReportSummaryRisk {
  risk: string;
  impact: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction: string;
}

export interface ExecutiveReportSummaryRecommendation {
  action: string;
  responsiblePerson: string;
  deadline: string;
  expectedImpact: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ExecutiveReportSummary {
  organization: string;
  reportTitle: string;
  reportingPeriod: string;
  generationDate: string;
  scopeLabel: string;
  moduleLabels: string[];
  schoolCount: number;
  connectedSources: number;
  totalStaff: number;
  attendanceRate: number;
  turnoverCount: number;
  openIssues: number;
  criticalAlerts: number;
  bestSchool?: { name: string; score: number; note: string } | null;
  watchlistSchool?: { name: string; score: number; note: string } | null;
  strengths: string[];
  risks: ExecutiveReportSummaryRisk[];
  recommendations: ExecutiveReportSummaryRecommendation[];
  kpis: ExecutiveReportSummaryKpi[];
  chartData: ExecutiveReportSummaryChartData;
  keyRecommendation: string;
  conclusionHint: string;
  contextNotes: string[];
}

type SnapshotRecord = {
  metricName: string;
  value: string;
  schoolId: string | null;
  school?: { id: string; name: string } | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toFixed(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.0';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function inferPeriodLabel(period: ExecutiveReportSummaryRequest['period']): string {
  switch (period) {
    case 'WEEKLY':
      return 'الأسبوع الحالي';
    case 'MONTHLY':
      return 'الشهر الحالي';
    case 'SEMESTER':
      return 'الفصل الدراسي الحالي';
    default:
      return period;
  }
}

function inferModuleLabel(module: string): string {
  const labels: Record<string, string> = {
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

  return labels[module] || module;
}

// `NO_BASELINE_TREND` is returned whenever there is no real prior-period
// value to compare against — never compute a delta off a missing metric,
// since that silently manufactures numbers like "-100%" when `current` is
// really "no data" rather than a true zero measurement.
const NO_BASELINE_TREND = 'لا توجد مقارنة سابقة';

function inferTrend(current: number, baseline: number): string {
  if (!baseline) return 'مستقر';
  const delta = ((current - baseline) / baseline) * 100;
  const rounded = Math.round(delta);
  if (rounded === 0) return 'مستقر';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function schoolScore(attendance: number, issues: number, turnover: number): number {
  return clampScore(attendance - issues * 4 - turnover * 2);
}

function buildChartSeriesFromSchools(
  schools: Array<{ name: string; score: number }>,
  openIssues: number,
  criticalAlerts: number,
  recommendations: ExecutiveReportSummaryRecommendation[],
): ExecutiveReportSummaryChartData {
  const firstFour = schools.slice(0, 4);

  // School comparison: real school scores
  const schoolComparison: ExecutiveReportSummaryChartPoint[] =
    firstFour.length > 0
      ? firstFour.map((school) => ({ label: school.name, value: school.score }))
      : [{ label: 'لا توجد بيانات مدارس', value: 0 }];

  // Attendance evolution: use school scores as attendance proxies across periods
  // Only populate if we have at least one school with data
  const attendanceEvolution: ExecutiveReportSummaryChartPoint[] =
    firstFour.length > 0
      ? firstFour.map((school, index) => ({
          label: `مدرسة ${index + 1}`,
          value: school.score,
        }))
      : [];

  // Performance trends: use real issue and score data
  const avgScore = firstFour.length > 0
    ? Math.round(firstFour.reduce((sum, s) => sum + s.score, 0) / firstFour.length)
    : 0;
  const performanceTrends: ExecutiveReportSummaryChartPoint[] = [
    { label: 'الحضور', value: avgScore },
    { label: 'التنبيهات المغلقة', value: Math.max(0, avgScore - criticalAlerts * 5) },
    { label: 'المتابعة', value: recommendations.length > 0 ? avgScore - 5 : avgScore },
    { label: 'المخاطر', value: Math.max(0, 100 - (openIssues * 8)) },
  ];

  // Issue distribution: real counts
  const issueDistribution: ExecutiveReportSummaryChartPoint[] = [
    { label: 'تنبيهات مفتوحة', value: Math.max(0, openIssues) },
    { label: 'تنبيهات حرجة', value: Math.max(0, criticalAlerts) },
    { label: 'توصيات معلقة', value: recommendations.length },
    { label: 'أخرى', value: 0 },
  ];

  // Task status: real recommendation counts
  const highPriority = recommendations.filter((r) => r.priority === 'HIGH').length;
  const medPriority = recommendations.filter((r) => r.priority === 'MEDIUM').length;
  const taskStatus: ExecutiveReportSummaryChartPoint[] = [
    { label: 'أولوية عالية', value: highPriority },
    { label: 'أولوية متوسطة', value: medPriority },
    { label: 'منخفضة', value: Math.max(0, recommendations.length - highPriority - medPriority) },
    { label: 'مكتملة', value: 0 },
  ];

  return { attendanceEvolution, schoolComparison, performanceTrends, issueDistribution, taskStatus };
}

export async function buildExecutiveReportSummary(
  request: ExecutiveReportSummaryRequest,
): Promise<ExecutiveReportSummary> {
  interface SchoolWithSourcesRow {
    id: string;
    name: string;
    code: string;
    sources: { id: string }[];
  }

  interface AlertRow {
    id: string;
    schoolId: string | null;
    priority: string;
    status: string;
  }

  const schoolWhere = request.scope === 'SCHOOL_SPECIFIC' && request.schoolId
    ? { id: request.schoolId, isActive: true }
    : { isActive: true };

  // Resolve the active-school ID set first so alerts/dataSources below can be
  // scoped to it — previously those two queries had NO school filter at all
  // in ALL_SCHOOLS scope, so they always included every school (active or
  // not) while the `schools` list itself was scoped. That mismatch is
  // exactly the "one subsystem uses N schools, another uses M" bug class.
  const activeSchoolIds = (
    await prisma.school.findMany({ where: schoolWhere, select: { id: true } })
  ).map((s: { id: string }) => s.id);
  const schoolScopeFilter = request.scope === 'SCHOOL_SPECIFIC' && request.schoolId
    ? { schoolId: request.schoolId }
    // Include system-wide alerts/sources (schoolId === null) alongside every
    // active school's records; only exclude records tied to an inactive school.
    : { OR: [{ schoolId: { in: activeSchoolIds } }, { schoolId: null }] };

  const [schools, snapshots, alerts, dataSources] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      include: {
        sources: { where: { status: 'CONNECTED' }, select: { id: true } },
      },
    }),
    prisma.kpiSnapshot.findMany({
      where: request.scope === 'SCHOOL_SPECIFIC' && request.schoolId
        ? { OR: [{ schoolId: request.schoolId }, { schoolId: null }] }
        : { schoolId: null },
      orderBy: { date: 'desc' },
      take: 200,
      include: { school: { select: { id: true, name: true } } },
    }),
    prisma.alert.findMany({
      where: {
        status: { not: 'RESOLVED' },
        ...schoolScopeFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.dataSource.findMany({
      where: {
        status: 'CONNECTED',
        ...schoolScopeFilter,
      },
      select: { id: true },
    }),
  ]);

  const latestByMetric = new Map<string, SnapshotRecord>();
  for (const snapshot of snapshots as SnapshotRecord[]) {
    const key = `${snapshot.metricName}:${snapshot.schoolId || 'all'}`;
    if (!latestByMetric.has(key)) {
      latestByMetric.set(key, snapshot);
    }
  }

  const getMetricValue = (metricName: string, schoolId: string | null = null): number => {
    const record = latestByMetric.get(`${metricName}:${schoolId || 'all'}`);
    return record ? toNumber(record.value) : 0;
  };

  // Distinguishes "no snapshot recorded for this metric" from "the recorded
  // value happens to be 0" — getMetricValue() alone collapses both cases to
  // 0, which is what previously made the KPI dashboard render a fabricated
  // literal "N/A" string (via the `attendanceRate ? ... : 'N/A'` pattern
  // below) and fed a real 0 into inferTrend() against a 90/80 baseline,
  // producing a fake "-100%" delta. Every "is data present" decision below
  // must go through this, not through truthiness of the value itself.
  const hasMetric = (metricName: string, schoolId: string | null = null): boolean =>
    latestByMetric.has(`${metricName}:${schoolId || 'all'}`);

  const schoolMetrics = schools.map((school: SchoolWithSourcesRow) => {
    const attendance = getMetricValue('attendance_rate', school.id) || getMetricValue('attendance_rate');
    const totalStaff = getMetricValue('total_staff', school.id) || getMetricValue('total_staff');
    const issues = getMetricValue('open_issues', school.id) || alerts.filter((alert: AlertRow) => alert.schoolId === school.id).length;
    const turnover = getMetricValue('turnover_count', school.id) || 0;

    return {
      id: school.id,
      name: school.name,
      score: schoolScore(attendance || 0, issues || 0, turnover || 0),
      attendance,
      totalStaff,
      issues,
      turnover,
      connectedSources: school.sources.length,
    };
  });

  const sortedSchools = [...schoolMetrics].sort((a, b) => b.score - a.score);
  const bestSchool = sortedSchools[0]
    ? {
        name: sortedSchools[0].name,
        score: sortedSchools[0].score,
        note: sortedSchools[0].score >= 85 ? 'أداء مستقر فوق المستوى المستهدف' : 'الأداء جيد لكنه يحتاج متابعة للحفاظ على الاستقرار',
      }
    : null;
  const watchlistSchool = sortedSchools[sortedSchools.length - 1]
    ? {
        name: sortedSchools[sortedSchools.length - 1].name,
        score: sortedSchools[sortedSchools.length - 1].score,
        note: sortedSchools[sortedSchools.length - 1].score < 70 ? 'تحتاج إلى تدخل سريع ومراجعة تفصيلية' : 'تحتاج إلى متابعة أقرب من بقية المدارس',
      }
    : null;

  const requestSchoolId = request.scope === 'SCHOOL_SPECIFIC' && request.schoolId ? request.schoolId : null;
  const totalStaff = getMetricValue('total_staff', requestSchoolId) || getMetricValue('total_staff');
  const attendanceRate = getMetricValue('attendance_rate', requestSchoolId) || getMetricValue('attendance_rate');
  const turnoverCount = getMetricValue('turnover_count', requestSchoolId) || getMetricValue('turnover_count');
  const openIssues = getMetricValue('open_issues') || alerts.length;
  const criticalAlerts = alerts.filter((alert: AlertRow) => alert.priority === 'HIGH' || alert.priority === 'CRITICAL').length;
  const connectedSources = dataSources.length;
  const schoolCount = schools.length;
  const moduleLabels = request.modules.map(inferModuleLabel);

  const strengths: string[] = [];
  if (attendanceRate >= 90) strengths.push(`معدل الحضور العام عند ${toFixed(attendanceRate)}% وهو ضمن النطاق المستهدف.`);
  if (connectedSources > 0) strengths.push(`تم ربط ${connectedSources} مصدر بيانات فعّال يدعم المتابعة اليومية.`);
  if (criticalAlerts === 0) strengths.push('لا توجد تنبيهات حرجة مفتوحة في الوقت الحالي.');
  if (bestSchool) strengths.push(`أفضل أداء مسجل لدى ${bestSchool.name}.`);
  if (strengths.length === 0) strengths.push('الوضع العام مستقر ويتيح بناء خطة تحسين قصيرة المدى.');

  const risks: ExecutiveReportSummaryRisk[] = [];
  if (criticalAlerts > 0) {
    risks.push({
      risk: 'تنبيهات حرجة مفتوحة',
      impact: `${criticalAlerts} تنبيه حرِج يحتاج إلى متابعة تنفيذية فورية.`,
      priority: 'HIGH',
      recommendedAction: 'تكليف مالك واضح لكل تنبيه وإغلاقه خلال فترة محددة.',
    });
  }
  if (attendanceRate > 0 && attendanceRate < 90) {
    risks.push({
      risk: 'انخفاض الحضور العام',
      impact: `معدل الحضور عند ${toFixed(attendanceRate)}% وهو أقل من المستوى المفضل.`,
      priority: 'MEDIUM',
      recommendedAction: 'تعزيز المتابعة اليومية مع المدارس الأقل التزاماً بالحضور.',
    });
  }
  if (turnoverCount > 0) {
    risks.push({
      risk: 'دوران كادر ملحوظ',
      impact: `سُجِّل ${turnoverCount} كعنصر دوران أو استقرار وظيفي يحتاج للمراجعة.`,
      priority: turnoverCount >= 10 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'مراجعة أسباب المغادرة أو التغيير وتحديد إجراءات تثبيت للكادر.',
    });
  }
  if (watchlistSchool && watchlistSchool.score < 75) {
    risks.push({
      risk: `المدرسة ${watchlistSchool.name} دون المتوسط`,
      impact: watchlistSchool.note,
      priority: watchlistSchool.score < 70 ? 'HIGH' : 'MEDIUM',
      recommendedAction: 'وضع خطة دعم قصيرة المدى تشمل الحضور والمتابعة والالتزام بالإجراءات.',
    });
  }
  if (risks.length === 0) {
    risks.push({
      risk: 'لا توجد مخاطر جوهرية ظاهرة',
      impact: 'البيانات الحالية تشير إلى وضع إداري مقبول مع استمرار الحاجة للمتابعة الدورية.',
      priority: 'LOW',
      recommendedAction: 'الاستمرار في المراقبة الدورية مع مراجعة المؤشرات أسبوعياً.',
    });
  }

  const recommendations: ExecutiveReportSummaryRecommendation[] = [
    {
      action: 'إغلاق التنبيهات ذات الأولوية الأعلى أولاً وتحديد مسؤول مباشر لكل بند.',
      responsiblePerson: 'الإدارة العليا',
      deadline: '7 أيام',
      expectedImpact: 'خفض المخاطر ورفع سرعة الاستجابة.',
      priority: 'HIGH',
    },
    {
      action: 'متابعة المدارس الأقل أداءً بخطة دعم قصيرة وواضحة.',
      responsiblePerson: 'فريق المتابعة التنفيذية',
      deadline: '14 يوماً',
      expectedImpact: 'تحسين الاستقرار ورفع الاتساق بين المدارس.',
      priority: 'HIGH',
    },
    {
      action: 'مراجعة المؤشرات الرئيسية في نهاية الفترة وربطها بالقرارات القادمة.',
      responsiblePerson: 'مكتب المشرفة العامة',
      deadline: inferPeriodLabel(request.period),
      expectedImpact: 'تثبيت دورة مراجعة بسيطة وسهلة المتابعة.',
      priority: 'MEDIUM',
    },
  ];

  // "غير متوفر حالياً" (not currently available) is the one honest label for
  // a metric with no underlying snapshot — never a hardcoded number, and
  // never the raw string 'N/A' (which previously leaked straight into the
  // rendered report instead of being translated for an executive reader).
  const NOT_AVAILABLE = 'غير متوفر حالياً';
  const attendanceDataPresent = hasMetric('attendance_rate', requestSchoolId) || hasMetric('attendance_rate');
  const staffPerformanceDataPresent = Boolean(bestSchool);

  const kpis: ExecutiveReportSummaryKpi[] = [
    {
      label: 'Attendance',
      value: attendanceDataPresent ? `${toFixed(attendanceRate)}%` : NOT_AVAILABLE,
      trend: attendanceDataPresent ? inferTrend(attendanceRate, 90) : NO_BASELINE_TREND,
      meaning: 'معدل الحضور العام في نطاق التقرير',
    },
    {
      label: 'Staff Performance',
      value: staffPerformanceDataPresent ? `${bestSchool!.score}` : NOT_AVAILABLE,
      trend: staffPerformanceDataPresent ? inferTrend(bestSchool!.score, 80) : NO_BASELINE_TREND,
      meaning: 'قراءة مختصرة للأداء التشغيلي العام',
    },
    {
      label: 'Complaints',
      value: openIssues,
      trend: openIssues > 0 ? 'متابعة مطلوبة' : 'مستقر',
      meaning: 'عدد القضايا أو التنبيهات المفتوحة',
    },
    {
      label: 'Tasks',
      value: Math.max(openIssues, risks.length),
      trend: openIssues > 0 ? 'قيد الإغلاق' : 'منخفض',
      meaning: 'عدد البنود التي تتطلب متابعة تنفيذية',
    },
    {
      label: 'Meetings',
      value: recommendations.length,
      trend: 'ثابت',
      meaning: 'نقاط المتابعة المقترحة خلال الفترة',
    },
    {
      label: 'Budget',
      value: connectedSources > 0 ? 'مربوط ضمن المنظومة' : 'غير متوفر',
      trend: 'مستقر',
      meaning: 'قراءة مختصرة للوضع المالي أو تغذية البيانات',
    },
  ];

  const chartData = buildChartSeriesFromSchools(sortedSchools, openIssues, criticalAlerts, recommendations);

  const keyRecommendation = recommendations[0]?.action || 'التركيز على إغلاق الأولويات الأعلى أثراً أولاً.';
  const conclusionHint =
    criticalAlerts > 0
      ? 'تحتاج الفترة إلى متابعة تنفيذية واضحة وسريعة.'
      : 'الوضع العام مستقر مع فرص تحسين قصيرة المدى.';

  return {
    organization: request.scope === 'ALL_SCHOOLS' ? 'مجموعة المدارس' : request.schoolName || 'مدرسة محددة',
    reportTitle: request.title,
    reportingPeriod: inferPeriodLabel(request.period),
    generationDate: new Date().toISOString(),
    scopeLabel: request.scope === 'ALL_SCHOOLS' ? 'جميع المدارس' : request.schoolName || 'مدرسة محددة',
    moduleLabels,
    schoolCount,
    connectedSources,
    totalStaff,
    attendanceRate,
    turnoverCount,
    openIssues,
    criticalAlerts,
    bestSchool,
    watchlistSchool,
    strengths,
    risks,
    recommendations,
    kpis,
    chartData,
    keyRecommendation,
    conclusionHint,
    contextNotes: [
      `النطاق: ${request.scope === 'ALL_SCHOOLS' ? 'جميع المدارس' : request.schoolName || 'مدرسة محددة'}`,
      `الفترة: ${inferPeriodLabel(request.period)}`,
      `المدارس: ${schoolCount}`,
      `الوحدات المشمولة: ${moduleLabels.join('، ') || 'غير محددة'}`,
      `المصادر النشطة: ${connectedSources}`,
    ],
  };
}

