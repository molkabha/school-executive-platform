import React, { Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Route-level code splitting for faster initial load
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SourcesPage = lazy(() => import('./pages/SourcesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ReportDetailPage = lazy(() => import('./pages/ReportDetailPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const DataCenterPage = lazy(() => import('./pages/DataCenterPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const MeetingsPage = lazy(() => import('./pages/MeetingsPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));

import { AuthProvider, useAuth } from './stores/authStore';
import { ToastProvider } from './components/ui/Toast';
import { SchoolFilterProvider } from './stores/schoolFilterStore';

// Arabic is the only supported language — set document direction statically.
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar-SA-u-nu-latn';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8FAFC',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif',
          direction: 'rtl'
        }}>
          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: '#FEE2E2',
              color: '#DC2626',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              marginBottom: '16px'
            }}>
              <i className="fa-solid fa-circle-exclamation" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
              حدث خطأ غير متوقع في الواجهة
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
              {this.state.error?.message || 'تعذر تحميل هذا المكون. يرجى إعادة محاولة التحميل.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: '#1E3A5F',
                color: '#fff',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SchoolFilterProvider>
          <ToastProvider>
            <BrowserRouter>
                <Suspense fallback={
                  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
                    <div style={{ textAlign: 'center', color: '#64748B', fontFamily: 'Inter, system-ui, sans-serif' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, color: '#1E3A5F', marginBottom: 16 }} />
                      <div style={{ fontSize: 14 }}>جاري التحميل...</div>
                    </div>
                  </div>
                }>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/assistant" element={<ProtectedRoute><AssistantPage /></ProtectedRoute>} />
                    <Route path="/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
                    <Route path="/sources" element={<ProtectedRoute><SourcesPage /></ProtectedRoute>} />
                    <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                    <Route path="/reports/:id" element={<ProtectedRoute><ReportDetailPage /></ProtectedRoute>} />
                    <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
                    <Route path="/data-center" element={<ProtectedRoute><DataCenterPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/complaints" element={<ProtectedRoute><ComplaintsPage /></ProtectedRoute>} />
                    <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
                    <Route path="/meetings" element={<ProtectedRoute><MeetingsPage /></ProtectedRoute>} />
                    <Route path="/audit-logs" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </SchoolFilterProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
