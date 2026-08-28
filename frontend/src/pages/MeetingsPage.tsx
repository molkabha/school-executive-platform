import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Meeting } from '../types';
import { MeetingsService, SchoolsService } from '../services/api';
import { useSchoolFilter } from '../stores/schoolFilterStore';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'مجدول',
  DONE: 'منتهي',
  CANCELLED: 'ملغي',
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'badge-info',
  DONE: 'badge-success',
  CANCELLED: 'badge-outline',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ar-SA-u-nu-latn', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
}

function isThisWeek(dateStr: string): boolean {
  if (isToday(dateStr)) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  return d >= now && d <= weekEnd;
}

function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date() && !isToday(dateStr);
}

const EMPTY_FORM = {
  title: '',
  date: '',
  time: '09:00',
  location: '',
  schoolIds: [] as string[],
  participants: '',
  agenda: '',
};

export function MeetingsPage() {
  const { showToast } = useToast();
  const { selectedSchoolId } = useSchoolFilter();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState<Meeting | null>(null);
  const [notes, setNotes] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedSchoolId) params.schoolId = selectedSchoolId;
      const data = await MeetingsService.getAll(params);
      setMeetings(data);
    } catch {
      showToast('فشل تحميل الاجتماعات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    SchoolsService.getAll().then(setSchools).catch(() => {});
  }, [selectedSchoolId]);

  const todayMeetings = meetings.filter(m => isToday(m.date) && m.status === 'SCHEDULED');
  const weekMeetings = meetings.filter(m => isThisWeek(m.date) && m.status === 'SCHEDULED');
  const pastMeetings = meetings.filter(m => isPast(m.date) || m.status !== 'SCHEDULED').slice(0, 15);

  const handleStatusUpdate = async (meeting: Meeting, status: string) => {
    try {
      await MeetingsService.update(meeting.id, { status });
      showToast('تم تحديث حالة الاجتماع ✓', 'success');
      load();
    } catch {
      showToast('فشل التحديث', 'error');
    }
  };

  const handleSaveNotes = async () => {
    if (!editingNotes) return;
    setSaving(true);
    try {
      await MeetingsService.update(editingNotes.id, { notes });
      showToast('تم حفظ الملاحظات ✓', 'success');
      setEditingNotes(null);
      load();
    } catch {
      showToast('فشل حفظ الملاحظات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleSchool = (id: string) => {
    setForm(f => ({
      ...f,
      schoolIds: f.schoolIds.includes(id)
        ? f.schoolIds.filter(s => s !== id)
        : [...f.schoolIds, id],
    }));
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date) {
      showToast('يرجى ملء العنوان والتاريخ', 'error');
      return;
    }
    setSaving(true);
    try {
      const dateTime = new Date(`${form.date}T${form.time}:00`);
      await MeetingsService.create({
        title: form.title,
        date: dateTime.toISOString(),
        location: form.location || undefined,
        schoolIds: form.schoolIds,
        participants: form.participants || undefined,
        agenda: form.agenda || undefined,
      });
      showToast('تم إضافة الاجتماع ✓', 'success');
      setShowModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      showToast('فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const MeetingCard = ({ meeting, showActions = true }: { meeting: Meeting; showActions?: boolean }) => (
    <div className="meeting-card card mb-3">
      <div className="meeting-card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="meeting-time-badge">
            <i className="fa-regular fa-clock" style={{ marginLeft: 4 }} />
            {formatTime(meeting.date)}
          </span>
          <span className={`badge ${STATUS_BADGE[meeting.status]}`}>{STATUS_LABELS[meeting.status]}</span>
          {isToday(meeting.date) && meeting.status === 'SCHEDULED' && (
            <span className="badge badge-gold">اليوم</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {meeting.status === 'SCHEDULED' && showActions && (
            <>
              <button
                className="btn btn-xs btn-success-outline"
                onClick={() => handleStatusUpdate(meeting, 'DONE')}
              >
                <i className="fa-solid fa-check" /> إنهاء
              </button>
              <button
                className="btn btn-xs btn-subtle"
                onClick={() => {
                  setEditingNotes(meeting);
                  setNotes(meeting.notes || '');
                }}
              >
                <i className="fa-solid fa-pen" /> ملاحظات
              </button>
              <button
                className="btn btn-xs btn-subtle"
                onClick={() => handleStatusUpdate(meeting, 'CANCELLED')}
              >
                <i className="fa-solid fa-ban" /> إلغاء
              </button>
            </>
          )}
        </div>
      </div>

      <h4 className="meeting-title mt-2">{meeting.title}</h4>

      <div className="meeting-meta mt-2" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#64748B' }}>
        <span><i className="fa-solid fa-calendar" style={{ marginLeft: 4 }} />{formatDate(meeting.date)}</span>
        {meeting.location && (
          <span><i className="fa-solid fa-location-dot" style={{ marginLeft: 4 }} />{meeting.location}</span>
        )}
      </div>

      {meeting.schoolNames && meeting.schoolNames.length > 0 && (
        <div className="meeting-schools mt-2" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {meeting.schoolNames.map(s => (
            <span key={s.id} className="badge badge-school">
              <i className="fa-solid fa-school" style={{ marginLeft: 3 }} />{s.name}
            </span>
          ))}
        </div>
      )}

      {meeting.participants && (
        <p className="text-xs text-muted mt-1">
          <i className="fa-solid fa-users" style={{ marginLeft: 4 }} />{meeting.participants}
        </p>
      )}

      {meeting.agenda && (
        <div className="meeting-agenda mt-2 text-sm">
          <strong>جدول الأعمال:</strong> {meeting.agenda}
        </div>
      )}

      {meeting.notes && (
        <div className="meeting-notes mt-2 text-sm" style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px' }}>
          <i className="fa-solid fa-note-sticky text-amber" style={{ marginLeft: 4 }} />
          <strong>ملاحظات:</strong> {meeting.notes}
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      activePage="meetings"
      title="الاجتماعات"
      subtitle="جدولة ومتابعة الاجتماعات مع مدراء المدارس والكادر"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <i className="fa-solid fa-plus" /> جدولة اجتماع
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted"><i className="fa-solid fa-spinner fa-spin" /> جاري التحميل...</div>
      ) : (
        <>
          {/* Today */}
          {todayMeetings.length > 0 && (
            <div className="mb-5">
              <div className="section-label-bar mb-3">
                <i className="fa-solid fa-sun text-amber" />
                <span>اجتماعات اليوم ({todayMeetings.length})</span>
              </div>
              {todayMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
            </div>
          )}

          {/* This week */}
          {weekMeetings.length > 0 && (
            <div className="mb-5">
              <div className="section-label-bar mb-3">
                <i className="fa-solid fa-calendar-week text-primary" />
                <span>هذا الأسبوع ({weekMeetings.length})</span>
              </div>
              {weekMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}
            </div>
          )}

          {/* Past / cancelled */}
          {pastMeetings.length > 0 && (
            <div className="mb-5">
              <div className="section-label-bar mb-3">
                <i className="fa-solid fa-history text-muted" />
                <span>السابقة والملغاة</span>
              </div>
              {pastMeetings.map(m => <MeetingCard key={m.id} meeting={m} showActions={false} />)}
            </div>
          )}

          {meetings.length === 0 && (
            <EmptyState
              icon="fa-calendar-xmark"
              title="لا توجد اجتماعات"
              description="لم يتم جدولة أي اجتماعات بعد."
              actionText="جدولة اجتماع"
              onAction={() => setShowModal(true)}
            />
          )}
        </>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>جدولة اجتماع جديد</h3>
              <button className="icon-action-btn" onClick={() => setShowModal(false)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>عنوان الاجتماع *</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="موضوع الاجتماع..." />
              </div>
              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input type="date" className="form-control" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>الوقت</label>
                  <input type="time" className="form-control" value={form.time} onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>الموقع</label>
                <input className="form-control" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="قاعة الاجتماعات / رابط اتصال..." />
              </div>
              <div className="form-group">
                <label>المدارس المعنية</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {schools.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={form.schoolIds.includes(s.id)}
                        onChange={() => toggleSchool(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>المشاركون</label>
                <input className="form-control" value={form.participants} onChange={(e) => setForm(f => ({ ...f, participants: e.target.value }))} placeholder="أسماء المشاركين المتوقعين..." />
              </div>
              <div className="form-group">
                <label>جدول الأعمال</label>
                <textarea className="form-control" rows={3} value={form.agenda} onChange={(e) => setForm(f => ({ ...f, agenda: e.target.value }))} placeholder="محاور الاجتماع..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-subtle" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-calendar-plus" />}
                {' '}جدولة الاجتماع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {editingNotes && (
        <div className="modal-overlay" onClick={() => setEditingNotes(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ملاحظات الاجتماع</h3>
              <button className="icon-action-btn" onClick={() => setEditingNotes(null)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted text-sm mb-3">{editingNotes.title}</p>
              <textarea className="form-control" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أدخلي ملاحظات الاجتماع..." />
            </div>
            <div className="modal-footer">
              <button className="btn btn-subtle" onClick={() => setEditingNotes(null)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSaveNotes} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-save" />}
                {' '}حفظ الملاحظات
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default MeetingsPage;
