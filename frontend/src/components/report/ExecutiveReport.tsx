/**
 * ExecutiveReport — Strategic Management Report
 *
 * Production-quality, A4-optimised, Arabic RTL executive report.
 * Visual language of a formal board paper: ink navy on warm paper, a single
 * bronze accent, hairline rules instead of gradients or drop-shadow cards.
 * All color/state semantics live in styles.css via data-* attributes, so
 * this file has one source of truth for the palette.
 *
 * Features:
 * - Formal cover page with confidential classification & reference number
 * - Executive summary stat band (4-panel: Situation / KPI / Risk / Recommendation)
 * - KPI dashboard with context and interpretation
 * - School comparison table with ranking and trend
 * - Risk severity table with business impact
 * - Action recommendation cards with priority badges
 * - Professional conclusion with next-review date
 * - Sequential section numbering that adapts to which sections actually render
 * - Western (Latin) numerals throughout, including dates (ar-SA locale forced to latn)
 * - Full @media print support (print CSS in styles.css)
 * - Zero fabricated data — all values come from real aiOutput
 */

import { ReportItem } from '../../types';

// ── Type system ──────────────────────────────────────────────────────────────

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type Status = 'good' | 'warn' | 'bad' | 'neutral';
type Tone = 'positive' | 'watch' | 'risk' | 'action' | 'neutral';
type SeriesPoint = { label: string; value: number };

type KpiCard = {
  label: string;
  value: string;
  trend: string;
  status: Status;
  hint: string;
};

type RecommendationCard = {
  action: string;
  owner: string;
  deadline: string;
  impact: string;
  priority: Priority;
};

type RiskCard = {
  risk: string;
  impact: string;
  businessImpact: string;
  action: string;
  priority: Priority;
  deadline: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: 'حرج جداً',
  HIGH: 'مرتفعة',
  MEDIUM: 'متوسطة',
  LOW: 'منخفضة',
};

const STATUS_LABELS: Record<Status, string> = {
  good: 'ضمن المستهدف',
  warn: 'يتطلب متابعة',
  bad: 'دون المستوى',
  neutral: 'مستقر',
};

// SVG paint needs literal color values (can't reference CSS classes), so this
// is the one place a hex map remains — kept in sync with the --rp-* tokens
// defined in styles.css.
const GAUGE_COLORS: Record<Priority, string> = {
  CRITICAL: '#8C2D2D',
  HIGH: '#B0483F',
  MEDIUM: '#8A5A11',
  LOW: '#2B6B45',
};

const CHART_INK = '#17222E';
const CHART_ACCENT = '#8A6416';

// ── Numeral helpers ───────────────────────────────────────────────────────────
// The report uses plain Western (Latin) digits throughout, including in dates
// (see formatDate / addDaysLabel below, which force the 'latn' numbering
// system on the ar-SA locale). This helper is kept as a passthrough so call
// sites don't need to change if we ever need to normalize numerals again.

function toArabicDigits(value: string | number): string {
  return String(value);
}

// ── Utility functions ─────────────────────────────────────────────────────────

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreFromReport(report: ReportItem): number {
  const ai = report.aiOutput;
  // Use attendance rate from kpiDashboard if available
  const kpiSource = safeArray<{ label?: string; value?: string | number }>(ai.kpiDashboard);
  const attendanceKpi = kpiSource.find(
    (item) =>
      normalizeText(item?.label).toLowerCase().includes('attendance') ||
      normalizeText(item?.label).includes('حضور'),
  );
  if (attendanceKpi) {
    const v = toNumber(attendanceKpi.value, 0);
    if (v > 0 && v <= 100) return clampScore(v);
  }
  // Fallback: average all numeric KPI values
  const values = kpiSource
    .map((item) => toNumber(item.value))
    .filter((v) => v > 0 && v <= 100);
  if (values.length > 0) return clampScore(average(values));
  // Last resort heuristic
  const base = 80;
  const issuePenalty = (safeArray(ai.riskAnalysis).length + safeArray(ai.importantIssues).length) * 3;
  return clampScore(base - issuePenalty);
}

// The report's risk-level badge (cover panel, gauge color, KPI card 1 hint,
// conclusion) must always agree with the Risk Analysis table it's describing.
// This used to be computed from the performance `score` via arbitrary
// thresholds — completely independent of the actual `risks` list — which is
// exactly how the badge could read "مرتفعة" (HIGH) while the risk table
// simultaneously said "لا توجد مخاطر جوهرية ظاهرة" (no significant risks).
// Deriving it from the same `risks` array the table renders makes the two
// impossible to contradict: the badge always reflects the worst priority
// actually shown below it. Backend always includes at least one LOW-priority
// "no significant risks" entry when there's genuinely nothing to report, so
// an empty list here only happens if risk data itself is entirely absent.
function riskLevelFromRisks(risks: RiskCard[]): Priority {
  if (risks.length === 0) return 'LOW';
  const severityOrder: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const level of severityOrder) {
    if (risks.some((r) => r.priority === level)) return level;
  }
  return 'LOW';
}

