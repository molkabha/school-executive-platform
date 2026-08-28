import { useEffect, useState } from 'react';
import { AlertItem } from '../types';
import { AlertsService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

export function AlertsPage() {
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (selectedSchoolId) params.schoolId = selectedSchoolId;
      const data = await AlertsService.getAll(params);
      setAlerts(data);
    } catch (err: any) {
      showToast('فشل تحميل التنبيهات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, priorityFilter, selectedSchoolId]);

  const handleResolveAlert = async (id: string, title: string) => {
    try {
      await AlertsService.resolve(id);
      showToast(`تم إغلاق التنبيه بنجاح: ${title}`, 'success');
      loadAlerts();
      if (selectedAlert?.id === id) setSelectedAlert(null);
    } catch (err: any) {
      showToast('فشل إغلاق التنبيه', 'error');
    }
  };

  return (
    <AppShell
      activePage="alerts"
      title="منظومة التنبيهات الإستراتيجية"
      subtitle="تجميع ومعالجة التنبيهات المستخرجة تلقائياً من ملفات الحضور والسكن وصوت المعلم ودوران الكادر."
    >
      {/* Filters Toolbar */}
      <div className="card-header-actions mb-4">
        <div className="filter-pill-group">
          <button
            className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            جميع التنبيهات
          </button>
          <button
            className={`filter-pill ${statusFilter === 'OPEN' ? 'active' : ''}`}
            onClick={() => setStatusFilter('OPEN')}
          >
            المفتوحة فقط
          </button>
          <button
            className={`filter-pill ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
            onClick={() => setStatusFilter('IN_PROGRESS')}
          >
            قيد المعالجة
          </button>
          <button
            className={`filter-pill ${statusFilter === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('RESOLVED')}
          >
            المغلقة
          </button>
        </div>

        <div className="filter-select-wrap">
          <select
            className="form-control text-xs"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="ALL">جميع الأولويات</option>
            <option value="CRITICAL">حرجة جداً (CRITICAL)</option>
            <option value="HIGH">عالية (HIGH)</option>
            <option value="MEDIUM">متوسطة (MEDIUM)</option>
            <option value="LOW">منخفضة (LOW)</option>
          </select>
        </div>
      </div>

      {/* Main Alerts Table */}
      <div className="card">
        <div className="chart-box-header">
          <h3>قائمة التنبيهات والإنذارات الحية ({alerts.length})</h3>
        </div>

        {loading ? (
          <SkeletonTable rows={5} />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon="fa-bell-slash"
            title="لا توجد تنبيهات لهذه الفلاتر"
            description="جميع القطاعات والمدارس تعمل وفق المعدل الطبيعي."
          />
        ) : (
          <div className="table-container">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>الأولوية</th>
                  <th>عنوان التنبيه والقضية</th>
                  <th>الوحدة والمصدر</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className={alert.status === 'RESOLVED' ? 'opacity-60' : ''}>
                    <td>
                      <span className={`priority-badge badge-${alert.priority.toLowerCase()}`}>
                        {alert.priority}
                      </span>
                    </td>
                    <td>
                      <strong>{alert.title}</strong>
                      {alert.details && (
                        <span className="d-block text-xs text-muted text-truncate-1">
                          {alert.details}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-subtle">{alert.source}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          alert.status === 'RESOLVED'
                            ? 'badge-success'
                            : alert.status === 'IN_PROGRESS'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {alert.status}
                      </span>
                    </td>
                    <td>{new Date(alert.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}</td>
                    <td>
                      <div className="btn-group">
                        <button
                          className="btn btn-xs btn-outline"
                          onClick={() => setSelectedAlert(alert)}
                        >
                          <i className="fa-solid fa-eye" /> التفاصيل
                        </button>
                        {alert.status !== 'RESOLVED' && (
                          <button
                            className="btn btn-xs btn-primary"
                            onClick={() => handleResolveAlert(alert.id, alert.title)}
                          >
                            <i className="fa-solid fa-check" /> إغلاق التنبيه
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Alert Details Drawer Modal */}
      {selectedAlert && (
        <div className="modal-backdrop" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-triangle-exclamation text-danger" />
                <span>تفاصيل التنبيه التنفيذي</span>
              </div>
              <button className="icon-action-btn" onClick={() => setSelectedAlert(null)} aria-label="إغلاق">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body">
              <div className="alert-drawer-header">
                <span className={`priority-badge badge-${selectedAlert.priority.toLowerCase()}`}>
                  الأولوية: {selectedAlert.priority}
                </span>
                <span className="badge badge-subtle">الوحدة المصدر: {selectedAlert.source}</span>
              </div>

              <h3 className="mt-3">{selectedAlert.title}</h3>

              <div className="alert-drawer-desc mt-3">
                <label>تفاصيل القضية والشواهد:</label>
                <p>{selectedAlert.details || 'لا تتوفر تفاصيل إضافية.'}</p>
              </div>

              <div className="meta-list mt-4">
                <div className="meta-item">
                  <strong>الحالة الحالية:</strong> <span>{selectedAlert.status}</span>
                </div>
                <div className="meta-item">
                  <strong>تاريخ الظهور:</strong> <span>{new Date(selectedAlert.createdAt).toLocaleString('ar-SA-u-nu-latn')}</span>
                </div>
                {selectedAlert.resolvedAt && (
                  <div className="meta-item">
                    <strong>تاريخ المعالجة:</strong> <span>{new Date(selectedAlert.resolvedAt).toLocaleString('ar-SA-u-nu-latn')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              {selectedAlert.status !== 'RESOLVED' && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleResolveAlert(selectedAlert.id, selectedAlert.title)}
                >
                  <i className="fa-solid fa-circle-check" /> تحديد كـ "مُعالج ومُغلق"
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setSelectedAlert(null)}>
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default AlertsPage;
