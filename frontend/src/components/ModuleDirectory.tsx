import { useState, useMemo } from 'react';
import { StaffModuleDef } from '../types';

// ─── Category definitions ───────────────────────────────────────────────────

interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'workforce',
    label: 'القوى العاملة والتخطيط',
    icon: 'fa-briefcase',
    color: '#1E3A5F',
  },
  {
    key: 'attendance_wellbeing',
    label: 'الحضور والبيئة الوظيفية',
    icon: 'fa-user-check',
    color: '#047857',
  },
  {
    key: 'development',
    label: 'التطوير والتميز المهني',
    icon: 'fa-graduation-cap',
    color: '#0891B2',
  },
  {
    key: 'governance',
    label: 'الحوكمة والتقييم',
    icon: 'fa-shield-halved',
    color: '#CA8A04',
  },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface ModuleDirectoryProps {
  modules: StaffModuleDef[];
  selectedModuleId: string;
  onSelectModule: (id: string) => void;
  loading?: boolean;
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function DirectorySkeleton() {
  return (
    <div style={{ padding: '8px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="module-dir-skeleton-item">
          <div
            className="skeleton-line"
            style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, margin: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div className="skeleton-line title" style={{ marginBottom: 4 }} />
            <div className="skeleton-line text short" style={{ margin: 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ModuleDirectory({
  modules,
  selectedModuleId,
  onSelectModule,
  loading = false,
}: ModuleDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentModule = modules.find((m) => m.id === selectedModuleId);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(
      (m) =>
        m.title.includes(q) ||
        (m.titleEn && m.titleEn.toLowerCase().includes(q)) ||
        (m.responsiblePerson && m.responsiblePerson.includes(q))
    );
  }, [modules, searchQuery]);

  const grouped = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: filteredModules.filter(
        (m) => (m.category || 'governance') === cat.key
      ),
    })).filter((g) => g.items.length > 0);
  }, [filteredModules]);

  const hasEntries = modules.some((m) => (m.entries?.length ?? 0) > 0);

  return (
    <div className="module-directory-panel">
      {/* ── Mobile toggle ── */}
      <button
        className="module-dir-mobile-toggle"
        onClick={() => setMobileOpen((p) => !p)}
        style={{ border: 'none', width: '100%', textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {currentModule && (
            <div
              className="module-dir-icon"
              style={{ background: `${currentModule.color}15`, color: currentModule.color }}
            >
              <i className={`fa-solid ${currentModule.icon}`} />
            </div>
          )}
          <span>{currentModule?.title || 'اختر الوحدة'}</span>
        </div>
        <i className={`fa-solid ${mobileOpen ? 'fa-chevron-up' : 'fa-chevron-down'} toggle-icon`} />
      </button>

      {/* ── Panel body ── */}
      <div
        className={`module-dir-panel-body ${mobileOpen ? 'open' : ''}`}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        {/* Header */}
        <div className="module-dir-header">
          <div className="module-dir-title">
            <i className="fa-solid fa-list-check" />
            <span>الوحدات الإستراتيجية</span>
            <span
              style={{
                marginRight: 'auto',
                fontSize: '0.65rem',
                background: '#EFF6FF',
                color: '#1D4ED8',
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 800,
                border: '1px solid #BFDBFE',
              }}
            >
              {modules.length} وحدة
            </span>
          </div>

          {/* Entry status summary bar */}
          {!loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: hasEntries ? '#F0FDF4' : '#F8FAFC',
                border: `1px solid ${hasEntries ? '#BBF7D0' : '#E2E8F0'}`,
                borderRadius: 10,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: hasEntries ? '#10B981' : '#CBD5E1',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: hasEntries ? '#166534' : '#94A3B8',
                }}
              >
                {hasEntries ? 'تتوفر بيانات إدخال للوحدات' : 'لا توجد بيانات بعد'}
              </span>
            </div>
          )}

          {/* Search */}
          <div className="module-dir-search">
            <i className="fa-solid fa-magnifying-glass search-icon" />
            <input
              type="text"
              placeholder="بحث في الوحدات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              dir="rtl"
            />
          </div>
        </div>

        {/* Scrollable list */}
        <div className="module-dir-scroll">
          {loading ? (
            <DirectorySkeleton />
          ) : grouped.length === 0 ? (
            <div
              style={{
                padding: '28px 12px',
                textAlign: 'center',
                color: '#94A3B8',
                fontSize: '0.82rem',
              }}
            >
              <i
                className="fa-solid fa-magnifying-glass"
                style={{ fontSize: '1.4rem', marginBottom: 8, display: 'block' }}
              />
              لا توجد وحدات تطابق البحث
            </div>
          ) : (
            grouped.map((cat) => (
              <div key={cat.key} className="module-category-group">
                <span className="module-category-label">
                  <i className={`fa-solid ${cat.icon}`} style={{ marginLeft: 5, color: cat.color }} />
                  {cat.label}
                </span>

                {cat.items.map((mod) => {
                  const isActive = mod.id === selectedModuleId;
                  const entryCount = mod.entries?.length ?? 0;

                  return (
                    <div
                      key={mod.id}
                      className={`module-dir-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onSelectModule(mod.id);
                        setMobileOpen(false);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onSelectModule(mod.id);
                          setMobileOpen(false);
                        }
                      }}
                    >
                      <div
                        className="module-dir-icon"
                        style={{
                          background: isActive ? `${mod.color}20` : `${mod.color}12`,
                          color: mod.color,
                        }}
                      >
                        <i className={`fa-solid ${mod.icon}`} />
                      </div>

                      <div className="module-dir-info">
                        <span className="module-dir-name">{mod.title}</span>
                        {mod.responsiblePerson && (
                          <span className="module-dir-responsible">
                            <i
                              className="fa-solid fa-user-tie"
                              style={{ marginLeft: 3, fontSize: '0.58rem' }}
                            />
                            {mod.responsiblePerson}
                          </span>
                        )}
                      </div>

                      <div className="module-dir-end">
                        {entryCount > 0 && (
                          <span className="module-entry-count">{entryCount}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ModuleDirectory;