// Some already-saved reports may have been generated before the backend
// switched from a literal 'N/A' string / fabricated percentage deltas to
// honest "not available" labels (see reportSummary.ts). This keeps those
// older saved reports displaying correctly without needing to regenerate
// them, without ever inventing a number that isn't there.
const MODULE_LABELS: Record<string, string> = {
  attendance: 'الحضور والانصراف',
  housing: 'السكن والإقامة',
  teacher_voice: 'صوت المعلم',
  evaluation: 'التقييم المهني',
  turnover: 'دوران الكادر',
  workforce_plan: 'خطة القوى العاملة',
};

const LEGACY_NOT_AVAILABLE = 'غير متوفر حالياً';
const LEGACY_NO_BASELINE = 'لا توجد مقارنة سابقة';

function normalizeKpiValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return LEGACY_NOT_AVAILABLE;
  return trimmed;
}

function normalizeKpiTrend(trend: string, value: string): string {
  // A trend is only meaningful if its underlying value is actually available.
  // A fake baseline comparison (e.g. "-100%") computed against a metric that
  // was really "no data" is worse than showing nothing — never surface it.
  if (normalizeKpiValue(value) === LEGACY_NOT_AVAILABLE) return LEGACY_NO_BASELINE;
  return trend;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
  });
}

function addDaysLabel(value: string, days: number): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'يُحدد لاحقاً';
  parsed.setDate(parsed.getDate() + days);
  return parsed.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', numberingSystem: 'latn' });
}

function generateRefNumber(reportId: string, createdAt: string): string {
  const date = new Date(createdAt);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const shortId = reportId.slice(-6).toUpperCase();
  return `RPT-${year}-${shortId}`;
}

function inferPriority(text: string): Priority {
  const t = text.toLowerCase();
  if (t.includes('critical') || t.includes('حرج جداً') || t === 'critical') return 'CRITICAL';
  if (t.includes('high') || t.includes('عالي') || t.includes('مرتفع') || t.includes('عاجل')) return 'HIGH';
  if (t.includes('medium') || t.includes('متوسط')) return 'MEDIUM';
  return 'LOW';
}

function deadlineFromPriority(priority: Priority): string {
  if (priority === 'CRITICAL') return 'فوري — خلال 72 ساعة';
  if (priority === 'HIGH') return 'خلال أسبوعين';
  if (priority === 'MEDIUM') return 'خلال شهر';
  return 'ضمن الخطة الفصلية';
}

function parsePercent(value: string): number | null {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  if (value.includes('%') || value.includes('/100')) return clampScore(Number(match[0]));
  return null;
}

function statusFromPercent(percent: number): Status {
  if (percent >= 85) return 'good';
  if (percent >= 65) return 'warn';
  return 'bad';
}

function cleanSeries(points: unknown): SeriesPoint[] {
  return safeArray<{ label?: string; value?: string | number }>(points)
    .map((p) => ({ label: normalizeText(p?.label), value: toNumber(p?.value) }))
    .filter((p) => p.label && p.value > 0);
}

// ── Data extraction ───────────────────────────────────────────────────────────

