import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { AuditService } from '../services/api';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function AuditLogPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await AuditService.getAll();
      setLogs(data);
    } catch (err: any) {
      showToast('فشل تحميل سجلات النظام', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const formatDate = (dt: string) =>
    new Date(dt).toLocaleString('ar-SA-u-nu-latn', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const ACTION_LABELS: Record<string, string> = {
    login: 'تسجيل دخول',
    failed_login: 'محاولة دخول فاشلة',
    logout: 'تسجيل خروج',
    create_source: 'إضافة مصدر',
    update_source: 'تحديث مصدر',
    delete_source: 'حذف مصدر',
    create_report: 'إنشاء تقرير',
    chat_agent_query: 'استعلام المساعد',
    clear_agent_history: 'مسح سجل المحادثة',
    update_school_status: 'تغيير حالة المدرسة',
  };

  return (
    <AppShell
      activePage="audit-logs"
      title="سجلات النظام"
      subtitle="آخر 100 حركة تنفيذية مسجّلة في المنصة"
    >
      <div className="card mb-4">
        <div className="card-header">
          <div className="card-title">
            <i className="fa-solid fa-shield-halved text-primary" />
            <span>سجل العمليات التنفيذية</span>
          </div>
          <button className="btn btn-sm btn-outline" onClick={loadLogs} disabled={loading}>
            <i className="fa-solid fa-rotate" />
            تحديث
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={10} />
        ) : logs.length === 0 ? (
          <div className="empty-state py-5 text-center">
            <i className="fa-solid fa-list-check fa-3x text-muted mb-3" />
            <p>لا توجد سجلات بعد.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>المستخدم</th>
                  <th>الإجراء</th>
                  <th>الكيان</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.78rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {formatDate(log.createdAt)}
                    </td>
                    <td>{log.user?.name || log.userId || '—'}</td>
                    <td>
                      <span className="badge badge-primary">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {log.entity}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.details || '—'}
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

// Default export required for React.lazy() code splitting
export default AuditLogPage;
