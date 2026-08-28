import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../stores/authStore';
import { getApiUrl } from '../config';

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  // Fields start empty — no pre-filled credentials in production
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show demo credentials hint only when explicitly enabled via env
  const showDemoCredentials = (import.meta as any).env?.VITE_SHOW_DEMO_CREDENTIALS === 'true';

  const API_URL = getApiUrl();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/auth/login`,
        { email, password },
        { withCredentials: true },
      );
      login(response.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please verify the supervisor email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-4">
          <div className="sidebar-brand-icon mx-auto mb-3" style={{ width: 56, height: 56, fontSize: '1.6rem' }}>
            <i className="fa-solid fa-school" />
          </div>
          <h1>Executive Intelligence Platform</h1>
          <p>Private school group supervision for one General Supervisor.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-3">
            <label>Supervisor email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control"
              type="email"
              placeholder="supervisor@schools-group.sa"
              required
            />
          </div>

          <div className="form-group mb-4">
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control"
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="form-error alert alert-danger text-xs mb-4">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-glow w-100"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Verifying protected executive access...' : 'Enter protected executive interface'}
          </button>
        </form>

        {showDemoCredentials && (
          <div className="demo-accounts-box mt-4 pt-3 border-top text-xs text-muted">
            <strong>Demo — General Supervisor account:</strong>
            <div className="mt-1">
              <code>supervisor@schools-group.sa</code> / <code>School2026!</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