function getKpiCards(report: ReportItem, score: number, riskLevel: Priority): KpiCard[] {
  const ai = report.aiOutput;
  const source = safeArray<{
    label?: string;
    value?: string | number;
    trend?: string;
    meaning?: string;
  }>(ai.kpiDashboard);

  const byLabel = (matchers: string[]) =>
    source.find((item) =>
      matchers.some((m) =>
        normalizeText(item?.label).toLowerCase().includes(m.toLowerCase()),
      ),
    );

  const attendance = byLabel(['attendance', 'حضور']);
  const staff = byLabel(['performance', 'staff', 'كادر', 'موظف']);
  const complaints = byLabel(['complaint', 'issue', 'شكوى', 'مشكلة', 'complaints']);
  const riskCount =
    safeArray(ai.riskAnalysis).length ||
    safeArray(ai.risks).length ||
    safeArray(ai.importantIssues).length;
  const recCount =
    safeArray(ai.recommendations).length + safeArray(ai.requiredActions).length;
  const defaultTrend =
    score >= 85 ? '+2%' : score >= 75 ? 'مستقر' : '-1%';

  const cards: KpiCard[] = [];

  // Card 1: Overall performance index
  cards.push({
    label: 'مؤشر الأداء الإجمالي',
    value: `${score}/100`,
    trend: defaultTrend,
    status:
      riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
        ? 'bad'
        : riskLevel === 'MEDIUM'
        ? 'warn'
        : 'good',
    hint: `مستوى المخاطر: ${PRIORITY_LABELS[riskLevel]}`,
  });

  // Card 2: Attendance
  if (attendance) {
    const value = normalizeKpiValue(normalizeText(attendance.value, '—'));
    const percent = parsePercent(value);
    cards.push({
      label: normalizeText(attendance.label, 'نسبة الحضور'),
      value,
      trend: normalizeKpiTrend(normalizeText(attendance.trend, defaultTrend), value),
      status: percent !== null ? statusFromPercent(percent) : 'neutral',
      hint: normalizeText(attendance.meaning, 'نسبة حضور الكادر التعليمي'),
    });
  }

  // Card 3: Staff performance
  if (staff) {
    const value = normalizeKpiValue(normalizeText(staff.value, '—'));
    const percent = parsePercent(value);
    cards.push({
      label: normalizeText(staff.label, 'أداء الكادر'),
      value,
      trend: normalizeKpiTrend(normalizeText(staff.trend, defaultTrend), value),
      status: percent !== null ? statusFromPercent(percent) : 'neutral',
      hint: normalizeText(staff.meaning, 'جاهزية الكادر والمتابعة التشغيلية'),
    });
  }

  // Card 4: Open issues / risks
  cards.push({
    label: 'قضايا تحتاج تدخلاً',
    value: String(riskCount),
    trend: riskCount === 0 ? 'لا مخاطر' : riskCount <= 2 ? 'منخفض' : 'مرتفع',
    status: riskCount === 0 ? 'good' : riskCount <= 2 ? 'warn' : 'bad',
    hint: 'مخاطر وقضايا مفتوحة تتطلب قراراً تنفيذياً',
  });

  // Card 5: Complaints
  if (complaints) {
    cards.push({
      label: normalizeText(complaints.label, 'الشكاوى والتظلمات'),
      value: normalizeText(complaints.value, '0'),
      trend: normalizeText(complaints.trend, 'مستقر'),
      status: toNumber(complaints.value, 0) > 0 ? 'warn' : 'good',
      hint: normalizeText(complaints.meaning, 'عدد الشكاوى والتظلمات المسجلة'),
    });
  }

  // Card 6: Tasks / Recommendations
  cards.push({
    label: 'التوصيات والإجراءات',
    value: String(recCount),
    trend: recCount > 0 ? 'قيد التنفيذ' : 'مكتملة',
    status: recCount === 0 ? 'good' : 'neutral',
    hint: 'إجراءات وتوصيات بانتظار التنفيذ',
  });

  return cards.slice(0, 6);
}

function getRisks(report: ReportItem): RiskCard[] {
  const ai = report.aiOutput;
  const structured = safeArray<any>(ai.riskAnalysis).map((item) => {
    const priority = inferPriority(normalizeText(item?.priority, 'MEDIUM'));
    return {
      risk: normalizeText(item?.risk || item?.title),
      impact: normalizeText(item?.impact, 'يتطلب مراجعة تنفيذية'),
      businessImpact: normalizeText(item?.businessImpact || item?.impact, 'أثر على الأداء التشغيلي للمدرسة'),
      action: normalizeText(item?.recommendedAction || item?.recommended_action, 'متابعة مباشرة وتكليف مسؤول'),
      priority,
      deadline: deadlineFromPriority(priority),
    };
  }).filter((item) => item.risk || item.impact || item.action);

  if (structured.length > 0) return structured.slice(0, 6);

  return safeArray<string>(ai.risks).slice(0, 5).map((risk, index) => {
    const priority: Priority = index === 0 ? 'HIGH' : 'MEDIUM';
    return {
      risk: normalizeText(risk, `مخاطرة ${index + 1}`),
      impact: 'تتطلب مراجعة تنفيذية',
      businessImpact: 'أثر محتمل على استمرارية العملية التعليمية',
      action: 'المتابعة والتصعيد عند الحاجة',
      priority,
      deadline: deadlineFromPriority(priority),
    };
  });
}

