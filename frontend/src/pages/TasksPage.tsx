import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Task } from '../types';
import { TasksService, SchoolsService } from '../services/api';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوحة',
  IN_PROGRESS: 'جارية',
  DONE: 'منجزة',
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'badge-danger',
  IN_PROGRESS: 'badge-warning',
  DONE: 'badge-success',
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

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'DONE') return false;
  return new Date(task.dueDate) < new Date();
}

function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn');
}

interface TaskFormState {
  title: string;
  description: string;
  schoolId: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate: string;
  assignedTo: string;
}

const EMPTY_FORM: TaskFormState = {
  title: '',
  description: '',
  schoolId: '',
  priority: 'MEDIUM',
  dueDate: '',
  assignedTo: '',
};

export function TasksPage() {
  const { selectedSchoolId } = useSchoolFilter();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedSchoolId) params.schoolId = selectedSchoolId;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const data = await TasksService.getAll(params);
      setTasks(data);
    } catch {
      showToast('فشل تحميل المهام', 'error');
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

  const handleQuickDone = async (task: Task) => {
    try {
      await TasksService.update(task.id, { status: 'DONE' });
      showToast('تم إنجاز المهمة ✓', 'success');
      load();
    } catch {
      showToast('فشل التحديث', 'error');
    }
  };

  const handleStatusChange = async (task: Task, status: string) => {
    try {
      await TasksService.update(task.id, { status });
      showToast('تم تحديث الحالة ✓', 'success');
      load();
    } catch {
      showToast('فشل التحديث', 'error');
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      showToast('يرجى إدخال عنوان المهمة', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title,
        description: form.description || undefined,
        schoolId: form.schoolId || undefined,
        priority: form.priority,
        assignedTo: form.assignedTo || undefined,
      };
      if (form.dueDate) {
        payload.dueDate = new Date(form.dueDate).toISOString();
      }
      await TasksService.create(payload);
      showToast('تم إضافة المهمة ✓', 'success');
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      showToast('فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Sort: overdue first, then by priority desc, then by dueDate
  const PRIORITY_W: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const sorted = [...tasks].sort((a, b) => {
    const aOver = isOverdue(a) ? 1 : 0;
    const bOver = isOverdue(b) ? 1 : 0;
    if (bOver !== aOver) return bOver - aOver;
    const pw = (PRIORITY_W[b.priority] || 0) - (PRIORITY_W[a.priority] || 0);
    if (pw !== 0) return pw;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    return 0;
  });

  const overdueCount = tasks.filter(isOverdue).length;

  return (
    <AppShell
      activePage="tasks"
      title="المهام المعلقة"
      subtitle="إدارة المهام والإجراءات المطلوبة عبر المدارس"
    >
      {/* Overdue warning */}
      {overdueCount > 0 && (
        <div className="alert alert-danger mb-4" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa-solid fa-clock-rotate-left" />
          <span><strong>{overdueCount}</strong> مهام متأخرة تجاوزت تاريخ الاستحقاق</span>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="page-toolbar mb-4">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['', 'OPEN', 'IN_PROGRESS', 'DONE'].map((s) => (
            <button
              key={s}
              className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === '' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
          <div style={{ width: 1, background: '#E2E8F0', margin: '0 4px' }} />
          {['', 'CRITICAL', 'HIGH', 'MEDIUM'].map((p) => (
            <button
              key={p}
              className={`filter-pill ${priorityFilter === p ? 'active' : ''}`}
              onClick={() => setPriorityFilter(p)}
            >
              {p === '' ? 'كل الأولويات' : PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <i className="fa-solid fa-plus" /> إضافة مهمة
        </button>
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="text-center py-8 text-muted"><i className="fa-solid fa-spinner fa-spin" /> جاري التحميل...</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="fa-list-check"
          title="لا توجد مهام"
          description="لم يتم تسجيل أي مهام بعد."
          actionText="إضافة مهمة"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <div className="tasks-list">
          {sorted.map((task) => {
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className={`task-card card mb-3 priority-left-border priority-${task.priority.toLowerCase()} ${overdue ? 'overdue' : ''}`}
              >
                <div className="task-card-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Quick-done checkbox */}
                    {task.status !== 'DONE' && (
                      <button
                        className="task-done-btn"
                        onClick={() => handleQuickDone(task)}
                        title="إنجاز المهمة"
                      >
                        <i className="fa-regular fa-circle-check" />
                      </button>
                    )}
                    <span className={`badge ${PRIORITY_BADGE[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
                    {task.school ? (
                      <span className="badge badge-school">
                        <i className="fa-solid fa-school" style={{ marginLeft: 4 }} />{task.school.name}
                      </span>
                    ) : (
                      <span className="badge badge-outline">عام (جميع المدارس)</span>
                    )}
                    {overdue && (
                      <span className="badge badge-danger-outline">
                        <i className="fa-solid fa-clock" style={{ marginLeft: 4 }} /> متأخرة
                      </span>
                    )}
                  </div>
                  <span className={`badge ${STATUS_BADGE[task.status]}`}>{STATUS_LABELS[task.status]}</span>
                </div>

                <h4 className={`task-title mt-2 ${task.status === 'DONE' ? 'line-through text-muted' : ''}`}>
                  {task.title}
                </h4>
                {task.description && <p className="task-desc text-sm text-muted mt-1">{task.description}</p>}

                <div className="task-meta mt-2" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#64748B' }}>
                  <span>
                    <i className="fa-solid fa-calendar" style={{ marginLeft: 4 }} />
                    الاستحقاق: <span className={overdue ? 'text-danger font-bold' : ''}>{formatDueDate(task.dueDate)}</span>
                  </span>
                  {task.assignedTo && (
                    <span>
                      <i className="fa-solid fa-user-tie" style={{ marginLeft: 4 }} />
                      {task.assignedTo}
                    </span>
                  )}
                </div>

                {task.status !== 'DONE' && (
                  <div className="task-actions mt-3">
                    {task.status === 'OPEN' && (
                      <button className="btn btn-xs btn-outline" onClick={() => handleStatusChange(task, 'IN_PROGRESS')}>
                        <i className="fa-solid fa-play" /> تفعيل
                      </button>
                    )}
                    <button className="btn btn-xs btn-success-outline" onClick={() => handleQuickDone(task)}>
                      <i className="fa-solid fa-check" /> إنجاز
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>إضافة مهمة جديدة</h3>
              <button className="icon-action-btn" onClick={() => setShowModal(false)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>عنوان المهمة *</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="ماذا يجب إنجازه؟" />
              </div>
              <div className="form-group">
                <label>الوصف</label>
                <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="تفاصيل إضافية..." />
              </div>
              <div className="form-group">
                <label>المدرسة</label>
                <select className="form-control" value={form.schoolId} onChange={(e) => setForm(f => ({ ...f, schoolId: e.target.value }))}>
                  <option value="">عام (لا يختص بمدرسة)</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>الأولوية</label>
                  <select className="form-control" value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value as any }))}>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>تاريخ الاستحقاق</label>
                  <input type="date" className="form-control" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>مسندة إلى</label>
                <input className="form-control" value={form.assignedTo} onChange={(e) => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="اسم المسؤول..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-subtle" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-plus" />}
                {' '}إضافة المهمة
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default TasksPage;
