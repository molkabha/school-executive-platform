import { useEffect, useState } from 'react';
import { DataSource, SourceType } from '../types';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { SourcesService } from '../services/api';
import { ImportService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { DataSourceConnector } from '../components/DataSourceConnector';
import { ProviderIcon } from '../components/ProviderIcons';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useSearchParams } from 'react-router-dom';
import { SOURCE_TYPE_DEFINITIONS } from '../constants/sourceTypes';

const SOURCE_TYPES = SOURCE_TYPE_DEFINITIONS.reduce<Record<string, { name: string }>>((acc, entry) => {
  acc[entry.type] = { name: entry.label };
  return acc;
}, {});

const STATUS_OPTIONS = ['CONNECTED', 'NOT_CONNECTED', 'ERROR'] as const;

export function SourcesPage() {
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();
  const [searchParams] = useSearchParams();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnectorOpen, setIsConnectorOpen] = useState(false);
  const [selectedSourceForAI, setSelectedSourceForAI] = useState<DataSource | null>(null);
  const [selectedSourceForImport, setSelectedSourceForImport] = useState<DataSource | null>(null);
  const [importDatasetType, setImportDatasetType] = useState('attendance');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Per-source action loading states
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await SourcesService.getAll({ schoolId: selectedSchoolId || undefined });
      setSources(data);
    } catch (err: any) {
      showToast('فشل تحميل مصادر البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, [selectedSchoolId]);

  useEffect(() => {
    const microsoftStatus = searchParams.get('microsoftStatus');
    const message = searchParams.get('message');
    const sourceId = searchParams.get('sourceId');

    if (!microsoftStatus) return;

    if (microsoftStatus === 'connected') {
      showToast('Microsoft connection completed successfully.', 'success');
    } else {
      showToast(message || 'Microsoft connection failed.', 'error');
    }

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: 'microsoft-oauth-complete',
          status: microsoftStatus,
          sourceId,
          message,
        },
        window.location.origin,
      );
      window.close();
      return;
    }

    loadSources();
    // The query params are intentionally left intact so the status is visible in the current tab.
  }, [searchParams, showToast]);

  const handleDeleteSource = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت تأكد من إلغاء ربط المصدر "${name}"؟`)) return;
    try {
      await SourcesService.delete(id);
      showToast('تم إلغاء ربط المصدر بنجاح', 'success');
      loadSources();
    } catch (err: any) {
      showToast('فشل حذف المصدر', 'error');
    }
  };

  /**
   * Reconnect a source: calls PUT /api/sources/:id/connect
   * Sets status to CONNECTED and updates lastSync timestamp.
   */
  const handleReconnect = async (source: DataSource) => {
    setReconnectingId(source.id);
    try {
      await SourcesService.connect(source.id, {});
      showToast(`تم إعادة الاتصال بـ "${source.name}" بنجاح ✓`, 'success');
      await loadSources();
    } catch (err: any) {
      showToast(err.response?.data?.message || `فشل إعادة الاتصال بـ "${source.name}"`, 'error');
    } finally {
      setReconnectingId(null);
    }
  };

  /**
   * Update source status via PATCH /api/sources/:id/status
   */
  const handleStatusChange = async (source: DataSource, newStatus: string) => {
    if (newStatus === source.status) return;
    setStatusChangingId(source.id);
    try {
      await SourcesService.updateStatus(source.id, newStatus);
      showToast(`تم تحديث حالة "${source.name}" إلى ${newStatus} ✓`, 'success');
      await loadSources();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل تحديث الحالة', 'error');
    } finally {
      setStatusChangingId(null);
    }
  };

  const openImportModal = (source: DataSource) => {
    setSelectedSourceForImport(source);
    setImportDatasetType(source.module === 'housing' ? 'housing' : 'attendance');
    setImportPreview(null);
    setImportMessage(null);
  };

  const loadImportPreview = async () => {
    if (!selectedSourceForImport) return;
    setPreviewLoading(true);
    setImportMessage(null);
    try {
      const preview = await ImportService.previewSource(selectedSourceForImport.id, {
        datasetType: importDatasetType,
      });
      setImportPreview(preview);
    } catch (err: any) {
      setImportMessage(err.response?.data?.message || 'Failed to load import preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runImport = async () => {
    if (!selectedSourceForImport) return;
    setImportRunning(true);
    setImportMessage(null);
    try {
      const result = await ImportService.importSource(selectedSourceForImport.id, {
        datasetType: importDatasetType,
      });
      setImportPreview((current: any) => ({ ...current, result }));
      setImportMessage(
        `Imported ${result.importedCount}, updated ${result.updatedCount}, skipped ${result.skippedCount}, failed ${result.failedCount}.`
      );
      await loadSources();
    } catch (err: any) {
      setImportMessage(err.response?.data?.message || 'Failed to import source file');
    } finally {
      setImportRunning(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'CONNECTED': return 'badge-success';
      case 'ERROR': return 'badge-danger';
      default: return 'badge-warning';
    }
  };

  const [showAllSources, setShowAllSources] = useState(false);
  const visibleSources = showAllSources ? sources : sources.slice(0, 4);

  return (
    <AppShell
      activePage="sources"
      title="إدارة مصادر البيانات والمستندات"
      subtitle="عرض مبسط للمصادر والملفات — عرض ٤ عناصر رئيسية مع إمكانية التوسيع."
    >
      <div className="card mb-4">
        <div className="chart-box-header">
          <div>
            <h3>حالة الاتصال بمصادر البيانات ({sources.length})</h3>
            <p className="text-muted text-xs">Sources connected from Google Drive, Excel Upload, and Gmail.</p>
          </div>
          <button className="btn btn-primary btn-glow" onClick={() => setIsConnectorOpen(true)}>
            <i className="fa-solid fa-plug" /> اتصال مصدر جديد
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={4} />
        ) : sources.length === 0 ? (
          <EmptyState
            icon="fa-plug-circle-exclamation"
            title="لا توجد مصادر بيانات مرتبطة"
            description="اضغط على زر 'اتصال مصدر جديد' لبدء ربط ملفات الكادر التعليمي بالمنصة."
            actionText="اتصال مصدر جديد"
            onAction={() => setIsConnectorOpen(true)}
          />
        ) : (
          <>
            <div className="source-cards-grid">
              {visibleSources.map((source) => {
                const typeInfo = SOURCE_TYPES[source.type as SourceType] || { name: source.type };
                const isReconnecting = reconnectingId === source.id;
                const isChangingStatus = statusChangingId === source.id;

                return (
                  <div key={source.id} className="source-card">
                    <div className="source-card-left">
                      <div className="source-file-icon">
                        <ProviderIcon type={source.type as SourceType} />
                      </div>
                      <div>
                        <strong>{source.name}</strong>
                        <div className="source-meta-row">
                          <span>الموفر: {typeInfo.name}</span>
                          <span>الوحدة: {source.module}</span>
                          <span>المالك: {source.owner?.name || 'مخصص'}</span>
                          <span>
                            آخر مزامنة:{' '}
                            {source.lastSync ? new Date(source.lastSync).toLocaleString('ar-SA-u-nu-latn') : 'غير محدد'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="source-actions">
                      {/* Status badge + dropdown toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`badge ${getStatusBadgeClass(source.status)}`}>
                          {source.status === 'CONNECTED' ? 'Connected ✓' : source.status}
                        </span>
                        <select
                          className="form-control"
                          style={{ width: 'auto', minWidth: '130px', fontSize: '0.75rem', padding: '2px 6px', height: 'auto' }}
                          value={source.status}
                          disabled={isChangingStatus}
                          onChange={(e) => handleStatusChange(source, e.target.value)}
                          title="تغيير الحالة"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Reconnect Button */}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleReconnect(source)}
                        disabled={isReconnecting || source.status === 'CONNECTED'}
                      >
                        {isReconnecting ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin" /> جاري الاتصال...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-rotate" /> إعادة اتصال
                          </>
                        )}
                      </button>

                      {/* External URL Button */}
                      {source.externalUrl && (
                        <a
                          href={source.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-outline"
                          title="فتح رابط الملف المباشر"
                          aria-label="فتح رابط الملف المباشر"
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square" />
                        </a>
                      )}

                      {/* AI Analysis Button */}
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setSelectedSourceForAI(source)}
                        title="تحليل بالذكاء الاصطناعي"
                      >
                        <i className="fa-solid fa-brain" /> تحليل AI
                      </button>

                      {['GOOGLE_DRIVE', 'GOOGLE_SHEETS', 'GMAIL', 'ONEDRIVE', 'SHAREPOINT', 'OUTLOOK'].includes(source.type) && (
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openImportModal(source)}
                          title="Preview and import the latest source file"
                        >
                          <i className="fa-solid fa-file-import" /> Import
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        className="btn btn-sm danger"
                        onClick={() => handleDeleteSource(source.id, source.name)}
                        title="إلغاء ربط المصدر"
                        aria-label="إلغاء ربط المصدر"
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Toggle show all sources button */}
            {sources.length > 4 && (
              <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowAllSources(!showAllSources)}
                  style={{ fontWeight: 800 }}
                >
                  <i className={`fa-solid ${showAllSources ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                  {showAllSources
                    ? 'عرض أقل (إعادة لـ ٤ عناصر)'
                    : `عرض كافة المصادر المتبقية (+${sources.length - 4} مصادر)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* DataSource Connector Wizard */}
      <DataSourceConnector
        module="general"
        schoolId={selectedSchoolId}
        isOpen={isConnectorOpen}
        onClose={() => setIsConnectorOpen(false)}
        onSuccess={() => {
          setIsConnectorOpen(false);
          loadSources();
        }}
      />

      {/* AI Modal for Selected Source */}
      {selectedSourceForAI && (
        <div className="modal-backdrop" onClick={() => setSelectedSourceForAI(null)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-brain text-primary" />
                <span>تحليل بالذكاء الاصطناعي للمصدر: {selectedSourceForAI.name}</span>
              </div>
              <button className="icon-action-btn" onClick={() => setSelectedSourceForAI(null)} aria-label="إغلاق">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <AIAnalysisPanel
                module={selectedSourceForAI.module}
                documentName={selectedSourceForAI.name}
              />
            </div>
          </div>
        </div>
      )}

      {selectedSourceForImport && (
        <div className="modal-backdrop" onClick={() => setSelectedSourceForImport(null)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-file-import text-primary" />
                <span>Import from {selectedSourceForImport.name}</span>
              </div>
              <button className="icon-action-btn" onClick={() => setSelectedSourceForImport(null)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-3">
                <label>Dataset</label>
                <select className="form-control" value={importDatasetType} onChange={(e) => setImportDatasetType(e.target.value)}>
                  <option value="attendance">Attendance</option>
                  <option value="housing">Housing</option>
                  <option value="complaints">Complaints</option>
                  <option value="tasks">Tasks</option>
                  <option value="meetings">Meetings</option>
                  <option value="staff_modules">Staff Modules</option>
                  <option value="schools">Schools</option>
                  <option value="kpi_snapshots">KPI Snapshots</option>
                </select>
              </div>
              <div className="settings-actions-bar mb-3">
                <button className="btn btn-outline" onClick={loadImportPreview} disabled={previewLoading || importRunning}>
                  {previewLoading ? 'Loading preview...' : 'Load preview'}
                </button>
                <button className="btn btn-primary btn-glow" onClick={runImport} disabled={importRunning || previewLoading}>
                  {importRunning ? 'Importing...' : 'Run import'}
                </button>
              </div>
              {importMessage && (
                <div className="alert alert-info text-xs mb-3">
                  <i className="fa-solid fa-circle-info" /> {importMessage}
                </div>
              )}
              {importPreview && (
                <div className="card p-3">
                  <h4 className="mb-2">Preview</h4>
                  <div className="text-xs mb-2">
                    <strong>File:</strong> {importPreview.fileName} <br />
                    <strong>Rows:</strong> {importPreview.rowCount} <br />
                    <strong>Mapped headers:</strong> {Object.keys(importPreview.mappedHeaders || {}).length}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: '280px', overflow: 'auto' }}>
{JSON.stringify({
  headers: importPreview.headers,
  mappedHeaders: importPreview.mappedHeaders,
  sampleRows: importPreview.sampleRows,
  errors: importPreview.errors,
  result: importPreview.result || null,
}, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default SourcesPage;