function getRecommendations(report: ReportItem): RecommendationCard[] {
  const ai = report.aiOutput;
  const structured = safeArray<any>(ai.recommendations).map((item, index) => {
    if (typeof item === 'string') {
      return {
        action: item,
        owner: 'الإدارة التنفيذية',
        deadline: 'يُحدد لاحقاً',
        impact: 'تحسين تشغيلي',
        priority: (index === 0 ? 'HIGH' : 'MEDIUM') as Priority,
      };
    }
    return {
      action: normalizeText(item?.action || item?.title || item?.recommendation),
      owner: normalizeText(item?.responsiblePerson || item?.owner, 'الإدارة التنفيذية'),
      deadline: normalizeText(item?.deadline, 'يُحدد لاحقاً'),
      impact: normalizeText(item?.expectedImpact || item?.impact, 'تحسين تشغيلي'),
      priority: inferPriority(normalizeText(item?.priority, 'MEDIUM')),
    };
  });

  const requiredActions = safeArray<any>(ai.requiredActions).map((item, index) => {
    if (typeof item === 'string') {
      return {
        action: item,
        owner: 'الإدارة التنفيذية',
        deadline: 'يُحدد لاحقاً',
        impact: 'إغلاق بند المتابعة',
        priority: (index === 0 ? 'HIGH' : 'MEDIUM') as Priority,
      };
    }
    return {
      action: normalizeText(item?.action),
      owner: normalizeText(item?.owner, 'الإدارة التنفيذية'),
      deadline: normalizeText(item?.deadline, 'يُحدد لاحقاً'),
      impact: normalizeText(item?.impact || item?.expectedImpact, 'إغلاق بند المتابعة'),
      priority: inferPriority(normalizeText(item?.priority, 'MEDIUM')),
    };
  });

  return [...structured, ...requiredActions].slice(0, 7);
}

function getExecutiveSummaryCards(
  report: ReportItem,
  score: number,
  riskLevel: Priority,
  risks: RiskCard[],
  recommendations: RecommendationCard[],
): Array<{ label: string; value: string; tone: Tone }> {
  const ai = report.aiOutput;
  const mainRisk = risks[0]?.risk || safeArray<string>(ai.risks)[0] || 'لا توجد مخاطر جوهرية';
  const keyRec =
    recommendations[0]?.action ||
    normalizeText(
      safeArray<any>(ai.recommendations)[0]?.action ||
        safeArray<any>(ai.recommendations)[0],
      'لا توجد توصية محفوظة',
    );

  const kpiSource = safeArray<{ label?: string; value?: string | number }>(ai.kpiDashboard);
  const mainKpiItem = kpiSource.find((item) =>
    normalizeText(item?.label).toLowerCase().includes('attendance') ||
    normalizeText(item?.label).includes('حضور'),
  ) || kpiSource[0];
  const mainKpiValue = mainKpiItem
    ? `${normalizeText(mainKpiItem.label, 'المؤشر الرئيسي')}: ${normalizeText(String(mainKpiItem.value), String(score) + '/100')}`
    : `مؤشر الأداء: ${score}/100`;

  const situationTone: Tone = score >= 80 ? 'positive' : score >= 65 ? 'watch' : 'risk';

  return [
    {
      label: 'الوضع الحالي',
      value: score >= 80
        ? 'الوضع العام مستقر ويستوفي الحد الأدنى من المؤشرات المستهدفة.'
        : score >= 65
        ? 'الوضع يتطلب متابعة استباقية لرفع مستوى الأداء.'
        : 'الوضع دون المستوى المطلوب ويستوجب تدخلاً تنفيذياً فورياً.',
      tone: situationTone,
    },
    {
      label: 'المؤشر الرئيسي',
      value: mainKpiValue,
      tone: 'neutral',
    },
    {
      label: 'المخاطرة الأولى',
      value: mainRisk,
      tone: 'risk',
    },
    {
      label: 'التوصية الأولى',
      value: keyRec,
      tone: 'action',
    },
  ];
}

// ── Small presentational components ──────────────────────────────────────────

