import { useEffect, useMemo, useState } from 'react';
import { School } from '../types';
import { DashboardService, SchoolsService } from '../services/api';
import { AppShell } from '../components/AppShell';
import { SkeletonTable } from '../components/ui/SkeletonLoader';
import { useToast } from '../components/ui/Toast';

interface DashboardSnapshot {
  totalStaff: number;
  connectedSourcesCount: number;
  lastUpdated: string;
  staffBySchool: Array<{
    schoolId: string;
    schoolName: string;
    staffCount: number;
    attendanceRate: number;
    connectedSources: number;
  }>;
}

interface SchoolFormData {
  name: string;
  code: string;
}

const emptyForm: SchoolFormData = { name: '', code: '' };

export function DataCenterPage() {
  const { showToast } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Add / Edit modal
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [formData, setFormData] = useState<SchoolFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingSchool, setDeletingSchool] = useState<School | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk JSON import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [schoolsData, dashboardData] = await Promise.all([
        SchoolsService.getAll(),
        DashboardService.getStats(),
      ]);
      setSchools(schoolsData);
      setSnapshot(dashboardData);
    } catch (err) {
      console.error(err);
      showToast('فشل تحميل بيانات المدارس', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const staffBySchool = useMemo(() => {
    const rows = snapshot?.staffBySchool || [];
    return new Map(rows.map((item) => [item.schoolId, item]));
  }, [snapshot]);

  // --- Add School ---
  const openAddModal = () => {
    setEditingSchool(null);
    setFormData(emptyForm);
    setShowSchoolModal(true);
  };

  // --- Edit School ---
  const openEditModal = (school: School) => {
    setEditingSchool(school);
    setFormData({ name: school.name, code: school.code });
    setShowSchoolModal(true);
  };

  const handleCloseSchoolModal = () => {
    setShowSchoolModal(false);
    setEditingSchool(null);
    setFormData(emptyForm);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      showToast('يرجى إدخال اسم ورمز المدرسة', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editingSchool) {
        await SchoolsService.update(editingSchool.id, { name: formData.name.trim(), code: formData.code.trim().toUpperCase() });
        showToast('تم تحديث بيانات المدرسة بنجاح ✓', 'success');
      } else {
        await SchoolsService.create({ name: formData.name.trim(), code: formData.code.trim().toUpperCase() });
        showToast('تمت إضافة المدرسة بنجاح ✓', 'success');
      }
      handleCloseSchoolModal();
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشلت عملية الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete School ---
  const handleDeleteConfirm = async () => {
    if (!deletingSchool) return;
    setDeleting(true);
    try {
      await SchoolsService.delete(deletingSchool.id);
      showToast('تم حذف المدرسة بنجاح', 'success');
      setDeletingSchool(null);
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل حذف المدرسة', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // --- Bulk JSON Import ---
  const handleOpenImport = () => {
    setImportJson('');
    setImportError('');
    setShowImportModal(true);
  };

  const handleBulkImport = async () => {
    setImportError('');
    let parsed: Array<{ name: string; code: string }>;
    try {
      parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('يجب أن يكون المحتوى مصفوفة JSON');
      for (const item of parsed) {
        if (!item.name || !item.code) throw new Error('كل عنصر يجب أن يحتوي على "name" و"code"');
      }
    } catch (err: any) {
      setImportError(`خطأ في تنسيق JSON: ${err.message}`);
      return;
    }

    setImporting(true);
    try {
      const result = await SchoolsService.bulkCreate(parsed.map((s) => ({ name: s.name.trim(), code: s.code.trim().toUpperCase() })));
      showToast(`تم استيراد ${result.importedCount} مدرسة بنجاح ✓`, 'success');
      setShowImportModal(false);
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل الاستيراد', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleToggleActive = async (school: School) => {
    try {
      const newStatus = school.isActive === false ? true : false;
      await SchoolsService.updateStatus(school.id, newStatus);
      showToast(`School ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update school status', 'error');
    }
  };

  return (
    <AppShell
      activePage="data-center"
      title="Data Center"
      subtitle="Central view of school information, contact ownership, staff indicators, connected sources, documents, and synchronization status."
    >
      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Schools</span>
            <span className="kpi-icon icon-navy"><i className="fa-solid fa-school" /></span>
          </div>
          <div className="kpi-value">{schools.length}</div>
          <div className="kpi-subtext">Single organization school group</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Staff Indicators</span>
            <span className="kpi-icon icon-green"><i className="fa-solid fa-users-viewfinder" /></span>
          </div>
          <div className="kpi-value">{snapshot?.totalStaff ?? 0}</div>
          <div className="kpi-subtext">Current staff count snapshot</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Connected Sources</span>
            <span className="kpi-icon icon-blue"><i className="fa-solid fa-plug-circle-check" /></span>
          </div>
          <div className="kpi-value">{snapshot?.connectedSourcesCount ?? 0}</div>
          <div className="kpi-subtext">Files and integrations available to the AI Agent</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Last Data Update</span>
            <span className="kpi-icon icon-amber"><i className="fa-solid fa-clock-rotate-left" /></span>
          </div>
          <div className="kpi-value text-xs">
            {snapshot?.lastUpdated ? new Date(snapshot.lastUpdated).toLocaleString('ar-SA-u-nu-latn') : 'Pending'}
          </div>
          <div className="kpi-subtext">Synchronization status across the group</div>
        </div>
      </div>

      {/* Schools Table with CRUD */}
      <div className="card mb-4">
        <div className="chart-box-header">
          <div>
            <h3>Schools Information</h3>
            <p>Data Center inventory for the school group under global executive supervision.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-outline btn-sm" onClick={handleOpenImport}>
              <i className="fa-solid fa-file-import" /> Bulk JSON Import
            </button>
            <button className="btn btn-primary btn-glow" onClick={openAddModal}>
              <i className="fa-solid fa-plus" /> Add School
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={4} />
        ) : schools.length === 0 ? (
          <div className="empty-state-box" style={{ textAlign: 'center', padding: '40px' }}>
            <i className="fa-solid fa-school" style={{ fontSize: '2rem', opacity: 0.3 }} />
            <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>No schools registered yet. Click "Add School" to get started.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Directors / Contact Information</th>
                  <th>Staff Indicators</th>
                  <th>Connected Data Sources</th>
                  <th>Documents</th>
                  <th>Synchronization Status</th>
                  <th>Last Data Update</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const metrics = staffBySchool.get(school.id);
                  const lastSyncDates = (school.sources || [])
                    .map((source) => source.lastSync)
                    .filter(Boolean)
                    .map((value) => new Date(value as string));
                  const lastSync = lastSyncDates.sort((a, b) => b.getTime() - a.getTime())[0];

                  return (
                    <tr key={school.id}>
                      <td>
                        <div className="user-table-cell">
                          <div className="user-avatar-sm">{school.name.charAt(0)}</div>
                          <div>
                            <strong>{school.name}</strong>
                            {school.isActive === false && <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: '6px' }}>Inactive</span>}
                            <span className="d-block text-muted text-xs">{school.code}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">Maintained in connected school records</span></td>
                      <td>
                        <div className="metrics-pills">
                          <span className="metric-tag">{metrics?.staffCount || 0} staff</span>
                          <span className="metric-tag">{metrics?.attendanceRate || 0}% attendance</span>
                        </div>
                      </td>
                      <td><span className="badge badge-primary">{metrics?.connectedSources || 0} connected</span></td>
                      <td><span className="badge badge-subtle">{school._count?.reports || 0} reports linked</span></td>
                      <td>
                        <span className={`badge ${lastSync ? 'badge-success' : 'badge-warning'}`}>
                          {lastSync ? 'Synchronized' : 'Needs source connection'}
                        </span>
                      </td>
                      <td>{lastSync ? lastSync.toLocaleString('ar-SA-u-nu-latn') : 'No sync yet'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEditModal(school)}
                            title="Edit school"
                            aria-label="Edit school"
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            className={`btn btn-sm ${school.isActive !== false ? 'btn-outline' : 'btn-secondary'}`}
                            onClick={() => handleToggleActive(school)}
                            title={school.isActive !== false ? "Deactivate school" : "Activate school"}
                          >
                            <i className={`fa-solid ${school.isActive !== false ? 'fa-eye-slash' : 'fa-eye'}`} />
                          </button>
                          <button
                            className="icon-action-btn danger"
                            onClick={() => setDeletingSchool(school)}
                            title="Delete school"
                            aria-label="Delete school"
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit School Modal */}
      {showSchoolModal && (
        <div className="modal-backdrop" onClick={handleCloseSchoolModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-school text-primary" />
                <span>{editingSchool ? 'Edit School' : 'Add New School'}</span>
              </div>
              <button className="icon-action-btn" onClick={handleCloseSchoolModal} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveSchool}>
                <div className="form-group mb-3">
                  <label>School Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Al Ibdaa School"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group mb-4">
                  <label>School Code * <small className="text-muted">(unique identifier)</small></label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.code}
                    onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SCH001"
                    required
                  />
                </div>
                <div className="settings-actions-bar">
                  <button type="button" className="btn btn-outline" onClick={handleCloseSchoolModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-glow" disabled={saving}>
                    {saving ? 'Saving...' : editingSchool ? 'Save Changes' : 'Add School'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSchool && (
        <div className="modal-backdrop" onClick={() => setDeletingSchool(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-triangle-exclamation text-danger" />
                <span>Confirm Delete</span>
              </div>
              <button className="icon-action-btn" onClick={() => setDeletingSchool(null)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete school <strong>"{deletingSchool.name}"</strong> ({deletingSchool.code})?
              </p>
              <p className="text-muted text-xs mt-2">
                ⚠️ This action cannot be undone. Schools with active users, sources, or reports may be blocked by foreign key constraints.
              </p>
              <div className="settings-actions-bar mt-4">
                <button className="btn btn-outline" onClick={() => setDeletingSchool(null)} disabled={deleting}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete School'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk JSON Import Modal */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-file-import text-primary" />
                <span>Bulk JSON School Import</span>
              </div>
              <button className="icon-action-btn" onClick={() => setShowImportModal(false)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted text-xs mb-3">
                Paste a JSON array of schools. Each item must have <code>name</code> and <code>code</code> fields. Duplicate codes will be skipped automatically.
              </p>
              <pre className="text-xs mb-3" style={{ background: 'var(--surface-2, #1a1a2e)', padding: '10px', borderRadius: '6px', color: 'var(--text-muted)' }}>
{`[
  { "name": "Al Ibdaa School", "code": "SCH001" },
  { "name": "Al Riyadah School", "code": "SCH002" }
]`}
              </pre>
              <div className="form-group mb-3">
                <label>JSON Data *</label>
                <textarea
                  className="form-control"
                  rows={10}
                  value={importJson}
                  onChange={(e) => { setImportJson(e.target.value); setImportError(''); }}
                  placeholder='[{"name":"School Name","code":"SCH001"}]'
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>
              {importError && (
                <div className="alert alert-danger text-xs mb-3">
                  <i className="fa-solid fa-circle-xmark" /> {importError}
                </div>
              )}
              <div className="settings-actions-bar">
                <button className="btn btn-outline" onClick={() => setShowImportModal(false)} disabled={importing}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-glow" onClick={handleBulkImport} disabled={importing || !importJson.trim()}>
                  {importing ? 'Importing...' : 'Import Schools'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default DataCenterPage;
