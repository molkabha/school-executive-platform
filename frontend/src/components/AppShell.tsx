import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { t } from '../stores/languageStore';
import { ReportsService } from '../services/api';
import { useToast } from './ui/Toast';
import { SchoolSelector } from './SchoolSelector';

interface NavGroup {
  groupKey: string;
  items: Array<{ path: string; labelKey: string; icon: string }>;
}

const navGroups: NavGroup[] = [
  {
    groupKey: 'mainGroup',
    items: [
      { path: '/', labelKey: 'dashboard', icon: 'fa-chart-pie' },
    ],
  },
  {
    groupKey: 'operationsGroup',     // "العمليات اليومية"
    items: [
      { path: '/complaints', labelKey: 'complaints', icon: 'fa-comment-exclamation' },
      { path: '/tasks', labelKey: 'tasks', icon: 'fa-list-check' },
      { path: '/meetings', labelKey: 'meetings', icon: 'fa-calendar-days' },
      { path: '/alerts', labelKey: 'alerts', icon: 'fa-triangle-exclamation' },
    ],
  },
  {
    groupKey: 'staffGroup',
    items: [
      { path: '/staff', labelKey: 'staff', icon: 'fa-users-gear' },
    ],
  },
  {
    groupKey: 'dataReportsGroup',
    items: [
      { path: '/reports', labelKey: 'reports', icon: 'fa-wand-magic-sparkles' },
      { path: '/assistant', labelKey: 'assistant', icon: 'fa-robot' },
    ],
  },
  {
    groupKey: 'systemGroup',
    items: [
      { path: '/data-center', labelKey: 'dataCenter', icon: 'fa-database' },
      { path: '/settings', labelKey: 'settings', icon: 'fa-sliders' },
      { path: '/audit-logs', labelKey: 'auditLogs', icon: 'fa-shield-halved' },
    ],
  },
];

export function AppShell({
  title,
  subtitle,
  activePage,
  children,
}: {
  title: string;
  subtitle: string;
  activePage: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);

  const accountLabel =
    user?.role === 'GENERAL_SUPERVISOR' ? t('generalSupervisor') : t('protectedInterface');

  const handleGenerateMonthlyReport = async () => {
    setGeneratingReport(true);
    try {
      const result = await ReportsService.generate({
        title: 'التقرير التنفيذي الشهري الشامل',
        scope: 'ALL_SCHOOLS',
        period: 'MONTHLY',
        modules: ['attendance', 'housing', 'teacher_voice', 'turnover', 'workforce_plan'],
      });
      showToast('تم إنشاء التقرير بنجاح ✓', 'success');
      setShowGenModal(false);
      if (result?.id) {
        navigate(`/reports/${result.id}`);
      } else {
        navigate('/reports');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل توليد التقرير', 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="app-layout rtl">
      {/* Mobile Bar */}
      <div className="mobile-header">
        <button
          className="icon-action-btn"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label={mobileNavOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
        >
          <i className={`fa-solid ${mobileNavOpen ? 'fa-xmark' : 'fa-bars'}`} />
        </button>
        <div className="brand-text-mobile">
          <i className="fa-solid fa-school" /> الإشراف التنفيذي
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand-icon">
            <i className="fa-solid fa-school" />
          </div>
          <div className="sidebar-brand-text">
            <h2>منظومة الإشراف الذكي</h2>
            <p>إدارة مجموعة المدارس</p>
          </div>
        </div>

        {/* Scope Indicator */}
        <div className="jurisdiction-select-wrap">
          <label>نطاق الإشراف</label>
          <div className="scope-badge-display">
            <i className="fa-solid fa-shield-halved text-gold" />
            <span>{t('supervisorScope')}</span>
          </div>
        </div>

        {/* Grouped Sidebar Navigation */}
        <div className="sidebar-grouped-nav">
          {navGroups.map((group) => (
            <div key={group.groupKey} className="nav-group-box">
              <span className="nav-group-title">{t(group.groupKey)}</span>
              <ul className="sidebar-nav">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    activePage === item.path.replace('/', '');
                  return (
                    <li key={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                      <Link
                        to={item.path}
                        className="nav-link"
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <div className="nav-link-inner">
                          <i className={`fa-solid ${item.icon}`} />
                          <span>{t(item.labelKey)}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Sidebar Footer User Info */}
        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-avatar">{user?.name ? user.name.charAt(0) : 'M'}</div>
            <div className="user-meta">
              <h4>{user?.name}</h4>
              <p>{accountLabel}</p>
              {user?.lastLoginAt !== undefined && (
                <p className="last-login-meta" style={{ fontSize: '0.72rem', opacity: 0.7, marginTop: 2 }}>
                  {t('lastLoginLabel')}: {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString('ar-SA-u-nu-latn', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : t('lastLoginNever')}
                </p>
              )}
            </div>
          </div>
          <button className="icon-action-btn danger" onClick={logout} title={t('logout')} aria-label={t('logout')}>
            <i className="fa-solid fa-arrow-right-from-bracket" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        <header className="navbar">
          <div className="nav-left">
            <div className="page-title-text">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>

          <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SchoolSelector />

            {/* Top Action: Generate Monthly Report Button */}
            <button
              className="btn btn-primary btn-glow btn-sm"
              onClick={() => setShowGenModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}
            >
              <i className="fa-solid fa-wand-magic-sparkles" />
              <span>{t('generateMonthlyReport')}</span>
            </button>


          </div>
        </header>

        <main className="content-area">{children}</main>
      </div>

      {/* Monthly Report Generation Modal */}
      {showGenModal && (
        <div className="modal-backdrop" onClick={() => !generatingReport && setShowGenModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fa-solid fa-wand-magic-sparkles text-gold" style={{ fontSize: '1.4rem' }} />
                <h3 style={{ margin: 0 }}>{t('generateReportModalTitle')}</h3>
              </div>
              <button
                className="icon-action-btn"
                onClick={() => !generatingReport && setShowGenModal(false)}
                disabled={generatingReport}
                aria-label="إغلاق"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px 0' }}>
              <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: 1.6 }}>
                {t('generateReportModalDesc')}
              </p>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowGenModal(false)}
                disabled={generatingReport}
              >
                {t('cancel')}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateMonthlyReport}
                disabled={generatingReport}
              >
                {generatingReport ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> {t('generating')}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-bolt" /> {t('startGeneration')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
