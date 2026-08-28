import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReportItem } from '../types';
import { ReportsService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { SkeletonCard } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

const ExecutiveReport = lazy(() => import('../components/report/ExecutiveReport'));

export function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [report, setReport] = useState<ReportItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadReport = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await ReportsService.getOne(id);
        if (active) setReport(data);
      } catch {
        if (active) {
          setReport(null);
          showToast('فشل تحميل التقرير المحفوظ', 'error');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadReport();

    return () => {
      active = false;
    };
  }, [id, showToast]);

  const handleDownloadPdf = async () => {
    if (exporting) return;
    const element = document.getElementById('report-pdf-content');
    if (!element) return;

    setExporting(true);
    try {
      const filename = `Executive_Report_${report?.title || 'Export'}`;
      const { exportReportToPdf } = await import('../utils/pdfExport');
      await exportReportToPdf('report-pdf-content', filename);
    } catch {
      showToast('تعذّر إنشاء ملف PDF، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell
      activePage="reports"
      title="عرض التقرير التنفيذي"
      subtitle="يعرض التقرير من aiOutput المحفوظ فقط مع إمكانية تنزيله مباشرة كملف PDF"
    >
      <div className="report-page-shell">
        <div className="report-toolbar no-print">
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/reports')}>
            <i className="fa-solid fa-arrow-right" /> العودة للتقارير
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadPdf} disabled={exporting}>
            <i className={exporting ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-download'} />
            {exporting ? ' جارٍ إنشاء PDF...' : ' تنزيل PDF'}
          </button>
        </div>

        {loading ? (
          <SkeletonCard />
        ) : !report ? (
          <EmptyState
            icon="fa-file-circle-exclamation"
            title="التقرير غير موجود"
            description="لم يتم العثور على التقرير المطلوب أو لا يمكن تحميله."
            actionText="العودة إلى الأرشيف"
            onAction={() => navigate('/reports')}
          />
        ) : (
          <div id="report-pdf-content">
            <Suspense fallback={<SkeletonCard />}>
              <ExecutiveReport report={report} />
            </Suspense>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default ReportDetailPage;
