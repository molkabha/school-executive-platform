import { useEffect, useState } from 'react';
import { StaffModuleDef, StaffModuleEntryData, School } from '../types';
import { StaffService, SchoolsService } from '../services/api';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { AppShell } from '../components/AppShell';
import { ModuleDirectory } from '../components/ModuleDirectory';
import { AIAnalysisPanel } from '../components/AIAnalysisPanel';
import { SkeletonCard } from '../components/ui/SkeletonLoader';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'GOOD', label: 'جيد' },
  { value: 'NEEDS_ATTENTION', label: 'يحتاج متابعة' },
  { value: 'CRITICAL', label: 'حرج' },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  GOOD: 'جيد',
  NEEDS_ATTENTION: 'يحتاج متابعة',
  CRITICAL: 'حرج',
};

interface EntryFormData {
  schoolId: string;
  title: string;
  status: string;
  metricsRaw: string;
  notes: string;
  linkedDocument: string;
  sourceRefs: string;
}

const emptyEntryForm: EntryFormData = {
  schoolId: '',
  title: '',
  status: 'ACTIVE',
  metricsRaw: '{}',
  notes: '',
  linkedDocument: '',
  sourceRefs: '',
};

export function StaffPage() {
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();
  const [modules, setModules] = useState<StaffModuleDef[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('workforce_plan');
  const [loadingModules, setLoadingModules] = useState(true);

  const [moduleDetail, setModuleDetail] = useState<{
    module: StaffModuleDef;
    entries: StaffModuleEntryData[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [schools, setSchools] = useState<School[]>([]);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<EntryFormData>(emptyEntryForm);
  const [savingEntry, setSavingEntry] = useState(false);
  const [metricsError, setMetricsError] = useState('');

  const loadModules = async () => {
    setLoadingModules(true);
    try {
      const params = selectedSchoolId ? { schoolId: selectedSchoolId } : undefined;
      const data = await StaffService.getModules(params);
      setModules(data);
      if (data.length > 0 && !selectedModuleId) {
        setSelectedModuleId(data[0].id);
      }
    } catch {
      showToast('فشل تحميل وحدات الكادر التعليمي', 'error');
    } finally {
      setLoadingModules(false);
    }
  };

  const loadModuleDetail = async (modId: string) => {
    setLoadingDetail(true);
    try {
      const params = selectedSchoolId ? { schoolId: selectedSchoolId } : undefined;
      const data = await StaffService.getModuleDetail(modId, params);
      setModuleDetail(data);
    } catch {
      showToast('فشل تحميل تفاصيل الوحدة', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadSchools = async () => {
    try {
      const data = await SchoolsService.getAll();
      setSchools(data);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    loadModules();
    loadSchools();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (selectedModuleId) {
      loadModuleDetail(selectedModuleId);
    }
  }, [selectedModuleId, selectedSchoolId]);

  const currentModuleDef = modules.find((m) => m.id === selectedModuleId);

  const openEntryModal = () => {
    // If a specific school is currently selected in the filter, default the
    // new entry to that school. If "All Schools" is selected, fall back to
    // the previous safe behavior (first school in the list).
    const defaultSchoolId =
      selectedSchoolId && schools.some((s) => s.id === selectedSchoolId)
        ? selectedSchoolId
        : schools.length > 0
        ? schools[0].id
        : '';
    setEntryForm({
      ...emptyEntryForm,
      schoolId: defaultSchoolId,
    });
    setEditingEntryId(null);
    setMetricsError('');
    setIsEntryModalOpen(true);
  };

  const openEditModal = (entry: any) => {
    setEntryForm({
      schoolId: entry.schoolId,
      title: entry.title,
      status: entry.status,
      metricsRaw: entry.metrics ? JSON.stringify(entry.metrics) : '{}',
      notes: entry.notes || '',
      linkedDocument: entry.linkedDocument || '',
      sourceRefs: (entry.sourceRefs && entry.sourceRefs.length > 0) ? entry.sourceRefs[0] : '',
    });
    setEditingEntryId(entry.id);
    setMetricsError('');
    setIsEntryModalOpen(true);
  };

  const handleCloseEntryModal = () => {
    setIsEntryModalOpen(false);
    setEditingEntryId(null);
    setMetricsError('');
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetricsError('');

    if (!entryForm.schoolId) {
      showToast('يرجى اختيار المدرسة', 'warning');
      return;
    }
    if (!entryForm.title.trim()) {
      showToast('يرجى إدخال عنوان الإدخال', 'warning');
      return;
    }

    let parsedMetrics: Record<string, unknown> = {};
    if (entryForm.metricsRaw.trim() && entryForm.metricsRaw.trim() !== '{}') {
      try {
        parsedMetrics = JSON.parse(entryForm.metricsRaw);
        if (typeof parsedMetrics !== 'object' || Array.isArray(parsedMetrics)) {
          throw new Error('يجب أن تكون المؤشرات كائن JSON');
        }
      } catch (err: any) {
        setMetricsError(`خطأ في صيغة JSON: ${err.message}`);
        return;
      }
    }

    setSavingEntry(true);
    try {
      const payload: any = {
        schoolId: entryForm.schoolId,
        title: entryForm.title.trim(),
        status: entryForm.status,
        metrics: parsedMetrics,
        notes: entryForm.notes.trim() || null,
        linkedDocument: entryForm.linkedDocument.trim() || undefined,
        sourceRefs: entryForm.sourceRefs.trim() ? [entryForm.sourceRefs.trim()] : undefined,
      };

      // Attendance: extract typed fields from metricsRaw
      if (selectedModuleId === 'attendance') {
        if (parsedMetrics.attendanceRate !== undefined) payload.attendanceRate = Number(parsedMetrics.attendanceRate);
        if (parsedMetrics.absentCount !== undefined) payload.absenceCount = Number(parsedMetrics.absentCount);
      }

      // Housing: extract typed fields from metricsRaw
      if (selectedModuleId === 'housing') {
        if (parsedMetrics.openIssues !== undefined) payload.housingIssueCount = Number(parsedMetrics.openIssues);
        if ((parsedMetrics as any).housingCategory) payload.housingCategory = (parsedMetrics as any).housingCategory;
        if ((parsedMetrics as any).housingSeverity) payload.housingSeverity = (parsedMetrics as any).housingSeverity;
        if ((parsedMetrics as any).resolutionSla) payload.resolutionSla = (parsedMetrics as any).resolutionSla;
      }

      if (editingEntryId) {
        await StaffService.updateEntry(selectedModuleId, editingEntryId, payload);
        showToast('تم تحديث الإدخال بنجاح ✓', 'success');
      } else {
        await StaffService.createEntry(selectedModuleId, payload);
        showToast('تم إضافة الإدخال بنجاح ✓', 'success');
      }
      handleCloseEntryModal();
      await loadModuleDetail(selectedModuleId);
      await loadModules();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل حفظ الإدخال', 'error');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId: string, title?: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الإدخال "${title || 'هذا الإدخال'}"؟`)) return;
    try {
      await StaffService.deleteEntry(selectedModuleId, entryId);
      showToast('تم حذف الإدخال بنجاح', 'success');
      await loadModuleDetail(selectedModuleId);
      await loadModules();
    } catch (err: any) {
      showToast('فشل حذف الإدخال', 'error');
    }
  };

  return (
    <AppShell
      activePage="staff"
      title="متابعة وتطوير الكادر التعليمي"
      subtitle="15 وحدة إستراتيجية متكاملة — إشراف ذكي على جميع جوانب الكادر التعليمي في جميع المدارس"
    >
      {/* ── Two-Column Layout ── */}
      <div className="staff-page-layout">

        {/* ═══ LEFT: Module Directory ═══ */}
        <ModuleDirectory
          modules={modules}
          selectedModuleId={selectedModuleId}
          onSelectModule={setSelectedModuleId}
          loading={loadingModules}
        />

        {/* ═══ RIGHT: Module Detail Panel ═══ */}
        <div className="module-detail-panel">

          {/* ── Module Header Card ── */}
          {currentModuleDef && (
            <div className="card mb-4 module-header-card">
              {/* Top row: icon + title + actions */}
              <div className="module-header-top">
                <div className="module-title-box">
                  <div
                    className="module-avatar-icon"
                    style={{
                      background: `${currentModuleDef.color}15`,
                      color: currentModuleDef.color,
                    }}
                  >
                    <i className={`fa-solid ${currentModuleDef.icon}`} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0 }}>{currentModuleDef.title}</h2>

                      {/* Source connection status chip - Removed for architectural decoupling */}

                      {/* Responsible person badge */}
                      {currentModuleDef.responsiblePerson && (
                        <span
                          className="badge badge-subtle"
                          style={{ background: '#EFF6FF', color: '#1E3A5F', border: '1px solid #BFDBFE' }}
                        >
                          <i className="fa-solid fa-user-tie" style={{ marginLeft: 4 }} />
                          {currentModuleDef.responsiblePerson}
                        </span>
                      )}
                    </div>
                    <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                      {currentModuleDef.description}
                    </p>
                  </div>
                </div>

                <div className="module-header-actions">
                  <button className="btn btn-outline btn-sm" onClick={openEntryModal}>
                    <i className="fa-solid fa-plus" /> إضافة إدخال
                  </button>
                  <a href="/sources" className="btn btn-secondary btn-glow btn-sm">
                    <i className="fa-solid fa-arrow-up-right-from-square" /> مركز المستندات
                  </a>
                </div>
              </div>

              {/* KPI strip */}
              {currentModuleDef.kpis && currentModuleDef.kpis.length > 0 && (
                <div className="kpi-strip">
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: '#64748B',
                      alignSelf: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <i className="fa-solid fa-chart-line" style={{ marginLeft: 4, color: '#2563EB' }} />
                    مؤشرات الأداء:
                  </span>
                  {currentModuleDef.kpis.map((kpi, i) => (
                    <span key={i} className="kpi-strip-item">
                      <i className="fa-solid fa-circle-dot" style={{ color: currentModuleDef.color }} />
                      {kpi}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions strip */}
              {currentModuleDef.actions && currentModuleDef.actions.length > 0 && (
                <div className="module-actions-strip">
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: '#64748B',
                      alignSelf: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <i className="fa-solid fa-bullseye" style={{ marginLeft: 4, color: '#D97706' }} />
                    الإجراءات المستهدفة:
                  </span>
                  {currentModuleDef.actions.map((act, i) => (
                    <span key={i} className="module-action-tag">
                      <i className="fa-solid fa-arrow-left" />
                      {act}
                    </span>
                  ))}
                </div>
              )}

              {/* Reports strip */}
              {currentModuleDef.reports && currentModuleDef.reports.length > 0 && (
                <div className="module-reports-strip">
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: '#64748B',
                      alignSelf: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <i className="fa-solid fa-file-chart-column" style={{ marginLeft: 4, color: '#059669' }} />
                    التقارير المرتبطة:
                  </span>
                  {currentModuleDef.reports.map((rep, i) => (
                    <span key={i} className="module-report-link">
                      <i className="fa-solid fa-file-lines" />
                      {rep}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Module Detail: Sources + Table + AI ── */}
          {loadingDetail ? (
            <div className="grid-2-cols mb-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : moduleDetail ? (
            <div>
              {/* ── Linked Data Sources Removed for Architectural Decoupling ── */}

              {/* Entries Table */}
              {moduleDetail.entries.length > 0 ? (
                <div className="card mb-4">
                  <div className="chart-box-header">
                    <h3>
                      <i className="fa-solid fa-table-list" style={{ marginLeft: 8, color: '#475569' }} />
                      مؤشرات الأداء التفصيلية حسب المدرسة
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-subtle">{moduleDetail.entries.length} إدخال</span>
                      <button className="btn btn-outline btn-xs" onClick={openEntryModal}>
                        <i className="fa-solid fa-plus" /> إضافة
                      </button>
                    </div>
                  </div>
                  <div className="table-container">
                    <table className="table-enterprise">
                      <thead>
                        <tr>
                          <th>المدرسة</th>
                          <th>العنوان</th>
                          <th>الحالة التشغيلية</th>
                          <th>المؤشرات</th>
                          <th>المرجع (المستند/المصدر)</th>
                          <th>آخر تحديث</th>
                          <th>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moduleDetail.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <strong>{entry.schoolName}</strong>
                            </td>
                            <td>{entry.title}</td>
                            <td>
                              <span
                                className={`badge ${
                                  entry.status === 'GOOD'
                                    ? 'badge-success'
                                    : entry.status === 'NEEDS_ATTENTION'
                                    ? 'badge-warning'
                                    : entry.status === 'CRITICAL'
                                    ? 'badge-danger'
                                    : 'badge-neutral'
                                }`}
                              >
                                {STATUS_LABELS[entry.status] || entry.status}
                              </span>
                            </td>
                            <td>
                              <div className="metrics-pills">
                                {Object.entries(entry.metrics || {}).map(([key, val]) => (
                                  <span key={key} className="metric-tag">
                                    {key}: <strong>{String(val)}</strong>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              {entry.linkedDocument || (entry.sourceRefs && entry.sourceRefs.length > 0) ? (
                                <a href="/sources" className="badge badge-primary">
                                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ marginLeft: 4 }} />
                                  عرض المرجع
                                </a>
                              ) : (
                                <span className="badge badge-neutral">بدون مرجع</span>
                              )}
                            </td>
                            <td style={{ color: '#64748B', fontSize: '0.78rem' }}>
                              {new Date(entry.updatedAt).toLocaleDateString('ar-SA-u-nu-latn')}
                            </td>
                            <td>
                              <button className="btn btn-xs btn-outline" onClick={() => openEditModal(entry)}>تعديل</button>
                              <button className="btn btn-xs danger ml-2" onClick={() => handleDeleteEntry(entry.id, entry.title)}>حذف</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="card mb-4">
                  <EmptyState
                    icon="fa-table-list"
                    title="لا توجد إدخالات لهذه الوحدة بعد"
                    description="أضف إدخالاً جديداً لتتبع مؤشرات الأداء لكل مدرسة."
                    actionText="إضافة إدخال"
                    onAction={openEntryModal}
                  />
                </div>
              )}

              {/* AI Analysis Panel */}
              <AIAnalysisPanel
                module={selectedModuleId}
                documentName={`${selectedModuleId}_data`}
                sampleText={
                  `بيانات وحدة ${currentModuleDef?.title}: ` +
                  JSON.stringify(moduleDetail.entries)
                }
              />
            </div>
          ) : !loadingModules && !currentModuleDef ? (
            <div className="card">
              <EmptyState
                icon="fa-list-check"
                title="اختر وحدة من القائمة"
                description="حدد وحدة إستراتيجية من الديركتوري على اليمين لعرض تفاصيلها ومؤشراتها."
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Add Entry Modal ── */}
      {isEntryModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseEntryModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${currentModuleDef?.color || '#1E3A5F'}15`,
                    color: currentModuleDef?.color || '#1E3A5F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className={`fa-solid ${currentModuleDef?.icon || 'fa-plus'}`} />
                </div>
                <span>{editingEntryId ? 'تعديل إدخال' : 'إضافة إدخال'} — {currentModuleDef?.title}</span>
              </div>
              <button className="icon-action-btn" onClick={handleCloseEntryModal} aria-label="إغلاق">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSaveEntry}>
                {/* School */}
                <div className="form-group mb-3">
                  <label>المدرسة *</label>
                  {schools.length > 0 ? (
                    <select
                      className="form-control"
                      value={entryForm.schoolId}
                      onChange={(e) =>
                        setEntryForm((prev) => ({ ...prev, schoolId: e.target.value }))
                      }
                      required
                    >
                      <option value="">— اختر المدرسة —</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="alert alert-danger text-xs">
                      لا توجد مدارس مسجلة. يرجى إضافة مدرسة أولاً من صفحة Data Center.
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="form-group mb-3">
                  <label>عنوان الإدخال *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={entryForm.title}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="مثال: تقرير الحضور الأسبوعي"
                    required
                  />
                </div>

                {/* Status */}
                <div className="form-group mb-3">
                  <label>الحالة التشغيلية *</label>
                  <select
                    className="form-control"
                    value={entryForm.status}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                    required
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Metrics: structured for known modules, raw JSON for others */}
                {selectedModuleId === 'attendance' ? (
                  <div className="structured-metrics-box">
                    <div className="structured-metrics-title">
                      <i className="fa-solid fa-table-cells" style={{ marginLeft: 6 }} /> بيانات الحضور
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group mb-3">
                        <label>عدد الكادر الإجمالي</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).staffCount || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, staffCount: Number(e.target.value) }) }));
                          }}
                          placeholder="45"
                        />
                      </div>
                      <div className="form-group mb-3">
                        <label>نسبة الحضور (%)</label>
                        <input
                          type="number" min="0" max="100" step="0.1" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).attendanceRate || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, attendanceRate: Number(e.target.value) }) }));
                          }}
                          placeholder="94.5"
                        />
                      </div>
                      <div className="form-group mb-3">
                        <label>عدد الغائبين</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).absentCount || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, absentCount: Number(e.target.value) }) }));
                          }}
                          placeholder="3"
                        />
                      </div>
                      <div className="form-group mb-3">
                        <label>عدد المتأخرين</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).lateCount || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, lateCount: Number(e.target.value) }) }));
                          }}
                          placeholder="2"
                        />
                      </div>
                    </div>
                  </div>
                ) : selectedModuleId === 'housing' ? (
                  <div className="structured-metrics-box">
                    <div className="structured-metrics-title">
                      <i className="fa-solid fa-house" style={{ marginLeft: 6 }} /> بيانات السكن
                    </div>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div className="form-group mb-3">
                        <label>قضايا مفتوحة</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).openIssues || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, openIssues: Number(e.target.value) }) }));
                          }}
                          placeholder="4"
                        />
                      </div>
                      <div className="form-group mb-3">
                        <label>قضايا حرجة</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).criticalIssues || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, criticalIssues: Number(e.target.value) }) }));
                          }}
                          placeholder="1"
                        />
                      </div>
                      <div className="form-group mb-3">
                        <label>قضايا محلولة</label>
                        <input
                          type="number" min="0" className="form-control"
                          value={(() => { try { return JSON.parse(entryForm.metricsRaw).resolvedIssues || ''; } catch { return ''; } })()}
                          onChange={(e) => {
                            const cur = (() => { try { return JSON.parse(entryForm.metricsRaw); } catch { return {}; } })();
                            setEntryForm(p => ({ ...p, metricsRaw: JSON.stringify({ ...cur, resolvedIssues: Number(e.target.value) }) }));
                          }}
                          placeholder="12"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-group mb-3">
                    <label>
                      بيانات الوحدة (JSON) <small className="text-muted">— اختياري</small>
                    </label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={entryForm.metricsRaw}
                      onChange={(e) => {
                        setEntryForm((prev) => ({ ...prev, metricsRaw: e.target.value }));
                        setMetricsError('');
                      }}
                      placeholder='{"totalStaff": 45, "attendanceRate": 94}'
                      style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    {metricsError && <small className="text-danger">{metricsError}</small>}
                    <small className="text-muted text-xs">
                      مثال: {`{"totalStaff": 45, "attendanceRate": 94.5}`}
                    </small>
                  </div>
                )}

                {/* References */}
                <div className="form-group mb-3">
                  <label>
                    معرف المستند المرتبط <small className="text-muted">— اختياري</small>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={entryForm.linkedDocument}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, linkedDocument: e.target.value }))
                    }
                    placeholder="مثال: doc_12345"
                  />
                </div>

                <div className="form-group mb-3">
                  <label>
                    معرف مصدر البيانات <small className="text-muted">— اختياري</small>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={entryForm.sourceRefs}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, sourceRefs: e.target.value }))
                    }
                    placeholder="مثال: src_67890"
                  />
                </div>

                {/* Notes */}
                <div className="form-group mb-4">
                  <label>
                    ملاحظات <small className="text-muted">— اختياري</small>
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={entryForm.notes}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="أي ملاحظات إضافية..."
                  />
                </div>

                <div className="settings-actions-bar">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleCloseEntryModal}
                    disabled={savingEntry}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-glow"
                    disabled={savingEntry || schools.length === 0}
                  >
                    {savingEntry ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin" /> جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-floppy-disk" /> حفظ الإدخال
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── DataSourceConnector Removed for Architectural Decoupling ── */}
    </AppShell>
  );
}

export default StaffPage;
