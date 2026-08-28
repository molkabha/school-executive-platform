import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Complaint } from '../types';
import { ComplaintsService, SchoolsService } from '../services/api';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';

const SOURCE_LABELS: Record<string, string> = {
  WHATSAPP: 'واتساب',
  PHONE: 'هاتف',
  EMAIL: 'بريد إلكتروني',
  WALK_IN: 'حضوري',
  OTHER: 'أخرى',
};

const SOURCE_ICONS: Record<string, string> = {
  WHATSAPP: 'fa-brands fa-whatsapp',
  PHONE: 'fa-solid fa-phone',
  EMAIL: 'fa-solid fa-envelope',
  WALK_IN: 'fa-solid fa-person-walking',
  OTHER: 'fa-solid fa-ellipsis',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوحة',
  IN_PROGRESS: 'جارية',
  RESOLVED: 'محلولة',
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'badge-danger',
  IN_PROGRESS: 'badge-warning',
  RESOLVED: 'badge-success',
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'حرجة',
  HIGH: 'عالية',
  MEDIUM: 'متوسطة',
  LOW: 'منخفضة',
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'badge-danger',
  HIGH: 'badge-warning',
  MEDIUM: 'badge-info',
  LOW: 'badge-success',
};

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = Math.floor((now - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

interface ComplaintFormState {
  schoolId: string;
  source: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'WALK_IN' | 'OTHER';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedTo: string;
}

const EMPTY_FORM: ComplaintFormState = {
  schoolId: '',
  source: 'WHATSAPP',
  title: '',
  description: '',
  priority: 'MEDIUM',
  assignedTo: '',
};

export function ComplaintsPage() {
  const { selectedSchoolId } = useSchoolFilter();
  const { showToast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [resolving, setResolving] = useState<Complaint | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resolutionNote, setResolutionNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedSchoolId) params.schoolId = selectedSchoolId;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const data = await ComplaintsService.getAll(params);
      setComplaints(data);
    } catch {
      showToast('فشل تحميل الشكاوى', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    SchoolsService.getAll().then(setSchools).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [selectedSchoolId, statusFilter, priorityFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, schoolId: selectedSchoolId || '' });
    setShowModal(true);
  };

  const openEdit = (c: Complaint) => {
    setEditing(c);
    setForm({
      schoolId: c.schoolId,
      source: c.source,
      title: c.title,
      description: c.description,
      priority: c.priority,
      assignedTo: c.assignedTo || '',
    });
    setShowModal(true);
  };

  const openResolve = (c: Complaint) => {
    setResolving(c);
    setResolutionNote('');
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.schoolId) {
      showToast('يرجى ملء الحقول الإلزامية', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await ComplaintsService.update(editing.id, {
          priority: form.priority,
          assignedTo: form.assignedTo || undefined,
        });
        showToast('تم تحديث الشكوى ✓', 'success');
      } else {
        await ComplaintsService.create(form);
        showToast('تم إضافة الشكوى ✓', 'success');
      }
      setShowModal(false);
      load();
    } catch {
      showToast('فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolving) return;
    setSaving(true);
    try {
      await ComplaintsService.update(resolving.id, {
        status: 'RESOLVED',
        resolutionNote: resolutionNote || undefined,
      });
      showToast('تم إغلاق الشكوى ✓', 'success');
      setResolving(null);
      load();
    } catch {
      showToast('فشل إغلاق الشكوى', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (c: Complaint, status: string) => {
    try {
      await ComplaintsService.update(c.id, { status });
      showToast('تم تحديث الحالة ✓', 'success');
      load();
    } catch {
      showToast('فشل التحديث', 'error');
    }
  };

  const sorted = [...complaints].sort(
    (a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0)
  );

  return (
    <AppShell
      activePage="complaints"
      title="شكاوى أولياء الأمور"
      subtitle="متابعة وإدارة الشكاوى الواردة من أولياء الأمور والكادر"
    >
      {/* Filters & Actions */}
      <div className="page-toolbar mb-4">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['', 'OPEN', 'IN_PROGRESS', 'RESOLVED'].map((s) => (
            <button
              key={s}
              className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === '' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
          <div style={{ width: 1, background: '#E2E8F0', margin: '0 4px' }} />
          {['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
            <button
              key={p}
              className={`filter-pill ${priorityFilter === p ? 'active' : ''}`}
              onClick={() => setPriorityFilter(p)}
            >
              {p === '' ? 'كل الأولويات' : PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <i className="fa-solid fa-plus" /> إضافة شكوى
        </button>
      </div>

      {/* Complaints List */}
      {loading ? (
        <div className="text-center py-8 text-muted"><i className="fa-solid fa-spinner fa-spin" /> جاري التحميل...</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="fa-comment-slash"
          title="لا توجد شكاوى"
          description="لم يتم تسجيل أي شكاوى بعد في هذا الفلتر."
          actionText="إضافة شكوى"
          onAction={openCreate}
        />
      ) : (
        <div className="complaints-list">
          {sorted.map((c) => (
            <div key={c.id} className={`complaint-card card mb-3 priority-left-border priority-${c.priority.toLowerCase()}`}>
              <div className="complaint-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span className={`badge ${PRIORITY_BADGE[c.priority]}`}>{PRIORITY_LABELS[c.priority]}</span>
                  <span className="complaint-source-badge">
                    <i className={SOURCE_ICONS[c.source]} style={{ marginLeft: 4 }} />
                    {SOURCE_LABELS[c.source]}
                  </span>
                  <span className="badge badge-school">
                    <i className="fa-solid fa-school" style={{ marginLeft: 4 }} />{c.school?.name}
                  </span>
                  <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                </div>
                <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABELS[c.status]}</span>
              </div>

              <h4 className="complaint-title mt-2">{c.title}</h4>
              <p className="complaint-desc text-sm text-muted mt-1">{c.description}</p>

              {c.assignedTo && (
                <div className="text-xs text-muted mt-1">
                  <i className="fa-solid fa-user-tie" style={{ marginLeft: 4 }} />
                  مسند إلى: {c.assignedTo}
                </div>
              )}

              <div className="complaint-actions mt-3">
                {c.status !== 'RESOLVED' && (
                  <>
                    {c.status === 'OPEN' && (
                      <button className="btn btn-xs btn-outline" onClick={() => handleStatusChange(c, 'IN_PROGRESS')}>
                        <i className="fa-solid fa-play" /> تفعيل
                      </button>
                    )}
                    <button className="btn btn-xs btn-success-outline" onClick={() => openResolve(c)}>
                      <i className="fa-solid fa-check-circle" /> إغلاق
                    </button>
                  </>
                )}
                <button className="btn btn-xs btn-subtle" onClick={() => openEdit(c)}>
                  <i className="fa-solid fa-pen" /> تعديل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'تعديل الشكوى' : 'إضافة شكوى جديدة'}</h3>
              <button className="icon-action-btn" onClick={() => setShowModal(false)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              {!editing && (
                <>
                  <div className="form-group">
                    <label>المدرسة *</label>
                    <select className="form-control" value={form.schoolId} onChange={(e) => setForm(f => ({ ...f, schoolId: e.target.value }))}>
                      <option value="">اختر المدرسة</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>مصدر الشكوى *</label>
                    <select className="form-control" value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value as any }))}>
                      {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>عنوان الشكوى *</label>
                    <input className="form-control" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="عنوان مختصر للشكوى" />
                  </div>
                  <div className="form-group">
                    <label>تفاصيل الشكوى *</label>
                    <textarea className="form-control" rows={3} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف تفصيلي للشكوى..." />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>الأولوية</label>
                <select className="form-control" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value as any }))}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>مسند إلى</label>
                <input className="form-control" value={form.assignedTo} onChange={(e) => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="اسم المسؤول..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-subtle" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-save" />}
                {editing ? ' حفظ التعديلات' : ' إضافة الشكوى'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolving && (
        <div className="modal-overlay" onClick={() => setResolving(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>إغلاق الشكوى</h3>
              <button className="icon-action-btn" onClick={() => setResolving(null)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <p className="mb-3 text-muted">هل تريدين إغلاق الشكوى: <strong>{resolving.title}</strong>؟</p>
              <div className="form-group">
                <label>ملاحظات الحل (اختياري)</label>
                <textarea className="form-control" rows={3} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="كيف تم حل الشكوى؟" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-subtle" onClick={() => setResolving(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleResolve} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check-circle" />}
                {' '}تأكيد الإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default ComplaintsPage;
