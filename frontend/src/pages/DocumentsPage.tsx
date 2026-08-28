import { useEffect, useState } from 'react';
import { DocumentItem, SourceType } from '../types';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { DocumentsService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { useToast } from '../components/ui/Toast';
import { ProviderIcon } from '../components/ProviderIcons';
import { DOCUMENT_SOURCE_TYPE_DEFINITIONS } from '../constants/sourceTypes';

const DOCUMENT_MODULE_OPTIONS = [
  { value: 'attendance', label: 'الحضور والانصراف' },
  { value: 'housing', label: 'السكن' },
  { value: 'teacher_voice', label: 'صوت المعلم' },
  { value: 'general', label: 'عام' },
];

export function DocumentsPage() {
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSourceType, setCreateSourceType] = useState<'POWERPOINT' | 'WORD' | 'PDF_DOC' | 'ONENOTE'>('POWERPOINT');
  const [createExternalUrl, setCreateExternalUrl] = useState('');
  const [createModule, setCreateModule] = useState('general');
  const [creating, setCreating] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await DocumentsService.getAll({
        module: filterModule !== 'all' ? filterModule : undefined,
        schoolId: selectedSchoolId || undefined,
      });
      setDocuments(data);
    } catch (err: any) {
      showToast('فشل تحميل مراجع المستندات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [filterModule, selectedSchoolId]);

  const openCreateModal = () => {
    setCreateName('');
    setCreateExternalUrl('');
    setCreateSourceType('POWERPOINT');
    setCreateModule(filterModule !== 'all' ? filterModule : 'general');
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateName('');
    setCreateExternalUrl('');
    setCreateSourceType('POWERPOINT');
    setCreateModule('general');
  };

  const handleCreateDocument = async () => {
    const name = createName.trim();
    if (!name) {
      showToast('اسم المستند مطلوب', 'warning');
      return;
    }

    setCreating(true);
    try {
      await DocumentsService.create({
        name,
        sourceType: createSourceType,
        externalUrl: createExternalUrl.trim() || undefined,
        module: createModule,
        schoolId: selectedSchoolId || undefined,
      });
      showToast('تمت إضافة المستند بنجاح', 'success');
      closeCreateModal();
      await loadDocuments();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل إنشاء المستند', 'error');
    } finally {
      setCreating(false);
    }
  };

  const [showAllDocs, setShowAllDocs] = useState(false);
  const visibleDocs = showAllDocs ? documents : documents.slice(0, 4);

  return (
    <AppShell
      activePage="documents"
      title="مرجع المستندات التنفيذية"
      subtitle="عرض مبسط ونظيف للمستندات والملفات — عرض ٤ عناصر رئيسية مع إمكانية التوسيع."
    >
      <div className="card-header-actions mb-4">
        <div className="filter-pill-group">
          <button
            className={`filter-pill ${filterModule === 'all' ? 'active' : ''}`}
            onClick={() => setFilterModule('all')}
          >
            كافة المستندات ({documents.length})
          </button>
          <button
            className={`filter-pill ${filterModule === 'attendance' ? 'active' : ''}`}
            onClick={() => setFilterModule('attendance')}
          >
            الحضور والانصراف
          </button>
          <button
            className={`filter-pill ${filterModule === 'housing' ? 'active' : ''}`}
            onClick={() => setFilterModule('housing')}
          >
            السكن
          </button>
          <button
            className={`filter-pill ${filterModule === 'teacher_voice' ? 'active' : ''}`}
            onClick={() => setFilterModule('teacher_voice')}
          >
            صوت المعلم
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={openCreateModal}>
            <i className="fa-solid fa-plus" /> إضافة مستند
          </button>
          <button className="btn btn-outline" onClick={loadDocuments}>
            <i className="fa-solid fa-rotate" /> تحديث القائمة
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={4} />
      ) : documents.length === 0 ? (
        <EmptyState
          icon="fa-file-circle-exclamation"
          title="لا توجد مستندات مسجلة"
          description="لم يتم إحالة أي مراجع مستندات لهذا الفلتر بعد."
          actionText="إضافة مستند"
          onAction={openCreateModal}
        />
      ) : (
        <div className="card p-0">
          <div className="table-container">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>اسم المستند المرجعي</th>
                  <th>الموفر والمصدر</th>
                  <th>الوحدة المرتبطة</th>
                  <th>المالك</th>
                  <th>آخر تحديث</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="doc-name-cell">
                        <div className="doc-icon">
                          <ProviderIcon type={doc.sourceType} />
                        </div>
                        <div>
                          <strong>{doc.name}</strong>
                          {doc.school && <span className="d-block text-muted text-xs">{doc.school.name}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{doc.sourceType}</span>
                    </td>
                    <td>
                      <span className="badge badge-subtle">{doc.module}</span>
                    </td>
                    <td>{doc.owner?.name || 'غير معروف'}</td>
                    <td>{new Date(doc.lastUpdated).toLocaleDateString('ar-SA-u-nu-latn')}</td>
                    <td>
                      <div className="btn-group">
                        {doc.externalUrl ? (
                          <a
                            href={doc.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-outline"
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square" /> فتح الأصل
                          </a>
                        ) : (
                          <span className="text-muted text-xs">ملف داخلي</span>
                        )}
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => setSelectedDoc(doc)}
                        >
                          <i className="fa-solid fa-brain" /> تحليل AI
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {documents.length > 4 && (
            <div style={{ textAlign: 'center', padding: '12px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowAllDocs(!showAllDocs)}
                style={{ fontWeight: 800 }}
              >
                <i className={`fa-solid ${showAllDocs ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                {showAllDocs
                  ? 'عرض أقل (إعادة لـ ٤ عناصر)'
                  : `عرض كافة المستندات المتبقية (+${documents.length - 4} مستندات)`}
              </button>
            </div>
          )}
        </div>
      )}

      {isCreateOpen && (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-plus text-primary" />
                <span>إضافة مستند جديد</span>
              </div>
              <button className="icon-action-btn" onClick={closeCreateModal} aria-label="إغلاق">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body">
              <p className="section-desc">اختر نوع المستند ثم أدخل بياناته الأساسية قبل الحفظ.</p>

              <div>
                <label>نوع المستند</label>
                <div className="provider-grid">
                  {DOCUMENT_SOURCE_TYPE_DEFINITIONS.map((entry) => (
                    <div
                      key={entry.type}
                      className={`provider-card ${createSourceType === entry.type ? 'selected' : ''}`}
                      onClick={() => setCreateSourceType(entry.type as 'POWERPOINT' | 'WORD' | 'PDF_DOC' | 'ONENOTE')}
                    >
                      <div className="provider-icon" style={{ background: `${entry.color}15`, color: entry.color }}>
                        <ProviderIcon type={entry.type as SourceType} />
                      </div>
                      <div className="provider-info">
                        <h4>{entry.label}</h4>
                        <p>{entry.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group-wrap">
                <label>اسم المستند</label>
                <input
                  type="text"
                  className="form-control"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="مثال: تقرير الأداء الشهري"
                />

                <label>URL خارجي</label>
                <input
                  type="url"
                  className="form-control"
                  value={createExternalUrl}
                  onChange={(e) => setCreateExternalUrl(e.target.value)}
                  placeholder="https://..."
                />
                <small className="form-help">اختياري، لكنه يساعد على الرجوع إلى الملف الأصلي لاحقاً.</small>

                <label>الوحدة</label>
                <select
                  className="form-control"
                  value={createModule}
                  onChange={(e) => setCreateModule(e.target.value)}
                >
                  {DOCUMENT_MODULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label>المدرسة</label>
                <input
                  type="text"
                  className="form-control"
                  value={selectedSchoolId || 'عامة'}
                  disabled
                />
                <small className="form-help">
                  {selectedSchoolId ? 'سيتم ربط المستند بالمدرسة المحددة في الفلتر الحالي.' : 'سيُحفظ المستند كنطاق عام.'}
                </small>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeCreateModal} disabled={creating}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleCreateDocument} disabled={creating}>
                {creating ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDoc && (
        <div className="modal-backdrop" onClick={() => setSelectedDoc(null)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-brain text-primary" />
                <span>تحليل بالذكاء الاصطناعي للمستند المرجعي: {selectedDoc.name}</span>
              </div>
              <button className="icon-action-btn" onClick={() => setSelectedDoc(null)} aria-label="إغلاق">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <AIAnalysisPanel
                module={selectedDoc.module}
                documentName={selectedDoc.name}
                initialAnalysis={selectedDoc.analysisHistory?.[0] || null}
                onAnalysisComplete={async (result) => {
                  try {
                    await DocumentsService.saveAnalysis(selectedDoc.id, result);
                    loadDocuments();
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default DocumentsPage;
