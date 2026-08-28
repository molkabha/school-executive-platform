import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { AppShell } from '../components/AppShell';
import { DashboardData, ExecutiveSummaryToday } from '../types';
import { DashboardService, AgentService } from '../services/api';
import { SkeletonGrid, SkeletonTable } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

// Priority color mapping
const priorityColors: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#F97316',
  MEDIUM: '#F59E0B',
  LOW: '#10B981',
};

const priorityBadgeClass: Record<string, string> = {
  CRITICAL: 'badge-danger',
  HIGH: 'badge-warning',
  MEDIUM: 'badge-info',
  LOW: 'badge-success',
};

const attentionTypeIcon: Record<string, string> = {
  alert: 'fa-triangle-exclamation',
  complaint: 'fa-comment-exclamation',
  task: 'fa-list-check',
};

const attentionTypeLabelAr: Record<string, string> = {
  alert: 'تنبيه',
  complaint: 'شكوى',
  task: 'مهمة',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [aiSummary, setAiSummary] = useState<ExecutiveSummaryToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aiLoadedRef = useRef(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = selectedSchoolId ? { schoolId: selectedSchoolId } : undefined;
      const stats = await DashboardService.getStats(params);
      setData(stats);
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.message || 'فشل تحميل بيانات لوحة المتابعة';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Deferred: AI summary loads AFTER data renders (Phase 2 loading)
  const fetchAiSummary = async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshingSummary(true);
    } else {
      setLoadingSummary(true);
    }
    try {
      const params = selectedSchoolId ? { schoolId: selectedSchoolId } : undefined;
      const res = forceRefresh
        ? await AgentService.refreshSummary(params)
        : await AgentService.getTodaySummary(params);
      setAiSummary(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
      setRefreshingSummary(false);
    }
  };

  useEffect(() => {
    aiLoadedRef.current = false;
    fetchDashboardData().then(() => {
      // Only load AI summary once per school selection
      if (!aiLoadedRef.current) {
        aiLoadedRef.current = true;
        fetchAiSummary();
      }
    });
  }, [selectedSchoolId]);

  const formatMeetingTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <AppShell
      activePage="dashboard"
      title="لوحة المتابعة التنفيذية الإستراتيجية"
      subtitle={`أهلاً بكِ ${user?.name || ''} • إشراف تنفيذي مباشر على الكادر التعليمي في جميع المدارس`}
    >
      {/* ─────────────────────────────────────────────
          SECTION 1: What Needs My Attention Today?
          (database-driven, renders immediately)
      ───────────────────────────────────────────── */}
      {!loading && data && (data.attentionItems.length > 0 || data.openComplaintsCount > 0 || data.overdueTasksCount > 0) && (
        <div className="card attention-card mb-4">
          <div className="attention-header">
            <div className="attention-title-block">
              <div className="attention-icon-badge">
                <i className="fa-solid fa-bell-exclamation" />
              </div>
              <div>
                <h3>ما الذي يحتاج انتباهي اليوم؟</h3>
                <p className="text-muted text-xs">
                  {data.overdueTasksCount > 0 && <span className="me-2"><i className="fa-solid fa-clock text-danger" /> {data.overdueTasksCount} مهمة متأخرة</span>}
                  {data.openComplaintsCount > 0 && <span className="me-2"><i className="fa-solid fa-comment-exclamation text-amber" /> {data.openComplaintsCount} شكوى مفتوحة</span>}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-subtle btn-xs" onClick={() => navigate('/tasks')}>
                <i className="fa-solid fa-list-check" /> المهام
              </button>
              <button className="btn btn-subtle btn-xs" onClick={() => navigate('/complaints')}>
                <i className="fa-solid fa-comment-exclamation" /> الشكاوى
              </button>
            </div>
          </div>

          <div className="attention-list">
            {data.attentionItems.map((item) => (
              <div
                key={item.id}
                className="attention-item"
                style={{ borderRightColor: priorityColors[item.priority] || '#64748B' }}
              >
                <div className="attention-item-left">
                  <span
                    className="attention-type-badge"
                    style={{ background: priorityColors[item.priority] + '20', color: priorityColors[item.priority] }}
                  >
                    <i className={`fa-solid ${attentionTypeIcon[item.type]}`} />
                    {attentionTypeLabelAr[item.type]}
                  </span>
                  <span className="attention-item-title">{item.title}</span>
                  {item.school && (
                    <span className="attention-school-tag">
                      <i className="fa-solid fa-school" /> {item.school}
                    </span>
                  )}
                </div>
                <span className={`badge ${priorityBadgeClass[item.priority] || 'badge-info'}`}>
                  {item.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────
          SECTION 2: Today's Meetings Widget
          (shows only if there are meetings today)
      ───────────────────────────────────────────── */}
      {!loading && data && data.todayMeetings.length > 0 && (
        <div className="card meetings-today-card mb-4">
          <div className="chart-box-header">
            <div>
              <h3><i className="fa-solid fa-calendar-day" style={{ marginLeft: 8, color: '#7C3AED' }} />اجتماعات اليوم</h3>
              <p className="text-muted text-xs">{data.todayMeetings.length} اجتماع مجدول اليوم</p>
            </div>
            <button className="btn btn-subtle btn-xs" onClick={() => navigate('/meetings')}>
              إدارة الاجتماعات
            </button>
          </div>
          <div className="meetings-today-list">
            {data.todayMeetings.map((meeting) => (
              <div key={meeting.id} className="meeting-today-item">
                <div className="meeting-time">
                  <i className="fa-regular fa-clock" />
                  {formatMeetingTime(meeting.date)}
                </div>
                <div className="meeting-today-info">
                  <strong>{meeting.title}</strong>
                  {meeting.location && (
                    <span className="text-xs text-muted">
                      <i className="fa-solid fa-location-dot" style={{ marginLeft: 4 }} />{meeting.location}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-danger mb-4">
          <i className="fa-solid fa-triangle-exclamation" />
          <span>{error}</span>
          <button className="btn btn-subtle btn-xs mr-auto" onClick={fetchDashboardData}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────
          SECTION 3: KPI Cards Grid
      ───────────────────────────────────────────── */}
      <div className="section-label-bar mb-2">
        <i className="fa-solid fa-gauge-high text-primary" />
        <span>مؤشرات الأداء الرئيسية</span>
        <button className="btn btn-subtle btn-xs mr-auto" onClick={fetchDashboardData} disabled={loading}>
          <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} /> تحديث
        </button>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : data ? (
        <div className="kpi-grid">
          {/* KPI 1: Total Staff */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">إجمالي الكادر التعليمي</span>
              <div className="kpi-icon icon-navy">
                <i className="fa-solid fa-users" />
              </div>
            </div>
            <div className="kpi-value">{data.totalStaff}</div>
            <div className="kpi-subtext">موزعون على {data.staffBySchool.length} مدارس معتمدة</div>
          </div>

          {/* KPI 2: Attendance Rate */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">نسبة حضور الكادر الإجمالية</span>
              <div className="kpi-icon icon-green">
                <i className="fa-solid fa-user-check" />
              </div>
            </div>
            <div className="kpi-value text-emerald">
              {data.attendanceRate > 0 ? `${data.attendanceRate}%` : '—'}
            </div>
            <div className="kpi-subtext text-emerald">
              <i className="fa-solid fa-arrow-trend-up" /> بناءً على ملفات الحضور
            </div>
          </div>

          {/* KPI 3: Open Issues */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">قضايا الكادر المفتوحة</span>
              <div className="kpi-icon icon-red">
                <i className="fa-solid fa-triangle-exclamation" />
              </div>
            </div>
            <div className="kpi-value text-danger">{data.openIssues}</div>
            <div className="kpi-subtext text-danger">سكن + تنبيهات نشطة</div>
          </div>

          {/* KPI 4: Pending Actions */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">إجراءات عالية الأولوية</span>
              <div className="kpi-icon icon-amber">
                <i className="fa-solid fa-clock-rotate-left" />
              </div>
            </div>
            <div className="kpi-value text-amber">{data.pendingActions}</div>
            <div className="kpi-subtext">تتطلب متابعة عاجلة من مدراء المدارس</div>
          </div>

          {/* KPI 5: Turnover */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">مغادرو الكادر (الفصل الحالي)</span>
              <div className="kpi-icon icon-rose">
                <i className="fa-solid fa-right-left" />
              </div>
            </div>
            <div className="kpi-value">{data.turnoverCount}</div>
            <div className="kpi-subtext text-muted">مؤشر الدوران واكتشاف المخاطر</div>
          </div>

          {/* KPI 6: Connected Data Sources */}
          <div className="card kpi-card">
            <div className="kpi-top">
              <span className="kpi-title">مصادر البيانات النشطة</span>
              <div className="kpi-icon icon-blue">
                <i className="fa-solid fa-plug" />
              </div>
            </div>
            <div className="kpi-value text-primary">{data.connectedSourcesCount}</div>
            <div className="kpi-subtext text-primary">Google Drive, Excel Upload, Gmail...</div>
          </div>
        </div>
      ) : null}

      {/* ─────────────────────────────────────────────
          SECTION 4: School Breakdown & Alerts
      ───────────────────────────────────────────── */}
      <div className="dashboard-content-grid mt-4">
        {/* Left Column: School Breakdown */}
        <div className="card">
          <div className="chart-box-header">
            <div>
              <h3><i className="fa-solid fa-sitemap" style={{ marginLeft: 8, color: '#2563EB' }}/> توزيع الكادر والالتزام حسب المدارس</h3>
              <p className="text-muted text-xs">نظرة مقارنة سريعة عبر المدارس</p>
            </div>
            <span className="badge badge-gold">محدث مباشرة من DB</span>
          </div>

          {loading ? (
            <SkeletonTable rows={4} />
          ) : data && data.staffBySchool.length > 0 ? (
            <div className="school-breakdown-list">
              {data.staffBySchool.map((school) => (
                <div key={school.schoolId} className="school-breakdown-item">
                  <div className="school-info">
                    <div className="school-icon">
                      <i className="fa-solid fa-school" />
                    </div>
                    <div>
                      <strong>{school.schoolName}</strong>
                      <span className="d-block text-xs text-muted">
                        إجمالي المعلمين: {school.staffCount > 0 ? school.staffCount : '—'} معلم • {school.connectedSources} مصادر مرتبطة
                      </span>
                    </div>
                  </div>
                  <div className="school-metrics">
                    <div className="metric-pill">
                      <span className="label">نسبة الحضور</span>
                      <span
                        className={`value ${
                          school.attendanceRate === 0
                            ? 'text-muted'
                            : school.attendanceRate >= 95
                            ? 'text-emerald'
                            : school.attendanceRate >= 92
                            ? 'text-amber'
                            : 'text-danger'
                        }`}
                      >
                        {school.attendanceRate > 0 ? `${school.attendanceRate}%` : '—'}
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className={`progress-bar-fill ${
                          school.attendanceRate === 0
                            ? 'bg-muted'
                            : school.attendanceRate >= 95
                            ? 'bg-emerald'
                            : school.attendanceRate >= 92
                            ? 'bg-amber'
                            : 'bg-danger'
                        }`}
                        style={{ width: school.attendanceRate > 0 ? `${Math.min(100, school.attendanceRate)}%` : '3%' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد بيانات مدارس" description="لم يتم العثور على بيانات حضور المدارس." />
          )}
        </div>

        {/* Right Column: Live Active Alerts */}
        <div className="card">
          <div className="chart-box-header">
            <div>
              <h3>التنبيهات الإستراتيجية الحية</h3>
              <p className="text-muted text-xs">القضايا المستخرجة من المستندات والإيميلات</p>
            </div>
            <button className="btn btn-subtle btn-xs" onClick={() => navigate('/alerts')}>
              عرض الكل ({data?.recentAlerts?.length || 0})
            </button>
          </div>

          {loading ? (
            <SkeletonTable rows={4} />
          ) : data && data.recentAlerts.length > 0 ? (
            <div className="alerts-feed-list">
              {data.recentAlerts.map((alert) => (
                <div key={alert.id} className={`alert-feed-item priority-${alert.priority.toLowerCase()}`}>
                  <div className="alert-feed-top">
                    <span className={`priority-badge badge-${alert.priority.toLowerCase()}`}>
                      {alert.priority}
                    </span>
                    <span className="alert-time text-xs text-muted">
                      {new Date(alert.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}
                    </span>
                  </div>
                  <h4 className="alert-feed-title">{alert.title}</h4>
                  {alert.details && <p className="alert-feed-desc text-xs">{alert.details}</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="fa-circle-check"
              title="لا توجد تنبيهات حرة"
              description="جميع قطاعات المدارس تعمل بشكل مستقر حالياً."
            />
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────
          SECTION 5: Recent Executive Reports
      ───────────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="chart-box-header">
          <div>
            <h3>آخر التقارير التنفيذية المنشأة بالذكاء الاصطناعي</h3>
            <p className="text-muted text-xs">تقارير إستراتيجية تم حفظها لمشاركتها مع مدراء المدارس</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/reports')}>
            عرض جميع التقارير
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={3} />
        ) : data && data.recentReports.length > 0 ? (
          <div className="table-container">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>عنوان التقرير</th>
                  <th>النطاق التنفيذي</th>
                  <th>الفترة</th>
                  <th>منشئ التقرير</th>
                  <th>تاريخ الإنشاء</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {data.recentReports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <i className="fa-solid fa-file-invoice text-primary ml-2" />
                      <strong>{report.title}</strong>
                    </td>
                    <td>
                      <span className="badge badge-gold">
                        {report.scope === 'ALL_SCHOOLS' ? 'جميع المدارس' : 'مدرسة واحدة'}
                      </span>
                    </td>
                    <td>{report.period}</td>
                    <td>{report.createdBy}</td>
                    <td>{new Date(report.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}</td>
                    <td>
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => navigate(`/reports/${report.id}`)}
                      >
                        عرض التقرير
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="fa-file-slash"
            title="لا توجد تقارير منشأة حالياً"
            description="اضغط على إنشاء تقرير تنفيذي لتوليد تقرير بالذكاء الاصطناعي."
            actionText="إنشاء تقرير الآن"
            onAction={() => navigate('/reports')}
          />
        )}
      </div>

      {/* ─────────────────────────────────────────────
          SECTION 6: AI Executive Summary (deferred)
      ───────────────────────────────────────────── */}
      <div className="card executive-today-card mt-4">
        <div className="executive-today-header">
          <div className="executive-today-title">
            <div className="pulse-ai-badge">
              <i className="fa-solid fa-brain" />
            </div>
            <div>
              <h3>{aiSummary?.summaryTitle || 'الملخص الذكي اليومي للمشرفة العامة'}</h3>
              <p className="text-muted text-xs">
                {aiSummary?.fromCache ? '⚡ من الذاكرة المؤقتة (4 ساعات)' : 'تجميع وتحليل بواسطة RAG Intelligence Engine'}
              </p>
            </div>
          </div>
          <div className="banner-actions">
            <button className="btn btn-primary btn-glow btn-sm" onClick={() => navigate('/assistant')}>
              <i className="fa-solid fa-robot" /> اسألي المساعد التنفيذي
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => fetchAiSummary(true)}
              disabled={refreshingSummary || loadingSummary}
            >
              <i className={`fa-solid fa-rotate ${refreshingSummary ? 'fa-spin' : ''}`} /> تحديث التحليل
            </button>
          </div>
        </div>

        {loadingSummary ? (
          <div className="py-3 text-center text-muted text-xs">
            <i className="fa-solid fa-spinner fa-spin ml-2" /> جاري تجميع مؤشرات المدارس...
          </div>
        ) : aiSummary ? (
          <div className="executive-today-body mt-3">
            <div className="highlights-grid mb-3">
              {aiSummary.highlights.map((h, i) => (
                <div key={i} className="highlight-pill-item">
                  <i className="fa-solid fa-chart-line text-gold ml-2" />
                  <span>{h}</span>
                </div>
              ))}
            </div>

            <div className="recommendation-callout-bar">
              <div className="rec-left">
                <i className="fa-solid fa-lightbulb text-warning" />
                <span>
                  <strong>التوصية الإستراتيجية العاجلة اليوم:</strong> {aiSummary.recommendedAction}
                </span>
              </div>
              <span className={`badge ${aiSummary.riskLevel === 'HIGH' ? 'badge-danger' : aiSummary.riskLevel === 'MEDIUM' ? 'badge-warning' : 'badge-success'}`}>
                مستوى المخاطر: {aiSummary.riskLevel}
              </span>
            </div>
          </div>
        ) : (
          <div className="py-3 text-center text-muted text-xs">
            <i className="fa-solid fa-brain ml-2" /> اضغط على "تحديث التحليل" لتجميع الملخص الذكي
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default DashboardPage;

