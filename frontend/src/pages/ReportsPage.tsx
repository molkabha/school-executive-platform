import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReportItem } from '../types';
import { ReportsService } from '../services/api';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { AppShell } from '../components/AppShell';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

const AVAILABLE_MODULES = [
  { id: 'attendance', name: 'الحضور والانصراف' },
  { id: 'housing', name: 'السكن والإقامة' },
  { id: 'teacher_voice', name: 'صوت المعلم' },
  { id: 'evaluation', name: 'التقييم المهني' },
  { id: 'turnover', name: 'دوران الكادر' },
  { id: 'workforce_plan', name: 'خطة القوى العاملة' },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedSchoolId, schools } = useSchoolFilter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('التقرير التنفيذي الشامل');
  const [period, setPeriod] = useState<'WEEKLY' | 'MONTHLY' | 'SEMESTER'>('MONTHLY');
  const [scope, setScope] = useState<'ALL_SCHOOLS' | 'SCHOOL_SPECIFIC'>('ALL_SCHOOLS');
  // Local override for report generation form (separate from the global list filter)
  const [reportSchoolId, setReportSchoolId] = useState<string>('');
  const [selectedModules, setSelectedModules] = useState<string[]>([
    'attendance',
    'housing',
    'teacher_voice',
    'turnover',
  ]);
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = selectedSchoolId ? { schoolId: selectedSchoolId } : undefined;
      const result = await ReportsService.getAll(params);
      setReports(result.data || result);
    } catch {
      showToast('فشل تحميل التقارير', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Sync the local report form school picker to the global selected school
  useEffect(() => {
    if (selectedSchoolId) setReportSchoolId(selectedSchoolId);
    else if (schools.length > 0) setReportSchoolId(schools[0].id);
  }, [selectedSchoolId, schools]);

  useEffect(() => {
    loadData();
  }, [selectedSchoolId]);

  const toggleModule = (id: string) => {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((module) => module !== id) : [...prev, id],
    );
  };

  const handleGenerateReport = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedModules.length === 0) {
      showToast('يرجى اختيار وحدة واحدة على الأقل', 'warning');
      return;
    }

    setGenerating(true);
    try {
      const newReport = await ReportsService.generate({
        title,
        scope,
        period,
        modules: selectedModules,
        schoolId: scope === 'SCHOOL_SPECIFIC' ? reportSchoolId : undefined,
      });

      showToast('تم إنشاء التقرير التنفيذي وحفظه بنجاح', 'success');
      navigate(`/reports/${newReport.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'فشل توليد التقرير';
      showToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppShell
      activePage="reports"
      title="منظومة التقارير التنفيذية الذكية"
      subtitle="إنشاء تقارير استراتيجية محفوظة ثم عرضها من البيانات المخزنة فقط"
    >
      <div className="card mb-4">
        <div className="chart-box-header">
          <div>
            <h3>مولّد التقارير التنفيذية بالذكاء الاصطناعي</h3>
            <p className="text-muted text-xs">
              يتم تشغيل الذكاء الاصطناعي مرة واحدة فقط عند الضغط على زر التوليد، ثم يُحفظ الناتج في قاعدة البيانات.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerateReport} className="report-form-grid">
          <div className="form-group">
            <label>عنوان التقرير</label>
            <input
              type="text"
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>الفترة الزمنية</label>
            <select
              className="form-control"
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
            >
              <option value="WEEKLY">تقرير أسبوعي</option>
              <option value="MONTHLY">تقرير شهري</option>
              <option value="SEMESTER">تقرير فصلي</option>
            </select>
          </div>

          <div className="form-group">
            <label>النطاق التنفيذي</label>
            <select
              className="form-control"
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
            >
              <option value="ALL_SCHOOLS">جميع المدارس</option>
              <option value="SCHOOL_SPECIFIC">مدرسة محددة</option>
            </select>
          </div>

          {scope === 'SCHOOL_SPECIFIC' && (
            <div className="form-group">
              <label>اختر المدرسة</label>
              <select
                className="form-control"
                value={reportSchoolId}
                onChange={(e) => setReportSchoolId(e.target.value)}
              >
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group full-width">
            <label>الوحدات المشمولة في التقرير</label>
            <div className="checkbox-pill-group">
              {AVAILABLE_MODULES.map((module) => {
                const checked = selectedModules.includes(module.id);
                return (
                  <button
                    key={module.id}
                    type="button"
                    className={`checkbox-pill ${checked ? 'active' : ''}`}
                    onClick={() => toggleModule(module.id)}
                  >
                    <i className={`fa-solid ${checked ? 'fa-square-check' : 'fa-square'}`} />
                    <span>{module.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group full-width text-left">
            <button type="submit" className="btn btn-primary btn-glow" disabled={generating}>
              {generating ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin" /> جارٍ توليد التقرير وحفظه...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles" /> توليد التقرير التنفيذي
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="chart-box-header">
          <h3>أرشيف التقارير التنفيذية المحفوظة ({reports.length})</h3>
        </div>

        {loading ? (
          <SkeletonTable rows={4} />
        ) : reports.length === 0 ? (
          <EmptyState
            icon="fa-file-invoice"
            title="لا توجد تقارير محفوظة حالياً"
            description="قم بتوليد أول تقرير تنفيذي من النموذج أعلاه."
          />
        ) : (
          <div className="table-container">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>النطاق</th>
                  <th>الفترة</th>
                  <th>الوحدات المشمولة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <i className="fa-solid fa-file-contract text-primary ml-2" />
                      <strong>{report.title}</strong>
                    </td>
                    <td>
                      <span className="badge badge-gold">
                        {report.scope === 'ALL_SCHOOLS' ? 'جميع المدارس' : report.school?.name || 'مدرسة محددة'}
                      </span>
                    </td>
                    <td>{report.period}</td>
                    <td>
                      <div className="metrics-pills">
                        {report.modules.map((module) => (
                          <span key={module} className="metric-tag">
                            {AVAILABLE_MODULES.find((item) => item.id === module)?.name || module}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{new Date(report.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}</td>
                    <td>
                      <div className="btn-group">
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => navigate(`/reports/${report.id}`)}
                        >
                          <i className="fa-solid fa-eye" /> عرض التقرير
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default ReportsPage;