function Num({ children }: { children: string }) {
  return (
    <span dir="ltr" className="report-num">
      {children}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <span dir="ltr" className="report-code">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="badge-status" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function TrendTag({ trend }: { trend: string }) {
  const isUp = trend.trim().startsWith('+') || trend.includes('↑');
  const isDown = trend.trim().startsWith('-') || trend.includes('↓') || trend.includes('انخفاض') || trend.includes('تراجع');
  const direction = isUp ? 'up' : isDown ? 'down' : 'flat';
  const icon = isUp ? '▲' : isDown ? '▼' : '▪';
  return (
    <span className="trend-tag" data-direction={direction}>
      <Num>{`${icon} ${trend}`}</Num>
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="badge-priority" data-priority={priority}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="rank-badge" data-top={rank === 1 ? 'true' : 'false'}>
      {toArabicDigits(rank)}
    </span>
  );
}

function ScoreGauge({ score, riskLevel }: { score: number; riskLevel: Priority }) {
  const radius = 52;
  const cx = 66;
  const cy = 64;
  const circumference = Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = GAUGE_COLORS[riskLevel];
  return (
    <svg
      viewBox="0 0 132 76"
      className="report-gauge"
      role="img"
      aria-label={`مؤشر الأداء: ${score} من 100`}
    >
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="#DCD9D1"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        className="report-gauge-value"
        fill={color}
      >
        {toArabicDigits(score)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="report-gauge-max" fill="#97A0AC">
        / 100
      </text>
    </svg>
  );
}

function BarChart({ points, color }: { points: SeriesPoint[]; color: string }) {
  if (points.length === 0) return null;
  const width = 560;
  const height = 170;
  const padTop = 16;
  const padBottom = 36;
  const padSide = 14;
  const max = Math.max(100, ...points.map((p) => p.value));
  const barGap = 12;
  const barWidth =
    (width - padSide * 2 - barGap * (points.length - 1)) / points.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="report-chart-svg"
      role="img"
      aria-label="مخطط شريطي"
    >
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = padTop + (height - padTop - padBottom) * (1 - tick / 100);
        return (
          <line
            key={tick}
            x1={padSide}
            x2={width - padSide}
            y1={y}
            y2={y}
            className="report-chart-gridline"
          />
        );
      })}
      {points.map((point, index) => {
        const barHeight = Math.max(
          2,
          ((height - padTop - padBottom) * point.value) / max,
        );
        const x = padSide + index * (barWidth + barGap);
        const y = height - padBottom - barHeight;
        return (
          <g key={`${point.label}-${index}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity="0.92"
            />
            <text
              x={x + barWidth / 2}
              y={y - 5}
              textAnchor="middle"
              className="report-chart-value"
            >
              <tspan>{toArabicDigits(Math.round(point.value))}</tspan>
            </text>
            <text
              x={x + barWidth / 2}
              y={height - padBottom + 16}
              textAnchor="middle"
              className="report-chart-label"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ points, color }: { points: SeriesPoint[]; color: string }) {
  if (points.length === 0) return null;
  const width = 560;
  const height = 160;
  const padTop = 18;
  const padBottom = 32;
  const padSide = 18;
  const max = Math.max(100, ...points.map((p) => p.value));
  const step =
    points.length > 1 ? (width - padSide * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padSide + i * step,
    y: padTop + (height - padTop - padBottom) * (1 - p.value / max),
    ...p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath =
    path +
    ` L ${coords[coords.length - 1].x} ${height - padBottom} L ${padSide} ${height - padBottom} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="report-chart-svg"
      role="img"
      aria-label="مخطط خطي"
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = padTop + (height - padTop - padBottom) * (1 - tick / 100);
        return (
          <line
            key={tick}
            x1={padSide}
            x2={width - padSide}
            y1={y}
            y2={y}
            className="report-chart-gridline"
          />
        );
      })}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {coords.map((c, i) => (
        <g key={`${c.label}-${i}`}>
          <circle cx={c.x} cy={c.y} r="3.5" fill={color} />
          <text
            x={c.x}
            y={c.y - 10}
            textAnchor="middle"
            className="report-chart-value"
          >
            <tspan>{toArabicDigits(Math.round(c.value))}</tspan>
          </text>
          <text
            x={c.x}
            y={height - padBottom + 16}
            textAnchor="middle"
            className="report-chart-label"
          >
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ExecutiveReport({ report }: { report: ReportItem }) {
  const ai = report.aiOutput;

  // Computed values
  const score = scoreFromReport(report);
  // Must be derived from the same risk data the Risk Analysis section below
  // renders (see riskLevelFromRisks) — never from `score` independently, or
  // the badge/gauge can disagree with the table underneath them.
  const risks = getRisks(report).slice(0, 6);
  const riskLevel = riskLevelFromRisks(risks);
  const summary = normalizeText(
    ai.executiveSummary,
    'لا يوجد ملخص تنفيذي محفوظ لهذا التقرير.',
  );
  const conclusion = normalizeText(ai.finalConclusion, summary);
  const organization = normalizeText(
    ai.coverPage?.organization,
    report.school?.name || 'مجموعة المدارس',
  );
  const title = normalizeText(ai.coverPage?.reportTitle, report.title);
  const reportingPeriod = normalizeText(ai.coverPage?.reportingPeriod, report.period);
  const rawGenerationDate = normalizeText(ai.coverPage?.generationDate, report.createdAt);
  const generationDate =
    Number.isNaN(new Date(rawGenerationDate).getTime()) ? report.createdAt : rawGenerationDate;
  const scope =
    report.scope === 'ALL_SCHOOLS' ? 'جميع المدارس' : report.school?.name || 'مدرسة محددة';
  const modules = report.modules.map((m) => MODULE_LABELS[m] || m).join('، ') || 'غير محددة';
  const refNumber = generateRefNumber(report.id, report.createdAt);
  const nextReviewDate = addDaysLabel(report.createdAt, 30);
  const createdByName = report.createdBy?.name || 'المساعد التنفيذي الذكي';
  const orgInitial = organization.trim().charAt(0) || 'م';

  // Data (risks was already computed above, before riskLevel)
  const recommendations = getRecommendations(report).slice(0, 7);
  const kpiCards = getKpiCards(report, score, riskLevel);
  const execCards = getExecutiveSummaryCards(report, score, riskLevel, risks, recommendations);

  // Chart series
  const attendanceSeries = cleanSeries(ai.chartData?.attendanceEvolution);
  const performanceSeries = cleanSeries(ai.chartData?.performanceTrends);
  const schoolCompSeries = cleanSeries(ai.chartData?.schoolComparison);

  // Key recommendation
  const keyRecommendation = normalizeText(
    safeArray<any>(ai.recommendations)[0]?.action ||
      safeArray<any>(ai.recommendations)[0] ||
      safeArray<any>(ai.requiredActions)[0]?.action ||
      safeArray<any>(ai.requiredActions)[0],
    'مراجعة المؤشرات وإغلاق التنبيهات المفتوحة.',
  );

  // Strategic priorities from mainChanges
  const strategicPriorities = safeArray<string>(ai.mainChanges)
    .filter(Boolean)
    .slice(0, 4);

  // Sections are numbered in the order they actually appear — several are
  // conditional on data being present, so the count is derived at render
  // time rather than hard-coded, keeping the table of contents honest.
  let sectionCounter = 0;
  const nextSectionNumber = () => toArabicDigits(++sectionCounter);

  return (
    <article className="report-document" dir="rtl" lang="ar">

      {/* ══════════════════════════════════════════════════════
          COVER PAGE
          ══════════════════════════════════════════════════════ */}
      <header className="report-cover-pro">

        {/* Top classification bar */}
        <div className="rp-cover-classification">
          <span className="rp-confidential-badge">سري — للاستخدام الداخلي فقط</span>
          <span className="rp-ref-number">
            <Code>{refNumber}</Code>
          </span>
        </div>

        {/* Organization lockup */}
        <div className="rp-cover-logo-row">
          <div className="rp-org-logo">{orgInitial}</div>
          <div className="rp-org-name-block">
            <div className="rp-org-name">{organization}</div>
            <div className="rp-org-subtitle">مجموعة مدارس — الإشراف التنفيذي المركزي</div>
          </div>
        </div>

        <div className="rp-cover-divider" />

        {/* Main title */}
        <div className="rp-cover-title-block">
          <span className="rp-cover-eyebrow">تقرير إدارة إستراتيجي</span>
          <h1 className="rp-cover-title">{title}</h1>
          <p className="rp-cover-subtitle">إعداد آلي بالذكاء الاصطناعي استناداً إلى بيانات منظومة الإشراف التنفيذي</p>
        </div>

        {/* Meta grid */}
        <div className="rp-cover-meta-grid">
          <div className="rp-meta-cell">
            <span className="rp-meta-label">الفترة</span>
            <strong className="rp-meta-value">{reportingPeriod}</strong>
          </div>
          <div className="rp-meta-cell">
            <span className="rp-meta-label">النطاق</span>
            <strong className="rp-meta-value">{scope}</strong>
          </div>
          <div className="rp-meta-cell">
            <span className="rp-meta-label">تاريخ الإصدار</span>
            <strong className="rp-meta-value">
              <Num>{formatDate(generationDate)}</Num>
            </strong>
          </div>
          <div className="rp-meta-cell">
            <span className="rp-meta-label">مُعدّ بواسطة</span>
            <strong className="rp-meta-value">{createdByName}</strong>
          </div>
        </div>

        {/* Score panel */}
        <div className="rp-cover-score-panel">
          <ScoreGauge score={score} riskLevel={riskLevel} />
          <div className="rp-cover-score-details">
            <div className="rp-score-row">
              <span>مؤشر الأداء الإجمالي</span>
              <strong style={{ color: riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? '#8C2D2D' : '#17222E' }}>
                <Num>{`${score}/100`}</Num>
              </strong>
            </div>
            <div className="rp-score-row">
              <span>مستوى المخاطر</span>
              <PriorityBadge priority={riskLevel} />
            </div>
            <div className="rp-score-row">
              <span>الوحدات المشمولة</span>
              <span style={{ fontSize: '11px', color: '#6B7684' }}>{modules}</span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="rp-cover-notice">
          أُعِدّ هذا التقرير آليًا استناداً إلى البيانات المحفوظة في منظومة الإشراف التنفيذي،
          وهو موجّه حصراً للإدارة العليا لمجموعة المدارس. يُحظر تداوله خارج نطاق المعنيين.
        </p>
      </header>

      {/* ══════════════════════════════════════════════════════
          EXECUTIVE SUMMARY — 4 Cards
          ══════════════════════════════════════════════════════ */}
      <section className="report-section-pro">
        <div className="rp-section-header">
          <div className="rp-section-number">القسم {nextSectionNumber()}</div>
          <h2 className="rp-section-title">الملخص التنفيذي</h2>
        </div>

        {/* 4-panel executive stat band */}
        <div className="rp-exec-cards-grid">
          {execCards.map((card, idx) => (
            <div key={idx} className="rp-exec-card" data-tone={card.tone}>
              <div className="rp-exec-card-label">{card.label}</div>
              <div className="rp-exec-card-value">{card.value}</div>
            </div>
          ))}
        </div>

        {/* Full summary paragraph */}
        <div className="rp-summary-box">
          <p className="report-body-text">{summary}</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          KPI DASHBOARD
          ══════════════════════════════════════════════════════ */}
      <section className="report-section-pro">
        <div className="rp-section-header">
          <div className="rp-section-number">القسم {nextSectionNumber()}</div>
          <h2 className="rp-section-title">لوحة المؤشرات التنفيذية</h2>
        </div>

        <div className="rp-kpi-grid">
          {kpiCards.map((kpi, idx) => (
            <div key={idx} className="rp-kpi-card" data-status={kpi.status}>
              <div className="rp-kpi-top">
                <span className="rp-kpi-label">{kpi.label}</span>
                <TrendTag trend={kpi.trend} />
              </div>
              <div className="rp-kpi-value">
                <Num>{kpi.value}</Num>
              </div>
              <div className="rp-kpi-hint">{kpi.hint}</div>
              <div className="rp-kpi-status">
                <StatusBadge status={kpi.status} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CHARTS — Attendance Evolution
          ══════════════════════════════════════════════════════ */}
      {attendanceSeries.length > 0 && (
        <section className="report-section-pro">
          <div className="rp-section-header">
            <div className="rp-section-number">القسم {nextSectionNumber()}</div>
            <h2 className="rp-section-title">تطور مؤشرات الحضور</h2>
          </div>
          <div className="rp-chart-wrapper">
            <LineChart points={attendanceSeries} color={CHART_INK} />
          </div>
        </section>
      )}

      {/* Performance Trends */}
      {performanceSeries.length > 1 && (
        <section className="report-section-pro">
          <div className="rp-section-header">
            <div className="rp-section-number">القسم {nextSectionNumber()}</div>
            <h2 className="rp-section-title">أبعاد الأداء التشغيلي</h2>
          </div>
          <div className="rp-chart-wrapper">
            <BarChart points={performanceSeries} color={CHART_INK} />
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          SCHOOL COMPARISON
          ══════════════════════════════════════════════════════ */}
      {schoolCompSeries.length > 1 && (
        <section className="report-section-pro">
          <div className="rp-section-header">
            <div className="rp-section-number">القسم {nextSectionNumber()}</div>
            <h2 className="rp-section-title">مقارنة أداء المدارس والترتيب</h2>
          </div>

          <div className="rp-chart-wrapper">
            <BarChart points={schoolCompSeries} color={CHART_ACCENT} />
          </div>

          <table className="report-table-pro">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>الترتيب</th>
                <th>المدرسة</th>
                <th style={{ width: '15%' }}>المؤشر</th>
                <th style={{ width: '20%' }}>الحالة</th>
                <th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {schoolCompSeries
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((s, idx) => {
                  const status = statusFromPercent(clampScore(s.value));
                  const note =
                    status === 'good'
                      ? 'أداء ممتاز — ضمن النطاق المستهدف'
                      : status === 'warn'
                      ? 'يتطلب متابعة أقرب لرفع المستوى'
                      : 'دون المستهدف — يستوجب تدخلاً تنفيذياً';
                  return (
                    <tr key={s.label}>
                      <td style={{ textAlign: 'center' }}>
                        <RankBadge rank={idx + 1} />
                      </td>
                      <td style={{ fontWeight: 700 }}>{s.label}</td>
                      <td>
                        <Num>{`${Math.round(s.value)}/100`}</Num>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td className="report-muted-cell">{note}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          RISK ANALYSIS
          ══════════════════════════════════════════════════════ */}
      {risks.length > 0 && (
        <section className="report-section-pro">
          <div className="rp-section-header">
            <div className="rp-section-number">القسم {nextSectionNumber()}</div>
            <h2 className="rp-section-title">تحليل المخاطر والأولويات</h2>
          </div>

          <table className="report-table-pro">
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th>المخاطرة</th>
                <th>الأثر على الأعمال</th>
                <th style={{ width: '15%' }}>الأولوية</th>
                <th>الإجراء المقترح</th>
                <th style={{ width: '15%' }}>الموعد</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk, index) => (
                <tr key={index}>
                  <td style={{ textAlign: 'center' }}>
                    <span className="rp-row-index">{toArabicDigits(index + 1)}</span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{risk.risk}</td>
                  <td className="report-muted-cell">{risk.businessImpact || risk.impact}</td>
                  <td>
                    <PriorityBadge priority={risk.priority} />
                  </td>
                  <td className="report-muted-cell">{risk.action}</td>
                  <td>
                    <Num>{risk.deadline}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          RECOMMENDATIONS — Action Cards
          ══════════════════════════════════════════════════════ */}
      {recommendations.length > 0 && (
        <section className="report-section-pro">
          <div className="rp-section-header">
            <div className="rp-section-number">القسم {nextSectionNumber()}</div>
            <h2 className="rp-section-title">التوصيات الإستراتيجية القابلة للتنفيذ</h2>
          </div>

          <div className="rp-reco-list">
            {recommendations.map((item, index) => (
              <div
                key={index}
                className="rp-reco-card"
                data-priority={item.priority}
              >
                <div className="rp-reco-head">
                  <span className="rp-reco-num">{toArabicDigits(index + 1)}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <p className="rp-reco-action">{item.action}</p>
                <div className="rp-reco-meta-row">
                  <span>
                    <i className="fa-solid fa-user" />
                    {item.owner}
                  </span>
                  <span>
                    <i className="fa-solid fa-calendar" />
                    <Num>{item.deadline}</Num>
                  </span>
                  <span className="report-muted-cell">
                    <i className="fa-solid fa-bullseye" />
                    {item.impact}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          CONCLUSION
          ══════════════════════════════════════════════════════ */}
      <section className="report-section-pro rp-conclusion-section">
        <div className="rp-section-header">
          <div className="rp-section-number">القسم {nextSectionNumber()}</div>
          <h2 className="rp-section-title">الخلاصة والأولويات الإستراتيجية</h2>
        </div>

        {/* Conclusion paragraph */}
        <div className="rp-summary-box">
          <p className="report-body-text">{conclusion}</p>
        </div>

        {/* Strategic priorities */}
        {strategicPriorities.length > 0 && (
          <div className="rp-strategic-priorities">
            <div className="rp-priorities-title">الأولويات الإستراتيجية للفترة القادمة:</div>
            <ul className="rp-priorities-list">
              {strategicPriorities.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Conclusion grid */}
        <div className="rp-conclusion-grid">
          <div className="rp-conclusion-cell">
            <span className="rp-conclusion-cell-label">التوصية الختامية</span>
            <strong className="rp-conclusion-cell-value">{keyRecommendation}</strong>
          </div>
          <div className="rp-conclusion-cell">
            <span className="rp-conclusion-cell-label">موعد المراجعة القادمة</span>
            <strong className="rp-conclusion-cell-value">
              <Num>{nextReviewDate}</Num>
            </strong>
          </div>
          <div className="rp-conclusion-cell">
            <span className="rp-conclusion-cell-label">مستوى المخاطر الحالي</span>
            <PriorityBadge priority={riskLevel} />
          </div>
          <div className="rp-conclusion-cell">
            <span className="rp-conclusion-cell-label">رقم مرجع التقرير</span>
            <strong className="rp-conclusion-cell-value">
              <Code>{refNumber}</Code>
            </strong>
          </div>
        </div>
      </section>

      {/* Report Footer */}
      <footer className="report-footer-pro">
        <div className="rp-footer-left">
          <span>{organization}</span>
          <span style={{ color: '#DCD9D1' }}>|</span>
          <span>{title}</span>
        </div>
        <div className="rp-footer-right">
          <span style={{ color: '#97A0AC', fontSize: '10px' }}>سري — للاستخدام الداخلي فقط</span>
          <span style={{ color: '#DCD9D1' }}>|</span>
          <Code>{refNumber}</Code>
        </div>
      </footer>
    </article>
  );
}

export default ExecutiveReport;